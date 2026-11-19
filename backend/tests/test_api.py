"""End-to-end API tests against a running server.

Run:  docker compose exec api pytest -q tests     (BASE_URL defaults to http://localhost:8000)
Creates uniquely-named records each run, so it is safe on a dev database.
"""
import os
import uuid
from datetime import date, timedelta

import httpx
import pytest

BASE = os.environ.get("BASE_URL", "http://localhost:8000")
ADMIN = (os.environ.get("ADMIN_EMAIL", "admin@yashpowertech.local"), os.environ.get("ADMIN_PASSWORD", "Admin@12345"))
RUN = uuid.uuid4().hex[:6]


def client() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=20)


def login(email, password):
    c = client()
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return c, r.json()


@pytest.fixture(scope="module")
def admin():
    c, _ = login(*ADMIN)
    return c


@pytest.fixture(scope="module")
def staff(admin):
    """An 'Employee'-role user linked to an employee profile."""
    roles = {r["name"]: r["id"] for r in admin.get("/api/roles").json()}
    email = f"staff.{RUN}@example.com"
    u = admin.post("/api/users", json={"email": email, "full_name": f"Staff {RUN}", "password": "Staff@12345",
                                      "role_id": roles["Employee"]}).json()
    dept = admin.get("/api/departments").json()[0]["id"]
    e = admin.post("/api/employees", json={"employee_code": f"T-{RUN}", "full_name": f"Staff {RUN}", "email": email,
                                          "department_id": dept, "user_id": u["id"],
                                          "date_of_joining": "2026-01-05"}).json()
    c, me = login(email, "Staff@12345")
    assert me["user"]["employee_id"] == e["id"]
    return {"c": c, "user": u, "emp": e}


def test_health_and_bad_login():
    c = client()
    assert c.get("/api/health").json() == {"status": "ok"}
    assert c.post("/api/auth/login", json={"email": ADMIN[0], "password": "wrong"}).status_code == 401
    assert c.get("/api/employees").status_code == 401


