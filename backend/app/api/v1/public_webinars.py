from __future__ import annotations

import secrets
import uuid as uuid_lib
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import APIError
from app.core.redis import rate_limit_check
from app.core.utils import get_client_ip
from app.db.session import get_db
from app.models.webinar import (
    Organization,
    Webinar,
    WebinarGender,
    WebinarRegistration,
    WebinarRegistrationStatus,
    WebinarReminderDispatch,
    WebinarReminderType,
)
from app.schemas.webinar import RegistrationCreate, RegistrationResend, RegistrationVerify
from app.services import webinar_service as wsvc
from app.services.captcha_service import verify_turnstile
from app.services.email_service import (
    render_webinar_confirmation_email,
    render_webinar_verification_email,
    send_email,
)

router = APIRouter(prefix="/public/webinars", tags=["public:webinars"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SEAT_STATUSES = (WebinarRegistrationStatus.registered,)


def _detail_url(webinar: Webinar) -> str:
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/webinars/{webinar.slug}"


async def _seat_counts(db: AsyncSession, webinar_ids: list) -> dict:
    """Verified registered seats taken, per webinar id."""
    counts = {wid: 0 for wid in webinar_ids}
    if not webinar_ids:
        return counts
    rows = await db.execute(
        select(WebinarRegistration.webinar_id, func.count(WebinarRegistration.id))
        .where(
            WebinarRegistration.webinar_id.in_(webinar_ids),
            WebinarRegistration.status == WebinarRegistrationStatus.registered,
        )
        .group_by(WebinarRegistration.webinar_id)
    )
    for wid, cnt in rows.all():
        counts[wid] = cnt
    return counts


def _card_dict(w: Webinar, host: Optional[dict], taken: int, now) -> dict:
    status = wsvc.compute_status(w, now)
    reg = wsvc.registration_state(w, taken, now)
    return {
        "id": str(w.id),
        "slug": w.slug,
        "title": w.title,
        "subtitle": w.subtitle,
        "category": w.category,
        "language": w.language,
        "flyer_url": w.flyer_url,
        "banner_url": w.banner_url,
        "start_at": w.start_at.isoformat() if w.start_at else None,
        "end_at": w.end_at.isoformat() if w.end_at else None,
        "timezone": w.timezone,
        "duration_mins": wsvc.duration_minutes(w),
        "is_free": w.is_free,
        "price": float(w.price or 0),
        "currency": w.currency,
        "status": status,
        "registration_state": reg["state"],
        "seats_left": reg["seats_left"],
        "max_participants": reg["max_participants"],
        "host": host,
    }


def _detail_dict(w: Webinar, host: Optional[dict], taken: int, now) -> dict:
    base = _card_dict(w, host, taken, now)
    detail_url = _detail_url(w)
    base.update(
        {
            "description": w.description,
            "faqs": w.faqs or [],
            "provider_type": w.provider_type.value,
            "registration_open_at": w.registration_open_at.isoformat() if w.registration_open_at else None,
            "registration_close_at": w.registration_close_at.isoformat() if w.registration_close_at else None,
            "allow_waitlist": w.allow_waitlist,
            "meta_title": w.meta_title or w.title,
            "meta_description": w.meta_description or w.subtitle or (w.description or "")[:200],
            "og_image_url": w.og_image_url or w.banner_url or w.flyer_url,
            # Join link only shown publicly when the admin opted in.
            "meeting_url": w.meeting_url if w.meeting_link_public else None,
            "meeting_link_public": w.meeting_link_public,
            "calendar_url": wsvc.google_calendar_url(w, detail_url),
            "ics_url": f"/api/v1/public/webinars/{w.id}/calendar.ics",
            "detail_url": detail_url,
        }
    )
    return base


async def _resolve_webinar(db: AsyncSession, id_or_slug: str) -> Webinar:
    webinar: Optional[Webinar] = None
    try:
        uuid_lib.UUID(id_or_slug)
        webinar = await db.get(Webinar, id_or_slug)
    except (ValueError, TypeError):
        webinar = (
            await db.execute(select(Webinar).where(Webinar.slug == id_or_slug))
        ).scalar_one_or_none()
    if not webinar or not webinar.is_published or webinar.is_cancelled:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)
    return webinar


# ---------------------------------------------------------------------------
# Listing + detail
# ---------------------------------------------------------------------------


@router.get("")
async def list_webinars(
    status: Optional[str] = Query(None, description="upcoming | live | past"),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Webinar).where(
        Webinar.is_published == True,  # noqa: E712
        Webinar.is_cancelled == False,  # noqa: E712
    )
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Webinar.title).like(term)
            | func.lower(func.coalesce(Webinar.category, "")).like(term)
        )
    rows = (await db.execute(stmt.order_by(Webinar.start_at.asc()))).scalars().all()

    now = wsvc.now_utc()
    if status in ("upcoming", "live", "past"):
        rows = [w for w in rows if wsvc.compute_status(w, now) == status]
    # past webinars read better newest-first
    if status == "past":
        rows = sorted(rows, key=lambda w: w.start_at, reverse=True)
    rows = rows[:limit]

    # batch host + seat counts
    org_ids = list({w.organization_id for w in rows if w.organization_id})
    orgs_by_id: dict = {}
    if org_ids:
        org_rows = (await db.execute(select(Organization).where(Organization.id.in_(org_ids)))).scalars().all()
        orgs_by_id = {o.id: o for o in org_rows}
    default_org = await wsvc.get_default_org(db)
    seat_counts = await _seat_counts(db, [w.id for w in rows])

    items = []
    for w in rows:
        org = orgs_by_id.get(w.organization_id) or default_org
        items.append(_card_dict(w, wsvc.host_dict(org), seat_counts.get(w.id, 0), now))
    return {"success": True, "data": items}


