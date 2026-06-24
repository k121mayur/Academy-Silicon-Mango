from __future__ import annotations

import math
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import APIError
from app.core.utils import slugify
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.batch import Batch
from app.models.course import Course, CourseType, DurationUnit
from app.models.user import User
from app.schemas.course import (
    CourseCreate,
    CoursePublic,
    CourseUpdate,
)
from app.services.storage_service import save_upload

router = APIRouter(prefix="/courses", tags=["admin:courses"])


def _to_public(c: Course, batches_count: int = 0) -> CoursePublic:
    return CoursePublic(
        id=str(c.id),
        title=c.title,
        slug=c.slug,
        description=c.description,
        category=c.category,
        course_type=c.course_type.value,
        duration_unit=c.duration_unit.value,
        duration_value=c.duration_value,
        price=c.price,
        discount=c.discount,
        tags=c.tags or [],
        syllabus_items=c.syllabus_items or [],
        faqs=c.faqs or [],
        certification_criteria=c.certification_criteria or [],
        banner_url=c.banner_url,
        syllabus_pdf_url=c.syllabus_pdf_url,
        demo_youtube_url=c.demo_youtube_url,
        is_published=c.is_published,
        batches_count=batches_count,
        created_at=c.created_at,
    )


async def _unique_slug(db: AsyncSession, base_slug: str, exclude_id: Optional[str] = None) -> str:
    slug = base_slug
    suffix = 1
    while True:
        stmt = select(Course.id).where(Course.slug == slug)
        if exclude_id:
            stmt = stmt.where(Course.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if not existing:
            return slug
        suffix += 1
        slug = f"{base_slug}-{suffix}"


@router.get("")
async def list_courses(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    type: Optional[str] = None,
    published: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(Course)
    count_stmt = select(func.count(Course.id))

    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(Course.title.ilike(like), Course.category.ilike(like)))
        count_stmt = count_stmt.where(or_(Course.title.ilike(like), Course.category.ilike(like)))
    if type:
        try:
            t = CourseType(type)
            stmt = stmt.where(Course.course_type == t)
            count_stmt = count_stmt.where(Course.course_type == t)
        except ValueError:
            pass
    if published is not None:
        stmt = stmt.where(Course.is_published == published)
        count_stmt = count_stmt.where(Course.is_published == published)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(Course.created_at.desc()).offset((page - 1) * limit).limit(limit)
    courses = (await db.execute(stmt)).scalars().all()

    course_ids = [c.id for c in courses]
    counts_map: dict = {}
    if course_ids:
        cnt_res = await db.execute(
            select(Batch.course_id, func.count(Batch.id)).where(Batch.course_id.in_(course_ids)).group_by(Batch.course_id)
        )
        counts_map = {row[0]: row[1] for row in cnt_res.all()}

    items = [_to_public(c, counts_map.get(c.id, 0)) for c in courses]
    return {
        "success": True,
        "data": items,
        "meta": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit))},
    }


@router.post("", response_model=CoursePublic)
async def create_course(
    payload: CourseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    base = slugify(payload.title)
    slug = await _unique_slug(db, base)
    try:
        ct = CourseType(payload.course_type)
        du = DurationUnit(payload.duration_unit)
    except ValueError as e:
        raise APIError(code="VALIDATION", message=str(e))

    course = Course(
        title=payload.title,
        slug=slug,
        description=payload.description,
        category=payload.category,
        course_type=ct,
        duration_unit=du,
        duration_value=payload.duration_value,
        price=payload.price,
        discount=payload.discount,
        demo_youtube_url=payload.demo_youtube_url,
        tags=payload.tags,
        syllabus_items=[i.model_dump() for i in payload.syllabus_items],
        faqs=[i.model_dump() for i in payload.faqs],
        certification_criteria=[i.model_dump() for i in payload.certification_criteria],
        is_published=False,
        created_by=user.id,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    print(f"[ADMIN] Course created: {course.title} ({course.slug})")
    return _to_public(course, 0)


@router.get("/{course_id}", response_model=CoursePublic)
async def get_course(course_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    course = await db.get(Course, course_id)
    if not course:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)
    cnt = (await db.execute(select(func.count(Batch.id)).where(Batch.course_id == course.id))).scalar_one()
    return _to_public(course, cnt)


@router.put("/{course_id}", response_model=CoursePublic)
async def update_course(
    course_id: str,
    payload: CourseUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    course = await db.get(Course, course_id)
    if not course:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)

    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] != course.title:
        new_slug = await _unique_slug(db, slugify(data["title"]), exclude_id=str(course.id))
        course.slug = new_slug
    if "course_type" in data:
        course.course_type = CourseType(data.pop("course_type"))
    if "duration_unit" in data:
        course.duration_unit = DurationUnit(data.pop("duration_unit"))
    if "syllabus_items" in data:
        course.syllabus_items = [i if isinstance(i, dict) else i.model_dump() for i in data.pop("syllabus_items")]
    if "faqs" in data:
        course.faqs = [i if isinstance(i, dict) else i.model_dump() for i in data.pop("faqs")]
    if "certification_criteria" in data:
        course.certification_criteria = [i if isinstance(i, dict) else i.model_dump() for i in data.pop("certification_criteria")]

    for k, v in data.items():
        if hasattr(course, k):
            setattr(course, k, v)
    await db.commit()
    await db.refresh(course)
    print(f"[ADMIN] Course updated: {course.title}")
    cnt = (await db.execute(select(func.count(Batch.id)).where(Batch.course_id == course.id))).scalar_one()
    return _to_public(course, cnt)


@router.delete("/{course_id}")
async def delete_course(course_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    course = await db.get(Course, course_id)
    if not course:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)
    bcnt = (await db.execute(select(func.count(Batch.id)).where(Batch.course_id == course.id))).scalar_one()
    if bcnt > 0:
        raise APIError(code="HAS_BATCHES", message="Cannot delete course with batches. Delete batches first.")
    await db.delete(course)
    await db.commit()
    print(f"[ADMIN] Course deleted: {course.slug}")
    return {"success": True, "message": "Deleted"}


@router.patch("/{course_id}/publish", response_model=CoursePublic)
async def toggle_publish(course_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    course = await db.get(Course, course_id)
    if not course:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)
    course.is_published = not course.is_published
    await db.commit()
    await db.refresh(course)
    cnt = (await db.execute(select(func.count(Batch.id)).where(Batch.course_id == course.id))).scalar_one()
    return _to_public(course, cnt)


@router.post("/{course_id}/banner")
async def upload_banner(
    course_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    course = await db.get(Course, course_id)
    if not course:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)
    url = await save_upload(file, "course_banners")
    course.banner_url = url
    await db.commit()
    return {"success": True, "data": {"banner_url": url}}


@router.post("/{course_id}/syllabus")
async def upload_syllabus(
    course_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    course = await db.get(Course, course_id)
    if not course:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)
    url = await save_upload(file, "syllabus_pdfs")
    course.syllabus_pdf_url = url
    await db.commit()
    return {"success": True, "data": {"syllabus_pdf_url": url}}


