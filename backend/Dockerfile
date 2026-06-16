FROM python:3.12-slim

WORKDIR /app

# Runtime + AMD GPU encode deps. BuildKit cache mounts keep apt's downloaded .deb
# files and package index across builds, so a warm rebuild re-downloads nothing
# and a changed build fetches only the diff. The apt cache lives in the mounts
# (NOT in an image layer), which is why we DON'T `rm -rf /var/lib/apt/lists` — the
# image stays small either way, and keeping the lists lets a later build skip
# `apt-get update`'s re-download. We also remove the base image's `docker-clean`
# hook (it deletes .debs right after install, which would make the cache mount a
# no-op) and tell apt to keep downloaded packages.
#
#   ffmpeg          — Debian's ffmpeg IS built with --enable-vaapi, so it drives
#                     the AMD Radeon GPU (h264_vaapi). Same libx264/libx265/aac
#                     codecs and identical HLS output as before for the CPU path.
#   libva2 +        — VAAPI runtime + Mesa "radeonsi" VAAPI driver. Without the
#   mesa-va-drivers   driver, ffmpeg sees /dev/dri but has nothing to talk to it
#                     with, so h264_vaapi fails and silently drops to CPU.
#   vainfo          — diagnostic: `vainfo` in the container proves the GPU is
#                     reachable and lists encode entrypoints (see DEPLOYER_GUIDE).
#   curl            — backend /health healthcheck.
#   procps          — pgrep, used by the worker/beat healthchecks.
#
# Deliberately NOT installed: gcc / libpq-dev. Every package in requirements.txt
# ships a prebuilt cp312 manylinux wheel (asyncpg, bcrypt, cryptography, Pillow,
# reportlab, pypdf), so nothing compiles from source, and we use asyncpg — never
# psycopg2 — so the libpq headers are dead weight. Dropping them removes the only
# reason apt previously pulled a compiler toolchain.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache && \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libva2 \
    mesa-va-drivers \
    vainfo \
    curl \
    procps

# pip with a BuildKit cache mount: downloaded wheels persist across builds, so
# even when requirements.txt changes only the diff is fetched. The cache lives in
# the mount (not the image layer), so the image stays just as small.
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads/course_banners \
    /app/uploads/syllabus_pdfs \
    /app/uploads/session_resources \
    /app/uploads/receipts \
    /app/uploads/certificate_templates \
    /app/uploads/certificates \
    /app/uploads/submissions \
    /app/media/originals \
    /app/media/videos

EXPOSE 8085

# Production: gunicorn manages N async uvicorn workers (no --reload, no file
# watcher). DB migrations run in the dedicated one-shot `migrate` compose
# service, NOT here, so multiple workers never race `alembic upgrade`.
# Worker count is tuned for 2 vCPU (override with GUNICORN_WORKERS).
CMD ["sh", "-c", "gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${GUNICORN_WORKERS:-3} --bind 0.0.0.0:8085 --timeout 120 --graceful-timeout 30 --max-requests 2000 --max-requests-jitter 200 --access-logfile - --error-logfile -"]
