from datetime import date, datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


# ---------- auth ----------
class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=160)
    password: str = Field(min_length=1, max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class RoleBrief(ORM):
    id: int
    name: str


class Me(ORM):
    id: int
    email: str
    full_name: str
    role: RoleBrief
    permissions: list[str]
    employee_id: int | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Me


# ---------- roles / users ----------
class PermissionOut(ORM):
    id: int
    code: str
    module: str
    action: str


class RoleOut(ORM):
    id: int
    name: str
    description: str | None
    is_system: bool
    permissions: list[str]
    user_count: int = 0


class RoleIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    description: str | None = Field(None, max_length=255)
    permissions: list[str] = []


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: RoleBrief
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    role_id: int
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    role_id: int | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=8, max_length=200)


class UserBrief(ORM):
    id: int
    full_name: str
    email: str


# ---------- departments ----------
class DepartmentIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = Field(None, max_length=255)
    head_employee_id: int | None = None


class DepartmentOut(ORM):
    id: int
    name: str
    code: str
    description: str | None
    head_employee_id: int | None
    employee_count: int = 0


# ---------- employees ----------
EmpStatus = Literal["onboarding", "active", "on_notice", "exited"]
EmpType = Literal["full_time", "part_time", "contract", "intern"]


class EmployeeIn(BaseModel):
    employee_code: str = Field(min_length=1, max_length=20)
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=20, pattern=r"^[0-9+\-\s()]*$")
    designation: str | None = Field(None, max_length=100)
    department_id: int | None = None
    manager_id: int | None = None
    user_id: int | None = None
    employment_type: EmpType = "full_time"
    status: EmpStatus = "active"
    date_of_joining: date | None = None
    date_of_exit: date | None = None
    address: str | None = None
    emergency_contact: str | None = Field(None, max_length=160)

    @model_validator(mode="after")
    def check_dates(self):
        if self.date_of_exit and self.date_of_joining and self.date_of_exit < self.date_of_joining:
            raise ValueError("Exit date cannot be before joining date")
        if self.status == "exited" and not self.date_of_exit:
            raise ValueError("Exit date is required when status is 'exited'")
        return self


class DeptBrief(ORM):
    id: int
    name: str


class EmployeeOut(ORM):
    id: int
    employee_code: str
    full_name: str
    email: str | None
    phone: str | None
    designation: str | None
    department_id: int | None
    department: DeptBrief | None
    manager_id: int | None
    user_id: int | None
    employment_type: str
    status: str
    date_of_joining: date | None
    date_of_exit: date | None
    address: str | None
    emergency_contact: str | None
    created_at: datetime


class EmpBrief(ORM):
    id: int
    employee_code: str
    full_name: str


# ---------- attendance ----------
AttStatus = Literal["present", "absent", "half_day", "leave", "holiday", "wfh"]


class AttendanceOut(ORM):
    id: int
    employee_id: int
    employee: EmpBrief
    work_date: date
    check_in: datetime | None
    check_out: datetime | None
    status: str
    source: str
    notes: str | None
    hours: float | None = None


class AttendanceManualIn(BaseModel):
    employee_id: int
    work_date: date
    status: AttStatus
    check_in: datetime | None = None
    check_out: datetime | None = None
    notes: str | None = Field(None, max_length=255)

    @model_validator(mode="after")
    def check_times(self):
        if self.check_in and self.check_out and self.check_out < self.check_in:
            raise ValueError("Check-out cannot be before check-in")
        return self


# ---------- leave ----------
LeaveType = Literal["casual", "sick", "earned", "unpaid", "comp_off"]


class LeaveIn(BaseModel):
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: str | None = Field(None, max_length=1000)
    employee_id: int | None = None  # HR may file on behalf of someone

    @model_validator(mode="after")
    def check_range(self):
        if self.end_date < self.start_date:
            raise ValueError("End date cannot be before start date")
        return self


class LeaveDecisionIn(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str | None = Field(None, max_length=255)


class LeaveOut(ORM):
    id: int
    employee_id: int
    employee: EmpBrief
    leave_type: str
    start_date: date
    end_date: date
    days: int = 0
    reason: str | None
    status: str
    decided_at: datetime | None
    decision_note: str | None
    created_at: datetime


# ---------- tasks ----------
Priority = Literal["low", "medium", "high", "urgent"]
TaskStatus = Literal["todo", "in_progress", "blocked", "done"]


class TaskIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = None
    assignee_id: int | None = None
    priority: Priority = "medium"
    status: TaskStatus = "todo"
    due_date: date | None = None


class TaskPatch(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=200)
    description: str | None = None
    assignee_id: int | None = None
    priority: Priority | None = None
    status: TaskStatus | None = None
    due_date: date | None = None


class TaskOut(ORM):
    id: int
    title: str
    description: str | None
    assignee: UserBrief | None
    created_by: UserBrief
    priority: str
    status: str
    due_date: date | None
    completed_at: datetime | None
    created_at: datetime
    overdue: bool = False


# ---------- documents ----------
class DocumentOut(ORM):
    id: int
    title: str
    original_filename: str
    content_type: str
    size_bytes: int
    sha256: str
    category: str
    tags: list[str]
    description: str | None
    employee_id: int | None
    uploaded_by: UserBrief
    created_at: datetime


class DocumentPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    category: str | None = Field(None, max_length=40)
    tags: list[str] | None = None
    description: str | None = None


# ---------- audit ----------
class AuditOut(ORM):
    id: int
    user: UserBrief | None
    action: str
    entity: str
    entity_id: str | None
    summary: str | None
    ip_address: str | None
    created_at: datetime
