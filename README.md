# Silicon Mango Academy

> Learn. Build. Get Certified.

A full-stack learning platform with **React 18 + Vite + TailwindCSS** on the frontend and **FastAPI + PostgreSQL + Redis + Alembic** on the backend.

This day delivers a working **public landing page**, a complete **authentication system** (Email + OTP + Google OAuth), and the **full Admin panel** for running an academy end-to-end — courses, instructors, batches, students, enrollments, payments, and certificates.

---

## Table of contents

1. [What was built today](#what-was-built-today)
2. [System architecture](#system-architecture)
3. [Auth system in detail](#auth-system-in-detail)
4. [Admin panel — feature by feature](#admin-panel--feature-by-feature)
5. [Backend foundations](#backend-foundations)
6. [Frontend foundations](#frontend-foundations)
7. [How to run the project (for reviewers)](#how-to-run-the-project-for-reviewers)
8. [Tech stack reference](#tech-stack-reference)
9. [Useful commands](#useful-commands)

---

## What was built today

A snapshot of every feature shipped, grouped by area:

| Area | What landed | Why it exists |
|---|---|---|
| **Project foundation** | Docker setup, env config, FastAPI app factory, SQLAlchemy async session, Alembic migrations, Redis client, JWT helpers, structured exceptions | The skeleton that every later feature plugs into. Without these, nothing runs. |
| **Database schema** | 19 tables modeled in SQLAlchemy: users, profiles (student / instructor), courses, course-instructors, batches, batch plans, schedule slots, enrollments, sessions, session resources, OTP records, payments, payment settings, certificates, certificate templates, assignments, submissions, attendance | A complete domain model so admin features have real data shapes to work with from day one, not stubs. |
| **Auth — Email + OTP** | `/auth/signup/request`, `/auth/signup/verify`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`. HttpOnly cookie sessions with rotating refresh tokens. | Lets students self-serve onboarding without an admin needing to provision them. |
| **Auth — Google OAuth** | `/auth/google/authorize`, `/auth/google/callback` with state-cookie CSRF protection | Frictionless signup. New Google accounts auto-create a student. |
| **Auth — security** | bcrypt password hashing, 6-digit OTP (5-min TTL, max 5 attempts), Redis-backed token blacklist (logout / refresh rotation), Redis sliding-window rate limits on login + OTP | Prevents brute force, replay of revoked tokens, and OTP spam. |
| **Public landing page** | Hero, features, courses preview, testimonials, footer | First impression for the marketing site. |
| **Auth UI** | Multi-step signup (email → OTP → password) with strength meter, resend cooldown, OTP input, Google button. Login page with Google. | The student-facing front door. |
| **Admin panel** | Dashboard, Courses, Catalogue, Course Form, Instructors, Assign Instructors, Batches, Batch Create, Batch Detail, Batch Ops, Students, Student Detail, Enrollments, Payments, Payment Settings, Certificates | The actual operational tool the academy team uses every day. Detailed below. |
| **Auto session planning** | Service that auto-generates plan rows (Week 1, Week 2…) and sessions from batch schedule slots when a batch is created | Instead of an admin manually creating 60 calendar entries per batch, they pick days/times once and the system fills in the calendar. |
| **File storage** | Local filesystem under `backend/uploads/`, served at `/uploads`. Used for course banners, syllabus PDFs, certificate templates. | Real file uploads work without an S3 dependency. Swappable later. |
| **Email service** | aiosmtplib + Gmail SMTP (port 465 implicit TLS or 587 STARTTLS, auto-detected). Welcome-instructor email and OTP email templates. **Falls back to console** when SMTP isn't configured. | Real emails when you want them, zero-friction dev when you don't. |
| **Boot-time seeding** | Master admin (`admin@siliconmango.com` / `Admin@12345`) is created on first boot if it doesn't exist | Lets a reviewer log in to the admin panel immediately. |
| **Error envelope** | Every error returns `{success: false, error: {code, message, details?}}` and CORS headers are attached even on 5xx responses | Consistent client error handling and no CORS-masked 500s in DevTools. |

---

## System architecture

```
Academy-Silicon-Mango/
├── backend/                      FastAPI app
│   ├── app/
│   │   ├── api/v1/               All API routes
│   │   │   ├── auth.py            Login/Signup/OTP/Google OAuth/Refresh/Logout
│   │   │   ├── public.py          Public landing data
│   │   │   ├── router.py          Wires everything under /api/v1
│   │   │   └── admin/             Admin endpoints (8 modules)
│   │   ├── core/                  Config, security, redis, oauth, exceptions, utils
│   │   ├── db/                    Engine, session factory, master-admin seeder
│   │   ├── dependencies/          get_current_user, role guards
│   │   ├── models/                SQLAlchemy models (19 tables)
│   │   ├── schemas/               Pydantic request/response schemas
│   │   ├── services/              auth_service, email_service, planning_service, storage_service
│   │   └── main.py                App factory + middleware + exception handlers
│   ├── alembic/versions/0001_initial.py   Idempotent enum-aware migration
│   ├── uploads/                   File storage (banners, syllabi, cert templates)
│   ├── .env                       Local secrets (gitignored)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                     React + Vite app
│   ├── src/
│   │   ├── components/ui/         Button, Input, Card, Modal, Table, Spinner, …
│   │   ├── components/shared/     OTPInput, FileUpload
│   │   ├── components/layout/     PublicLayout, AdminLayout, AdminChrome
│   │   ├── features/auth/stores/  Zustand auth store
│   │   ├── pages/                 Landing + auth + admin + portal placeholders
│   │   ├── services/              admin.service.ts, auth.service.ts
│   │   ├── lib/                   axios client, query client, error helpers
│   │   └── router/                ProtectedRoute, route constants
│   ├── .env                       VITE_API_BASE_URL
│   └── vite.config.ts             Proxies /api and /uploads to backend
└── docker-compose.yml            Postgres + Redis + Backend + Frontend
```

**Request flow.** Browser → Vite dev server (5174) → proxies `/api` to FastAPI (8085) → SQLAlchemy async engine → PostgreSQL. Redis sits beside FastAPI for token blacklist, OTP rate limits, and login rate limits. Static uploads are served directly by FastAPI under `/uploads`.

---

## Auth system in detail

The auth system has three flows and one set of session primitives shared across all of them.

### Session primitives (used by every flow)

- **Access token**: 15-min JWT, set as HttpOnly cookie `access_token`. Carries `sub` (user id), `role`, `email`, `jti`.
- **Refresh token**: 7-day JWT, set as HttpOnly cookie `refresh_token`. Carries `sub` and `jti` only.
- **Cookie flags**: `httponly`, `samesite=lax`, `secure` set automatically in production.
- **Refresh rotation**: every `/auth/refresh` blacklists the incoming refresh `jti` in Redis (TTL = remaining lifetime) and issues a brand new pair. Reuse of a stolen refresh token is detectable.
- **Logout**: blacklists both `access` and `refresh` `jti`s and clears cookies.

### Flow 1 — Email + OTP signup

1. **`POST /auth/signup/request`** with `{ email }`.
   - Rate-limited per email via Redis sliding-window (`rate_limit_check` in [redis.py](backend/app/core/redis.py)).
   - Generates a 6-digit OTP, hashes it with bcrypt, persists an `OTPRecord` (5-min expiry, attempts=0).
   - Sends the OTP email — or prints to the backend console when SMTP is not configured.
2. **`POST /auth/signup/verify`** with `{ email, otp, password, display_name }`.
   - Looks up the latest `OTPRecord` for the email + `signup` purpose.
   - Rejects expired records, rejects records with ≥5 prior failed attempts.
   - Verifies the OTP with bcrypt; increments `attempts` on a miss.
   - On success: creates a `User` (role=student, auth_provider=email) + `StudentProfile`, deletes all OTP records for the email, re-fetches with `selectinload` so relationships are eager-loaded, returns `AuthResponse` and sets session cookies.
3. **Frontend** at [Signup.tsx](frontend/src/pages/auth/Signup.tsx) walks through three steps: email → OTP (with countdown + 60s resend cooldown) → password (with strength meter + name).

### Flow 2 — Email + Password login

- **`POST /auth/login`** with `{ email, password }`.
- IP-based rate limit via Redis.
- `authenticate_user` checks password with bcrypt, rejects accounts on wrong provider (email account trying to log in for a Google-only user, or vice versa) with a clear error code.
- Issues access + refresh, sets cookies, returns the user.

### Flow 3 — Google OAuth

- **`GET /auth/google/authorize`** generates a CSRF state token, stores it in an HttpOnly `oauth_state` cookie, and redirects to Google.
- **`GET /auth/google/callback`** validates `state` matches the cookie, exchanges the code for a token, fetches userinfo, then either creates a new student (with avatar) or returns the existing one.
- Mismatched provider attempts surface as `?error=...` on the frontend `/login` page.

### Profile completion gate

The response from any successful auth call includes `profile_complete: bool`. The frontend uses this to redirect new users to `/portal/profile` instead of `/portal/dashboard` until they fill in name + phone + city.

---

## Admin panel — feature by feature

Every admin endpoint is guarded by `require_admin` and is grouped under `/api/v1/admin`. The frontend pages live in [src/pages/admin/](frontend/src/pages/admin/).

### 1. Dashboard — `/admin/dashboard`

Code: [backend/app/api/v1/admin/dashboard.py](backend/app/api/v1/admin/dashboard.py), [Dashboard.tsx](frontend/src/pages/admin/Dashboard.tsx)

- **`GET /dashboard/stats`** — single call returning every KPI on the home screen: total revenue (sum of paid payments), this-month revenue, month-over-month %, active students (distinct active enrollments), total courses, total batches, total instructors, total students.
- **`GET /dashboard/revenue-chart?days=30`** — daily revenue series for the chart, gap-filled (zero for days with no payments) so the chart never shows broken X-axis days.
- **`GET /dashboard/recent-transactions?limit=5`** — latest payments with student email + batch name pre-joined.
- **`GET /dashboard/upcoming-sessions?days=7`** — next 7 days of scheduled sessions across all batches, joined with batch name.

**Why it matters.** Gives the admin a single screen they can open in the morning to see "is the business healthy? what's happening today?".

### 2. Courses — `/admin/courses`

Code: [backend/app/api/v1/admin/courses.py](backend/app/api/v1/admin/courses.py), [Courses.tsx](frontend/src/pages/admin/Courses.tsx), [CourseForm.tsx](frontend/src/pages/admin/CourseForm.tsx)

The catalogue is the spine of everything else — batches, sessions, enrollments, certificates all hang off a course.

- **List** (`GET /courses`) — paginated, with full-text search on title + category, filter by `course_type` (live/recorded/hybrid) and `published` flag. Each row carries a `batches_count` so admins know which courses are actively running.
- **Create** (`POST /courses`) — generates a unique slug from the title (auto-suffixes `-2`, `-3` if a collision exists), validates enums, persists rich JSON fields (syllabus items, FAQs, certification criteria, tags). Always created as draft (`is_published=False`).
- **Get / Update** (`GET/PUT /courses/{id}`) — partial update. Title change auto-regenerates slug while keeping uniqueness.
- **Delete** (`DELETE /courses/{id}`) — guarded: refuses if any batch references the course (`HAS_BATCHES` error), so you can't orphan running cohorts.
- **Publish toggle** (`PATCH /courses/{id}/publish`) — single endpoint to flip published state, used as a pill on the course list.
- **Banner upload** (`POST /courses/{id}/banner`) — multipart upload, saved under `uploads/course_banners/`, URL written back on the course row.
- **Syllabus PDF upload** (`POST /courses/{id}/syllabus`) — same pattern under `uploads/syllabus_pdfs/`.
- **Course-instructor assignment** (`GET/POST/DELETE /courses/{id}/instructors`) — many-to-many. Used to gate which instructors can be picked when creating a batch for the course.

### 3. Instructors — `/admin/instructors`

Code: [backend/app/api/v1/admin/users.py](backend/app/api/v1/admin/users.py), [Instructors.tsx](frontend/src/pages/admin/Instructors.tsx), [AssignInstructors.tsx](frontend/src/pages/admin/AssignInstructors.tsx)

- **List** (`GET /users/instructors`) — paginated + email search, joined with `InstructorProfile` for display name, bio, skills, avatar.
- **Create** (`POST /users/instructors`) — admin provisions an instructor account directly. If no password is supplied, a 12-char random password (with a guaranteed digit, uppercase, and symbol suffix) is generated. The temporary password is **returned in the response** AND emailed via the welcome-instructor template, so even if email is broken in dev the admin can still hand it over.
- **Get / Update** (`GET/PATCH /users/instructors/{id}`) — admin can deactivate an account (`is_active=false`) or edit profile fields.
- **Course assignment UI** at `/admin/assign-instructors` — pick a course, search an instructor by email, click Assign. This drives the `CourseInstructor` rows that the batch creation form filters against.

### 4. Students — `/admin/students`

- **List** (`GET /users/students`) — paginated + email search. Each row includes `enrollments_count` (so admins can see who's an active learner vs a sign-up that never enrolled), `auth_provider`, and profile completion state.
- **Create** (`POST /users/students`) — admin can manually create a student account (e.g. for offline-paid students).
- **Get** (`GET /users/students/{id}`) — full profile including occupation, education history, experience JSON arrays.

### 5. Batches — `/admin/batches`

Code: [backend/app/api/v1/admin/batches.py](backend/app/api/v1/admin/batches.py), [Batches.tsx](frontend/src/pages/admin/Batches.tsx), [BatchCreate.tsx](frontend/src/pages/admin/BatchCreate.tsx), [BatchDetail.tsx](frontend/src/pages/admin/BatchDetail.tsx), [BatchOps.tsx](frontend/src/pages/admin/BatchOps.tsx)

A batch is one running cohort of a course — it has dates, an instructor, capacity, a delivery mode, and (for live batches) a weekly or date-based schedule.

- **List** (`GET /batches`) — filters by course, mode, status, name search. Each row is enriched with course title, instructor display name, and live `enrolled_count`.
- **Create** (`POST /batches`):
  - Verifies the chosen instructor is assigned to the course (otherwise → `BATCH_004`).
  - Auto-derives status: `upcoming` if start is in the future, `active` if today is in range, `completed` if end is past.
  - For `live` mode, persists schedule slots — either weekly (`weekday + start_time + end_time`) or date-based (`slot_date + start_time + end_time`).
  - **Auto-creates plans + sessions** via `sync_inherited_sessions` (see below).
- **Update** (`PUT /batches/{id}`) — refused if the batch is locked.
- **Assign instructor** (`POST /batches/{id}/assign-instructor`) — same course-membership check.
- **Plans** (`GET/PUT /batches/{id}/plans`) — admin can edit the auto-generated week/day titles and summaries.
- **Sync sessions** (`POST /batches/{id}/sync-sessions`) — wipes inherited sessions (preserves manually-added ones) and rebuilds from the current schedule. Useful when an admin changes a slot.
- **Enrollments inside a batch** (`GET /batches/{id}/enrollments`, `POST /batches/{id}/enroll`, `DELETE /batches/{id}/enrollments/{enrollment_id}`) — capacity is checked but admins can override (logged as a warning).
- **Complete** (`POST /batches/{id}/complete`) — sets status to `completed` and locks the batch so the dates / capacity can't be changed accidentally. This is a prerequisite for certificate generation.

### 6. Auto session planning — the magic behind batches

Code: [backend/app/services/planning_service.py](backend/app/services/planning_service.py)

When an admin creates a 4-week React course batch with classes Mon/Wed at 7-9pm, they shouldn't have to manually click 8 calendar entries. So this service does:

1. **`ensure_batch_plans`** — creates `BatchPlan` rows numbered 1..N where N = `course.duration_value`. Labels are `Week 1`, `Week 2`… or `Day 1`, `Day 2`… based on `course.duration_unit`.
2. **`sync_inherited_sessions`** — deletes any `Session` rows where `origin = inherited` (keeps manually-added ones), then re-creates them based on:
   - **Recorded courses** → one session per plan, scheduled at 10:00 UTC, one day apart from start.
   - **Live + weekly schedule** → for each plan (week), iterate every weekday slot, compute the actual date inside that week, create a session with the slot's start/end times.
   - **Live + date-based schedule** → one session per slot, mapped 1:1 to plans in date order.

   Every created session has `origin=inherited` so a re-sync won't duplicate it. Duration is computed from the slot's `end_time - start_time`, floored to a minimum of 30 minutes.

### 7. Enrollments — `/admin/enrollments`

Code: [backend/app/api/v1/admin/enrollments.py](backend/app/api/v1/admin/enrollments.py), [Enrollments.tsx](frontend/src/pages/admin/Enrollments.tsx)

- **List** (`GET /enrollments`) — paginated, joined with student email + name, batch name, course title.
- **Admin enroll** (`POST /enrollments`) — special path: in addition to creating the `Enrollment`, it auto-creates a paid `Payment` row marked `razorpay_order_id="ADMIN_ENROLL"` so admin-enrolled students count toward revenue and don't appear as "unpaid" in reports.

### 8. Payments — `/admin/payments`

Code: [backend/app/api/v1/admin/payments.py](backend/app/api/v1/admin/payments.py), [Payments.tsx](frontend/src/pages/admin/Payments.tsx), [PaymentSettings.tsx](frontend/src/pages/admin/PaymentSettings.tsx)

- **List payments** (`GET /payments`) — paginated, status filter, joined with student name + batch name + currency.
- **Get payment settings** (`GET /payment-settings`) — returns `mode` (test/live), `key_id_masked` (only first 8 + last 4 chars), `has_credentials`. Secret is **never returned**.
- **Update payment settings** (`PUT /payment-settings`) — admin sets Razorpay credentials. Stored in the `payment_settings` table (single row pattern).

### 9. Certificates — `/admin/certificates`

Code: [backend/app/api/v1/admin/certificates.py](backend/app/api/v1/admin/certificates.py), [Certificates.tsx](frontend/src/pages/admin/Certificates.tsx)

- **Templates** (`GET/POST /certificate-templates`) — admin uploads a per-course template (PDF/image) and a JSON `field_config` describing where the student's name and date go.
- **Bulk generate** (`POST /certificates/generate` with `{ batch_id }`) — only allowed once a batch is `completed`. Iterates every active enrollment and creates a `Certificate` row (idempotent — skips students who already have one). Email status starts as `pending`.
- **Resend** (`POST /certificates/{id}/resend`) — flips email status back to `pending` for the email worker to pick up.

### 10. Common admin chrome

Code: [AdminChrome.tsx](frontend/src/components/layout/AdminChrome.tsx), [AdminLayout.tsx](frontend/src/components/layout/AdminLayout.tsx)

- Sidebar navigation with active-route highlighting.
- Top bar with user avatar + logout.
- TanStack Query for all data fetching — automatic caching, background refetch, mutation invalidation.
- `react-hot-toast` for ephemeral feedback.
- Confirm modals for destructive actions.

---

## Backend foundations

### Config — [app/core/config.py](backend/app/core/config.py)

`pydantic-settings` reads `.env`, validates types, exposes `settings.DATABASE_URL`, `settings.SECRET_KEY`, etc. `cookie_secure` is auto-derived from `ENVIRONMENT == "production"` so dev cookies work over HTTP.

### Security — [app/core/security.py](backend/app/core/security.py)

Tiny module exposing `hash_password` / `verify_password` (bcrypt), `generate_otp` / `hash_otp` / `verify_otp`, `create_access_token` / `create_refresh_token` / `decode_token`, and the cookie helpers `set_auth_cookies` / `clear_auth_cookies`. JWT `jti` is a UUID4 so each token is uniquely identifiable for blacklisting.

### Redis — [app/core/redis.py](backend/app/core/redis.py)

Single async client shared across the process. Three responsibilities:

- **Token blacklist**: `blacklist:{kind}:{jti}` → expires with the token's TTL so stale entries auto-clean.
- **Sliding-window rate limits**: ZSET per key, scores = unix timestamps. `ZREMRANGEBYSCORE` drops old entries, `ZCARD` counts the live window. Used by login (per-IP) and OTP (per-email).
- **Connection lifecycle**: `get_redis()` lazy-initializes, `close_redis()` runs on FastAPI shutdown.

For development, both rate limits are set to **1000 attempts / 15 min** so they don't get in the way during testing.

### Exceptions — [app/core/exceptions.py](backend/app/core/exceptions.py)

`APIError(code, message, status_code=400, details=None)` is the canonical exception. Helper builders (`err_invalid_credentials`, `err_otp_expired`, `err_otp_max_attempts`, `err_email_exists`, etc.) return pre-built ones with stable error codes the frontend can branch on.

### Main app — [app/main.py](backend/app/main.py)

- CORS allows the configured frontend URL plus any `localhost`/`127.0.0.1` port via regex (so Vite on 5174 and standalone tools both work).
- Lifespan handler boots Redis, runs the master-admin seed, and prints structured `[BOOT]` logs.
- Static `/uploads` mount.
- Four exception handlers (APIError, StarletteHTTPException, RequestValidationError, generic Exception) all return the unified `{success, error}` envelope **with CORS headers attached** — critical so a 500 doesn't get masked as a CORS error in DevTools.
- The generic handler also detects Redis connection failures and returns `503 SERVICE_UNAVAILABLE` with a clear message instead of a raw 500.

### Migrations — [alembic/versions/0001_initial.py](backend/alembic/versions/0001_initial.py)

Single "initial" migration that's idempotent at the DB level. Each enum is created via raw SQL `DO $ ... IF NOT EXISTS ... CREATE TYPE ... $` blocks, and column-level enum references are declared with `create_type=False` so SQLAlchemy doesn't try to create them again. This means the migration is safe to re-run on a partially-migrated database (a real problem we hit and fixed today).

[alembic/env.py](backend/alembic/env.py) escapes `%` → `%%` when injecting the URL into Alembic's ConfigParser, so passwords with `%`-encoded special characters (like `Postgress%400123` for `Postgress@0123`) work in both Alembic and pydantic-settings.

---

## Frontend foundations

### State + data

- **Zustand** for the auth store at [features/auth/stores/authStore.ts](frontend/src/features/auth/stores/authStore.ts) — `user`, `setUser`, `clear`. Used for guards and chrome.
- **TanStack Query** for all server state — every admin page is a `useQuery` + `useMutation` pair. Mutations call `queryClient.invalidateQueries` on success so the list refreshes automatically.
- **axios** with `withCredentials: true` so HttpOnly cookies travel on every request.

### Routing

- React Router 6 with route constants in [router/routes.ts](frontend/src/router/routes.ts).
- [ProtectedRoute](frontend/src/router/ProtectedRoute.tsx) checks the auth store and an optional `roles` prop. Calls `/auth/me` on first mount to hydrate the store from cookies.
- App shell at [App.tsx](frontend/src/App.tsx) declares public, student, instructor, and admin routes.

### UI primitives

`Button`, `Input`, `Card`, `Modal`, `ConfirmModal`, `Table`, `Spinner`, `Avatar`, `Badge`, `EmptyState`, `Select`, `OTPInput`, `FileUpload` — all in [components/ui/](frontend/src/components/ui/). Each accepts standard props and uses Tailwind classes resolved against the design system's tokens (primary, surface-container, ink-variant, etc.).

### Vite proxy

[vite.config.ts](frontend/vite.config.ts) proxies `/api` and `/uploads` to `http://localhost:8085`, so the frontend and backend appear to share an origin in dev — no CORS adventures during normal development.

---

## How to run the project (for reviewers)

You have two options. **Option A is the smoothest** if Docker is installed.

### Prerequisites

- Either: Docker Desktop installed and running.
- Or: Python 3.12+, Node.js 20+, PostgreSQL 16, Redis 7.

### Option A — Docker (one command)

From the repo root:

```bash
docker compose up --build
```

This single command:
1. Spins up PostgreSQL on `5432`
2. Spins up Redis on `6379`
3. Builds the backend, runs `alembic upgrade head`, starts FastAPI on `http://localhost:8085`
4. Builds the frontend (Vite production build), serves it via Nginx on `http://localhost:5174`
5. Seeds the master admin

Wait for `[BOOT] Startup complete — accepting requests` in the logs.

**Open in your browser:**
- Frontend: **http://localhost:5174**
- API docs (Swagger): **http://localhost:8085/docs**
- Health: **http://localhost:8085/health**

**Master admin login:**
- Email: `admin@siliconmango.com`
- Password: `Admin@12345`

To stop: `docker compose down`. To reset everything (wipes DB): `docker compose down -v`.

### Option B — Local development

#### B.1 Create the database

In `psql` or pgAdmin's Query Tool:

```sql
CREATE USER sm_siddhesh WITH PASSWORD 'Postgress@0123';
CREATE DATABASE silicon_mango OWNER sm_siddhesh;
GRANT ALL PRIVILEGES ON DATABASE silicon_mango TO sm_siddhesh;
```

(If you use different credentials, update `DATABASE_URL` in `backend/.env`. **URL-encode `@` in the password as `%40`** — so `Postgress@0123` becomes `Postgress%400123` in the URL.)

#### B.2 Start Redis

If you don't already have Redis running with the password set in `.env`:

```bash
docker run -d --name sm_redis -p 6379:6379 redis:7-alpine \
  redis-server --requirepass sm_redis_pass_2024
```

Or install Redis natively and `redis-server --requirepass sm_redis_pass_2024`.

#### B.3 Backend

```bash
cd backend

# Create virtual env
python -m venv .venv

# Activate (Windows PowerShell)
.\.venv\Scripts\Activate.ps1
# or macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Apply migrations
alembic upgrade head

# Start the API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8085
```

You should see:

```
[BOOT] Silicon Mango Academy — Backend starting up
[REDIS] Connected successfully
[BOOT] Startup complete — accepting requests
```

#### B.4 Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5174**.

### Reviewer test plan

Once running, walk through these to exercise everything that was built:

1. **Sign in as admin** → land on `/admin/dashboard` → confirm KPIs load and the revenue chart renders.
2. **Admin → Courses → Create Course** → fill title / description / duration (e.g. 4 weeks) / price → save.
3. **Admin → Instructors → Add Instructor** → create one. Note the **temporary password** in the response toast (also logged in the backend console for the welcome email).
4. **Admin → Assign Instructors** → assign that instructor to the course you created.
5. **Admin → Batches → Create Batch** → pick the course, instructor, dates, and a couple of weekly time slots. After save, open the batch detail and confirm sessions were auto-generated.
6. **Sign out → Sign up as a student** at `/signup`:
   - Enter email → click Send OTP.
   - **Find the OTP**: if SMTP isn't configured, the OTP is printed in the backend terminal in a `[EMAIL][CONSOLE FALLBACK]` block. If SMTP is configured (it is in this build), it's emailed.
   - Enter the OTP → set password + name → land on the student portal.
7. **Sign back in as admin → Enrollments → Enroll Student** → pick the student you just created, pick the batch.
8. **Admin → Payments** → see the `ADMIN_ENROLL` payment row from step 7.
9. **Admin → Batches → Complete batch** (only after end date is in the past, or override via SQL for review) **→ Certificates → Generate** → see certificates created.

### Where the OTP shows up in dev

Look in the backend terminal for:

```
============================================================
[EMAIL][CONSOLE FALLBACK] To: you@example.com
[EMAIL][CONSOLE FALLBACK] Subject: Your Silicon Mango Academy verification code
Your verification code is: 482917
============================================================
```

Or, with the included Gmail SMTP credentials in `.env`, it lands in the inbox.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `ConnectionRefusedError` on backend boot | Postgres or Redis isn't running. Verify both are up and credentials match `.env`. |
| `auth_provider_enum already exists` on `alembic upgrade head` | This was fixed today — the migration is idempotent. If you still see it, you have a stale migration; run `docker compose down -v` and retry. |
| `/auth/login` returns 500 with CORS error in DevTools | Almost always a DB password / DB URL issue. Check the backend terminal for `InvalidPasswordError`. Make sure `@` is `%40`-encoded in `DATABASE_URL`. |
| OTP says "expired" | Codes are 5 minutes — use the latest one printed/sent. |
| Login redirects back to `/login` immediately | Cookie domain mismatch. Make sure you're hitting the frontend at `localhost:5174`, not `127.0.0.1:5174`. |
| Port already in use | Another process owns the port. Stop it, or edit `docker-compose.yml`. |

---

## Tech stack reference

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, TailwindCSS, TanStack Query, Zustand, React Router 6, Recharts, react-hot-toast, axios |
| Backend | FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic 2, asyncpg, aiosmtplib, httpx, passlib[bcrypt], python-jose |
| Database | PostgreSQL 16 |
| Cache / Rate limit / Blacklist | Redis 7 |
| Auth | JWT (HttpOnly cookies, 15-min access, 7-day rolling refresh), bcrypt, Google OAuth 2 |
| Storage | Local filesystem at `backend/uploads/` (mounted at `/uploads`) |
| Container | Docker + docker-compose |

---

## Useful commands

```bash
# Docker — start everything
docker compose up --build

# Docker — start in background
docker compose up -d --build

# Docker — view backend logs
docker compose logs -f backend

# Docker — clean reset (wipes DB)
docker compose down -v

# Backend — generate a new migration after model changes
cd backend
alembic revision --autogenerate -m "describe_change"

# Backend — apply migrations
alembic upgrade head

# Backend — rollback one migration
alembic downgrade -1

# Frontend — type check
cd frontend && npx tsc --noEmit

# Frontend — production build
cd frontend && npm run build
```

---

## Console logging cheat sheet

The codebase logs heavily — both ends. Look for these prefixes when debugging:

**Backend:**
- `[BOOT]` startup events
- `[REDIS]` connection / rate-limit / blacklist
- `[AUTH]` login / signup / OTP events
- `[ADMIN]` admin actions (course/batch/enrollment/payment events)
- `[EMAIL]` emails sent or fallen-back-to-console
- `[OAUTH]` Google OAuth flow
- `[PLANNING]` auto-session generation
- `[STORAGE]` file uploads
- `[VALIDATION]` Pydantic errors
- `[ERROR]` unhandled exceptions

**Frontend (browser DevTools):**
- `[BOOT]`, `[API]`, `[AUTH]`, `[GUARD]`, `[LOGIN]`, `[SIGNUP]`, `[DASH]`, `[LANDING]`
