import csv
import io
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Attendance, Department, Employee, LeaveRequest, User
from ..schemas import (
    AttendanceManualIn, AttendanceOut, DepartmentIn, DepartmentOut, EmpBrief, EmployeeIn,
    EmployeeOut, LeaveDecisionIn, LeaveIn, LeaveOut, Page,
)
from ..security import audit, get_current_user, has, require

router = APIRouter(prefix="/api", tags=["hr"])


def _404(what: str):
    raise HTTPException(404, f"{what} not found")


def _commit(db: Session, conflict_msg: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, conflict_msg)


def my_employee(db: Session, user: User) -> Employee | None:
    return db.scalar(select(Employee).where(Employee.user_id == user.id))


# ================= departments =================
@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(_: User = Depends(require("departments:view")), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Employee.department_id, func.count())
                             .where(Employee.status != "exited").group_by(Employee.department_id)).all())
    out = []
    for d in db.scalars(select(Department).order_by(Department.name)).all():
        o = DepartmentOut.model_validate(d)
        o.employee_count = counts.get(d.id, 0)
        out.append(o)
    return out


@router.post("/departments", response_model=DepartmentOut, status_code=201)
def create_department(body: DepartmentIn, request: Request, user: User = Depends(require("departments:create")),
                      db: Session = Depends(get_db)):
    d = Department(**body.model_dump())
    d.code = d.code.upper()
    db.add(d)
    _commit(db, "Department name or code already exists")
    audit(db, user, "create", "department", d.id, f"Created department {d.name}", request)
    db.commit()
    return d


@router.put("/departments/{dept_id}", response_model=DepartmentOut)
def update_department(dept_id: int, body: DepartmentIn, request: Request,
                      user: User = Depends(require("departments:edit")), db: Session = Depends(get_db)):
    d = db.get(Department, dept_id) or _404("Department")
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    d.code = d.code.upper()
    audit(db, user, "update", "department", d.id, f"Updated department {d.name}", request)
    _commit(db, "Department name or code already exists")
    return d


@router.delete("/departments/{dept_id}", status_code=204)
def delete_department(dept_id: int, request: Request, user: User = Depends(require("departments:delete")),
                      db: Session = Depends(get_db)):
    d = db.get(Department, dept_id) or _404("Department")
    if db.scalar(select(func.count()).select_from(Employee).where(Employee.department_id == d.id,
                                                                  Employee.status != "exited")):
        raise HTTPException(400, "Department still has active employees")
    db.delete(d)
    audit(db, user, "delete", "department", dept_id, f"Deleted department {d.name}", request)
    db.commit()


# ================= employees =================
def _emp_query(q, department_id, status):
    stmt = select(Employee)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Employee.full_name).like(like), func.lower(Employee.employee_code).like(like),
                              func.lower(Employee.email).like(like), func.lower(Employee.designation).like(like)))
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if status:
        stmt = stmt.where(Employee.status == status)
    return stmt


@router.get("/employees", response_model=Page[EmployeeOut])
def list_employees(q: str | None = None, department_id: int | None = None, status: str | None = None,
                   page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=200),
                   _: User = Depends(require("employees:view")), db: Session = Depends(get_db)):
    stmt = _emp_query(q, department_id, status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.order_by(Employee.full_name).offset((page - 1) * size).limit(size)).all()
    return Page(items=items, total=total, page=page, size=size)


@router.get("/employees/lookup", response_model=list[EmpBrief])
def lookup_employees(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Employee).where(Employee.status != "exited").order_by(Employee.full_name)).all()


