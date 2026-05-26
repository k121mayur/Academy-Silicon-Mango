from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SessionPublic(BaseModel):
    id: str
    batch_id: str
    plan_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    session_type: str
    status: str
    origin: str
    meeting_link: Optional[str] = None
    recording_url: Optional[str] = None
    scheduled_at: datetime
    duration_mins: int
