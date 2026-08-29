"""courses — add language of instruction column

Revision ID: 0018_course_language
Revises: 0017_enrollment_date_indexes
Create Date: 2026-08-29 00:00:00

Additive migration — adds `language` column with default 'English' to `courses` table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018_course_language"
down_revision: Union[str, None] = "0017_enrollment_date_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("language", sa.String(length=50), nullable=False, server_default="English"),
    )


def downgrade() -> None:
    op.drop_column("courses", "language")
