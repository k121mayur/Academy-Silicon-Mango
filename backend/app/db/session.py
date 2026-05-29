from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# Pool is sized for a SMALL box: each gunicorn worker gets its own engine, so
# total Postgres connections = workers × (pool_size + max_overflow) + the Celery
# worker's own 2+2 pool. With 3 gunicorn workers that's 3×10 + 4 = 34, kept
# safely under Postgres `max_connections=60` (see docker-compose.yml).
# pool_recycle avoids handing out connections the server has already dropped.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    pool_recycle=1800,
    pool_timeout=30,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
