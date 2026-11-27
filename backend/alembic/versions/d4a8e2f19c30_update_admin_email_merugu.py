"""one-time update of Super Administrator email to admin@meruguglobal.com

Revision ID: d4a8e2f19c30
Revises: b7e3c91d4f20
Create Date: 2026-11-27 06:55:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4a8e2f19c30"
down_revision: Union[str, None] = "b7e3c91d4f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    already = conn.execute(
        sa.text("SELECT id FROM users WHERE email = :email LIMIT 1"),
        {"email": "admin@meruguglobal.com"},
    ).scalar()
    if already is not None:
        return
    admin_id = conn.execute(
        sa.text(
            "SELECT u.id FROM users u "
            "JOIN roles r ON r.id = u.role_id "
            "WHERE r.name = 'Super Administrator' "
            "ORDER BY u.id ASC LIMIT 1"
        )
    ).scalar()
    if admin_id is not None:
        conn.execute(
            sa.text("UPDATE users SET email = :email WHERE id = :id"),
            {"email": "admin@meruguglobal.com", "id": admin_id},
        )


def downgrade() -> None:
    pass
