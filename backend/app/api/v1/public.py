from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.batch import Batch, BatchStatus, Enrollment, EnrollmentStatus
from app.models.course import Course
from app.models.user import User, UserRole
from app.models.certificate import Certificate

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/courses")
async def public_courses(
    limit: int = Query(12, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Course).where(Course.is_published == True).order_by(Course.created_at.desc()).limit(limit)  # noqa: E712
        )
    ).scalars().all()
    items = []
    for c in rows:
        items.append(
            {
                "id": str(c.id),
                "title": c.title,
                "slug": c.slug,
                "description": c.description,
                "category": c.category,
                "course_type": c.course_type.value,
                "duration_unit": c.duration_unit.value,
                "duration_value": c.duration_value,
                "price": float(c.price),
                "discount": float(c.discount),
                "banner_url": c.banner_url,
                "tags": c.tags or [],
            }
        )
    return {"success": True, "data": items}


@router.get("/stats")
async def public_stats(db: AsyncSession = Depends(get_db)):
    students = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.student))
    ).scalar_one()
    instructors = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.instructor))
    ).scalar_one()
    courses = (
        await db.execute(select(func.count(Course.id)).where(Course.is_published == True))  # noqa: E712
    ).scalar_one()
    certificates = (await db.execute(select(func.count(Certificate.id)))).scalar_one()
    return {
        "success": True,
        "data": {
            "students": students,
            "instructors": instructors,
            "courses": courses,
            "certificates": certificates,
        },
    }
