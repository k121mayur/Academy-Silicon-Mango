"""initial schema — all tables

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-26 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# All enums defined here. We use postgresql.ENUM(..., create_type=False) so that
# alembic's create_table does NOT attempt to re-create them — they're already
# created by the idempotent SQL block in upgrade().
ENUM_DEFS = [
    ("auth_provider_enum", ["email", "google"]),
    ("user_role_enum", ["admin", "instructor", "student"]),
    ("occupation_enum", ["student", "employee", "other"]),
    ("otp_purpose_enum", ["signup", "reset"]),
    ("course_type_enum", ["live", "self_paced"]),
    ("duration_unit_enum", ["weeks", "days"]),
    ("delivery_mode_enum", ["live", "recorded"]),
    ("batch_status_enum", ["upcoming", "active", "completed", "cancelled"]),
    ("slot_type_enum", ["weekday", "date_based"]),
    ("enrollment_status_enum", ["active", "dropped", "completed"]),
    ("session_type_enum", ["live", "recorded"]),
    ("session_status_enum", ["scheduled", "completed", "cancelled"]),
    ("session_origin_enum", ["inherited", "manual"]),
    ("resource_type_enum", ["file", "link", "video"]),
    ("payment_status_enum", ["pending", "paid", "failed"]),
    ("payment_mode_enum", ["test", "live"]),
    ("assignment_type_enum", ["quiz", "pdf_upload", "text_upload", "file_upload", "link_submission"]),
    ("submission_status_enum", ["submitted", "graded", "late", "missing"]),
    ("attendance_status_enum", ["not_marked", "present", "absent", "late", "excused"]),
    ("attendance_source_enum", ["manual", "zoom", "google_meet", "pending_integration"]),
    ("cert_email_status_enum", ["pending", "sent", "failed"]),
]


def _enum(name: str) -> postgresql.ENUM:
    """Reference an existing enum without creating it."""
    values = dict(ENUM_DEFS)[name]
    return postgresql.ENUM(*values, name=name, create_type=False)


def upgrade() -> None:
    # ---------- ENUMS ----------
    # Idempotent enum creation via raw SQL DO blocks. Safe to run on a partial
    # database where some enums already exist.
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

    auth_provider = _enum("auth_provider_enum")
    user_role = _enum("user_role_enum")
    occupation = _enum("occupation_enum")
    otp_purpose = _enum("otp_purpose_enum")
    course_type = _enum("course_type_enum")
    duration_unit = _enum("duration_unit_enum")
    delivery_mode = _enum("delivery_mode_enum")
    batch_status = _enum("batch_status_enum")
    slot_type = _enum("slot_type_enum")
    enrollment_status = _enum("enrollment_status_enum")
    session_type = _enum("session_type_enum")
    session_status = _enum("session_status_enum")
    session_origin = _enum("session_origin_enum")
    resource_type = _enum("resource_type_enum")
    payment_status = _enum("payment_status_enum")
    payment_mode = _enum("payment_mode_enum")
    assignment_type = _enum("assignment_type_enum")
    submission_status = _enum("submission_status_enum")
    attendance_status = _enum("attendance_status_enum")
    attendance_source = _enum("attendance_source_enum")
    cert_email_status = _enum("cert_email_status_enum")

    # ---------- USERS ----------
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("auth_provider", auth_provider, nullable=False, server_default="email"),
        sa.Column("google_id", sa.String(255), nullable=True, unique=True),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "instructor_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("bio", sa.Text, nullable=True),
        sa.Column("skills", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("avatar_url", sa.String(500), nullable=True),
    )

    op.create_table(
        "student_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("occupation", occupation, nullable=True),
        sa.Column("education", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("experience", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("profile_complete", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("avatar_url", sa.String(500), nullable=True),
    )

    op.create_table(
        "otp_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_code", sa.String(255), nullable=False),
        sa.Column("purpose", otp_purpose, nullable=False, server_default="signup"),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_otp_records_email", "otp_records", ["email"])

    op.create_table(
        "courses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("course_type", course_type, nullable=False, server_default="live"),
        sa.Column("duration_unit", duration_unit, nullable=False, server_default="weeks"),
        sa.Column("duration_value", sa.Integer, nullable=False, server_default="4"),
        sa.Column("price", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("discount", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("tags", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("syllabus_items", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("faqs", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("certification_criteria", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("banner_url", sa.String(500), nullable=True),
        sa.Column("syllabus_pdf_url", sa.String(500), nullable=True),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_courses_slug", "courses", ["slug"])

    op.create_table(
        "course_instructors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("instructor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("course_id", "instructor_id", name="uq_course_instructor"),
    )

    op.create_table(
        "batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("instructor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("delivery_mode", delivery_mode, nullable=False, server_default="live"),
        sa.Column("status", batch_status, nullable=False, server_default="upcoming"),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("capacity", sa.Integer, nullable=True),
        sa.Column("is_locked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "batch_schedule_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slot_type", slot_type, nullable=False),
        sa.Column("weekday", sa.Integer, nullable=True),
        sa.Column("slot_date", sa.Date, nullable=True),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
    )

    op.create_table(
        "batch_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_index", sa.Integer, nullable=False),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("batch_id", "plan_index", name="uq_batch_plan_index"),
    )

    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batch_plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("session_type", session_type, nullable=False, server_default="live"),
        sa.Column("status", session_status, nullable=False, server_default="scheduled"),
        sa.Column("origin", session_origin, nullable=False, server_default="inherited"),
        sa.Column("meeting_link", sa.String(500), nullable=True),
        sa.Column("recording_url", sa.String(500), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_mins", sa.Integer, nullable=False, server_default="60"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "session_resources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("resource_type", resource_type, nullable=False, server_default="file"),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "enrollments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("status", enrollment_status, nullable=False, server_default="active"),
        sa.UniqueConstraint("batch_id", "student_id", name="uq_enrollment"),
    )

    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("enrollment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("enrollments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("razorpay_order_id", sa.String(255), nullable=True),
        sa.Column("razorpay_payment_id", sa.String(255), nullable=True),
        sa.Column("razorpay_signature", sa.String(255), nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False, server_default="INR"),
        sa.Column("status", payment_status, nullable=False, server_default="pending"),
        sa.Column("receipt_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "payment_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("mode", payment_mode, nullable=False, server_default="test"),
        sa.Column("key_id_masked", sa.String(50), nullable=True),
        sa.Column("key_id", sa.String(255), nullable=True),
        sa.Column("key_secret", sa.String(255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batch_plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("assignment_type", assignment_type, nullable=False, server_default="text_upload"),
        sa.Column("max_points", sa.Integer, nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("allow_late", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("file_url", sa.String(500), nullable=True),
        sa.Column("score", sa.Numeric(6, 2), nullable=True),
        sa.Column("feedback", sa.Text, nullable=True),
        sa.Column("graded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", submission_status, nullable=False, server_default="submitted"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "attendance_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", attendance_status, nullable=False, server_default="not_marked"),
        sa.Column("source", attendance_source, nullable=False, server_default="manual"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("marked_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("marked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "student_id", name="uq_attendance"),
    )

    op.create_table(
        "certificate_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("template_url", sa.String(500), nullable=True),
        sa.Column("field_config", postgresql.JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "certificates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pdf_url", sa.String(500), nullable=True),
        sa.Column("email_status", cert_email_status, nullable=False, server_default="pending"),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("emailed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("batch_id", "student_id", name="uq_certificate"),
    )


def downgrade() -> None:
    op.drop_table("certificates")
    op.drop_table("certificate_templates")
    op.drop_table("attendance_records")
    op.drop_table("submissions")
    op.drop_table("assignments")
    op.drop_table("payment_settings")
    op.drop_table("payments")
    op.drop_table("enrollments")
    op.drop_table("session_resources")
    op.drop_table("sessions")
    op.drop_table("batch_plans")
    op.drop_table("batch_schedule_slots")
    op.drop_table("batches")
    op.drop_table("course_instructors")
    op.drop_table("courses")
    op.drop_table("otp_records")
    op.drop_table("student_profiles")
    op.drop_table("instructor_profiles")
    op.drop_table("users")

    for enum_name, _ in reversed(ENUM_DEFS):
        op.execute(f"DROP TYPE IF EXISTS {enum_name} CASCADE;")
