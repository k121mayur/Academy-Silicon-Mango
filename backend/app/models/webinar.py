from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class WebinarProviderType(str, enum.Enum):
    """Meeting provider. MVP only uses manual_link; the rest are placeholders so
    a future Zoom/Meet/Webex/Teams integration is a drop-in, not a schema change."""

    manual_link = "manual_link"
    zoom = "zoom"
    google_meet = "google_meet"
    webex = "webex"
    teams = "teams"


class WebinarGender(str, enum.Enum):
    male = "male"
    female = "female"
    non_binary = "non_binary"
    prefer_not_to_say = "prefer_not_to_say"


class WebinarRegistrationStatus(str, enum.Enum):
    pending_verification = "pending_verification"
    registered = "registered"
    waitlisted = "waitlisted"
    cancelled = "cancelled"


class WebinarAttendanceStatus(str, enum.Enum):
    not_marked = "not_marked"
    present = "present"
    absent = "absent"


class WebinarPaymentStatus(str, enum.Enum):
    """Schema-ready for paid webinars (Phase 1.5). Free webinars stay not_required."""

    not_required = "not_required"
    pending = "pending"
    paid = "paid"
    failed = "failed"


class WebinarEmailAudience(str, enum.Enum):
    all = "all"
    verified = "verified"
    waitlisted = "waitlisted"
    selected = "selected"


class WebinarEmailStatus(str, enum.Enum):
    queued = "queued"
    sending = "sending"
    sent = "sent"
    failed = "failed"


class WebinarReminderType(str, enum.Enum):
    confirmation = "confirmation"
    r7d = "r7d"
    r1d = "r1d"
    r1h = "r1h"
    start = "start"
    followup = "followup"
    reschedule = "reschedule"
    cancellation = "cancellation"


# ---------------------------------------------------------------------------
# Organization (host / brand)
# ---------------------------------------------------------------------------


class Organization(Base):
    """A host/brand a webinar is presented under. A single `is_default` row
    (Silicon Mango) is seeded; admins can add more (other orgs or individuals)."""

    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    webinars: Mapped[list["Webinar"]] = relationship("Webinar", back_populates="organization")


# ---------------------------------------------------------------------------
# Webinar
# ---------------------------------------------------------------------------


class Webinar(Base):
    __tablename__ = "webinars"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)

    # Basic info
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subtitle: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    language: Mapped[str] = mapped_column(String(50), nullable=False, default="English")

    # Host / brand
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )

    # Media
    flyer_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    banner_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Schedule (authoritative timestamps; status is computed from these)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Kolkata")

    # Registration settings
    registration_open_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    registration_close_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    max_participants: Mapped[Optional[int]] = mapped_column(nullable=True)
    allow_waitlist: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Pricing (schema-ready; free fully functional)
    is_free: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")

    # Meeting access / provider abstraction
    provider_type: Mapped[WebinarProviderType] = mapped_column(
        Enum(WebinarProviderType, name="webinar_provider_enum"),
        nullable=False,
        default=WebinarProviderType.manual_link,
    )
    meeting_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    # When true, the join link is shown on the PUBLIC page (Google-Meet style). When
    # false it's only emailed to verified registrants.
    meeting_link_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Content / comms
    faqs: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    # {"confirmation": true, "reminder_7d": true, "reminder_1d": true,
    #  "reminder_1h": true, "start": true, "followup": false}
    email_settings: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)

    # SEO
    meta_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    meta_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    og_image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Lifecycle
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped[Optional["Organization"]] = relationship("Organization", back_populates="webinars")
    registrations: Mapped[list["WebinarRegistration"]] = relationship(
        "WebinarRegistration", back_populates="webinar", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


class WebinarRegistration(Base):
    __tablename__ = "webinar_registrations"
    __table_args__ = (UniqueConstraint("webinar_id", "email", name="uq_webinar_registration_email"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webinar_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webinars.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Registrant details
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    gender: Mapped[Optional[WebinarGender]] = mapped_column(
        Enum(WebinarGender, name="webinar_gender_enum"), nullable=True
    )
    profession: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # State
    status: Mapped[WebinarRegistrationStatus] = mapped_column(
        Enum(WebinarRegistrationStatus, name="webinar_registration_status_enum"),
        nullable=False,
        default=WebinarRegistrationStatus.pending_verification,
    )
    verification_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True, index=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    attendance_status: Mapped[WebinarAttendanceStatus] = mapped_column(
        Enum(WebinarAttendanceStatus, name="webinar_attendance_status_enum"),
        nullable=False,
        default=WebinarAttendanceStatus.not_marked,
    )

    # Payment (schema-ready)
    payment_status: Mapped[WebinarPaymentStatus] = mapped_column(
        Enum(WebinarPaymentStatus, name="webinar_payment_status_enum"),
        nullable=False,
        default=WebinarPaymentStatus.not_required,
    )
    amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    currency: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    transaction_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    razorpay_order_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # System capture
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    referral_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    utm: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    webinar: Mapped["Webinar"] = relationship("Webinar", back_populates="registrations")


# ---------------------------------------------------------------------------
# Email campaign (admin-composed bulk / selected emails)
# ---------------------------------------------------------------------------


class WebinarEmailCampaign(Base):
    __tablename__ = "webinar_email_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webinar_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webinars.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[WebinarEmailAudience] = mapped_column(
        Enum(WebinarEmailAudience, name="webinar_email_audience_enum"),
        nullable=False,
        default=WebinarEmailAudience.all,
    )
    recipient_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    status: Mapped[WebinarEmailStatus] = mapped_column(
        Enum(WebinarEmailStatus, name="webinar_email_status_enum"),
        nullable=False,
        default=WebinarEmailStatus.queued,
    )
    sent_count: Mapped[int] = mapped_column(nullable=False, default=0)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Reminder dispatch ledger (idempotency for scheduled / automatic mail)
# ---------------------------------------------------------------------------


class WebinarReminderDispatch(Base):
    __tablename__ = "webinar_reminder_dispatch"
    __table_args__ = (
        UniqueConstraint("registration_id", "reminder_type", name="uq_webinar_reminder_dispatch"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webinar_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webinars.id", ondelete="CASCADE"), nullable=False, index=True
    )
    registration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webinar_registrations.id", ondelete="CASCADE"), nullable=False
    )
    reminder_type: Mapped[WebinarReminderType] = mapped_column(
        Enum(WebinarReminderType, name="webinar_reminder_type_enum"), nullable=False
    )
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
