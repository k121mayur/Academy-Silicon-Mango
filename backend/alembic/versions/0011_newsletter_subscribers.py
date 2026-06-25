"""newsletter — double opt-in newsletter subscribers

Revision ID: 0011_newsletter_subscribers
Revises: 0010_course_demo_url
Create Date: 2026-06-25 00:00:00

Additive only — one new table. Touches no existing table. Pending/unverified
OTPs live in Redis, so no enum or extra columns are needed here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0011_newsletter_subscribers"
down_revision: Union[str, None] = "0010_course_demo_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "newsletter_subscribers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_newsletter_subscribers_email",
        "newsletter_subscribers",
        ["email"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_newsletter_subscribers_email", table_name="newsletter_subscribers")
    op.drop_table("newsletter_subscribers")
