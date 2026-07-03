from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.celery_app import celery
from app.core.config import settings
from app.models.batch import BatchEmailCampaign, BatchEmailStatus, Enrollment, EnrollmentStatus
from app.models.user import StudentProfile, User
from app.services.email_service import render_batch_bulk_email, send_email

# Small gap between messages so a large batch (e.g. Gmail's ~100/day app-password
# limit or provider rate limits) is not hammered in a tight loop.
SEND_INTERVAL_SECONDS = 1.0
# Commit progress every N sends so the list endpoint shows live progress and a
# Celery retry resumes from where it stopped instead of re-sending to everyone.
COMMIT_EVERY = 10


def _session_factory():
    engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_size=2, max_overflow=2)
    return engine, async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


@celery.task(name="tasks.send_batch_email_campaign", bind=True, max_retries=2, default_retry_delay=120)
def send_batch_email_campaign(self, campaign_id: str) -> dict:
    try:
        return asyncio.run(_send(campaign_id))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _send(campaign_id: str) -> dict:
    engine, Session = _session_factory()
    try:
        async with Session() as db:
            campaign = await db.get(BatchEmailCampaign, campaign_id)
            if not campaign:
                # Batch (and its campaign) was deleted while queued — nothing to do.
                return {"sent": 0}

            campaign.status = BatchEmailStatus.sending
            await db.commit()

            # Deterministic order so `sent_count` reliably marks the resume point.
            rows = (
                await db.execute(
                    select(User.email, StudentProfile.display_name)
                    .join(Enrollment, Enrollment.student_id == User.id)
                    .outerjoin(StudentProfile, StudentProfile.user_id == User.id)
                    .where(
                        Enrollment.batch_id == campaign.batch_id,
                        Enrollment.status == EnrollmentStatus.active,
                    )
                    .order_by(Enrollment.id)
                )
            ).all()

            subject, html, text = render_batch_bulk_email(campaign.subject, campaign.body)

            already = campaign.sent_count or 0
            try:
                for idx, (email, _display_name) in enumerate(rows):
                    if idx < already:
                        continue  # resume: skip messages a prior attempt already sent
                    if await send_email(email, subject, html, text):
                        campaign.sent_count += 1
                    if campaign.sent_count % COMMIT_EVERY == 0:
                        await db.commit()
                    await asyncio.sleep(SEND_INTERVAL_SECONDS)
            except Exception:
                # Persist partial progress + failed state before the retry re-raises.
                campaign.status = BatchEmailStatus.failed
                await db.commit()
                raise

            campaign.status = BatchEmailStatus.sent
            campaign.sent_at = datetime.now(timezone.utc)
            await db.commit()
            sent = campaign.sent_count
    finally:
        await engine.dispose()
    print(f"[BATCH] email campaign sent — campaign={campaign_id} sent={sent}")
    return {"sent": sent}
