from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Notification, NotificationRecipient, User
from ..schemas import NotificationIn, NotificationOut, NotificationPatch, Page, UserBrief
from ..security import audit, get_current_user, has, require

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _to_out(n: Notification, viewer_id: int) -> NotificationOut:
    rec_by_uid = {r.user_id: r for r in n.recipients}
    mine = rec_by_uid.get(viewer_id)
    return NotificationOut(
        id=n.id,
        title=n.title,
        message=n.message,
        priority=n.priority,
        audience=n.audience,
        created_by=UserBrief.model_validate(n.created_by),
        recipients=[UserBrief.model_validate(r.user) for r in n.recipients if r.user],
        recipient_count=len(n.recipients),
        is_read=bool(mine and mine.read_at is not None),
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


def _resolve_recipient_ids(db: Session, audience: str, recipient_ids: list[int]) -> list[int]:
    if audience == "all":
        return list(db.scalars(select(User.id).where(User.is_active.is_(True))).all())
    unique_ids = sorted(set(recipient_ids))
    found = list(db.scalars(select(User.id).where(User.id.in_(unique_ids), User.is_active.is_(True))).all())
    if not found:
        raise HTTPException(422, "No valid active recipients selected")
    return found


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not has(user, "notifications:view") and not has(user, "notifications:create"):
        return {"count": 0}
    # Count notifications visible to this user that have not been marked read by them
    rec_ids = select(NotificationRecipient.notification_id).where(NotificationRecipient.user_id == user.id)
    read_ids = select(NotificationRecipient.notification_id).where(
        NotificationRecipient.user_id == user.id, NotificationRecipient.read_at.is_not(None)
    )
    stmt = (
        select(func.count())
        .select_from(Notification)
        .where(
            or_(Notification.audience == "all", Notification.id.in_(rec_ids)),
            Notification.id.not_in(read_ids),
        )
    )
    return {"count": db.scalar(stmt) or 0}


@router.get("", response_model=Page[NotificationOut])
def list_notifications(
    scope: str = Query("inbox", pattern="^(inbox|manage)$"),
    page: int = Query(1, ge=1),
    size: int = Query(25, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    can_manage = has(user, "notifications:create") or has(user, "notifications:edit") or has(user, "notifications:delete")
    if scope == "manage":
        if not can_manage:
            raise HTTPException(403, "Missing permission: notifications:create or notifications:edit")
        stmt = select(Notification)
    else:
        if not (has(user, "notifications:view") or can_manage):
            raise HTTPException(403, "Missing permission: notifications:view")
        rec_ids = select(NotificationRecipient.notification_id).where(NotificationRecipient.user_id == user.id)
        stmt = select(Notification).where(or_(Notification.audience == "all", Notification.id.in_(rec_ids)))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).offset((page - 1) * size).limit(size)).all()
    return Page(items=[_to_out(n, user.id) for n in rows], total=total, page=page, size=size)


@router.post("", response_model=NotificationOut, status_code=201)
def create_notification(
    body: NotificationIn,
    request: Request,
    user: User = Depends(require("notifications:create")),
    db: Session = Depends(get_db),
):
    target_ids = _resolve_recipient_ids(db, body.audience, body.recipient_ids)
    n = Notification(
        title=body.title.strip(),
        message=body.message.strip(),
        priority=body.priority,
        audience=body.audience,
        created_by_id=user.id,
        recipients=[NotificationRecipient(user_id=uid) for uid in target_ids],
    )
    db.add(n)
    db.flush()
    target_desc = "everyone" if body.audience == "all" else f"{len(target_ids)} selected user(s)"
    audit(db, user, "create", "notification", n.id, f"Sent '{n.title}' to {target_desc}", request)
    db.commit()
    db.refresh(n)
    return _to_out(n, user.id)


@router.patch("/{notif_id}", response_model=NotificationOut)
def update_notification(
    notif_id: int,
    body: NotificationPatch,
    request: Request,
    user: User = Depends(require("notifications:edit")),
    db: Session = Depends(get_db),
):
    n = db.get(Notification, notif_id)
    if not n:
        raise HTTPException(404, "Notification not found")
    if body.title is not None:
        n.title = body.title.strip()
    if body.message is not None:
        n.message = body.message.strip()
    if body.priority is not None:
        n.priority = body.priority
    if body.audience is not None or body.recipient_ids is not None:
        new_audience = body.audience or n.audience
        new_ids_input = body.recipient_ids if body.recipient_ids is not None else [r.user_id for r in n.recipients]
        if new_audience == "selected" and not new_ids_input:
            raise HTTPException(422, "Select at least one recipient")
        n.audience = new_audience
        target_ids = set(_resolve_recipient_ids(db, new_audience, new_ids_input))
        existing_by_uid = {r.user_id: r for r in n.recipients}
        n.recipients = [
            existing_by_uid[uid] if uid in existing_by_uid else NotificationRecipient(user_id=uid)
            for uid in sorted(target_ids)
        ]
    audit(db, user, "update", "notification", n.id, f"Updated notification '{n.title}'", request)
    db.commit()
    db.refresh(n)
    return _to_out(n, user.id)


@router.delete("/{notif_id}", status_code=204)
def delete_notification(
    notif_id: int,
    request: Request,
    user: User = Depends(require("notifications:delete")),
    db: Session = Depends(get_db),
):
    n = db.get(Notification, notif_id)
    if not n:
        raise HTTPException(404, "Notification not found")
    title = n.title
    db.delete(n)
    audit(db, user, "delete", "notification", notif_id, f"Deleted notification '{title}'", request)
    db.commit()


@router.post("/{notif_id}/read", status_code=204)
def mark_read(notif_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notif_id)
    if not n:
        raise HTTPException(404, "Notification not found")
    rec = db.scalar(
        select(NotificationRecipient).where(
            NotificationRecipient.notification_id == notif_id, NotificationRecipient.user_id == user.id
        )
    )
    if rec is None:
        if n.audience != "all":
            raise HTTPException(403, "You are not a recipient of this notification")
        rec = NotificationRecipient(notification_id=notif_id, user_id=user.id)
        db.add(rec)
    if rec.read_at is None:
        rec.read_at = datetime.now(timezone.utc)
        db.commit()


@router.post("/read-all", status_code=204)
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    rec_ids = select(NotificationRecipient.notification_id).where(NotificationRecipient.user_id == user.id)
    visible = db.scalars(
        select(Notification).where(or_(Notification.audience == "all", Notification.id.in_(rec_ids)))
    ).all()
    for n in visible:
        rec = next((r for r in n.recipients if r.user_id == user.id), None)
        if rec is None:
            db.add(NotificationRecipient(notification_id=n.id, user_id=user.id, read_at=now))
        elif rec.read_at is None:
            rec.read_at = now
    db.commit()
