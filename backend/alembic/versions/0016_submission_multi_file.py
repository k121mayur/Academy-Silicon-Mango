"""submissions — add file_urls for multi-file assignment uploads

Revision ID: 0016_submission_multi_file
Revises: 0015_session_attendance_reminder
Create Date: 2026-07-07 00:00:00

Additive only — adds one nullable JSONB column to an existing table. No row
is touched, so no data can be lost. Existing rows keep reading their single
file via the pre-existing `file_url` column; new multi-file submissions also
populate `file_urls`.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0016_submission_multi_file"
down_revision: Union[str, None] = "0015_session_attendance_reminder"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "submissions",
        sa.Column("file_urls", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("submissions", "file_urls")
