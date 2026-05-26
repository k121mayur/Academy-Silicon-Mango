from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    meta: Optional[dict[str, Any]] = None


class PaginationMeta(BaseModel):
    page: int
    limit: int
    total: int
    pages: int


class TimestampedBase(BaseModel):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
