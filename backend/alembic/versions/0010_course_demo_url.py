"""course demo session — optional YouTube preview URL on courses

Revision ID: 0010_course_demo_url
Revises: 0009_blogs
Create Date: 2026-06-24 00:00:00

Additive only — one nullable column on the existing `courses` table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010_course_demo_url"
down_revision: Union[str, None] = "0009_blogs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("demo_youtube_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("courses", "demo_youtube_url")
