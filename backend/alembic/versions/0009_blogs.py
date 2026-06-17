"""blogs — rich-text blog posts (admin CRUD + public read)

Revision ID: 0009_blogs
Revises: 0008_payment_settings_singleton
Create Date: 2026-06-17 00:00:00

Additive only — one new table + its status enum. Touches no existing table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0009_blogs"
down_revision: Union[str, None] = "0008_payment_settings_singleton"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


BLOG_STATUS_VALUES = ["draft", "published"]


def upgrade() -> None:
    # ---------- ENUM (idempotent) ----------
    values_sql = ", ".join(f"'{v}'" for v in BLOG_STATUS_VALUES)
    op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blog_status_enum') THEN
                CREATE TYPE blog_status_enum AS ENUM ({values_sql});
            END IF;
        END
        $$;
    """)

    blog_status = postgresql.ENUM(*BLOG_STATUS_VALUES, name="blog_status_enum", create_type=False)

    # ---------- BLOGS ----------
    op.create_table(
        "blogs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("excerpt", sa.Text, nullable=True),
        sa.Column("author", sa.String(255), nullable=False),
        sa.Column("tags", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("thumbnail_url", sa.String(1000), nullable=True),
        sa.Column("status", blog_status, nullable=False, server_default="draft"),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("view_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_blogs_slug", "blogs", ["slug"])
    op.create_index("ix_blogs_status", "blogs", ["status"])
    op.create_index("ix_blogs_is_published", "blogs", ["is_published"])
    op.create_index("ix_blogs_published_at", "blogs", ["published_at"])
    op.create_index("ix_blogs_created_at", "blogs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_blogs_created_at", table_name="blogs")
    op.drop_index("ix_blogs_published_at", table_name="blogs")
    op.drop_index("ix_blogs_is_published", table_name="blogs")
    op.drop_index("ix_blogs_status", table_name="blogs")
    op.drop_index("ix_blogs_slug", table_name="blogs")
    op.drop_table("blogs")
    op.execute("DROP TYPE IF EXISTS blog_status_enum CASCADE")