@router.get("/employees/export")
def export_employees(request: Request, q: str | None = None, department_id: int | None = None,
                     status: str | None = None, user: User = Depends(require("employees:export")),
                     db: Session = Depends(get_db)):
    rows = db.scalars(_emp_query(q, department_id, status).order_by(Employee.employee_code)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Code", "Name", "Email", "Phone", "Designation", "Department", "Type", "Status", "Joined", "Exited"])
    for e in rows:
        w.writerow([e.employee_code, e.full_name, e.email or "", e.phone or "", e.designation or "",
                    e.department.name if e.department else "", e.employment_type, e.status,
                    e.date_of_joining or "", e.date_of_exit or ""])
    audit(db, user, "export", "employee", summary=f"Exported {len(rows)} employees", request=request)
    db.commit()
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=employees.csv"})


@router.get("/employees/{emp_id}", response_model=EmployeeOut)
def get_employee(emp_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id) or _404("Employee")
    if not has(user, "employees:view") and e.user_id != user.id:
        raise HTTPException(403, "Missing permission: employees:view")
    return e


def _validate_refs(db: Session, body: EmployeeIn, self_id: int | None = None):
    if body.department_id and not db.get(Department, body.department_id):
        raise HTTPException(422, "Department does not exist")
    if body.manager_id:
        if body.manager_id == self_id:
            raise HTTPException(422, "An employee cannot be their own manager")
        if not db.get(Employee, body.manager_id):
            raise HTTPException(422, "Manager does not exist")
    if body.user_id and not db.get(User, body.user_id):
        raise HTTPException(422, "Linked user does not exist")


@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(body: EmployeeIn, request: Request, user: User = Depends(require("employees:create")),
                    db: Session = Depends(get_db)):
    _validate_refs(db, body)
    data = body.model_dump()
    data["email"] = data["email"].lower() if data["email"] else None
    e = Employee(**data)
    db.add(e)
    _commit(db, "Employee code, email or linked user already in use")
    audit(db, user, "create", "employee", e.id, f"Created employee {e.employee_code} {e.full_name}", request)
    db.commit()
    db.refresh(e)
    return e


@router.put("/employees/{emp_id}", response_model=EmployeeOut)
def update_employee(emp_id: int, body: EmployeeIn, request: Request, user: User = Depends(require("employees:edit")),
                    db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id) or _404("Employee")
    _validate_refs(db, body, emp_id)
    before = e.status
    data = body.model_dump()
    data["email"] = data["email"].lower() if data["email"] else None
    for k, v in data.items():
        setattr(e, k, v)
    msg = f"Updated employee {e.employee_code}"
    if before != e.status:
        msg += f" (status {before} → {e.status})"
    audit(db, user, "update", "employee", e.id, msg, request)
    _commit(db, "Employee code, email or linked user already in use")
    db.refresh(e)
    return e


@router.delete("/employees/{emp_id}", status_code=204)
def delete_employee(emp_id: int, request: Request, user: User = Depends(require("employees:delete")),
                    db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id) or _404("Employee")
    db.delete(e)
    audit(db, user, "delete", "employee", emp_id, f"Deleted employee {e.employee_code} {e.full_name}", request)
    db.commit()


# ================= attendance =================
def _att_out(a: Attendance) -> AttendanceOut:
    o = AttendanceOut.model_validate(a)
    if a.check_in and a.check_out:
        o.hours = round((a.check_out - a.check_in).total_seconds() / 3600, 2)
    return o


@router.get("/attendance/today", response_model=AttendanceOut | None)
def my_today(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emp = my_employee(db, user)
    if not emp:
        return None
    a = db.scalar(select(Attendance).where(Attendance.employee_id == emp.id, Attendance.work_date == date.today()))
    return _att_out(a) if a else None


@router.post("/attendance/check-in", response_model=AttendanceOut)
def check_in(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emp = my_employee(db, user) or _no_profile()
    a = db.scalar(select(Attendance).where(Attendance.employee_id == emp.id, Attendance.work_date == date.today()))
    if a and a.check_in:
        raise HTTPException(400, "Already checked in today")
    now = datetime.now(timezone.utc)
    if a is None:
        a = Attendance(employee_id=emp.id, work_date=date.today(), source="web")
        db.add(a)
    a.check_in, a.status = now, "present"
    audit(db, user, "check_in", "attendance", emp.id, request=request)
    db.commit()
    db.refresh(a)
    return _att_out(a)


@router.post("/attendance/check-out", response_model=AttendanceOut)
def check_out(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emp = my_employee(db, user) or _no_profile()
    a = db.scalar(select(Attendance).where(Attendance.employee_id == emp.id, Attendance.work_date == date.today()))
    if not a or not a.check_in:
        raise HTTPException(400, "You have not checked in today")
    if a.check_out:
        raise HTTPException(400, "Already checked out today")
    a.check_out = datetime.now(timezone.utc)
    audit(db, user, "check_out", "attendance", emp.id, request=request)
    db.commit()
    db.refresh(a)
    return _att_out(a)


def _no_profile():
    raise HTTPException(400, "Your login is not linked to an employee profile. Ask HR to link it.")


def _att_query(db, user, start, end, employee_id, department_id):
    stmt = select(Attendance).join(Employee).where(Attendance.work_date.between(start, end))
    if not has(user, "attendance:view"):
        emp = my_employee(db, user)
        stmt = stmt.where(Attendance.employee_id == (emp.id if emp else -1))
    elif employee_id:
        stmt = stmt.where(Attendance.employee_id == employee_id)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    return stmt


@router.get("/attendance", response_model=Page[AttendanceOut])
def list_attendance(start: date | None = None, end: date | None = None, employee_id: int | None = None,
                    department_id: int | None = None, page: int = Query(1, ge=1),
                    size: int = Query(50, ge=1, le=500), user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    end = end or date.today()
    start = start or end - timedelta(days=30)
    stmt = _att_query(db, user, start, end, employee_id, department_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Attendance.work_date.desc(), Employee.full_name)
                      .offset((page - 1) * size).limit(size)).all()
    return Page(items=[_att_out(a) for a in rows], total=total, page=page, size=size)


@router.put("/attendance", response_model=AttendanceOut)
def upsert_attendance(body: AttendanceManualIn, request: Request, user: User = Depends(require("attendance:edit")),
                      db: Session = Depends(get_db)):
    db.get(Employee, body.employee_id) or _404("Employee")
    a = db.scalar(select(Attendance).where(Attendance.employee_id == body.employee_id,
                                           Attendance.work_date == body.work_date))
    if a is None:
        a = Attendance(employee_id=body.employee_id, work_date=body.work_date)
        db.add(a)
    a.status, a.check_in, a.check_out, a.notes, a.source = body.status, body.check_in, body.check_out, body.notes, "manual"
    audit(db, user, "upsert", "attendance", body.employee_id,
          f"Manual attendance {body.work_date} = {body.status}", request)
    db.commit()
    db.refresh(a)
    return _att_out(a)


@router.get("/attendance/report")
def monthly_report(year: int, month: int = Query(ge=1, le=12), department_id: int | None = None,
                   format: str = "json", request: Request = None, user: User = Depends(require("attendance:view")),
                   db: Session = Depends(get_db)):
    start = date(year, month, 1)
    end = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1))
    working_days = sum(1 for i in range((end - start).days + 1) if (start + timedelta(days=i)).weekday() != 6)
    emps = select(Employee).where(Employee.status != "exited")
    if department_id:
        emps = emps.where(Employee.department_id == department_id)
    emps = db.scalars(emps.order_by(Employee.employee_code)).all()
    rows = db.execute(select(Attendance.employee_id, Attendance.status, func.count())
                      .where(Attendance.work_date.between(start, end))
                      .group_by(Attendance.employee_id, Attendance.status)).all()
    agg: dict[int, dict[str, int]] = {}
    for eid, st, n in rows:
        agg.setdefault(eid, {})[st] = n
    report = []
    for e in emps:
        s = agg.get(e.id, {})
        present = s.get("present", 0) + s.get("wfh", 0) + 0.5 * s.get("half_day", 0)
        report.append({
            "employee_id": e.id, "employee_code": e.employee_code, "full_name": e.full_name,
            "department": e.department.name if e.department else None,
            "present": s.get("present", 0), "wfh": s.get("wfh", 0), "half_day": s.get("half_day", 0),
            "leave": s.get("leave", 0), "absent": s.get("absent", 0), "holiday": s.get("holiday", 0),
            "effective_days": present, "working_days": working_days,
            "attendance_pct": round(100 * present / working_days, 1) if working_days else 0,
        })
    if format == "csv":
        audit(db, user, "export", "attendance", summary=f"Monthly report {year}-{month:02d}", request=request)
        db.commit()
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=list(report[0].keys()) if report else ["employee_code"])
        w.writeheader()
        w.writerows(report)
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                                 headers={"Content-Disposition": f"attachment; filename=attendance-{year}-{month:02d}.csv"})
    return {"year": year, "month": month, "working_days": working_days, "rows": report}


