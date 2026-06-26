from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.celery_app import celery
from app.core.config import settings
from app.models.webinar import (
    Webinar,
    WebinarEmailAudience,
    WebinarEmailCampaign,
    WebinarEmailStatus,
    WebinarRegistration,
    WebinarRegistrationStatus,
    WebinarReminderDispatch,
    WebinarReminderType,
)
from app.services import webinar_service as wsvc
from app.services.email_service import (
    render_webinar_cancelled_email,
    render_webinar_custom_email,
    render_webinar_reminder_email,
    render_webinar_rescheduled_email,
    send_email,
)

DEFAULT_EMAIL_SETTINGS = {
    "confirmation": True,
    "reminder_7d": True,
    "reminder_1d": True,
    "reminder_1h": True,
    "start": True,
    "followup": False,
}

# (reminder_type, offset_seconds_before_start, email_settings_key, human_label)
REMINDER_WINDOWS = [
    (WebinarReminderType.r7d, 7 * 86400, "reminder_7d", "in 7 days"),
    (WebinarReminderType.r1d, 86400, "reminder_1d", "tomorrow"),
    (WebinarReminderType.r1h, 3600, "reminder_1h", "in 1 hour"),
    (WebinarReminderType.start, 0, "start", "now"),
]

# How late a reminder may still fire after its trigger time (covers worker downtime
# while preventing a "7 days before" mail from firing for a last-minute webinar).
PRE_START_TOLERANCE = timedelta(hours=6)
START_TOLERANCE = timedelta(hours=2)


def _session_factory():
    engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_size=2, max_overflow=2)
    return engine, async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


def _detail_url(webinar: Webinar) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/webinars/{webinar.slug}"


# ---------------------------------------------------------------------------
# Scheduled reminders (Celery Beat — every 5 minutes)
# ---------------------------------------------------------------------------


@celery.task(name="tasks.dispatch_webinar_reminders", bind=True, max_retries=1, default_retry_delay=120)
def dispatch_webinar_reminders(self) -> dict:
    try:
        return asyncio.run(_dispatch_reminders())
    except Exception as exc:
        raise self.retry(exc=exc)


async def _dispatch_reminders() -> dict:
    engine, Session = _session_factory()
    sent = 0
    try:
        async with Session() as db:
            now = datetime.now(timezone.utc)
            lo = now - timedelta(hours=2)
            hi = now + timedelta(days=7, hours=1)
            webinars = (
                await db.execute(
                    select(Webinar).where(
                        Webinar.is_published == True,  # noqa: E712
                        Webinar.is_cancelled == False,  # noqa: E712
                        Webinar.start_at >= lo,
                        Webinar.start_at <= hi,
                    )
                )
            ).scalars().all()

            for w in webinars:
                cfg = w.email_settings or DEFAULT_EMAIL_SETTINGS
                due = []
                for rtype, offset, key, label in REMINDER_WINDOWS:
                    if not cfg.get(key, True):
                        continue
                    if rtype == WebinarReminderType.start:
                        if w.start_at <= now <= w.start_at + START_TOLERANCE:
                            due.append((rtype, label))
                    else:
                        trigger = w.start_at - timedelta(seconds=offset)
                        if trigger <= now < w.start_at and (now - trigger) <= PRE_START_TOLERANCE:
                            due.append((rtype, label))
                if not due:
                    continue

                when_str = wsvc.format_local(w.start_at, w.timezone)
                detail_url = _detail_url(w)

                # Already-dispatched registration IDs per due reminder type (IDs only — cheap).
                already_by_type = {}
                for rtype, _label in due:
                    already_by_type[rtype] = set(
                        (
                            await db.execute(
                                select(WebinarReminderDispatch.registration_id).where(
                                    WebinarReminderDispatch.webinar_id == w.id,
                                    WebinarReminderDispatch.reminder_type == rtype,
                                )
                            )
                        ).scalars().all()
                    )

                # Stream registrations in keyset-paginated chunks so a webinar with
                # thousands of sign-ups never loads them all into memory at once.
                CHUNK = 200
                last_id = None
                while True:
                    q = (
                        select(WebinarRegistration)
                        .where(
                            WebinarRegistration.webinar_id == w.id,
                            WebinarRegistration.status == WebinarRegistrationStatus.registered,
                            WebinarRegistration.verified_at.is_not(None),
                        )
                        .order_by(WebinarRegistration.id)
                        .limit(CHUNK)
                    )
                    if last_id is not None:
                        q = q.where(WebinarRegistration.id > last_id)
                    chunk = (await db.execute(q)).scalars().all()
                    if not chunk:
                        break
                    last_id = chunk[-1].id

                    for r in chunk:
                        for rtype, label in due:
                            if r.id in already_by_type[rtype]:
                                continue
                            subject, html, text = render_webinar_reminder_email(
                                r.full_name, w.title, label, when_str, detail_url, w.meeting_url
                            )
                            ok = await send_email(r.email, subject, html, text)
                            if not ok:
                                continue
                            db.add(
                                WebinarReminderDispatch(
                                    webinar_id=w.id, registration_id=r.id, reminder_type=rtype
                                )
                            )
                            try:
                                await db.commit()
                                sent += 1
                            except IntegrityError:
                                await db.rollback()

                    if len(chunk) < CHUNK:
                        break
    finally:
        await engine.dispose()
    print(f"[WEBINAR] reminder dispatch done — sent={sent}")
    return {"sent": sent}


