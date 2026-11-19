from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuditLog, Permission, RefreshToken, Role, User
from ..schemas import (
    AuditOut, Page, PermissionOut, RoleIn, RoleOut, UserBrief, UserCreate, UserOut, UserUpdate,
)
from ..security import audit, get_current_user, hash_password, require

router = APIRouter(prefix="/api", tags=["admin"])


# ---------------- roles & permissions ----------------
def _role_out(db: Session, r: Role) -> RoleOut:
    count = db.scalar(select(func.count()).select_from(User).where(User.role_id == r.id)) or 0
    return RoleOut(id=r.id, name=r.name, description=r.description, is_system=r.is_system,
                   permissions=sorted(p.code for p in r.permissions), user_count=count)


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(_: User = Depends(require("roles:view")), db: Session = Depends(get_db)):
    return db.scalars(select(Permission).order_by(Permission.module, Permission.id)).all()


@router.get("/roles", response_model=list[RoleOut])
def list_roles(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_role_out(db, r) for r in db.scalars(select(Role).order_by(Role.id)).all()]


def _perms(db: Session, codes: list[str]) -> list[Permission]:
    perms = db.scalars(select(Permission).where(Permission.code.in_(codes))).all()
    unknown = set(codes) - {p.code for p in perms}
    if unknown:
        raise HTTPException(422, f"Unknown permissions: {', '.join(sorted(unknown))}")
    return list(perms)


@router.post("/roles", response_model=RoleOut, status_code=201)
def create_role(body: RoleIn, request: Request, user: User = Depends(require("roles:edit")),
                db: Session = Depends(get_db)):
    if db.scalar(select(Role).where(func.lower(Role.name) == body.name.lower())):
        raise HTTPException(409, "A role with this name already exists")
    r = Role(name=body.name, description=body.description, permissions=_perms(db, body.permissions))
    db.add(r)
    db.flush()
    audit(db, user, "create", "role", r.id, f"Created role {r.name}", request)
    db.commit()
    return _role_out(db, r)


@router.put("/roles/{role_id}", response_model=RoleOut)
def update_role(role_id: int, body: RoleIn, request: Request, user: User = Depends(require("roles:edit")),
                db: Session = Depends(get_db)):
    r = db.get(Role, role_id) or _404("Role")
    if r.name == "Super Administrator" and "roles:edit" not in body.permissions:
        raise HTTPException(400, "Super Administrator must keep roles:edit")
    if not r.is_system:
        r.name = body.name
    r.description = body.description
    r.permissions = _perms(db, body.permissions)
    audit(db, user, "update", "role", r.id, f"Updated permissions of {r.name} ({len(body.permissions)} grants)", request)
    db.commit()
    return _role_out(db, r)


@router.delete("/roles/{role_id}", status_code=204)
def delete_role(role_id: int, request: Request, user: User = Depends(require("roles:edit")),
                db: Session = Depends(get_db)):
    r = db.get(Role, role_id) or _404("Role")
    if r.is_system:
        raise HTTPException(400, "Built-in roles cannot be deleted")
    if db.scalar(select(func.count()).select_from(User).where(User.role_id == r.id)):
        raise HTTPException(400, "Role is assigned to users")
    db.delete(r)
    audit(db, user, "delete", "role", role_id, f"Deleted role {r.name}", request)
    db.commit()


# ---------------- users ----------------
@router.get("/users", response_model=Page[UserOut])
def list_users(q: str | None = None, page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=200),
               _: User = Depends(require("users:view")), db: Session = Depends(get_db)):
    stmt = select(User)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.full_name).like(like), func.lower(User.email).like(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.order_by(User.full_name).offset((page - 1) * size).limit(size)).all()
    return Page(items=items, total=total, page=page, size=size)


@router.get("/users/lookup", response_model=list[UserBrief])
def lookup_users(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Minimal directory so any user can pick an assignee."""
    return db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, request: Request, actor: User = Depends(require("users:create")),
                db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "A user with this email already exists")
    db.get(Role, body.role_id) or _404("Role")
    u = User(email=email, full_name=body.full_name, password_hash=hash_password(body.password),
             role_id=body.role_id, is_active=body.is_active)
    db.add(u)
    db.flush()
    audit(db, actor, "create", "user", u.id, f"Created user {email}", request)
    db.commit()
    db.refresh(u)
    return u


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, request: Request, actor: User = Depends(require("users:edit")),
                db: Session = Depends(get_db)):
    u = db.get(User, user_id) or _404("User")
    changes = []
    if body.full_name is not None:
        u.full_name = body.full_name
        changes.append("name")
    if body.role_id is not None and body.role_id != u.role_id:
        db.get(Role, body.role_id) or _404("Role")
        if u.id == actor.id:
            raise HTTPException(400, "You cannot change your own role")
        u.role_id = body.role_id
        changes.append("role")
    revoke = False
    if body.is_active is not None and body.is_active != u.is_active:
        if u.id == actor.id:
            raise HTTPException(400, "You cannot deactivate yourself")
        u.is_active = body.is_active
        revoke = not body.is_active
        changes.append("active" if body.is_active else "deactivated")
    if body.password:
        u.password_hash = hash_password(body.password)
        revoke = True
        changes.append("password reset")
    if revoke:
        db.execute(update(RefreshToken).where(RefreshToken.user_id == u.id, RefreshToken.revoked_at.is_(None))
                   .values(revoked_at=datetime.now(timezone.utc)))
    audit(db, actor, "update", "user", u.id, f"Updated {u.email}: {', '.join(changes) or 'no changes'}", request)
    db.commit()
    db.refresh(u)
    return u


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, request: Request, actor: User = Depends(require("users:delete")),
                db: Session = Depends(get_db)):
    u = db.get(User, user_id) or _404("User")
    if u.id == actor.id:
        raise HTTPException(400, "You cannot delete yourself")
    # Soft delete keeps audit/task history intact.
    u.is_active = False
    db.execute(update(RefreshToken).where(RefreshToken.user_id == u.id, RefreshToken.revoked_at.is_(None))
               .values(revoked_at=datetime.now(timezone.utc)))
    audit(db, actor, "deactivate", "user", u.id, f"Deactivated {u.email}", request)
    db.commit()


# ---------------- audit ----------------
@router.get("/audit", response_model=Page[AuditOut])
def list_audit(entity: str | None = None, action: str | None = None, user_id: int | None = None,
               page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200),
               _: User = Depends(require("audit:view")), db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.order_by(AuditLog.id.desc()).offset((page - 1) * size).limit(size)).all()
    return Page(items=items, total=total, page=page, size=size)


def _404(what: str):
    raise HTTPException(404, f"{what} not found")