# ================= leave =================
def _leave_out(l: LeaveRequest) -> LeaveOut:
    o = LeaveOut.model_validate(l)
    o.days = (l.end_date - l.start_date).days + 1
    return o


@router.get("/leave", response_model=Page[LeaveOut])
def list_leave(status: str | None = None, mine: bool = False, page: int = Query(1, ge=1),
               size: int = Query(50, ge=1, le=200), user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    stmt = select(LeaveRequest)
    if mine or not has(user, "leave:view"):
        emp = my_employee(db, user)
        stmt = stmt.where(LeaveRequest.employee_id == (emp.id if emp else -1))
    if status:
        stmt = stmt.where(LeaveRequest.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(LeaveRequest.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    return Page(items=[_leave_out(l) for l in rows], total=total, page=page, size=size)


@router.post("/leave", response_model=LeaveOut, status_code=201)
def apply_leave(body: LeaveIn, request: Request, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    if body.employee_id and has(user, "leave:approve"):
        emp = db.get(Employee, body.employee_id) or _404("Employee")
    else:
        emp = my_employee(db, user) or _no_profile()
    overlap = db.scalar(select(func.count()).select_from(LeaveRequest).where(
        LeaveRequest.employee_id == emp.id, LeaveRequest.status.in_(["pending", "approved"]),
        LeaveRequest.start_date <= body.end_date, LeaveRequest.end_date >= body.start_date))
    if overlap:
        raise HTTPException(409, "Overlaps an existing pending or approved leave request")
    l = LeaveRequest(employee_id=emp.id, leave_type=body.leave_type, start_date=body.start_date,
                     end_date=body.end_date, reason=body.reason)
    db.add(l)
    db.flush()
    audit(db, user, "create", "leave", l.id, f"{emp.full_name}: {body.leave_type} {body.start_date}→{body.end_date}", request)
    db.commit()
    db.refresh(l)
    return _leave_out(l)


@router.post("/leave/{leave_id}/decision", response_model=LeaveOut)
def decide_leave(leave_id: int, body: LeaveDecisionIn, request: Request, user: User = Depends(require("leave:approve")),
                 db: Session = Depends(get_db)):
    l = db.get(LeaveRequest, leave_id) or _404("Leave request")
    if l.status != "pending":
        raise HTTPException(400, f"Request is already {l.status}")
    if l.employee.user_id == user.id:
        raise HTTPException(403, "You cannot approve your own leave")
    l.status, l.decided_by_id, l.decided_at, l.decision_note = body.decision, user.id, datetime.now(timezone.utc), body.note
    if body.decision == "approved":
        d = l.start_date
        while d <= l.end_date:
            a = db.scalar(select(Attendance).where(Attendance.employee_id == l.employee_id, Attendance.work_date == d))
            if a is None:
                db.add(Attendance(employee_id=l.employee_id, work_date=d, status="leave", source="manual",
                                  notes=f"Leave #{l.id}"))
            elif not a.check_in:
                a.status, a.notes = "leave", f"Leave #{l.id}"
            d += timedelta(days=1)
    audit(db, user, body.decision, "leave", l.id, f"{l.employee.full_name} leave {body.decision}", request)
    db.commit()
    db.refresh(l)
    return _leave_out(l)


@router.post("/leave/{leave_id}/cancel", response_model=LeaveOut)
def cancel_leave(leave_id: int, request: Request, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    l = db.get(LeaveRequest, leave_id) or _404("Leave request")
    if l.employee.user_id != user.id and not has(user, "leave:approve"):
        raise HTTPException(403, "Not your leave request")
    if l.status != "pending":
        raise HTTPException(400, "Only pending requests can be cancelled")
    l.status = "cancelled"
    audit(db, user, "cancel", "leave", l.id, request=request)
    db.commit()
    db.refresh(l)
    return _leave_out(l)
