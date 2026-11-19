import hashlib
import mimetypes
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from urllib.parse import quote

from fastapi.responses import FileResponse, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Attendance, AuditLog, Document, DocumentBlob, Employee, LeaveRequest, Task, User
from ..schemas import AuditOut, DocumentOut, DocumentPatch, Page, TaskIn, TaskOut, TaskPatch
from ..security import audit, get_current_user, has, require

router = APIRouter(prefix="/api", tags=["work"])


def _404(what: str):
    raise HTTPException(404, f"{what} not found")


# ================= tasks =================
def _task_out(t: Task) -> TaskOut:
    o = TaskOut.model_validate(t)
    o.overdue = bool(t.due_date and t.status != "done" and t.due_date < date.today())
    return o


def _can_touch(user: User, t: Task, perm: str) -> bool:
    return has(user, perm) or t.created_by_id == user.id or t.assignee_id == user.id


@router.get("/tasks", response_model=Page[TaskOut])
def list_tasks(scope: str = Query("mine", pattern="^(mine|created|all)$"), status: str | None = None,
               priority: str | None = None, overdue: bool = False, q: str | None = None,
               page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200),
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Task)
    if scope == "all" and has(user, "tasks:view"):
        pass
    elif scope == "created":
        stmt = stmt.where(Task.created_by_id == user.id)
    else:
        stmt = stmt.where(Task.assignee_id == user.id)
    if status == "open":
        stmt = stmt.where(Task.status != "done")
    elif status:
        stmt = stmt.where(Task.status == status)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if overdue:
        stmt = stmt.where(Task.due_date < date.today(), Task.status != "done")
    if q:
        stmt = stmt.where(func.lower(Task.title).like(f"%{q.lower()}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Task.status == "done", Task.due_date.asc().nulls_last(), Task.id.desc())
                      .offset((page - 1) * size).limit(size)).all()
    return Page(items=[_task_out(t) for t in rows], total=total, page=page, size=size)


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(body: TaskIn, request: Request, user: User = Depends(require("tasks:create")),
                db: Session = Depends(get_db)):
    if body.assignee_id and not db.get(User, body.assignee_id):
        raise HTTPException(422, "Assignee does not exist")
    t = Task(**body.model_dump(), created_by_id=user.id)
    if t.status == "done":
        t.completed_at = datetime.now(timezone.utc)
    db.add(t)
    db.flush()
    audit(db, user, "create", "task", t.id, f"Task: {t.title}", request)
    db.commit()
    db.refresh(t)
    return _task_out(t)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskPatch, request: Request, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    t = db.get(Task, task_id) or _404("Task")
    if not _can_touch(user, t, "tasks:edit"):
        raise HTTPException(403, "You can only edit tasks you created or are assigned to")
    data = body.model_dump(exclude_unset=True)
    # Assignees who are not the creator may only move status.
    if t.created_by_id != user.id and not has(user, "tasks:edit") and set(data) - {"status"}:
        raise HTTPException(403, "Assignees can only change the status")
    if "assignee_id" in data and data["assignee_id"] and not db.get(User, data["assignee_id"]):
        raise HTTPException(422, "Assignee does not exist")
    for k, v in data.items():
        setattr(t, k, v)
    if "status" in data:
        t.completed_at = datetime.now(timezone.utc) if data["status"] == "done" else None
    audit(db, user, "update", "task", t.id, f"Task #{t.id}: {', '.join(f'{k}={v}' for k, v in data.items())}"[:500], request)
    db.commit()
    db.refresh(t)
    return _task_out(t)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, request: Request, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    t = db.get(Task, task_id) or _404("Task")
    if not (has(user, "tasks:delete") or t.created_by_id == user.id):
        raise HTTPException(403, "Only the creator or a manager can delete this task")
    db.delete(t)
    audit(db, user, "delete", "task", task_id, f"Deleted task {t.title}", request)
    db.commit()


# ================= documents =================
ALLOWED_EXT = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".txt", ".png", ".jpg", ".jpeg",
    ".gif", ".webp", ".tif", ".tiff", ".zip", ".dwg", ".dxf", ".msg", ".eml",
}
CATEGORIES = {"general", "hr", "employee", "tender", "contract", "drawing", "finance", "project", "vendor", "policy", "certificate"}