# ---------------------------------------------------------------------------
# Reschedule / cancellation notifications (admin-triggered)
# ---------------------------------------------------------------------------


def _parse_iso(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


async def _audience_regs(db, webinar_id):
    return (
        await db.execute(
            select(WebinarRegistration).where(
                WebinarRegistration.webinar_id == webinar_id,
                WebinarRegistration.verified_at.is_not(None),
                WebinarRegistration.status.in_(
                    [WebinarRegistrationStatus.registered, WebinarRegistrationStatus.waitlisted]
                ),
            )
        )
    ).scalars().all()


@celery.task(name="tasks.notify_webinar_reschedule", bind=True, max_retries=2, default_retry_delay=120)
def notify_webinar_reschedule(self, webinar_id: str, old_start_iso: str, old_end_iso: str) -> dict:
    try:
        return asyncio.run(_notify_reschedule(webinar_id, old_start_iso))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _notify_reschedule(webinar_id: str, old_start_iso: str) -> dict:
    engine, Session = _session_factory()
    sent = 0
    try:
        async with Session() as db:
            w = await db.get(Webinar, webinar_id)
            if not w:
                return {"sent": 0}
            old_dt = _parse_iso(old_start_iso)
            old_str = wsvc.format_local(old_dt, w.timezone) if old_dt else "previously scheduled time"
            new_str = wsvc.format_local(w.start_at, w.timezone)
            detail_url = _detail_url(w)
            for r in await _audience_regs(db, w.id):
                subject, html, text = render_webinar_rescheduled_email(
                    r.full_name, w.title, old_str, new_str, detail_url, w.meeting_url
                )
                if await send_email(r.email, subject, html, text):
                    sent += 1
    finally:
        await engine.dispose()
    print(f"[WEBINAR] reschedule notify done — webinar={webinar_id} sent={sent}")
    return {"sent": sent}


@celery.task(name="tasks.notify_webinar_cancellation", bind=True, max_retries=2, default_retry_delay=120)
def notify_webinar_cancellation(self, webinar_id: str) -> dict:
    try:
        return asyncio.run(_notify_cancellation(webinar_id))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _notify_cancellation(webinar_id: str) -> dict:
    engine, Session = _session_factory()
    sent = 0
    try:
        async with Session() as db:
            w = await db.get(Webinar, webinar_id)
            if not w:
                return {"sent": 0}
            when_str = wsvc.format_local(w.start_at, w.timezone)
            for r in await _audience_regs(db, w.id):
                subject, html, text = render_webinar_cancelled_email(r.full_name, w.title, when_str)
                if await send_email(r.email, subject, html, text):
                    sent += 1
    finally:
        await engine.dispose()
    print(f"[WEBINAR] cancellation notify done — webinar={webinar_id} sent={sent}")
    return {"sent": sent}


# ---------------------------------------------------------------------------
# Admin email campaign (all / verified / waitlisted / selected)
# ---------------------------------------------------------------------------


@celery.task(name="tasks.send_webinar_campaign", bind=True, max_retries=2, default_retry_delay=120)
def send_webinar_campaign(self, campaign_id: str) -> dict:
    try:
        return asyncio.run(_send_campaign(campaign_id))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _send_campaign(campaign_id: str) -> dict:
    engine, Session = _session_factory()
    sent = 0
    try:
        async with Session() as db:
            campaign = await db.get(WebinarEmailCampaign, campaign_id)
            if not campaign:
                return {"sent": 0}
            campaign.status = WebinarEmailStatus.sending
            await db.commit()

            stmt = select(WebinarRegistration).where(WebinarRegistration.webinar_id == campaign.webinar_id)
            if campaign.audience == WebinarEmailAudience.verified:
                stmt = stmt.where(WebinarRegistration.verified_at.is_not(None))
            elif campaign.audience == WebinarEmailAudience.waitlisted:
                stmt = stmt.where(WebinarRegistration.status == WebinarRegistrationStatus.waitlisted)
            elif campaign.audience == WebinarEmailAudience.selected:
                ids = campaign.recipient_ids or []
                if not ids:
                    campaign.status = WebinarEmailStatus.sent
                    campaign.sent_count = 0
                    campaign.sent_at = datetime.now(timezone.utc)
                    await db.commit()
                    return {"sent": 0}
                stmt = stmt.where(WebinarRegistration.id.in_(ids))
            else:  # all — exclude cancelled
                stmt = stmt.where(WebinarRegistration.status != WebinarRegistrationStatus.cancelled)

            regs = (await db.execute(stmt)).scalars().all()
            subject, html, text = render_webinar_custom_email(campaign.subject, campaign.body)
            for r in regs:
                if await send_email(r.email, subject, html, text):
                    sent += 1

            campaign.sent_count = sent
            campaign.status = WebinarEmailStatus.sent
            campaign.sent_at = datetime.now(timezone.utc)
            await db.commit()
    finally:
        await engine.dispose()
    print(f"[WEBINAR] campaign sent — campaign={campaign_id} sent={sent}")
    return {"sent": sent}
