"""reviews and review comments

Revision ID: 0019_reviews
Revises: 0018_course_language
Create Date: 2026-08-29 00:00:00

Additive migration — creates `reviews` and `review_comments` tables, and seeds initial testimonials.
"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0019_reviews"
down_revision: Union[str, None] = "0018_course_language"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create reviews table
    reviews_table = op.create_table(
        "reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("designation", sa.String(length=255), nullable=False),
        sa.Column("company_or_institution", sa.String(length=255), nullable=False),
        sa.Column("review_text", sa.Text(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_reviews_rating", "reviews", ["rating"])
    op.create_index("ix_reviews_is_approved", "reviews", ["is_approved"])

    # 2. Create review_comments table
    op.create_table(
        "review_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("review_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_name", sa.String(length=255), nullable=False),
        sa.Column("user_role", sa.String(length=50), nullable=False),
        sa.Column("comment_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_review_comments_review_id", "review_comments", ["review_id"])

    # 3. Seed initial 2 testimonials
    op.bulk_insert(
        reviews_table,
        [
            {
                "id": uuid.uuid4(),
                "rating": 5,
                "name": "Swapna Ghormode",
                "designation": "Technical Assistant",
                "company_or_institution": "Silicon Mango Academy",
                "review_text": (
                    "An absolutely fantastic basic Excel course. The instructor has a wonderful teaching style that "
                    "breaks down complex functions into simple, easy-to-understand language. No matter your prior "
                    "experience, they ensure that absolutely everyone's doubts are cleared. I feel much more confident using Excel now"
                ),
                "is_approved": True,
            },
            {
                "id": uuid.uuid4(),
                "rating": 5,
                "name": "Kiran M.",
                "designation": "Process Engineer",
                "company_or_institution": "Praj Industries",
                "review_text": (
                    "Even in an engineering field, we always don't get much exposure to technical skills and expertise in "
                    "academical content which is required for surviving and growing in corporate world. In such situation, "
                    "such courses specifically focused on technical content and live experience helps understand things exponentially "
                    "faster. Such affordable and well designed courses which never felt that your money or time is wasted."
                ),
                "is_approved": True,
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("review_comments")
    op.drop_table("reviews")
