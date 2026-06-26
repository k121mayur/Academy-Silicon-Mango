from __future__ import annotations

import sys
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Known-weak values that ship as defaults in this repo (config.py / docker-compose.yml).
# If any of these are still active when ENVIRONMENT=production, the app refuses to start.
# This converts a silent, invisible security hole into a loud, obvious boot failure.
_WEAK_SECRET_KEY = "change-me-in-production-this-is-a-dev-key-only"
_WEAK_ADMIN_PASSWORD = "Admin@12345"
_WEAK_DB_PASSWORD = "sm_secure_pass_2024"
_WEAK_REDIS_PASSWORD = "sm_redis_pass_2024"
_WEAK_SEGMENT_SECRET = "dev_segment_secret_change_me"


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
    # Video encoder selection (GPU-first). See ffmpeg_service.select_encoder():
    #   auto  → prefer AMD/Intel VAAPI, then NVIDIA NVENC, else CPU (libx264)
    #   vaapi → FORCE AMD/Intel GPU (recommended in production so the GPU does the
    #           work; run_encode still falls back to CPU at runtime if it fails)
    #   nvenc → FORCE NVIDIA GPU (same runtime fallback)
    #   cpu   → force libx264 (CPU)
    VIDEO_ENCODER: str = "auto"
    # Deprecated: superseded by VIDEO_ENCODER. Kept so older .env files still parse;
    # no longer consulted for encoder selection.
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

    def production_secret_problems(self) -> list[str]:
        """Return a list of human-readable problems with the production secret
        configuration. Empty list == safe to boot. Only meaningful in production.

        We check the *effective* values (after .env overrides) against the
        known-weak defaults that ship in this repo, plus a basic length floor on
        the JWT signing key. This is the single safety net that makes a missing or
        incomplete server .env fail loudly instead of silently running on public
        credentials."""
        problems: list[str] = []

        if self.SECRET_KEY == _WEAK_SECRET_KEY:
            problems.append(
                "SECRET_KEY is still the public default. Set a strong random value "
                '(python -c "import secrets; print(secrets.token_hex(32))").'
            )
        elif len(self.SECRET_KEY) < 32:
            problems.append("SECRET_KEY is too short (need >= 32 chars).")

        if self.MASTER_ADMIN_PASSWORD == _WEAK_ADMIN_PASSWORD:
            problems.append("MASTER_ADMIN_PASSWORD is still the public default 'Admin@12345'.")

        # These appear inside the connection URLs; substring match is the reliable check.
        if _WEAK_DB_PASSWORD in self.DATABASE_URL:
            problems.append("DATABASE_URL still uses the public default DB password.")
        if _WEAK_REDIS_PASSWORD in self.REDIS_URL:
            problems.append("REDIS_URL still uses the public default Redis password.")

        if self.SEGMENT_SIGNING_SECRET == _WEAK_SEGMENT_SECRET:
            problems.append("SEGMENT_SIGNING_SECRET is still the public default.")
        elif not self.SEGMENT_SIGNING_SECRET:
            problems.append("SEGMENT_SIGNING_SECRET is empty — video segment URLs cannot be signed.")

        if not self.VIDEO_STREAM_SECRET:
            problems.append(
                "VIDEO_STREAM_SECRET is empty — video playback tokens cannot be signed, so every "
                "video would 500 at runtime. Set a strong random value."
            )

        return problems


def assert_safe_production_config() -> None:
    """Refuse to start the app in production when any known-weak default secret is
    still active. No-op outside production so local development stays friction-free.
    Called at the very top of the FastAPI lifespan, before any seeding."""
    if not settings.is_production:
        return
    problems = settings.production_secret_problems()
    if not problems:
        return
    print("=" * 70)
    print("[BOOT][FATAL] Refusing to start in production with insecure configuration:")
    for p in problems:
        print(f"  - {p}")
    print(
        "Fix these in the server .env (and rotate the Postgres password with "
        "ALTER USER, not just the env var), then redeploy."
    )
    print("=" * 70)
    sys.exit(1)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    print(f"[CONFIG] Loaded settings — env={s.ENVIRONMENT}, smtp={'on' if s.smtp_enabled else 'off (console)'}, google_oauth={'on' if s.google_oauth_enabled else 'off'}")
    return s


settings = get_settings()
