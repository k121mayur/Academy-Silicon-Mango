"""student profile name parts (first/middle/last)

Revision ID: 0003_student_name_parts
Revises: 0002_videos
Create Date: 2026-05-29 10:00:00

Additive only — adds nullable first_name / middle_name / last_name columns to
student_profiles. display_name stays the canonical full name (derived from the
parts on write); the parts exist so the Profile form can round-trip exactly.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_student_name_parts"
down_revision: Union[str, None] = "0002_videos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("student_profiles", sa.Column("first_name", sa.String(100), nullable=True))
    op.add_column("student_profiles", sa.Column("middle_name", sa.String(100), nullable=True))
    op.add_column("student_profiles", sa.Column("last_name", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("student_profiles", "last_name")
    op.drop_column("student_profiles", "middle_name")
    op.drop_column("student_profiles", "first_name")