def _store_dir() -> Path:
    p = Path(settings.upload_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.get("/documents/categories")
def doc_categories(_: User = Depends(get_current_user)):
    return sorted(CATEGORIES)


@router.get("/documents", response_model=Page[DocumentOut])
def list_documents(q: str | None = None, category: str | None = None, tag: str | None = None,
                   employee_id: int | None = None, page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=200),
                   user: User = Depends(require("documents:view")), db: Session = Depends(get_db)):
    stmt = select(Document)
    if not has(user, "employees:view"):
        # Personal HR files are only visible to HR / managers and the uploader.
        stmt = stmt.where(or_(Document.category.notin_(["hr", "employee"]), Document.uploaded_by_id == user.id))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Document.title).like(like), func.lower(Document.original_filename).like(like),
                              func.lower(Document.description).like(like)))
    if category:
        stmt = stmt.where(Document.category == category)
    if employee_id:
        stmt = stmt.where(Document.employee_id == employee_id)
    rows = db.scalars(stmt.order_by(Document.id.desc())).all()
    if tag:
        rows = [d for d in rows if tag.lower() in [t.lower() for t in d.tags]]
    total = len(rows)
    return Page(items=rows[(page - 1) * size: page * size], total=total, page=page, size=size)


@router.post("/documents", response_model=DocumentOut, status_code=201)
async def upload_document(request: Request, file: UploadFile = File(...), title: str = Form(""),
                          category: str = Form("general"), tags: str = Form(""), description: str = Form(""),
                          employee_id: int | None = Form(None), user: User = Depends(require("documents:create")),
                          db: Session = Depends(get_db)):
    name = os.path.basename(file.filename or "upload")
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(415, f"File type {ext or '(none)'} is not allowed")
    if category not in CATEGORIES:
        raise HTTPException(422, "Unknown category")
    if employee_id and not db.get(Employee, employee_id):
        raise HTTPException(422, "Employee does not exist")
    in_db = settings.storage == "db"
    key = f"{'db:' if in_db else ''}{uuid.uuid4().hex}{ext}"
    dest = None if in_db else _store_dir() / key
    limit = settings.max_upload_mb * 1024 * 1024
    h, size, buf = hashlib.sha256(), 0, bytearray()
    out = dest.open("wb") if dest else None
    try:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB")
            h.update(chunk)
            if out:
                out.write(chunk)
            else:
                buf.extend(chunk)
        if size == 0:
            raise HTTPException(422, "File is empty")
    except HTTPException:
        if out:
            out.close()
            dest.unlink(missing_ok=True)
        raise
    finally:
        if out and not out.closed:
            out.close()
    digest = h.hexdigest()
    ctype = file.content_type or mimetypes.guess_type(name)[0] or "application/octet-stream"
    d = Document(title=title.strip() or Path(name).stem, original_filename=name, storage_key=key, content_type=ctype,
                 size_bytes=size, sha256=digest, category=category,
                 tags=[t.strip() for t in tags.split(",") if t.strip()][:20], description=description or None,
                 employee_id=employee_id, uploaded_by_id=user.id)
    db.add(d)
    db.flush()
    if in_db:
        db.add(DocumentBlob(document_id=d.id, data=bytes(buf)))
    audit(db, user, "upload", "document", d.id, f"Uploaded {name} ({size} bytes)", request)
    db.commit()
    db.refresh(d)
    return d


@router.get("/documents/{doc_id}/duplicates", response_model=list[DocumentOut])
def duplicates(doc_id: int, user: User = Depends(require("documents:view")), db: Session = Depends(get_db)):
    d = db.get(Document, doc_id) or _404("Document")
    return db.scalars(select(Document).where(Document.sha256 == d.sha256, Document.id != d.id)).all()


@router.get("/documents/{doc_id}/download")
def download(doc_id: int, request: Request, inline: bool = False, user: User = Depends(require("documents:download")),
             db: Session = Depends(get_db)):
    d = db.get(Document, doc_id) or _404("Document")
    if d.category in ("hr", "employee") and not has(user, "employees:view") and d.uploaded_by_id != user.id:
        raise HTTPException(403, "Restricted HR document")
    disposition = "inline" if inline else "attachment"
    if d.storage_key.startswith("db:"):
        blob = db.scalar(select(DocumentBlob).where(DocumentBlob.document_id == d.id))
        if blob is None:
            raise HTTPException(410, "File is missing from storage")
        audit(db, user, "download", "document", d.id, d.original_filename, request)
        db.commit()
        return Response(blob.data, media_type=d.content_type, headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(d.original_filename)}"})
    path = _store_dir() / d.storage_key
    if not path.exists():
        raise HTTPException(410, "File is missing from storage")
    audit(db, user, "download", "document", d.id, d.original_filename, request)
    db.commit()
    return FileResponse(path, media_type=d.content_type, filename=d.original_filename,
                        content_disposition_type=disposition)