def test_refresh_rotation_and_reuse_detection():
    c = client()
    r = c.post("/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
    first = r.cookies.get("yash_refresh")
    assert first
    r2 = client().post("/api/auth/refresh", cookies={"yash_refresh": first})
    assert r2.status_code == 200
    second = r2.cookies.get("yash_refresh")
    assert second and second != first
    # Within the 30 s grace window, replaying the old token is treated as a tab race (allowed).
    assert client().post("/api/auth/refresh", cookies={"yash_refresh": first}).status_code == 200
    # Logging out revokes the cookie it was given.
    client().post("/api/auth/logout", cookies={"yash_refresh": second})
    assert client().post("/api/auth/refresh", cookies={"yash_refresh": "garbage"}).status_code == 401


def test_permissions_enforced(staff):
    c = staff["c"]
    assert c.get("/api/users").status_code == 403
    assert c.get("/api/employees").status_code == 403
    assert c.get("/api/audit").status_code == 403
    assert c.post("/api/departments", json={"name": "X", "code": "X"}).status_code == 403
    assert c.get(f"/api/employees/{staff['emp']['id']}").status_code == 200  # own profile
    assert c.get("/api/dashboard").status_code == 200


def test_employee_validation(admin):
    r = admin.post("/api/employees", json={"employee_code": f"V-{RUN}", "full_name": "Val Test", "status": "exited"})
    assert r.status_code == 422 and "Exit date" in r.text
    ok = admin.post("/api/employees", json={"employee_code": f"V-{RUN}", "full_name": "Val Test"})
    assert ok.status_code == 201
    dup = admin.post("/api/employees", json={"employee_code": f"V-{RUN}", "full_name": "Dup"})
    assert dup.status_code == 409
    exp = admin.get("/api/employees/export", params={"q": f"V-{RUN}"})
    assert exp.status_code == 200 and f"V-{RUN}" in exp.text


def test_check_in_out(staff):
    c = staff["c"]
    r = c.post("/api/attendance/check-in")
    if r.status_code == 400:  # already checked in today on an earlier run
        assert "Already" in r.text
    else:
        assert r.status_code == 200 and r.json()["check_in"]
        assert c.post("/api/attendance/check-in").status_code == 400
        out = c.post("/api/attendance/check-out")
        assert out.status_code == 200 and out.json()["hours"] is not None
    mine = c.get("/api/attendance").json()
    assert all(a["employee_id"] == staff["emp"]["id"] for a in mine["items"])


def test_leave_flow(admin, staff):
    c = staff["c"]
    start = date.today() + timedelta(days=40)
    body = {"leave_type": "casual", "start_date": str(start), "end_date": str(start + timedelta(days=1)), "reason": "Family"}
    l = c.post("/api/leave", json=body)
    assert l.status_code == 201, l.text
    assert l.json()["days"] == 2
    assert c.post("/api/leave", json=body).status_code == 409  # overlap
    assert c.post(f"/api/leave/{l.json()['id']}/decision", json={"decision": "approved"}).status_code == 403
    d = admin.post(f"/api/leave/{l.json()['id']}/decision", json={"decision": "approved", "note": "ok"})
    assert d.status_code == 200 and d.json()["status"] == "approved"
    att = admin.get("/api/attendance", params={"start": str(start), "end": str(start + timedelta(days=1)),
                                               "employee_id": staff["emp"]["id"]}).json()
    assert {a["status"] for a in att["items"]} == {"leave"} and att["total"] == 2
    bad = c.post("/api/leave", json={**body, "end_date": str(start - timedelta(days=1))})
    assert bad.status_code == 422


def test_tasks(admin, staff):
    t = admin.post("/api/tasks", json={"title": f"Prepare LT panel BOQ {RUN}", "assignee_id": staff["user"]["id"],
                                       "priority": "high", "due_date": str(date.today() - timedelta(days=1))})
    assert t.status_code == 201
    tid = t.json()["id"]
    c = staff["c"]
    mine = c.get("/api/tasks", params={"scope": "mine", "overdue": True}).json()
    assert any(x["id"] == tid and x["overdue"] for x in mine["items"])
    assert c.patch(f"/api/tasks/{tid}", json={"title": "hijack"}).status_code == 403
    done = c.patch(f"/api/tasks/{tid}", json={"status": "done"})
    assert done.status_code == 200 and done.json()["completed_at"]
    assert c.delete(f"/api/tasks/{tid}").status_code == 403


def test_documents(admin, staff):
    content = f"Tender notice {RUN}".encode()
    files = {"file": (f"notice-{RUN}.pdf", content, "application/pdf")}
    r = admin.post("/api/documents", files=files, data={"category": "tender", "tags": "GeM, LT works"})
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["tags"] == ["GeM", "LT works"] and d["size_bytes"] == len(content)
    r2 = admin.post("/api/documents", files={"file": (f"copy-{RUN}.pdf", content, "application/pdf")}, data={"category": "tender"})
    dupes = admin.get(f"/api/documents/{r2.json()['id']}/duplicates").json()
    assert any(x["id"] == d["id"] for x in dupes)
    dl = staff["c"].get(f"/api/documents/{d['id']}/download")
    assert dl.status_code == 200 and dl.content == content
    assert admin.post("/api/documents", files={"file": ("evil.exe", b"MZ", "application/octet-stream")}).status_code == 415
    assert staff["c"].delete(f"/api/documents/{d['id']}").status_code == 403
    found = admin.get("/api/documents", params={"tag": "gem", "q": RUN}).json()
    assert found["total"] >= 1
    # HR documents are hidden from staff
    hr = admin.post("/api/documents", files={"file": (f"payslip-{RUN}.pdf", b"secret", "application/pdf")}, data={"category": "hr"}).json()
    assert staff["c"].get(f"/api/documents/{hr['id']}/download").status_code == 403


def test_roles_and_audit(admin, staff):
    roles = admin.get("/api/roles").json()
    emp_role = next(r for r in roles if r["name"] == "Employee")
    # Grant employees:view to Employee role, verify, then revoke.
    admin.put(f"/api/roles/{emp_role['id']}", json={"name": "Employee", "description": emp_role["description"],
                                                    "permissions": emp_role["permissions"] + ["employees:view"]})
    c2, _ = login(staff["user"]["email"], "Staff@12345")
    assert c2.get("/api/employees").status_code == 200
    admin.put(f"/api/roles/{emp_role['id']}", json={"name": "Employee", "description": emp_role["description"],
                                                    "permissions": emp_role["permissions"]})
    assert admin.put(f"/api/roles/{emp_role['id']}", json={"name": "Employee", "permissions": ["nope:x"]}).status_code == 422
    log = admin.get("/api/audit", params={"entity": "role"}).json()
    assert log["total"] >= 2
    rep = admin.get("/api/attendance/report", params={"year": date.today().year, "month": date.today().month}).json()
    assert rep["working_days"] > 0 and any(r["employee_id"] == staff["emp"]["id"] for r in rep["rows"])


def test_deactivate_user_blocks_login(admin, staff):
    roles = {r["name"]: r["id"] for r in admin.get("/api/roles").json()}
    u = admin.post("/api/users", json={"email": f"temp.{RUN}@example.com", "full_name": "Temp", "password": "Temp@12345",
                                      "role_id": roles["Employee"]}).json()
    assert admin.delete(f"/api/users/{u['id']}").status_code == 204
    r = client().post("/api/auth/login", json={"email": f"temp.{RUN}@example.com", "password": "Temp@12345"})
    assert r.status_code == 403
