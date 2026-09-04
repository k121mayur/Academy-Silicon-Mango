from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.newsletter import NewsletterSubscriber
from app.models.user import User
from app.schemas.newsletter import (
    NewsletterSubscriberCreate,
    NewsletterSubscriberUpdate,
)
from app.services.export_service import csv_response

router = APIRouter(prefix="/subscribers", tags=["admin:subscribers"])


@router.get("")
async def list_subscribers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by email or source"),
    status: Optional[str] = Query(None, description="active | inactive | all"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """List newsletter subscribers with pagination, search, and status filter."""
    total_count = (await db.execute(select(func.count(NewsletterSubscriber.id)))).scalar_one()
    active_count = (
        await db.execute(
            select(func.count(NewsletterSubscriber.id)).where(NewsletterSubscriber.is_active == True)  # noqa: E712
        )
    ).scalar_one()
    inactive_count = total_count - active_count

    conditions = []
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                NewsletterSubscriber.email.ilike(term),
                NewsletterSubscriber.source.ilike(term),
            )
        )
    if status == "active":
        conditions.append(NewsletterSubscriber.is_active == True)  # noqa: E712
    elif status == "inactive":
        conditions.append(NewsletterSubscriber.is_active == False)  # noqa: E712

    count_query = select(func.count(NewsletterSubscriber.id))
    if conditions:
        count_query = count_query.where(*conditions)
    filtered_total = (await db.execute(count_query)).scalar_one()

    query = select(NewsletterSubscriber)
    if conditions:
        query = query.where(*conditions)
    query = (
        query.order_by(NewsletterSubscriber.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )

    rows = (await db.execute(query)).scalars().all()

    data = [
        {
            "id": str(sub.id),
            "email": sub.email,
            "is_active": sub.is_active,
            "source": sub.source,
            "confirmed_at": sub.confirmed_at.isoformat() if sub.confirmed_at else None,
            "unsubscribed_at": sub.unsubscribed_at.isoformat() if sub.unsubscribed_at else None,
            "unsubscribe_reason": sub.unsubscribe_reason,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
        }
        for sub in rows
    ]

    return {
        "success": True,
        "data": data,
        "meta": {
            "page": page,
            "limit": limit,
            "total": filtered_total,
            "pages": max(1, math.ceil(filtered_total / limit)),
        },
        "stats": {
            "total": total_count,
            "active": active_count,
            "inactive": inactive_count,
        },
    }


@router.get("/export")
async def export_subscribers(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Export filtered newsletter subscribers to CSV."""
    conditions = []
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                NewsletterSubscriber.email.ilike(term),
                NewsletterSubscriber.source.ilike(term),
            )
        )
    if status == "active":
        conditions.append(NewsletterSubscriber.is_active == True)  # noqa: E712
    elif status == "inactive":
        conditions.append(NewsletterSubscriber.is_active == False)  # noqa: E712

    query = select(NewsletterSubscriber)
    if conditions:
        query = query.where(*conditions)
    query = query.order_by(NewsletterSubscriber.created_at.desc())

    rows = (await db.execute(query)).scalars().all()

    headers = [
        "Email",
        "Status",
        "Source",
        "Subscribed At",
        "Confirmed At",
        "Unsubscribed At",
        "Unsubscribe Reason",
    ]
    csv_rows = [
        [
            sub.email,
            "Active" if sub.is_active else "Inactive",
            sub.source or "",
            sub.created_at.isoformat() if sub.created_at else "",
            sub.confirmed_at.isoformat() if sub.confirmed_at else "Pending",
            sub.unsubscribed_at.isoformat() if sub.unsubscribed_at else "",
            sub.unsubscribe_reason or "",
        ]
        for sub in rows
    ]
    today_str = datetime.now().strftime("%Y-%m-%d")
    return csv_response(f"email_subscribers_{today_str}.csv", headers, csv_rows)


@router.post("")
async def create_subscriber(
    payload: NewsletterSubscriberCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Manually add or re-activate an email subscriber."""
    email = payload.email.lower().strip()
    res = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == email)
    )
    existing = res.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if existing:
        if existing.is_active:
            raise APIError(
                code="SUBSCRIBER_ALREADY_EXISTS",
                message=f"Subscriber {email} is already active.",
                status_code=409,
            )
        existing.is_active = True
        if payload.source:
            existing.source = payload.source
        if existing.confirmed_at is None:
            existing.confirmed_at = now
        await db.commit()
        await db.refresh(existing)
        return {
            "success": True,
            "data": {
                "id": str(existing.id),
                "email": existing.email,
                "is_active": existing.is_active,
                "source": existing.source,
                "confirmed_at": existing.confirmed_at.isoformat() if existing.confirmed_at else None,
                "created_at": existing.created_at.isoformat() if existing.created_at else None,
            },
            "message": "Subscriber re-activated successfully.",
        }

    sub = NewsletterSubscriber(
        email=email,
        is_active=True,
        source=payload.source or "admin_manual",
        confirmed_at=now,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return {
        "success": True,
        "data": {
            "id": str(sub.id),
            "email": sub.email,
            "is_active": sub.is_active,
            "source": sub.source,
            "confirmed_at": sub.confirmed_at.isoformat() if sub.confirmed_at else None,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
        },
        "message": "Subscriber added successfully.",
    }


@router.patch("/{subscriber_id}")
async def update_subscriber(
    subscriber_id: str,
    payload: NewsletterSubscriberUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Update subscriber active status or source."""
    try:
        sub_uuid = uuid.UUID(subscriber_id)
    except ValueError:
        raise APIError(code="INVALID_ID", message="Invalid subscriber ID", status_code=400)

    res = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.id == sub_uuid)
    )
    sub = res.scalar_one_or_none()
    if not sub:
        raise APIError(code="SUBSCRIBER_NOT_FOUND", message="Subscriber not found", status_code=404)

    if payload.is_active is not None:
        sub.is_active = payload.is_active
        if payload.is_active:
            sub.unsubscribed_at = None
            sub.unsubscribe_reason = None
            if sub.confirmed_at is None:
                sub.confirmed_at = datetime.now(timezone.utc)
        else:
            if sub.unsubscribed_at is None:
                sub.unsubscribed_at = datetime.now(timezone.utc)
    if payload.source is not None:
        sub.source = payload.source
    if payload.unsubscribe_reason is not None:
        sub.unsubscribe_reason = payload.unsubscribe_reason

    await db.commit()
    await db.refresh(sub)
    return {
        "success": True,
        "data": {
            "id": str(sub.id),
            "email": sub.email,
            "is_active": sub.is_active,
            "source": sub.source,
            "confirmed_at": sub.confirmed_at.isoformat() if sub.confirmed_at else None,
            "unsubscribed_at": sub.unsubscribed_at.isoformat() if sub.unsubscribed_at else None,
            "unsubscribe_reason": sub.unsubscribe_reason,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
        },
        "message": "Subscriber updated successfully.",
    }


@router.delete("/{subscriber_id}")
async def delete_subscriber(
    subscriber_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Permanently remove a subscriber."""
    try:
        sub_uuid = uuid.UUID(subscriber_id)
    except ValueError:
        raise APIError(code="INVALID_ID", message="Invalid subscriber ID", status_code=400)

    res = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.id == sub_uuid)
    )
    sub = res.scalar_one_or_none()
    if not sub:
        raise APIError(code="SUBSCRIBER_NOT_FOUND", message="Subscriber not found", status_code=404)

    await db.delete(sub)
    await db.commit()
    return {"success": True, "message": "Subscriber deleted successfully."}