@router.get("/{id_or_slug}")
async def webinar_detail(id_or_slug: str, db: AsyncSession = Depends(get_db)):
    webinar = await _resolve_webinar(db, id_or_slug)
    org = await wsvc.resolve_host_org(db, webinar)
    taken = (await _seat_counts(db, [webinar.id]))[webinar.id]
    return {"success": True, "data": _detail_dict(webinar, wsvc.host_dict(org), taken, wsvc.now_utc())}


@router.get("/{webinar_id}/calendar.ics")
async def webinar_ics(webinar_id: str, db: AsyncSession = Depends(get_db)):
    webinar = await _resolve_webinar(db, webinar_id)
    ics = wsvc.build_ics(webinar, _detail_url(webinar))
    filename = f"{webinar.slug or 'webinar'}.ics"
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


async def _send_verification(webinar: Webinar, reg: WebinarRegistration) -> None:
    base = settings.FRONTEND_URL.rstrip("/")
    verify_url = f"{base}/webinars/verify/{reg.verification_token}"
    subject, html, text = render_webinar_verification_email(reg.full_name, webinar.title, verify_url)
    await send_email(reg.email, subject, html, text)


@router.post("/{webinar_id}/register")
async def register(
    webinar_id: str,
    payload: RegistrationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    webinar = await _resolve_webinar(db, webinar_id)
    ip = get_client_ip(request)

    # 1) CAPTCHA
    if not await verify_turnstile(payload.captcha_token, ip):
        raise APIError(code="CAPTCHA_FAILED", message="CAPTCHA verification failed. Please try again.", status_code=400)

    # 2) Rate limiting (per IP and per email)
    allowed_ip, reset_ip = await rate_limit_check(f"webinar_reg:ip:{ip}", limit=10, window_seconds=3600)
    if not allowed_ip:
        raise APIError(
            code="RATE_LIMITED",
            message=f"Too many registrations from your network. Try again in {max(reset_ip // 60, 1)} minutes.",
            status_code=429,
            details={"retry_after": reset_ip},
        )
    email_l = payload.email.lower().strip()
    allowed_em, reset_em = await rate_limit_check(f"webinar_reg:email:{email_l}", limit=5, window_seconds=3600)
    if not allowed_em:
        raise APIError(
            code="RATE_LIMITED",
            message="Too many attempts for this email. Please try again later.",
            status_code=429,
            details={"retry_after": reset_em},
        )

    # 3) Registration window / capacity
    taken = (await _seat_counts(db, [webinar.id]))[webinar.id]
    state = wsvc.registration_state(webinar, taken)["state"]
    if state == "not_open":
        raise APIError(code="REG_NOT_OPEN", message="Registration is not open yet.", status_code=400)
    if state == "closed":
        raise APIError(code="REG_CLOSED", message="Registration for this webinar is closed.", status_code=400)
    if state == "full":
        raise APIError(code="WEBINAR_FULL", message="This webinar is full.", status_code=400)
    will_waitlist = state == "waitlist"

    # 4) Duplicate check
    existing = (
        await db.execute(
            select(WebinarRegistration).where(
                WebinarRegistration.webinar_id == webinar.id,
                func.lower(WebinarRegistration.email) == email_l,
            )
        )
    ).scalar_one_or_none()
    if existing:
        if existing.status == WebinarRegistrationStatus.pending_verification:
            # Re-send the confirmation link rather than erroring out.
            if not existing.verification_token:
                existing.verification_token = secrets.token_urlsafe(32)
                await db.commit()
            await _send_verification(webinar, existing)
            return {
                "success": True,
                "data": {"status": "pending_verification", "resent": True},
                "message": "You've already started registering — we've re-sent your confirmation link.",
            }
        raise APIError(
            code="WEBINAR_DUP",
            message="This email is already registered for this webinar.",
            status_code=409,
        )

    # 5) Gender coercion
    try:
        gender_enum = WebinarGender(payload.gender)
    except ValueError:
        raise APIError(code="VALIDATION", message="Invalid gender value.", status_code=422)

    reg = WebinarRegistration(
        webinar_id=webinar.id,
        full_name=payload.full_name.strip(),
        email=email_l,
        date_of_birth=payload.date_of_birth,
        gender=gender_enum,
        profession=payload.profession.strip(),
        status=WebinarRegistrationStatus.pending_verification,
        verification_token=secrets.token_urlsafe(32),
        ip_address=ip,
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
        referral_source=payload.referral_source,
        utm=payload.utm,
    )
    if not webinar.is_free:
        reg.amount = wsvc.payable_amount(webinar)
        reg.currency = webinar.currency
        from app.models.webinar import WebinarPaymentStatus

        reg.payment_status = WebinarPaymentStatus.pending
    db.add(reg)
    await db.commit()
    await db.refresh(reg)

    await _send_verification(webinar, reg)
    return {
        "success": True,
        "data": {"status": "pending_verification", "will_waitlist": will_waitlist},
        "message": "Almost there! Check your inbox to confirm your registration.",
    }


@router.post("/registrations/verify")
async def verify_registration(payload: RegistrationVerify, db: AsyncSession = Depends(get_db)):
    reg = (
        await db.execute(
            select(WebinarRegistration).where(WebinarRegistration.verification_token == payload.token)
        )
    ).scalar_one_or_none()
    if not reg:
        raise APIError(code="WEBINAR_TOKEN_INVALID", message="This confirmation link is invalid or has expired.", status_code=404)

    webinar = await db.get(Webinar, reg.webinar_id)
    if not webinar:
        raise APIError(code="NOT_FOUND", message="Webinar not found", status_code=404)

    already = reg.verified_at is not None
    if not already:
        # Assign registered vs waitlisted from verified seat count (excluding self).
        verified_taken = (
            await db.execute(
                select(func.count(WebinarRegistration.id)).where(
                    WebinarRegistration.webinar_id == webinar.id,
                    WebinarRegistration.status == WebinarRegistrationStatus.registered,
                    WebinarRegistration.id != reg.id,
                )
            )
        ).scalar_one()
        if (
            webinar.max_participants is not None
            and verified_taken >= webinar.max_participants
            and webinar.allow_waitlist
        ):
            reg.status = WebinarRegistrationStatus.waitlisted
        else:
            reg.status = WebinarRegistrationStatus.registered
        reg.verified_at = wsvc.now_utc()
        await db.commit()

    # Confirmation email (idempotent on the dispatch ledger).
    org = await wsvc.resolve_host_org(db, webinar)
    host = wsvc.host_dict(org)
    detail_url = _detail_url(webinar)
    when_str = wsvc.format_local(webinar.start_at, webinar.timezone)
    settings_map = webinar.email_settings or {}
    if not already and settings_map.get("confirmation", True):
        dispatched = (
            await db.execute(
                select(WebinarReminderDispatch).where(
                    WebinarReminderDispatch.registration_id == reg.id,
                    WebinarReminderDispatch.reminder_type == WebinarReminderType.confirmation,
                )
            )
        ).scalar_one_or_none()
        if not dispatched:
            subject, html, text = render_webinar_confirmation_email(
                reg.full_name,
                webinar.title,
                when_str,
                host["name"] if host else "Silicon Mango",
                detail_url,
                webinar.meeting_url,  # registrants always get the link by email
                wsvc.google_calendar_url(webinar, detail_url),
            )
            ics = wsvc.build_ics(webinar, detail_url)
            await send_email(
                reg.email,
                subject,
                html,
                text,
                attachments=[(f"{webinar.slug}.ics", ics.encode("utf-8"), "text/calendar")],
            )
            db.add(
                WebinarReminderDispatch(
                    webinar_id=webinar.id,
                    registration_id=reg.id,
                    reminder_type=WebinarReminderType.confirmation,
                )
            )
            await db.commit()

    return {
        "success": True,
        "data": {
            "verified": True,
            "waitlisted": reg.status == WebinarRegistrationStatus.waitlisted,
            "webinar": {
                "id": str(webinar.id),
                "slug": webinar.slug,
                "title": webinar.title,
                "start_at": webinar.start_at.isoformat() if webinar.start_at else None,
                "status": wsvc.compute_status(webinar),
            },
        },
    }


@router.post("/{webinar_id}/resend-verification")
async def resend_verification(
    webinar_id: str,
    payload: RegistrationResend,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    webinar = await _resolve_webinar(db, webinar_id)
    email_l = payload.email.lower().strip()
    allowed, reset = await rate_limit_check(f"webinar_resend:email:{email_l}", limit=4, window_seconds=900)
    if not allowed:
        raise APIError(
            code="RATE_LIMITED",
            message="Too many requests. Please try again in a few minutes.",
            status_code=429,
            details={"retry_after": reset},
        )

    reg = (
        await db.execute(
            select(WebinarRegistration).where(
                WebinarRegistration.webinar_id == webinar.id,
                func.lower(WebinarRegistration.email) == email_l,
            )
        )
    ).scalar_one_or_none()

    if reg and reg.status == WebinarRegistrationStatus.pending_verification:
        if not reg.verification_token:
            reg.verification_token = secrets.token_urlsafe(32)
            await db.commit()
        await _send_verification(webinar, reg)
    # Uniform response (do not leak whether the email is registered).
    return {"success": True, "message": "If that email has a pending registration, we've re-sent the link."}
