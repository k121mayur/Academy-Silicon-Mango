# CLAUDE.md

Guidance for Claude Code in this repo. Deep walkthroughs live in `README.md`, `DEPLOYMENT.md`, `VIDEO_PIPELINE.md`, `ops/DEPLOYER_GUIDE.md` — read on demand; don't restate them here.

## What this is

Silicon Mango Academy — a full-stack LMS + webinar platform, cost-optimized for ~50–70 concurrent users on a **single 2 vCPU / 6 GB box** behind Cloudflare (free CDN). Four actors (public, student, instructor, admin), each with their own portal; **role is enforced on both the frontend route guard and every backend endpoint.**

Stack: **FastAPI (async SQLAlchemy 2 + asyncpg) · PostgreSQL 16 · Redis 7 · Celery** backend; **React 18 + TS + Vite + Tailwind** frontend. **No automated tests** — verify manually (README §19) or via the `/verify` skill.

## Commands

- **Backend** (`backend/`): `alembic upgrade head` → `uvicorn app.main:app --reload` (:8085). New migration: `alembic revision --autogenerate -m "…"`. Local HLS playback: set `SERVE_SEGMENTS_FROM_APP=true`.
- **Frontend** (`frontend/`): `npm run dev` (:5174, proxies `/api`+`/uploads` → :8085) · `npm run build` (`tsc -b && vite build`) · `npm run lint`.
- **Celery** (`backend/`, one worker per queue + beat): `celery -A app.celery_app.celery worker -Q encoding` · `… -Q webinars` · `… beat`.
- **Docker**: `docker compose up -d --build` (local); add `-f docker-compose.prod.yml` for prod. **Ship to prod ONLY via `bash scripts/deploy.sh`** (backup→pull→rebuild→smoke-test). The `migrate` service runs migrations once and all apps wait on it.

## Architecture

**Backend (`backend/app/`)**
- `main.py` — `create_app()`. Every error → uniform envelope `{"success": false, "error": {"code","message","request_id"}}` (pool exhaustion → 503 `SERVER_BUSY`); `X-Request-ID` per request; `/docs` off in prod.
- `core/config.py` — single `settings` (Pydantic). `assert_safe_production_config()` refuses to boot prod on any weak-default secret — **add new secrets to its checks.**
- `api/v1/router.py` — routers grouped by audience (`auth`/`public*`, `admin/`, `instructor/`, `student/`); mirror this when adding endpoints.
- `dependencies/auth.py` — `get_current_user` reads JWT from an **httpOnly cookie** (no Authorization header); `require_role(*roles)`. Token `jti` checked vs a Redis blacklist; `iat` vs last password-change (so a password change kills all sessions).
- `models/` exported via `__init__.py` (keep `__all__` synced); `services/` hold business logic (endpoints stay thin); `tasks/` are Celery jobs.

**Two Celery queues, on purpose** — `encoding` and `webinars` run on separate workers so a multi-hour encode never delays a time-sensitive webinar reminder. Beat: nightly video optimize 00:00, reminder scan every 5 min. TZ `Asia/Kolkata` (`enable_utc=False`); `acks_late` so a crash re-runs the job.

**Video (see `VIDEO_PIPELINE.md`)** — FFmpeg → HLS. Encoder GPU-first via `VIDEO_ENCODER` (prod = AMD VAAPI, CPU fallback). Segment URLs are HMAC-signed with `SEGMENT_SIGNING_SECRET` — **must match the frontend nginx `SM_SEGMENT_SECRET`** — and time-bucketed so concurrent viewers share one CDN-cacheable URL. Prod nginx serves `/media` directly; the app serves it only when `SERVE_SEGMENTS_FROM_APP=true`.

**Frontend (`frontend/src/`)**
- `lib/api.ts` — the one axios instance, `withCredentials: true`. A 401 interceptor calls `/auth/refresh` once (concurrent 401s share one promise), retries, and on failure fires a global `auth:logout`. Read errors via `extractErrorCode`/`extractErrorMessage`.
- `services/` wrap `api`, one per domain — **components call services, not axios.** Server state = TanStack Query (keys in `lib/queryKeys.ts`); auth/session = Zustand. Routing = react-router with `router/ProtectedRoute.tsx`; `pages/` grouped by audience. `@/` = `src/`.
- Vite `manualChunks` splits heavy libs (recharts, tiptap, pdfjs, hls.js, qrcode) — keep big new deps out of the app shell. Prod build drops all `console.*`/`debugger`.
- **SEO/marketing in `index.html`**: GA4 gtag, meta/OG/Twitter, and JSON-LD live in `<head>`; a static crawlable splash (exactly **one `<h1>`** + copy + internal links) sits in `#root` and React replaces it on mount. `components/Analytics.tsx` sends a GA `page_view` on each route change. `robots.txt`/`sitemap.xml` are in `public/`. **Adding any new external script/connect host requires updating the CSP in BOTH `nginx.conf` and `nginx.prod.conf`** (prod `location /` inherits the server CSP via `expires`; local `location /` resets `add_header`).

## Conventions & gotchas

- **Cookie auth, not bearer tokens** — there is no Authorization-header flow; don't add one.
- **Uniform error envelope** `{success, error:{code,message}}` — preserve it in new handlers/services.
- **`razorpay` is pinned with `setuptools<81`** (the SDK does `import pkg_resources`); bumping past 81 breaks payments with "Payment library is not installed".
- **Razorpay secrets live only in env** (`RAZORPAY_{TEST,LIVE}_KEY_*`); the DB test/live toggle only selects which env key pair is active.
- **Docker volumes `sm_pgdata`/`sm_redisdata` are `external: true`** (fixed names, project pinned `silicon-mango`) so `down -v`/prune can't wipe them. Never change these on a live server. See `scripts/adopt-volumes.sh`.
- `docker-compose.yml` resource limits are tuned for the 2 vCPU / 6 GB box; summed memory ceilings exceed 6 GB on purpose (daytime traffic and the nightly encode peak are time-disjoint).
