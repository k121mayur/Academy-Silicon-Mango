from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://sm_user:sm_secure_pass_2024@localhost:5432/silicon_mango"

    # Redis
    REDIS_URL: str = "redis://:sm_redis_pass_2024@localhost:6379/0"

    # JWT
    SECRET_KEY: str = "change-me-in-production-this-is-a-dev-key-only"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 h in dev; override via .env in production
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # Google OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8085/api/v1/auth/google/callback"

    # SMTP Email
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    FROM_EMAIL: str = "Silicon Mango Academy <noreply@siliconmango.com>"

    # Razorpay — secrets live HERE (env) only, never in the DB or the browser.
    # Two independent key pairs:
    #   TEST → Razorpay test mode (fake money, test cards/UPI; safe to experiment)
    #   LIVE → real money, settled to your bank by Razorpay
    # The admin "mode" toggle (stored in the DB) only chooses which pair is
    # ACTIVE; switching modes never reads or moves these secrets.
    RAZORPAY_TEST_KEY_ID: Optional[str] = None
    RAZORPAY_TEST_KEY_SECRET: Optional[str] = None
    RAZORPAY_LIVE_KEY_ID: Optional[str] = None
    RAZORPAY_LIVE_KEY_SECRET: Optional[str] = None
    # Deprecated single-pair vars — still honoured as a TEST-mode fallback so
    # older .env files keep working. Prefer the explicit *_TEST_* pair above.
    RAZORPAY_KEY_ID: Optional[str] = None
    RAZORPAY_KEY_SECRET: Optional[str] = None

    # Cloudflare Turnstile (CAPTCHA) — used on the public webinar registration form.
    # When unset, CAPTCHA verification is skipped so local/dev works without keys.
    TURNSTILE_SITE_KEY: Optional[str] = None
    TURNSTILE_SECRET_KEY: Optional[str] = None

    # Storage
    UPLOAD_DIR: str = "./uploads"
    MEDIA_DIR: str = "/app/media"

    # Upload size caps (per file)
    MAX_VIDEO_MB: int = 500
    MIN_VIDEO_MB: int = 10   # reject trivially small/likely-broken video uploads
    MAX_DOC_MB: int = 2

    # Video streaming
    VIDEO_STREAM_SECRET: str = ""
    STREAM_TOKEN_TTL_SECONDS: int = 120
    SEGMENT_TOKEN_TTL_SECONDS: int = 30
    HLS_SEGMENT_SECONDS: int = 6
    ENABLE_GPU: bool = False

    # CDN-cacheable segment URLs (nginx secure_link, time-bucketed).
    # SEGMENT_SIGNING_SECRET MUST match the frontend nginx container's
    # SM_SEGMENT_SECRET. Segment URL expiry is snapped to a fixed bucket so all
    # concurrent viewers share one cacheable URL; the leak/revocation residual
    # is at most one bucket length.
    SEGMENT_SIGNING_SECRET: str = ""
    # Expiry is snapped to a fixed bucket and given a 2-bucket horizon, so a
    # signed URL is valid for 1–2 buckets (10–20 min here). All concurrent
    # viewers in the same bucket compute the SAME url → one cacheable object.
    # The 2-bucket horizon means playback never hits a near-expired URL, so it
    # stays smooth; worst-case leak/revocation residual is ~2 buckets.
    SEGMENT_URL_BUCKET_SECONDS: int = 600    # 10-min buckets
    SEGMENT_URL_TTL_SECONDS: int = 1200      # informational: max validity (2 buckets)
    # When true, FastAPI also serves .ts segments itself (local dev / fallback).
    # In production segments are served by nginx, so leave this off.
    SERVE_SEGMENTS_FROM_APP: bool = False

    # FFmpeg / encoding resource controls (small-box safety)
    FFMPEG_THREADS: int = 1                   # keep one core free for the API
    ENCODE_TIMEOUT_SECONDS: int = 1800        # 30 min hard cap per video

    # Celery
    CELERY_BROKER_URL: str = "redis://:sm_redis_pass_2024@localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://:sm_redis_pass_2024@localhost:6379/2"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    # Certificate
    CERTIFICATE_NAME_MAX_CHARS: int = 40

    # Master Admin
    MASTER_ADMIN_EMAIL: str = "admin@siliconmango.com"
    MASTER_ADMIN_PASSWORD: str = "Admin@12345"

    # Environment
    ENVIRONMENT: str = "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def cookie_secure(self) -> bool:
        # In dev, cookies must NOT be Secure (HTTP localhost). In prod, they must be.
        return self.is_production

    @property
    def google_oauth_enabled(self) -> bool:
        return bool(self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET)

    @property
    def smtp_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD)

    @property
    def turnstile_enabled(self) -> bool:
        return bool(self.TURNSTILE_SITE_KEY and self.TURNSTILE_SECRET_KEY)

    def razorpay_keys(self, mode: str) -> tuple[Optional[str], Optional[str]]:
        """(key_id, key_secret) for the given mode ('test' | 'live'), from env.
        Test mode falls back to the legacy RAZORPAY_KEY_ID/SECRET pair."""
        if mode == "live":
            return self.RAZORPAY_LIVE_KEY_ID, self.RAZORPAY_LIVE_KEY_SECRET
        return (
            self.RAZORPAY_TEST_KEY_ID or self.RAZORPAY_KEY_ID,
            self.RAZORPAY_TEST_KEY_SECRET or self.RAZORPAY_KEY_SECRET,
        )

    def razorpay_configured(self, mode: str) -> bool:
        """True if BOTH keys for the given mode are present in the env."""
        kid, ksec = self.razorpay_keys(mode)
        return bool(kid and ksec)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    print(f"[CONFIG] Loaded settings — env={s.ENVIRONMENT}, smtp={'on' if s.smtp_enabled else 'off (console)'}, google_oauth={'on' if s.google_oauth_enabled else 'off'}")
    return s


settings = get_settings()