@router.patch("/documents/{doc_id}", response_model=DocumentOut)
def update_document(doc_id: int, body: DocumentPatch, request: Request, user: User = Depends(require("documents:edit")),
                    db: Session = Depends(get_db)):
    d = db.get(Document, doc_id) or _404("Document")
    data = body.model_dump(exclude_unset=True)
    if "category" in data and data["category"] not in CATEGORIES:
        raise HTTPException(422, "Unknown category")
    for k, v in data.items():
        setattr(d, k, v)
    audit(db, user, "update", "document", d.id, f"Updated metadata of {d.title}", request)
    db.commit()
    db.refresh(d)
    return d


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int, request: Request, user: User = Depends(require("documents:delete")),
                    db: Session = Depends(get_db)):
    d = db.get(Document, doc_id) or _404("Document")
    if not d.storage_key.startswith("db:"):
        (_store_dir() / d.storage_key).unlink(missing_ok=True)
    db.delete(d)
    audit(db, user, "delete", "document", doc_id, f"Deleted {d.original_filename}", request)
    db.commit()


# ================= dashboard =================
@router.get("/dashboard")
def dashboard(user: User = Depends(require("dashboard:view")), db: Session = Depends(get_db)):
    today = date.today()
    count = lambda stmt: db.scalar(select(func.count()).select_from(stmt.subquery())) or 0  # noqa: E731
    my_open = count(select(Task.id).where(Task.assignee_id == user.id, Task.status != "done"))
    my_overdue = count(select(Task.id).where(Task.assignee_id == user.id, Task.status != "done", Task.due_date < today))
    due_this_week = db.scalars(select(Task).where(Task.assignee_id == user.id, Task.status != "done",
                                                  Task.due_date <= today + timedelta(days=7))
                               .order_by(Task.due_date).limit(8)).all()
    data: dict = {
        "my_open_tasks": my_open,
        "my_overdue_tasks": my_overdue,
        "my_upcoming_tasks": [_task_out(t).model_dump(mode="json") for t in due_this_week],
        "documents": count(select(Document.id)) if has(user, "documents:view") else None,
    }
    if has(user, "employees:view"):
        active = count(select(Employee.id).where(Employee.status.in_(["active", "on_notice", "onboarding"])))
        data["employees_active"] = active
        data["employees_onboarding"] = count(select(Employee.id).where(Employee.status == "onboarding"))
        by_dept = db.execute(select(func.coalesce(Employee.department_id, 0), func.count())
                             .where(Employee.status != "exited").group_by(Employee.department_id)).all()
        from ..models import Department
        names = dict(db.execute(select(Department.id, Department.name)).all())
        data["headcount_by_department"] = [{"department": names.get(d, "Unassigned"), "count": n} for d, n in by_dept]
    if has(user, "attendance:view"):
        rows = dict(db.execute(select(Attendance.status, func.count()).where(Attendance.work_date == today)
                               .group_by(Attendance.status)).all())
        data["attendance_today"] = rows
        trend = []
        for i in range(13, -1, -1):
            d = today - timedelta(days=i)
            n = count(select(Attendance.id).where(Attendance.work_date == d, Attendance.status.in_(["present", "wfh", "half_day"])))
            trend.append({"date": d.isoformat(), "present": n})
        data["attendance_trend"] = trend
    if has(user, "leave:view"):
        data["leave_pending"] = count(select(LeaveRequest.id).where(LeaveRequest.status == "pending"))
        data["on_leave_today"] = count(select(LeaveRequest.id).where(LeaveRequest.status == "approved",
                                                                     LeaveRequest.start_date <= today,
                                                                     LeaveRequest.end_date >= today))
    if has(user, "tasks:view"):
        data["tasks_overdue_all"] = count(select(Task.id).where(Task.status != "done", Task.due_date < today))
        data["tasks_by_status"] = dict(db.execute(select(Task.status, func.count()).group_by(Task.status)).all())
    if has(user, "audit:view"):
        recent = db.scalars(select(AuditLog).where(AuditLog.action.notin_(["login", "check_in", "check_out"]))
                            .order_by(AuditLog.id.desc()).limit(8)).all()
        data["recent_activity"] = [AuditOut.model_validate(a).model_dump(mode="json") for a in recent]
    return data
