"""Idempotent seed: permission catalogue, built-in roles, first admin, starter departments."""
from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .models import Department, Permission, Role, User
from .permissions import ALL, DEFAULT_ROLES
from .security import hash_password

DEPARTMENTS = [
    ("Management", "MGMT"), ("Tender & Estimation", "TENDER"), ("Electrical Design & Engineering", "EDE"),
    ("Electrical Execution", "EXEC"), ("MEP Design & Execution", "MEP"), ("Fire Fighting Systems", "FIRE"),
    ("Interior Fit-Out", "INT"), ("Liaisoning", "LIAS"), ("Procurement", "PROC"), ("Finance & Accounts", "FIN"),
    ("Human Resources", "HR"), ("Administration", "ADMIN"),
]


def run() -> None:
    db = SessionLocal()
    try:
        existing = {p.code: p for p in db.scalars(select(Permission)).all()}
        for code in ALL:
            if code not in existing:
                m, a = code.split(":")
                existing[code] = Permission(code=code, module=m, action=a)
                db.add(existing[code])
        db.flush()

        for name, (desc, codes) in DEFAULT_ROLES.items():
            role = db.scalar(select(Role).where(Role.name == name))
            if role is None:
                db.add(Role(name=name, description=desc, is_system=True,
                            permissions=[existing[c] for c in sorted(set(codes))]))
            elif name == "Super Administrator":
                role.permissions = [existing[c] for c in ALL]  # always keep full access
        db.flush()

        if not db.scalar(select(User).limit(1)):
            admin_role = db.scalar(select(Role).where(Role.name == "Super Administrator"))
            db.add(User(email=settings.admin_email.lower(), full_name="System Administrator",
                        password_hash=hash_password(settings.admin_password), role_id=admin_role.id))
            print(f"Seeded admin user {settings.admin_email}")

        if not db.scalar(select(Department).limit(1)):
            for n, c in DEPARTMENTS:
                db.add(Department(name=n, code=c))
        db.commit()
        print("Seed complete")
    finally:
        db.close()


if __name__ == "__main__":
    run()
