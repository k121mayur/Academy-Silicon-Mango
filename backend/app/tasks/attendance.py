from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.celery_app import celery
from app.core.config import settings
from app.models.user import InstructorProfile, User
from app.services.attendance_service import find_ended_sessions_without_attendance
from app.services.email_service import render_attendance_reminder_email, send_email
from app.services.webinar_service import format_local

# How far back the scan looks for ended-but-unmarked sessions. Bounded so a
# fresh deploy never mails instructors about long-past sessions.
REMINDER_WINDOW_HOURS = 48


def _session_factory():
    engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_size=2, max_overflow=2)
    return engine, async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


@celery.task(name="tasks.dispatch_attendance_reminders", bind=True, max_retries=1, default_retry_delay=120)
def dispatch_attendance_reminders(self) -> dict:
    try:
        return asyncio.run(_dispatch_reminders())
    except Exception as exc:
        raise self.retry(exc=exc)


async def _dispatch_reminders() -> dict:
    engine, Session = _session_factory()
    sent = 0
    try:
        async with Session() as db:
            pending = await find_ended_sessions_without_attendance(
                db, within_hours=REMINDER_WINDOW_HOURS, only_unreminded=True
            )
            for sess, batch in pending:
                if batch.instructor_id is None:
                    continue
                instructor = await db.get(User, batch.instructor_id)
                if not instructor or not instructor.email:
                    continue
                prof = (
                    await db.execute(
                        select(InstructorProfile).where(InstructorProfile.user_id == instructor.id)
                    )
                ).scalar_one_or_none()
                name = (prof.display_name if prof else None) or instructor.email

                when_str = format_local(sess.scheduled_at, "Asia/Kolkata")
                url = (
                    f"{settings.FRONTEND_URL.rstrip('/')}/instructor/attendance"
                    f"?session={sess.id}&batch={batch.id}"
                )
                subject, html, text = render_attendance_reminder_email(
                    name, batch.name, sess.title, when_str, url
                )
                if await send_email(instructor.email, subject, html, text):
                    # One reminder per session, ever — durable across restarts.
                    sess.attendance_reminder_sent_at = datetime.now(timezone.utc)
                    await db.commit()
                    sent += 1
    finally:
        await engine.dispose()
    print(f"[ATTENDANCE] reminder dispatch done — sent={sent}")
    return {"sent": sent}
