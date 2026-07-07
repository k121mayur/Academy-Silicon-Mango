"""sessions — add attendance_reminder_sent_at

Revision ID: 0015_session_attendance_reminder
Revises: 0014_payment_enrollment_indexes
Create Date: 2026-07-07 00:00:00

Additive only — adds one nullable column to an existing table. No row is
touched, so no data can be lost. Existing rows simply read NULL (reminder
not yet sent), which is the correct initial state.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0015_session_attendance_reminder"
down_revision: Union[str, None] = "0014_payment_enrollment_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("attendance_reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sessions", "attendance_reminder_sent_at")
