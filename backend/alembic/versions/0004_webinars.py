"""webinar management module — organizations, webinars, registrations, emails, reminders

Revision ID: 0004_webinars
Revises: 0003_student_name_parts
Create Date: 2026-06-05 10:00:00

Additive only — five new tables + their enums, plus a seeded default
Silicon Mango host/brand. Touches no existing table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0004_webinars"
down_revision: Union[str, None] = "0003_student_name_parts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ENUM_DEFS = [
    ("webinar_provider_enum", ["manual_link", "zoom", "google_meet", "webex", "teams"]),
    ("webinar_gender_enum", ["male", "female", "non_binary", "prefer_not_to_say"]),
    (
        "webinar_registration_status_enum",
        ["pending_verification", "registered", "waitlisted", "cancelled"],
    ),
    ("webinar_attendance_status_enum", ["not_marked", "present", "absent"]),
    ("webinar_payment_status_enum", ["not_required", "pending", "paid", "failed"]),
    ("webinar_email_audience_enum", ["all", "verified", "waitlisted", "selected"]),
    ("webinar_email_status_enum", ["queued", "sending", "sent", "failed"]),
    (
        "webinar_reminder_type_enum",
        ["confirmation", "r7d", "r1d", "r1h", "start", "followup", "reschedule", "cancellation"],
    ),
]

# Fixed id for the seeded default brand so re-runs / fresh DBs are deterministic.
DEFAULT_ORG_ID = "a0000000-0000-4000-8000-000000000001"


def _enum(name: str) -> postgresql.ENUM:
    values = dict(ENUM_DEFS)[name]
    return postgresql.ENUM(*values, name=name, create_type=False)


def upgrade() -> None:
    # ---------- ENUMS (idempotent) ----------
    for enum_name, values in ENUM_DEFS:
        values_sql = ", ".join(f"'{v}'" for v in values)
        op.execute(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{enum_name}') THEN
                    CREATE TYPE {enum_name} AS ENUM ({values_sql});
                END IF;
            END
            $$;
        """)

    provider = _enum("webinar_provider_enum")
    gender = _enum("webinar_gender_enum")
    reg_status = _enum("webinar_registration_status_enum")
    attendance = _enum("webinar_attendance_status_enum")
    pay_status = _enum("webinar_payment_status_enum")
    email_audience = _enum("webinar_email_audience_enum")
    email_status = _enum("webinar_email_status_enum")
    reminder_type = _enum("webinar_reminder_type_enum")

    # ---------- ORGANIZATIONS ----------
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---------- WEBINARS ----------
    op.create_table(
        "webinars",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(255), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("subtitle", sa.String(500), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("language", sa.String(50), nullable=False, server_default="English"),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("flyer_url", sa.String(500), nullable=True),
        sa.Column("banner_url", sa.String(500), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("registration_open_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("registration_close_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_participants", sa.Integer, nullable=True),
        sa.Column("allow_waitlist", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_free", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("price", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="INR"),
        sa.Column("provider_type", provider, nullable=False, server_default="manual_link"),
        sa.Column("meeting_url", sa.String(1000), nullable=True),
        sa.Column("meeting_link_public", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("faqs", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("email_settings", postgresql.JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("meta_title", sa.String(255), nullable=True),
        sa.Column("meta_description", sa.String(500), nullable=True),
        sa.Column("og_image_url", sa.String(500), nullable=True),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_cancelled", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_webinars_slug", "webinars", ["slug"])
    op.create_index("ix_webinars_start_at", "webinars", ["start_at"])

    # ---------- WEBINAR REGISTRATIONS ----------
    op.create_table(
        "webinar_registrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "webinar_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("webinars.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("date_of_birth", sa.Date, nullable=True),
        sa.Column("gender", gender, nullable=True),
        sa.Column("profession", sa.String(100), nullable=True),
        sa.Column("status", reg_status, nullable=False, server_default="pending_verification"),
        sa.Column("verification_token", sa.String(64), nullable=True, unique=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attendance_status", attendance, nullable=False, server_default="not_marked"),
        sa.Column("payment_status", pay_status, nullable=False, server_default="not_required"),
        sa.Column("amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(10), nullable=True),
        sa.Column("transaction_id", sa.String(255), nullable=True),
        sa.Column("razorpay_order_id", sa.String(255), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("referral_source", sa.String(255), nullable=True),
        sa.Column("utm", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("webinar_id", "email", name="uq_webinar_registration_email"),
    )
    op.create_index("ix_webinar_registrations_webinar_id", "webinar_registrations", ["webinar_id"])
    op.create_index("ix_webinar_registrations_email", "webinar_registrations", ["email"])
    op.create_index(
        "ix_webinar_registrations_verification_token", "webinar_registrations", ["verification_token"]
    )

    # ---------- WEBINAR EMAIL CAMPAIGNS ----------
    op.create_table(
        "webinar_email_campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "webinar_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("webinars.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("audience", email_audience, nullable=False, server_default="all"),
        sa.Column("recipient_ids", postgresql.JSONB, nullable=True),
        sa.Column("status", email_status, nullable=False, server_default="queued"),
        sa.Column("sent_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_webinar_email_campaigns_webinar_id", "webinar_email_campaigns", ["webinar_id"])

    # ---------- WEBINAR REMINDER DISPATCH ----------
    op.create_table(
        "webinar_reminder_dispatch",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "webinar_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("webinars.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "registration_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("webinar_registrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reminder_type", reminder_type, nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("registration_id", "reminder_type", name="uq_webinar_reminder_dispatch"),
    )
    op.create_index("ix_webinar_reminder_dispatch_webinar_id", "webinar_reminder_dispatch", ["webinar_id"])

    # ---------- SEED DEFAULT HOST/BRAND ----------
    op.execute(f"""
        INSERT INTO organizations
            (id, name, logo_url, description, website, contact_email, is_default, created_at, updated_at)
        SELECT
            '{DEFAULT_ORG_ID}',
            'Silicon Mango',
            '/Logo1.png',
            'Silicon Mango Academy — Learn. Build. Get Certified.',
            'https://siliconmango.com',
            'hello@siliconmango.com',
            true,
            now(),
            now()
        WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE is_default = true);
    """)


def downgrade() -> None:
    op.drop_table("webinar_reminder_dispatch")
    op.drop_table("webinar_email_campaigns")
    op.drop_table("webinar_registrations")
    op.drop_table("webinars")
    op.drop_table("organizations")

    for enum_name, _ in reversed(ENUM_DEFS):
        op.execute(f"DROP TYPE IF EXISTS {enum_name} CASCADE;")
