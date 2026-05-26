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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # Google OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"

    # SMTP Email
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    FROM_EMAIL: str = "Silicon Mango Academy <noreply@siliconmango.com>"

    # Razorpay
    RAZORPAY_KEY_ID: Optional[str] = None
    RAZORPAY_KEY_SECRET: Optional[str] = None

    # Storage
    UPLOAD_DIR: str = "./uploads"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

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


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    print(f"[CONFIG] Loaded settings — env={s.ENVIRONMENT}, smtp={'on' if s.smtp_enabled else 'off (console)'}, google_oauth={'on' if s.google_oauth_enabled else 'off'}")
    return s


settings = get_settings()
