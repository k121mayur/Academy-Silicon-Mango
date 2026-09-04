"""batches — add is_enrollment_closed column for admin enrollment control

Revision ID: 0020_batch_is_enrollment_closed
Revises: 0019_reviews
Create Date: 2026-09-02 00:00:00

Additive migration — adds `is_enrollment_closed` boolean column (default false)
to `batches` table to allow admins to stop/reopen batch enrollments.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0020_batch_is_enrollment_closed"
down_revision: Union[str, None] = "0019_reviews"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "batches",
        sa.Column("is_enrollment_closed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("batches", "is_enrollment_closed")
