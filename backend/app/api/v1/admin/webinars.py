from __future__ import annotations

import csv
import io
import math
import secrets
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery
from app.core.exceptions import APIError
from app.core.utils import slugify
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.user import User
from app.models.webinar import (
    Organization,
    Webinar,
    WebinarAttendanceStatus,
    WebinarEmailAudience,
    WebinarEmailCampaign,
    WebinarEmailStatus,
    WebinarProviderType,
    WebinarRegistration,
    WebinarRegistrationStatus,
)
from app.schemas.webinar import (
    EmailCampaignCreate,
    RegistrationAdminUpdate,
    WebinarCreate,
    WebinarUpdate,
)
from app.services import webinar_service as wsvc
from app.services.email_service import (
    render_webinar_confirmation_email,
    render_webinar_verification_email,
    send_email,
)
from app.services.storage_service import save_upload

router = APIRouter(prefix="/webinars", tags=["admin:webinars"])

DEFAULT_EMAIL_SETTINGS = {
    "confirmation": True,
    "reminder_7d": True,
    "reminder_1d": True,
    "reminder_1h": True,
    "start": True,
    "followup": False,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _enqueue(name: str, *args) -> None:
    """Best-effort dispatch to the `webinars` Celery queue. A broker hiccup must
    not fail the admin's save — the beat fallback / manual resend still works."""
    try:
        celery.send_task(name, args=list(args), queue="webinars")
        print(f"[WEBINAR] enqueued {name}")
    except Exception as exc:  # pragma: no cover
        print(f"[WEBINAR] enqueue {name} failed: {exc}")


def _coerce_provider(value: Optional[str]) -> WebinarProviderType:
    if not value:
        return WebinarProviderType.manual_link
    try:
        return WebinarProviderType(value)
    except ValueError:
        raise APIError(code="VALIDATION", message=f"Invalid provider_type: {value}", status_code=422)


def _validate_meeting_url(url: Optional[str]) -> None:
    if url and not (url.startswith("http://") or url.startswith("https://")):
        raise APIError(code="VALIDATION", message="Meeting link must start with http:// or https://", status_code=422)


def _tz(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return ZoneInfo("Asia/Kolkata")


def _local_input(dt: Optional[datetime], tz_name: str) -> Optional[str]:
    """Render a stored UTC time as a naive local string for a datetime-local input."""
    if not dt:
        return None
    aware = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return aware.astimezone(_tz(tz_name)).strftime("%Y-%m-%dT%H:%M")


async def _unique_slug(db: AsyncSession, base: str, exclude_id: Optional[str] = None) -> str:
    slug = base
    suffix = 1
    while True:
        stmt = select(Webinar.id).where(Webinar.slug == slug)
        if exclude_id:
            stmt = stmt.where(Webinar.id != exclude_id)
        if (await db.execute(stmt)).scalar_one_or_none() is None:
            return slug
        suffix += 1
        slug = f"{base}-{suffix}"


async def _counts(db: AsyncSession, webinar_id) -> dict:
    rows = await db.execute(
        select(WebinarRegistration.status, func.count(WebinarRegistration.id))
        .where(WebinarRegistration.webinar_id == webinar_id)
        .group_by(WebinarRegistration.status)
    )
    by_status = {s: c for s, c in rows.all()}
    verified = (
        await db.execute(
            select(func.count(WebinarRegistration.id)).where(
                WebinarRegistration.webinar_id == webinar_id,
                WebinarRegistration.verified_at.is_not(None),
            )
        )
    ).scalar_one()
    attended = (
        await db.execute(
            select(func.count(WebinarRegistration.id)).where(
                WebinarRegistration.webinar_id == webinar_id,
                WebinarRegistration.attendance_status == WebinarAttendanceStatus.present,
            )
        )
    ).scalar_one()
    total = sum(by_status.values())
    return {
        "total": total,
        "verified": verified,
        "registered": by_status.get(WebinarRegistrationStatus.registered, 0),
        "waitlisted": by_status.get(WebinarRegistrationStatus.waitlisted, 0),
        "pending": by_status.get(WebinarRegistrationStatus.pending_verification, 0),
        "attended": attended,
    }


def _admin_dict(w: Webinar, host: Optional[dict], counts: dict) -> dict:
    return {
        "id": str(w.id),
        "slug": w.slug,
        "title": w.title,
        "subtitle": w.subtitle,
        "description": w.description,
        "category": w.category,
        "language": w.language,
        "organization_id": str(w.organization_id) if w.organization_id else None,
        "host": host,
        "flyer_url": w.flyer_url,
        "banner_url": w.banner_url,
        "start_at": w.start_at.isoformat() if w.start_at else None,
        "end_at": w.end_at.isoformat() if w.end_at else None,
        "start_at_local": _local_input(w.start_at, w.timezone),
        "end_at_local": _local_input(w.end_at, w.timezone),
        "timezone": w.timezone,
        "duration_mins": wsvc.duration_minutes(w),
        "registration_open_at": w.registration_open_at.isoformat() if w.registration_open_at else None,
        "registration_close_at": w.registration_close_at.isoformat() if w.registration_close_at else None,
        "registration_open_at_local": _local_input(w.registration_open_at, w.timezone),
        "registration_close_at_local": _local_input(w.registration_close_at, w.timezone),
        "max_participants": w.max_participants,
        "allow_waitlist": w.allow_waitlist,
        "is_free": w.is_free,
        "price": float(w.price or 0),
        "currency": w.currency,
        "provider_type": w.provider_type.value,
        "meeting_url": w.meeting_url,
        "meeting_link_public": w.meeting_link_public,
        "faqs": w.faqs or [],
        "email_settings": w.email_settings or DEFAULT_EMAIL_SETTINGS,
        "meta_title": w.meta_title,
        "meta_description": w.meta_description,
        "og_image_url": w.og_image_url,
        "is_published": w.is_published,
        "is_cancelled": w.is_cancelled,
        "status": wsvc.compute_status(w),
        "counts": counts,
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }


async def _host_for(db: AsyncSession, w: Webinar) -> Optional[dict]:
    org = await wsvc.resolve_host_org(db, w)
    return wsvc.host_dict(org)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("")
async def list_webinars(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = Query(None, description="upcoming | live | past | cancelled"),
    published: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(Webinar)
    count_stmt = select(func.count(Webinar.id))
    if search:
        like = f"%{search}%"
        cond = or_(Webinar.title.ilike(like), Webinar.category.ilike(like))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if published is not None:
        stmt = stmt.where(Webinar.is_published == published)
        count_stmt = count_stmt.where(Webinar.is_published == published)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(Webinar.start_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()

    now = wsvc.now_utc()
    if status:
        rows = [w for w in rows if wsvc.compute_status(w, now) == status]

    # batch hosts
    org_ids = list({w.organization_id for w in rows if w.organization_id})
    orgs_by_id: dict = {}
    if org_ids:
        org_rows = (await db.execute(select(Organization).where(Organization.id.in_(org_ids)))).scalars().all()
        orgs_by_id = {o.id: o for o in org_rows}
    default_org = await wsvc.get_default_org(db)

    # batch registration counts
    reg_rows = await db.execute(
        select(WebinarRegistration.webinar_id, func.count(WebinarRegistration.id))
        .where(WebinarRegistration.webinar_id.in_([w.id for w in rows]))
        .group_by(WebinarRegistration.webinar_id)
    ) if rows else None
    reg_counts = {wid: c for wid, c in reg_rows.all()} if reg_rows is not None else {}

    items = []
    for w in rows:
        org = orgs_by_id.get(w.organization_id) or default_org
        items.append(
            {
                "id": str(w.id),
                "slug": w.slug,
                "title": w.title,
                "category": w.category,
                "flyer_url": w.flyer_url,
                "start_at": w.start_at.isoformat() if w.start_at else None,
                "end_at": w.end_at.isoformat() if w.end_at else None,
                "timezone": w.timezone,
                "is_free": w.is_free,
                "price": float(w.price or 0),
                "currency": w.currency,
                "is_published": w.is_published,
                "is_cancelled": w.is_cancelled,
                "status": wsvc.compute_status(w, now),
                "host": wsvc.host_dict(org),
                "registrations_count": reg_counts.get(w.id, 0),
            }
        )
    return {
        "success": True,
        "data": items,
        "meta": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit))},
    }


async def _resolve_org_id(db: AsyncSession, org_id: Optional[str]) -> Optional[str]:
    if org_id:
        org = await db.get(Organization, org_id)
        if not org:
            raise APIError(code="VALIDATION", message="Selected host does not exist.", status_code=422)
        return org_id
    default = await wsvc.get_default_org(db)
    return str(default.id) if default else None


@router.post("")
async def create_webinar(
    payload: WebinarCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    tz_name = payload.timezone or "Asia/Kolkata"
    start_at = wsvc.to_utc(payload.start_at, tz_name)
    end_at = wsvc.to_utc(payload.end_at, tz_name)
    if end_at <= start_at:
        raise APIError(code="VALIDATION", message="End time must be after start time.", status_code=422)
    _validate_meeting_url(payload.meeting_url)

    slug = await _unique_slug(db, slugify(payload.title))
    org_id = await _resolve_org_id(db, payload.organization_id)

    webinar = Webinar(
        slug=slug,
        title=payload.title.strip(),
        subtitle=payload.subtitle,
        description=payload.description,
        category=payload.category,
        language=payload.language or "English",
        organization_id=org_id,
        start_at=start_at,
        end_at=end_at,
        timezone=tz_name,
        registration_open_at=wsvc.to_utc(payload.registration_open_at, tz_name) if payload.registration_open_at else None,
        registration_close_at=wsvc.to_utc(payload.registration_close_at, tz_name) if payload.registration_close_at else None,
        max_participants=payload.max_participants,
        allow_waitlist=payload.allow_waitlist,
        is_free=payload.is_free,
        price=payload.price if not payload.is_free else 0,
        currency=payload.currency or "INR",
        provider_type=_coerce_provider(payload.provider_type),
        meeting_url=payload.meeting_url,
        meeting_link_public=payload.meeting_link_public,
        faqs=[f.model_dump() for f in payload.faqs],
        email_settings=payload.email_settings or DEFAULT_EMAIL_SETTINGS,
        meta_title=payload.meta_title,
        meta_description=payload.meta_description,
        is_published=False,
        created_by=user.id,
    )
    db.add(webinar)
    await db.commit()
    await db.refresh(webinar)
    print(f"[ADMIN] Webinar created: {webinar.title} ({webinar.slug})")
    return {"success": True, "data": _admin_dict(webinar, await _host_for(db, webinar), await _counts(db, webinar.id))}


@router.get("/{webinar_id}")
async def get_webinar(webinar_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    return {"success": True, "data": _admin_dict(webinar, await _host_for(db, webinar), await _counts(db, webinar.id))}


@router.put("/{webinar_id}")
async def update_webinar(
    webinar_id: str,
    payload: WebinarUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)

    old_start, old_end = webinar.start_at, webinar.end_at
    data = payload.model_dump(exclude_unset=True)
    tz_name = data.get("timezone") or webinar.timezone

    if "title" in data and data["title"] != webinar.title:
        webinar.slug = await _unique_slug(db, slugify(data["title"]), exclude_id=str(webinar.id))
    if "meeting_url" in data:
        _validate_meeting_url(data["meeting_url"])
    if "provider_type" in data:
        webinar.provider_type = _coerce_provider(data.pop("provider_type"))
    if "organization_id" in data:
        webinar.organization_id = await _resolve_org_id(db, data.pop("organization_id"))
    if "faqs" in data and data["faqs"] is not None:
        webinar.faqs = [f if isinstance(f, dict) else f.model_dump() for f in data.pop("faqs")]
    for field in ("start_at", "end_at", "registration_open_at", "registration_close_at"):
        if field in data and data[field] is not None:
            data[field] = wsvc.to_utc(data[field], tz_name)

    for k, v in data.items():
        if hasattr(webinar, k):
            setattr(webinar, k, v)

    if webinar.is_free:
        webinar.price = 0

    # Validate ordering after applying any time changes.
    if webinar.end_at <= webinar.start_at:
        raise APIError(code="VALIDATION", message="End time must be after start time.", status_code=422)

    await db.commit()
    await db.refresh(webinar)

    # Reschedule notification: only on an actual time change, only if published with audience.
    if webinar.is_published and not webinar.is_cancelled and (
        webinar.start_at != old_start or webinar.end_at != old_end
    ):
        audience = (
            await db.execute(
                select(func.count(WebinarRegistration.id)).where(
                    WebinarRegistration.webinar_id == webinar.id,
                    WebinarRegistration.verified_at.is_not(None),
                    WebinarRegistration.status.in_(
                        [WebinarRegistrationStatus.registered, WebinarRegistrationStatus.waitlisted]
                    ),
                )
            )
        ).scalar_one()
        if audience > 0:
            _enqueue(
                "tasks.notify_webinar_reschedule",
                str(webinar.id),
                old_start.isoformat() if old_start else "",
                old_end.isoformat() if old_end else "",
            )

    print(f"[ADMIN] Webinar updated: {webinar.title}")
    return {"success": True, "data": _admin_dict(webinar, await _host_for(db, webinar), await _counts(db, webinar.id))}


@router.delete("/{webinar_id}")
async def delete_webinar(webinar_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    await db.delete(webinar)  # cascades registrations / campaigns / dispatch rows
    await db.commit()
    print(f"[ADMIN] Webinar deleted: {webinar.slug}")
    return {"success": True, "message": "Deleted"}


@router.post("/{webinar_id}/publish")
async def publish_webinar(webinar_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    if webinar.is_cancelled:
        raise APIError(code="WEBINAR_CANCELLED", message="A cancelled webinar cannot be published.", status_code=400)
    webinar.is_published = True
    await db.commit()
    await db.refresh(webinar)
    return {"success": True, "data": _admin_dict(webinar, await _host_for(db, webinar), await _counts(db, webinar.id))}


@router.post("/{webinar_id}/unpublish")
async def unpublish_webinar(webinar_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    webinar.is_published = False
    await db.commit()
    await db.refresh(webinar)
    return {"success": True, "data": _admin_dict(webinar, await _host_for(db, webinar), await _counts(db, webinar.id))}


@router.post("/{webinar_id}/cancel")
async def cancel_webinar(webinar_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    if not webinar.is_cancelled:
        webinar.is_cancelled = True
        webinar.cancelled_at = wsvc.now_utc()
        await db.commit()
        await db.refresh(webinar)
        _enqueue("tasks.notify_webinar_cancellation", str(webinar.id))
    return {"success": True, "data": _admin_dict(webinar, await _host_for(db, webinar), await _counts(db, webinar.id))}


@router.post("/{webinar_id}/flyer")
async def upload_flyer(
    webinar_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    url = await save_upload(file, "webinar_flyers")
    webinar.flyer_url = url
    await db.commit()
    return {"success": True, "data": {"flyer_url": url}}


@router.post("/{webinar_id}/banner")
async def upload_banner(
    webinar_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    url = await save_upload(file, "webinar_banners")
    webinar.banner_url = url
    await db.commit()
    return {"success": True, "data": {"banner_url": url}}


# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------


def _reg_dict(r: WebinarRegistration) -> dict:
    return {
        "id": str(r.id),
        "full_name": r.full_name,
        "email": r.email,
        "date_of_birth": r.date_of_birth.isoformat() if r.date_of_birth else None,
        "gender": r.gender.value if r.gender else None,
        "profession": r.profession,
        "status": r.status.value,
        "verified_at": r.verified_at.isoformat() if r.verified_at else None,
        "attendance_status": r.attendance_status.value,
        "payment_status": r.payment_status.value,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/{webinar_id}/registrations")
async def list_registrations(
    webinar_id: str,
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    stmt = select(WebinarRegistration).where(WebinarRegistration.webinar_id == webinar.id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(WebinarRegistration.full_name.ilike(like), WebinarRegistration.email.ilike(like)))
    if status:
        try:
            stmt = stmt.where(WebinarRegistration.status == WebinarRegistrationStatus(status))
        except ValueError:
            pass
    rows = (await db.execute(stmt.order_by(WebinarRegistration.created_at.desc()))).scalars().all()
    return {"success": True, "data": [_reg_dict(r) for r in rows], "counts": await _counts(db, webinar.id)}


@router.patch("/{webinar_id}/registrations/{reg_id}")
async def update_registration(
    webinar_id: str,
    reg_id: str,
    payload: RegistrationAdminUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    reg = await db.get(WebinarRegistration, reg_id)
    if not reg or str(reg.webinar_id) != webinar_id:
        raise APIError(code="NOT_FOUND", message="Registration not found", status_code=404)
    if payload.attendance_status is not None:
        try:
            reg.attendance_status = WebinarAttendanceStatus(payload.attendance_status)
        except ValueError:
            raise APIError(code="VALIDATION", message="Invalid attendance status", status_code=422)
    if payload.status is not None:
        try:
            reg.status = WebinarRegistrationStatus(payload.status)
        except ValueError:
            raise APIError(code="VALIDATION", message="Invalid status", status_code=422)
    await db.commit()
    await db.refresh(reg)
    return {"success": True, "data": _reg_dict(reg)}


@router.delete("/{webinar_id}/registrations/{reg_id}")
async def delete_registration(
    webinar_id: str, reg_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    reg = await db.get(WebinarRegistration, reg_id)
    if not reg or str(reg.webinar_id) != webinar_id:
        raise APIError(code="NOT_FOUND", message="Registration not found", status_code=404)
    await db.delete(reg)
    await db.commit()
    return {"success": True, "message": "Deleted"}


@router.post("/{webinar_id}/registrations/{reg_id}/resend")
async def resend_registration_email(
    webinar_id: str, reg_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    reg = await db.get(WebinarRegistration, reg_id)
    if not reg or str(reg.webinar_id) != webinar_id:
        raise APIError(code="NOT_FOUND", message="Registration not found", status_code=404)
    webinar = await db.get(Webinar, webinar_id)

    from app.core.config import settings as _settings

    front = _settings.FRONTEND_URL.rstrip("/")
    detail_url = f"{front}/webinars/{webinar.slug}"

    if reg.status == WebinarRegistrationStatus.pending_verification:
        if not reg.verification_token:
            reg.verification_token = secrets.token_urlsafe(32)
            await db.commit()
        verify_url = f"{front}/webinars/verify/{reg.verification_token}"
        subject, html, text = render_webinar_verification_email(reg.full_name, webinar.title, verify_url)
        await send_email(reg.email, subject, html, text)
        return {"success": True, "message": "Verification email re-sent."}

    # Already verified → resend the confirmation (with join link + calendar).
    org = await wsvc.resolve_host_org(db, webinar)
    host = wsvc.host_dict(org)
    when_str = wsvc.format_local(webinar.start_at, webinar.timezone)
    subject, html, text = render_webinar_confirmation_email(
        reg.full_name,
        webinar.title,
        when_str,
        host["name"] if host else "Silicon Mango",
        detail_url,
        webinar.meeting_url,
        wsvc.google_calendar_url(webinar, detail_url),
    )
    ics = wsvc.build_ics(webinar, detail_url)
    await send_email(reg.email, subject, html, text, attachments=[(f"{webinar.slug}.ics", ics.encode("utf-8"), "text/calendar")])
    return {"success": True, "message": "Confirmation email re-sent."}


@router.get("/{webinar_id}/registrations/export")
async def export_registrations(
    webinar_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    rows = (
        await db.execute(
            select(WebinarRegistration)
            .where(WebinarRegistration.webinar_id == webinar.id)
            .order_by(WebinarRegistration.created_at.asc())
        )
    ).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["Name", "Email", "Gender", "Date of Birth", "Profession", "Status", "Verified", "Attendance", "Registered At"]
    )
    for r in rows:
        writer.writerow(
            [
                r.full_name,
                r.email,
                r.gender.value if r.gender else "",
                r.date_of_birth.isoformat() if r.date_of_birth else "",
                r.profession or "",
                r.status.value,
                "yes" if r.verified_at else "no",
                r.attendance_status.value,
                r.created_at.isoformat() if r.created_at else "",
            ]
        )
    buf.seek(0)
    filename = f"{webinar.slug}-registrations.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Email campaigns
# ---------------------------------------------------------------------------


@router.get("/{webinar_id}/emails")
async def list_campaigns(webinar_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    rows = (
        await db.execute(
            select(WebinarEmailCampaign)
            .where(WebinarEmailCampaign.webinar_id == webinar.id)
            .order_by(WebinarEmailCampaign.created_at.desc())
        )
    ).scalars().all()
    return {
        "success": True,
        "data": [
            {
                "id": str(c.id),
                "subject": c.subject,
                "audience": c.audience.value,
                "status": c.status.value,
                "sent_count": c.sent_count,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "sent_at": c.sent_at.isoformat() if c.sent_at else None,
            }
            for c in rows
        ],
    }


@router.post("/{webinar_id}/emails")
async def create_campaign(
    webinar_id: str,
    payload: EmailCampaignCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    try:
        audience = WebinarEmailAudience(payload.audience)
    except ValueError:
        raise APIError(code="VALIDATION", message="Invalid audience", status_code=422)
    if audience == WebinarEmailAudience.selected and not payload.recipient_ids:
        raise APIError(code="VALIDATION", message="Select at least one recipient.", status_code=422)

    campaign = WebinarEmailCampaign(
        webinar_id=webinar.id,
        subject=payload.subject,
        body=payload.body,
        audience=audience,
        recipient_ids=payload.recipient_ids,
        status=WebinarEmailStatus.queued,
        created_by=user.id,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    _enqueue("tasks.send_webinar_campaign", str(campaign.id))
    return {"success": True, "data": {"id": str(campaign.id), "status": campaign.status.value}}


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


def _age_bucket(dob, now: datetime) -> str:
    if not dob:
        return "unknown"
    age = now.year - dob.year - ((now.month, now.day) < (dob.month, dob.day))
    if age < 18:
        return "<18"
    if age <= 24:
        return "18-24"
    if age <= 34:
        return "25-34"
    if age <= 44:
        return "35-44"
    if age <= 54:
        return "45-54"
    return "55+"


@router.get("/{webinar_id}/reports")
async def webinar_reports(webinar_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    webinar = await db.get(Webinar, webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)

    rows = (
        await db.execute(select(WebinarRegistration).where(WebinarRegistration.webinar_id == webinar.id))
    ).scalars().all()

    total = len(rows)
    verified = sum(1 for r in rows if r.verified_at)
    attended = sum(1 for r in rows if r.attendance_status == WebinarAttendanceStatus.present)

    gender: dict = {}
    profession: dict = {}
    age: dict = {}
    now = datetime.now(timezone.utc)
    for r in rows:
        g = r.gender.value if r.gender else "unknown"
        gender[g] = gender.get(g, 0) + 1
        p = r.profession or "Unknown"
        profession[p] = profession.get(p, 0) + 1
        b = _age_bucket(r.date_of_birth, now)
        age[b] = age.get(b, 0) + 1

    def pct(n: int, d: int) -> float:
        return round((n / d) * 100, 1) if d else 0.0

    return {
        "success": True,
        "data": {
            "totals": {
                "registrations": total,
                "verified": verified,
                "attended": attended,
            },
            "demographics": {"gender": gender, "profession": profession, "age_group": age},
            "conversion": {
                "verification_rate": pct(verified, total),
                "attendance_rate": pct(attended, verified),
            },
        },
    }
