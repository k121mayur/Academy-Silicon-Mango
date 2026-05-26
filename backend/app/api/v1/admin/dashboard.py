from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.batch import Batch, BatchStatus, Enrollment, EnrollmentStatus
from app.models.course import Course
from app.models.payment import Payment, PaymentStatus
from app.models.session import Session, SessionStatus
from app.models.user import User, UserRole

router = APIRouter(prefix="/dashboard", tags=["admin:dashboard"])


@router.get("/stats")
async def stats(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    revenue = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status == PaymentStatus.paid)
        )
    ).scalar_one()

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)
    this_month_rev = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.status == PaymentStatus.paid)
            .where(Payment.created_at >= month_start)
        )
    ).scalar_one()
    last_month_rev = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.status == PaymentStatus.paid)
            .where(Payment.created_at >= last_month_start)
            .where(Payment.created_at < month_start)
        )
    ).scalar_one()

    mom_change = None
    if Decimal(last_month_rev or 0) > 0:
        mom_change = float((Decimal(this_month_rev) - Decimal(last_month_rev)) / Decimal(last_month_rev) * 100)

    active_students = (
        await db.execute(
            select(func.count(func.distinct(Enrollment.student_id)))
            .where(Enrollment.status == EnrollmentStatus.active)
        )
    ).scalar_one()
    total_courses = (await db.execute(select(func.count(Course.id)))).scalar_one()
    total_batches = (await db.execute(select(func.count(Batch.id)))).scalar_one()
    total_instructors = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.instructor))
    ).scalar_one()
    total_students = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.student))
    ).scalar_one()
    pending_grading = 0  # placeholder for future submissions/grading

    return {
        "success": True,
        "data": {
            "total_revenue": float(revenue),
            "this_month_revenue": float(this_month_rev),
            "mom_change_percent": mom_change,
            "active_students": active_students,
            "total_courses": total_courses,
            "total_batches": total_batches,
            "total_instructors": total_instructors,
            "total_students": total_students,
            "pending_grading": pending_grading,
        },
    }


@router.get("/revenue-chart")
async def revenue_chart(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    end = datetime.now(timezone.utc).replace(hour=23, minute=59, second=59)
    start = end - timedelta(days=days - 1)

    res = await db.execute(
        select(func.date(Payment.created_at), func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.status == PaymentStatus.paid)
        .where(Payment.created_at >= start)
        .group_by(func.date(Payment.created_at))
        .order_by(func.date(Payment.created_at))
    )
    rows = {str(row[0]): float(row[1]) for row in res.all()}

    series = []
    cur = start.date()
    end_d = end.date()
    while cur <= end_d:
        series.append({"date": cur.isoformat(), "amount": rows.get(cur.isoformat(), 0.0)})
        cur += timedelta(days=1)
    return {"success": True, "data": series}


@router.get("/recent-transactions")
async def recent_transactions(
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    res = await db.execute(
        select(Payment, User, Batch)
        .join(User, User.id == Payment.student_id)
        .join(Batch, Batch.id == Payment.batch_id)
        .order_by(Payment.created_at.desc())
        .limit(limit)
    )
    items = []
    for p, u, b in res.all():
        items.append(
            {
                "id": str(p.id),
                "student_email": u.email,
                "batch_name": b.name,
                "amount": float(p.amount),
                "status": p.status.value,
                "created_at": p.created_at,
            }
        )
    return {"success": True, "data": items}


@router.get("/upcoming-sessions")
async def upcoming_sessions(
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    end = datetime.now(timezone.utc) + timedelta(days=days)
    res = await db.execute(
        select(Session, Batch)
        .join(Batch, Batch.id == Session.batch_id)
        .where(Session.scheduled_at >= datetime.now(timezone.utc))
        .where(Session.scheduled_at <= end)
        .where(Session.status == SessionStatus.scheduled)
        .order_by(Session.scheduled_at)
        .limit(20)
    )
    items = []
    for s, b in res.all():
        items.append(
            {
                "id": str(s.id),
                "title": s.title,
                "batch_name": b.name,
                "scheduled_at": s.scheduled_at,
                "duration_mins": s.duration_mins,
                "session_type": s.session_type.value,
            }
        )
    return {"success": True, "data": items}
