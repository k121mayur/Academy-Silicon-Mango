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
    # Durability: a job stays on the queue until the worker finishes, so a worker
    # crash mid-encode re-runs it instead of losing it (pairs with Redis AOF).
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    # Backpressure / safety on a small box:
    #  - soft/hard time limits are a backstop for a truly stuck batch (each video
    #    already has its own ffmpeg timeout in ffmpeg_service.run_encode).
    #  - result_expires bounds Redis memory used by the result backend.
    #  - broker_pool_limit caps broker connections from the app/worker.
    task_soft_time_limit=4 * 60 * 60,
    task_time_limit=4 * 60 * 60 + 300,
    result_expires=24 * 60 * 60,
    broker_pool_limit=10,
    broker_connection_retry_on_startup=True,
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
