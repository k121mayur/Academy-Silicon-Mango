from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Time, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DeliveryMode(str, enum.Enum):
    live = "live"
    recorded = "recorded"


class BatchStatus(str, enum.Enum):
    upcoming = "upcoming"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class SlotType(str, enum.Enum):
    weekday = "weekday"
    date_based = "date_based"


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    instructor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    delivery_mode: Mapped[DeliveryMode] = mapped_column(
        Enum(DeliveryMode, name="delivery_mode_enum"), nullable=False, default=DeliveryMode.live
    )
    status: Mapped[BatchStatus] = mapped_column(
        Enum(BatchStatus, name="batch_status_enum"), nullable=False, default=BatchStatus.upcoming
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    course = relationship("Course", back_populates="batches")
    schedule_slots: Mapped[list["BatchScheduleSlot"]] = relationship(
        "BatchScheduleSlot", back_populates="batch", cascade="all, delete-orphan"
    )
    plans: Mapped[list["BatchPlan"]] = relationship(
        "BatchPlan", back_populates="batch", cascade="all, delete-orphan", order_by="BatchPlan.plan_index"
    )


class BatchScheduleSlot(Base):
    __tablename__ = "batch_schedule_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False
    )
    slot_type: Mapped[SlotType] = mapped_column(Enum(SlotType, name="slot_type_enum"), nullable=False)
    weekday: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    slot_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    batch: Mapped["Batch"] = relationship("Batch", back_populates="schedule_slots")


class BatchPlan(Base):
    __tablename__ = "batch_plans"
    __table_args__ = (UniqueConstraint("batch_id", "plan_index", name="uq_batch_plan_index"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False
    )
    plan_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    summary: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    batch: Mapped["Batch"] = relationship("Batch", back_populates="plans")


class EnrollmentStatus(str, enum.Enum):
    active = "active"
    dropped = "dropped"
    completed = "completed"


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("batch_id", "student_id", name="uq_enrollment"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[EnrollmentStatus] = mapped_column(
        Enum(EnrollmentStatus, name="enrollment_status_enum"), nullable=False, default=EnrollmentStatus.active
    )
