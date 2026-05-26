from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, Field


class ScheduleSlotIn(BaseModel):
    slot_type: str  # 'weekday' | 'date_based'
    weekday: Optional[int] = None  # 0-6
    slot_date: Optional[date] = None
    start_time: time
    end_time: time


class BatchCreate(BaseModel):
    course_id: str
    name: str = Field(min_length=1, max_length=255)
    delivery_mode: str = "live"  # live | recorded
    start_date: date
    end_date: date
    capacity: Optional[int] = None
    instructor_id: Optional[str] = None
    schedule_slots: list[ScheduleSlotIn] = []


class BatchUpdate(BaseModel):
    name: Optional[str] = None
    delivery_mode: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    capacity: Optional[int] = None
    status: Optional[str] = None


class BatchPublic(BaseModel):
    id: str
    course_id: str
    course_title: Optional[str] = None
    instructor_id: Optional[str] = None
    instructor_name: Optional[str] = None
    name: str
    delivery_mode: str
    status: str
    start_date: date
    end_date: date
    capacity: Optional[int] = None
    enrolled_count: int = 0
    is_locked: bool = False
    created_at: Optional[datetime] = None


class BatchPlanIn(BaseModel):
    plan_index: int
    title: str
    summary: Optional[str] = None


class BatchPlanPublic(BaseModel):
    id: str
    plan_index: int
    title: str
    summary: Optional[str] = None


class EnrollmentCreate(BaseModel):
    student_id: str


class EnrollmentPublic(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    batch_id: str
    enrolled_at: datetime
    status: str
