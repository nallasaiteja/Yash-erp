"""add must_change_password to users

Revision ID: b7e3c91d4f20
Revises: 9c4f1a2b8d10
Create Date: 2026-11-26 18:48:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b7e3c91d4f20"
down_revision: Union[str, None] = "9c4f1a2b8d10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
