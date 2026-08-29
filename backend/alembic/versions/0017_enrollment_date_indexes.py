"""users/enrollments — add date-column indexes for admin date-range filters

Revision ID: 0017_enrollment_date_indexes
Revises: 0016_submission_multi_file
Create Date: 2026-07-08 00:00:00

Additive only — adds indexes to existing tables/columns. No table, column, or
row is touched, so no data can be lost. Uses CREATE INDEX CONCURRENTLY (each
in its own autocommit block, outside the migration's transaction) so the
users/enrollments tables are never write-locked while the index builds — safe
to run against the live production tables without downtime. IF NOT EXISTS
makes this safe to re-run if a prior attempt partially completed.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0017_enrollment_date_indexes"
down_revision: Union[str, None] = "0016_submission_multi_file"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEXES = [
    ("ix_users_created_at", "users", "created_at"),
    ("ix_enrollments_enrolled_at", "enrollments", "enrolled_at"),
]


def upgrade() -> None:
    for name, table, column in _INDEXES:
        with op.get_context().autocommit_block():
            op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {table} ({column})")


def downgrade() -> None:
    for name, table, _column in _INDEXES:
        with op.get_context().autocommit_block():
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
