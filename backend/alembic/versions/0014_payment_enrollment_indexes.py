"""payments/enrollments — add missing lookup indexes

Revision ID: 0014_payment_enrollment_indexes
Revises: 0013_batch_email_campaigns
Create Date: 2026-07-04 00:00:00

Additive only — adds indexes to existing tables/columns. No table, column, or
row is touched, so no data can be lost. Uses CREATE INDEX CONCURRENTLY (each
in its own autocommit block, outside the migration's transaction) so the
payments/enrollments tables are never write-locked while the index builds —
safe to run against the live production tables without downtime. IF NOT
EXISTS makes this safe to re-run if a prior attempt partially completed.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0014_payment_enrollment_indexes"
down_revision: Union[str, None] = "0013_batch_email_campaigns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEXES = [
    ("ix_payments_status", "payments", "status"),
    ("ix_payments_created_at", "payments", "created_at"),
    ("ix_payments_student_id", "payments", "student_id"),
    ("ix_payments_batch_id", "payments", "batch_id"),
    ("ix_enrollments_student_id", "enrollments", "student_id"),
    ("ix_enrollments_batch_id", "enrollments", "batch_id"),
]


def upgrade() -> None:
    for name, table, column in _INDEXES:
        with op.get_context().autocommit_block():
            op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {table} ({column})")


def downgrade() -> None:
    for name, table, _column in _INDEXES:
        with op.get_context().autocommit_block():
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
