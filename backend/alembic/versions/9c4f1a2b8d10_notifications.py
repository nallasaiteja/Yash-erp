"""notifications tables

Revision ID: 9c4f1a2b8d10
Revises: 50e0779b9922
Create Date: 2026-11-26 18:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9c4f1a2b8d10"
down_revision: Union[str, None] = "50e0779b9922"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="normal"),
        sa.Column("audience", sa.String(length=20), nullable=False, server_default="all"),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "notification_recipients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("notification_id", sa.Integer(), sa.ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("notification_id", "user_id", name="uq_notification_recipient"),
    )
    op.create_index("ix_notification_recipients_notification_id", "notification_recipients", ["notification_id"])
    op.create_index("ix_notification_recipients_user_id", "notification_recipients", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_notification_recipients_user_id", table_name="notification_recipients")
    op.drop_index("ix_notification_recipients_notification_id", table_name="notification_recipients")
    op.drop_table("notification_recipients")
    op.drop_table("notifications")
