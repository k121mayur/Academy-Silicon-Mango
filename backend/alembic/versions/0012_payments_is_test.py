"""payments.is_test — mark test/dummy enrollments so they never count as revenue

Revision ID: 0012_payments_is_test
Revises: 0011_newsletter_subscribers
Create Date: 2026-07-03 00:00:00

Additive only — one new boolean column with a server default. On PostgreSQL a
column ADD with a non-volatile default is a metadata-only change (no table
rewrite), so this is safe on the live volume. Existing rows become is_test=false,
which preserves the current revenue totals exactly.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012_payments_is_test"
down_revision: Union[str, None] = "0011_newsletter_subscribers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("payments", "is_test")
