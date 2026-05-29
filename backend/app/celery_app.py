from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery = Celery(
    "silicon_mango",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.encoding"],
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=False,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "tasks.optimize_pending_videos": {"queue": "encoding"},
    },
)

celery.conf.beat_schedule = {
    "nightly-optimize-videos": {
        "task": "tasks.optimize_pending_videos",
        "schedule": crontab(hour=0, minute=0),
    },
}
