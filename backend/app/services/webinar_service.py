from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.webinar import Organization, Webinar


def to_utc(dt: datetime, tz_name: str) -> datetime:
    """Interpret a naive datetime as wall-clock time in `tz_name`, return tz-aware UTC.
    If the datetime already carries a timezone, just convert it to UTC."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc)
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        tz = ZoneInfo("Asia/Kolkata")
    return dt.replace(tzinfo=tz).astimezone(timezone.utc)


def format_local(dt: datetime, tz_name: str) -> str:
    """Human-readable rendering of a stored UTC time in the webinar's timezone."""
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        tz = ZoneInfo("Asia/Kolkata")
    local = _aware(dt).astimezone(tz)
    return local.strftime("%A, %d %B %Y, %I:%M %p ") + tz_name


# ---------------------------------------------------------------------------
# Status / lifecycle
# ---------------------------------------------------------------------------


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def compute_status(webinar: Webinar, now: Optional[datetime] = None) -> str:
    """upcoming | live | past | cancelled — derived from start/end and the cancel flag."""
    now = now or now_utc()
    if webinar.is_cancelled:
        return "cancelled"
    start = _aware(webinar.start_at)
    end = _aware(webinar.end_at)
    if now < start:
        return "upcoming"
    if start <= now <= end:
        return "live"
    return "past"


def _aware(dt: datetime) -> datetime:
    """Treat naive datetimes (shouldn't happen with timezone=True columns) as UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def duration_minutes(webinar: Webinar) -> int:
    delta = _aware(webinar.end_at) - _aware(webinar.start_at)
    return max(int(delta.total_seconds() // 60), 0)


def registration_state(webinar: Webinar, taken: int, now: Optional[datetime] = None) -> dict:
    """Compute whether registration is open, and remaining seats.

    `taken` = count of seats already consumed (pending_verification + registered).
    Waitlisted registrations do NOT consume a seat.

    Returns: {state, seats_left, max_participants}
    state ∈ open | not_open | closed | full | waitlist
    """
    now = now or now_utc()
    max_p = webinar.max_participants
    seats_left = (max_p - taken) if max_p is not None else None

    if not webinar.is_published or webinar.is_cancelled:
        return {"state": "closed", "seats_left": seats_left, "max_participants": max_p}

    # Webinar already ended → closed.
    if now > _aware(webinar.end_at):
        return {"state": "closed", "seats_left": seats_left, "max_participants": max_p}

    if webinar.registration_open_at and now < _aware(webinar.registration_open_at):
        return {"state": "not_open", "seats_left": seats_left, "max_participants": max_p}
    if webinar.registration_close_at and now > _aware(webinar.registration_close_at):
        return {"state": "closed", "seats_left": seats_left, "max_participants": max_p}

    if max_p is not None and taken >= max_p:
        return {
            "state": "waitlist" if webinar.allow_waitlist else "full",
            "seats_left": 0,
            "max_participants": max_p,
        }

    return {"state": "open", "seats_left": seats_left, "max_participants": max_p}


# ---------------------------------------------------------------------------
# Pricing
# ---------------------------------------------------------------------------


def payable_amount(webinar: Webinar) -> Decimal:
    if webinar.is_free:
        return Decimal("0")
    return Decimal(webinar.price or 0)


# ---------------------------------------------------------------------------
# Host / brand resolution
# ---------------------------------------------------------------------------


async def get_default_org(db: AsyncSession) -> Optional[Organization]:
    return (
        await db.execute(select(Organization).where(Organization.is_default == True))  # noqa: E712
    ).scalars().first()


async def resolve_host_org(db: AsyncSession, webinar: Webinar) -> Optional[Organization]:
    """The webinar's host, falling back to the default Silicon Mango brand when the
    host was deleted (organization_id SET NULL) — spec edge case 'Host Deleted'."""
    if webinar.organization_id:
        org = await db.get(Organization, webinar.organization_id)
        if org:
            return org
    return await get_default_org(db)


def host_dict(org: Optional[Organization]) -> Optional[dict]:
    if not org:
        return None
    return {
        "id": str(org.id),
        "name": org.name,
        "logo_url": org.logo_url,
        "description": org.description,
        "website": org.website,
        "contact_email": org.contact_email,
    }


# ---------------------------------------------------------------------------
# Calendar helpers (no external dependency)
# ---------------------------------------------------------------------------


def _ics_dt(dt: datetime) -> str:
    return _aware(dt).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _ics_escape(text: str) -> str:
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def build_ics(webinar: Webinar, detail_url: str) -> str:
    """Minimal RFC-5545 VCALENDAR for an add-to-calendar download."""
    location = webinar.meeting_url or "Online"
    summary = _ics_escape(webinar.title)
    description = _ics_escape((webinar.subtitle or webinar.description or "") + f"\n\n{detail_url}")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Silicon Mango Academy//Webinars//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:webinar-{webinar.id}@siliconmango",
        f"DTSTAMP:{_ics_dt(now_utc())}",
        f"DTSTART:{_ics_dt(webinar.start_at)}",
        f"DTEND:{_ics_dt(webinar.end_at)}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"LOCATION:{_ics_escape(location)}",
        f"URL:{detail_url}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"


def google_calendar_url(webinar: Webinar, detail_url: str) -> str:
    start = _ics_dt(webinar.start_at)
    end = _ics_dt(webinar.end_at)
    details = (webinar.subtitle or webinar.description or "") + f"\n\n{detail_url}"
    location = webinar.meeting_url or "Online"
    return (
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={quote(webinar.title)}"
        f"&dates={start}/{end}"
        f"&details={quote(details)}"
        f"&location={quote(location)}"
    )
