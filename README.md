# 🥭 Silicon Mango Academy

A full‑stack **online learning and webinar platform** where an academy can publish courses, run live or self‑paced (recorded‑video) cohorts, host public webinars with email registration, take payments, track attendance and assignments, and issue verifiable certificates — built to run comfortably for **50–70 concurrent users on a single small (2 vCPU / 6 GB) server** behind a free CDN.

This document explains **everything**: what each feature does in plain language, the **step‑by‑step workflow for every actor** (public visitors, students, instructors, and admins), the **technical details** behind each feature, and **why** each technology and design decision was made.

---

## Table of contents

1. [What is Silicon Mango Academy?](#1-what-is-silicon-mango-academy)
2. [The roles at a glance](#2-the-roles-at-a-glance)
3. [Architecture overview](#3-architecture-overview)
4. [Technology stack](#4-technology-stack-and-why-each-was-chosen)
5. [Public visitor journey](#5-public-visitor-journey)
6. [Student journey](#6-student-journey--every-feature-step-by-step)
7. [Instructor journey](#7-instructor-journey--every-feature-step-by-step)
8. [Admin journey](#8-admin-journey--every-feature-step-by-step)
9. [Deep dive: Authentication & security](#9-deep-dive-authentication--security)
10. [Deep dive: The self‑paced video pipeline](#10-deep-dive-the-selfpaced-video-pipeline)
11. [Deep dive: Payments & receipts](#11-deep-dive-payments--receipts)
12. [Deep dive: Certificates](#12-deep-dive-certificates)
13. [Deep dive: Webinar Management Module](#13-deep-dive-webinar-management-module)
14. [Deep dive: Load handling & deployment](#14-deep-dive-load-handling--deployment-architecture)
15. [Data model overview](#15-data-model-overview)
16. [Project structure](#16-project-structure)
17. [Configuration (environment variables)](#17-configuration-environment-variables)
18. [Running the project](#18-running-the-project)
19. [Step‑by‑step manual testing workflows](#19-stepbystep-manual-testing-workflows)
20. [Useful commands & troubleshooting](#20-useful-commands--troubleshooting)

---

## 1. What is Silicon Mango Academy?

Silicon Mango Academy is software for running an online school. It has four sides:

- A **public website** where anyone can browse published courses, explore upcoming webinars, and register for webinars — no account required.
- A **student portal** where learners enroll (and pay), watch recorded lessons or join live classes, submit assignments, see their attendance and progress, and download certificates.
- An **admin + instructor back office** where the academy creates courses, schedules cohorts ("batches"), manages people, takes payments, grades work, issues certificates, and now **creates and manages webinars** with a full email communication system.
- A **webinar platform** backed by email verification, branded host entities, automatic reminder emails, rescheduling notifications, and a dedicated Celery worker — no third‑party webinar tool needed.

**In one sentence:** it is a Udemy/LMS‑style platform, security‑hardened, cost‑optimized to run on a tiny cloud VM, now extended with a full self‑hosted webinar system.

---

## 2. The roles at a glance

| Role | Who they are | What they can do |
|------|--------------|------------------|
| **Public visitor** | Anyone who opens a link | Browse published courses & webinars, register for webinars, verify email, receive webinar emails |
| **Student** | Learners who sign up | Browse courses, enroll & pay, watch videos / join live classes, submit assignments, view attendance & progress, download certificates |
| **Instructor** | Teachers created by an admin | See their assigned batches, manage sessions & resources, upload lesson videos, create & grade assignments, mark attendance, issue certificates |
| **Admin** | The academy operator(s) | Everything above + dashboards & revenue, course catalog, provision instructors/students, create batches, manage enrollments, configure & reconcile payments, set up & generate certificates, **full webinar management** |

Each role has its **own portal and navigation**, and the system **locks routes by role** on both the frontend (route guards) and the backend (every endpoint checks the caller's role).

---

## 3. Architecture overview

```
                   ┌──────────────── Cloudflare (free CDN + HTTPS) ────────────────┐
   Browser ─HTTPS─▶│  • Caches video segments (*.ts) → ~90% of video traffic      │
                   │    never hits the server                                       │
                   │  • Passes through everything else (pages, API, playlists)     │
                   └────────────────────────┬─── TLS + Cloudflare origin lock-down ┘
                                            │
   ┌────────────────────── Single Oracle Cloud VM (2 vCPU / 6 GB) ───────────────────┐
   │  nginx (in the frontend container)                                              │
   │    ├── /           → React SPA (static files)                                   │
   │    ├── /api/       → FastAPI backend                                             │
   │    ├── /media/     → video chunks (nginx sendfile, zero Python)                  │
   │    └── /uploads/   → images / PDFs / webinar flyers                              │
   │                                                                                  │
   │  FastAPI backend (gunicorn → 3 async uvicorn workers)                            │
   │    ├── PostgreSQL 16   (all relational data)                                      │
   │    └── Redis 7         (OTP/rate-limit/token blacklist/Celery broker)             │
   │                                                                                  │
   │  Celery worker           → encodes uploaded videos to HLS (nightly + on upload)  │
   │  Celery worker-webinars  → reminder emails / reschedule / cancel / campaigns     │
   │  Celery beat             → scheduler (midnight encode scan + 5-min reminders)     │
   └──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Technology stack (and why each was chosen)

### Backend

| Technology | What it is | Why we chose it |
|---|---|---|
| **FastAPI** (Python) | Web framework | Async by default, automatic validation, fast to develop |
| **SQLAlchemy 2 (async) + asyncpg** | ORM + driver | Async queries, parameterized SQL (prevents injection) |
| **PostgreSQL 16** | Main database | Rock-solid, free, supports JSONB columns |
| **Redis 7** | Fast in-memory store | OTP cache, rate limits, token blacklist, Celery broker |
| **Celery + Celery Beat** | Background jobs + scheduler | Video encoding + webinar reminder dispatch in dedicated queues |
| **FFmpeg** | Video encoder | Converts uploads to streaming-friendly HLS chunks |
| **gunicorn + uvicorn workers** | Production server | 3 workers across 2 CPUs; slow requests can't freeze everyone |
| **Alembic** | DB migrations | Versioned, repeatable schema upgrades |
| **httpx** | Async HTTP client | Used to call Cloudflare Turnstile siteverify API |

### Frontend

| Technology | What it is | Why we chose it |
|---|---|---|
| **React 18 + TypeScript** | UI framework | Component-based, TypeScript catches mistakes before users see them |
| **Vite** | Build tool / dev server | Near-instant startup, fast production builds |
| **TailwindCSS** | Utility-first styling | Consistent design tokens, no large CSS files |
| **TanStack Query (React Query)** | Server-data manager | Caches API responses, deduplicates requests, auto-refreshes |
| **Zustand** | Client state | Holds the logged-in user/session with almost no boilerplate |
| **axios** | HTTP client | Central API client with automatic token-refresh interceptor |
| **hls.js** | HLS video player | Adaptive stream playback in all browsers |
| **Recharts** | Charts | Admin revenue and webinar demographic graphs |
| **Tiptap** | Rich-text editor | Course descriptions / structured content |
| **react-hot-toast** | Toast notifications | Success/error messages |
| **Cloudflare Turnstile** | Bot-protection CAPTCHA | Registration form anti-abuse (gracefully disabled when no key set) |

### Infrastructure

| Technology | What it is | Why we chose it |
|---|---|---|
| **Docker + Docker Compose** | Containers + orchestration | One command spins up the whole stack; memory/CPU limits protect the small box |
| **nginx** | Reverse proxy + static server | Serves the app, proxies the API, streams video from disk without Python |
| **Cloudflare (free)** | CDN + HTTPS + DDoS shield | Caches video at the edge; ~90% of video bandwidth never touches the origin |

---

## 5. Public visitor journey

No login required for any of the following.

### 5.1 Browse published courses

**Flow:** Open the **Explore** page (`/explore`) → see all published course cards (banner, title, price, category, duration) → click a card to read the full description, syllabus, FAQs, and pricing.

**Technical:** `GET /api/v1/public/courses` — only published, non-draft courses appear.

---

### 5.2 Browse webinars (Upcoming / Live / Past)

**Flow:**
1. Click **Webinars** in the header navigation or visit `/webinars`.
2. Three tabs: **Upcoming**, **Live**, **Past**. Switch tabs to filter by computed status.
3. Each webinar card shows: flyer image, title, host name + logo, date & time (in the webinar's timezone), duration, Free / Paid badge, and registration state.
4. Use the **search box** to filter by title or category across the current tab.
5. Click a card → full webinar detail page (`/webinars/<slug>`).

**Technical:** `GET /api/v1/public/webinars?status=upcoming&search=…` — only published, non-cancelled webinars are returned. Status (upcoming/live/past) is computed server-side from the start/end times.

**Landing page widget:** the main landing page also shows the first three upcoming webinars in a "Upcoming Webinars" section that links to `/webinars`.

---

### 5.3 View a webinar detail page

**Flow:**
1. Open any webinar detail page (`/webinars/<slug>`).
2. See: hero banner/flyer, title/subtitle, status badge (Upcoming / Live / Past / Cancelled), Free/Paid badge, category.
3. **Main column:** full description, Host card (name, logo, description, website link), FAQ accordion.
4. **Sidebar:** when / duration / seats left, registration state badge, **Register now** button (or disabled if closed/ended), optional **Join the session** button (only shown when the admin chose to make the meeting link public), **Add to Google Calendar** button, **Download .ics** button.

**Technical:** `GET /api/v1/public/webinars/{id_or_slug}` — the `meeting_url` field is only returned when `meeting_link_public=true`. OG/meta tags are set via the in-page `MetaTags` component (`meta_title`, `meta_description`, `og_image_url`).

---

### 5.4 Register for a webinar

**Flow:**
1. On the webinar detail page, click **Register now** (or **Join waitlist** if `allow_waitlist=true` and seats are full) → navigate to `/webinars/<slug>/register`.
2. Fill in: Full name, Email address, Date of birth, Gender (Male/Female/Non-Binary/Prefer Not To Say), Profession (dropdown).
3. Complete the **Cloudflare Turnstile** CAPTCHA widget (only shown when `TURNSTILE_SITE_KEY` is configured; absent in dev).
4. Submit → server validates CAPTCHA, checks rate limits (10 registrations/IP/hour + 5/email/hour), checks registration window and capacity, checks for duplicate.
5. A **verification email** is sent to the address. The page shows an "Almost there — check your inbox" screen.

**Duplicate handling:** if the same email is already in `pending_verification` state, the server re-sends the verification link and returns a "resent" flag. If the email is already fully registered, the form shows "You're already registered" with a **Resend confirmation** button.

**Technical:** `POST /api/v1/public/webinars/{id}/register`. Rate limiting uses the existing `rate_limit_check()` Redis helper (sliding window). The registration is created with status `pending_verification`. IP address and User-Agent are captured automatically; UTM params and referral source can be passed in the payload.

---

### 5.5 Verify email and receive confirmation

**Flow:**
1. Open the verification link in the email → navigates to `/webinars/verify/<token>`.
2. Server looks up the token, sets `verified_at`, and assigns status `registered` (or `waitlisted` if the webinar filled up between registration and verification).
3. **Confirmation email** is sent immediately, containing: webinar title/date, host name, meeting link (always sent by email regardless of `meeting_link_public`), Google Calendar link, and an ICS file attachment.
4. The page shows either "Registration confirmed! We've emailed you the details" or "You're on the waitlist!".
5. A **View webinar** button links back to the detail page.

**Idempotent:** clicking the same link again still shows "confirmed" — the dispatch ledger (`webinar_reminder_dispatch`) prevents a second confirmation email from being sent.

**Technical:** `POST /api/v1/public/webinars/registrations/verify` with `{token}`. The confirmation dispatch is recorded in the `webinar_reminder_dispatch` table under `reminder_type=confirmation` — the unique constraint prevents double-sends even on concurrent clicks.

---

### 5.6 Resend verification email

**Flow:** If the verification email is lost, the user can request a resend from the register page (after a "duplicate" detection) or directly. Rate-limited to 4 attempts per email per 15 minutes.

**Technical:** `POST /api/v1/public/webinars/{id}/resend-verification` with `{email}`. Returns a uniform "if that email has a pending registration, we've re-sent the link" response to avoid leaking whether an email is registered.

---

### 5.7 Add to calendar / download ICS

From the webinar detail page sidebar:
- **Google Calendar** button opens a pre-filled Google Calendar `render` URL (title, start/end, description, location = meeting URL or detail page URL).
- **.ics button** downloads a standards-compliant VCALENDAR file (`text/calendar`). The ICS is also attached to the confirmation email automatically.

**Technical:** `GET /api/v1/public/webinars/{id}/calendar.ics` — hand-built RFC 5545 VCALENDAR string; no new library dependency. `google_calendar_url()` builds the Google Calendar web link.

---

## 6. Student journey — every feature, step by step

### 6.1 Sign up & log in
**Flow (email + OTP):**
1. Go to **Sign up**, enter email, click **Send code**.
2. Receive a **6-digit OTP** by email (valid ~5 minutes; in dev it's printed to the server log).
3. Enter the OTP, choose a password and display name.
4. Account created and logged in (secure cookies set).

**Flow (Google):** Click **Continue with Google** → approve on Google → account auto-created → logged in.

**Technical:** `POST /auth/signup/request` → `POST /auth/signup/verify`; Google via `GET /auth/google/authorize` → `GET /auth/google/callback`. See [§9](#9-deep-dive-authentication--security).

### 6.2 Complete your profile (required gate)
Before enrolling, students fill in basic details (name, phone, city, occupation, education, experience). Backend exposes `profile_complete`; the frontend redirects to `/portal/profile` until it's true.

### 6.3 Explore courses
Open **Explore** → see published courses → open a course to read description, syllabus, FAQs, duration and price.

**Technical:** `GET /api/v1/public/courses` — only published courses appear.

### 6.4 Enroll & pay
1. Choose a course → choose an available batch → click **Enroll now**.
2. If free (price − discount ≤ 0): enrolled immediately.
3. Otherwise: **Razorpay** checkout opens prefilled → pay → server verifies HMAC signature → enrollment created → PDF receipt generated + emailed.

**Technical:** `POST /student/payment/create-order` → Razorpay modal → `POST /student/payment/verify-signature`. Full detail in [§11](#11-deep-dive-payments--receipts).

### 6.5 Watch recorded lessons
Open a recorded batch → click a lesson → video plays in the secure player (email watermark overlay). Pending-optimization videos show a "not ready yet" message.

**Technical:** `GET /student/videos/{id}/playback-info` → HLS manifest → nginx serves signed chunks. Full detail in [§10](#10-deep-dive-the-selfpaced-video-pipeline).

### 6.6 Attend live classes
Open a batch → see session list with dates/times → join via the meeting link → instructor marks attendance.

### 6.7 Assignments
Open batch → **Assignments** → see due dates and types → submit (text/file/link/quiz) → see score + feedback after grading.

**Technical:** `GET /student/batches/{id}/assignments`, `POST /student/assignments/{id}/submit`.

### 6.8 Attendance & progress
Open batch → **Progress** → see overall % (average of sessions/assignments/attendance ratios) + breakdown.

### 6.9 Certificate
When a batch completes and admin generates certificates, receive a personalized PDF by email with a QR code for public verification.

### 6.10 Profile & account
Edit display name and avatar (cropped square), change password.

---

## 7. Instructor journey — every feature, step by step

> Instructors don't self-register — an **admin provisions** their account with a generated password emailed to them.

### 7.1 Dashboard
Stats: assigned batches, total students, total sessions, pending-grading count.

**Technical:** `GET /instructor/dashboard/stats`.

### 7.2 Batch & session management
See assigned cohorts, their auto-generated weekly/daily plan, and scheduled sessions. Edit plan titles/summaries.

### 7.3 Session resources
Attach PDFs, external links, or (for recorded batches) video lessons to sessions.

### 7.4 Upload a lesson video
Pick a file → real progress bar upload → server stores original privately → encode job enqueued → students see "Pending optimization" until FFmpeg finishes.

**Technical:** `POST /instructor/sessions/{id}/videos`. Full detail in [§10](#10-deep-dive-the-selfpaced-video-pipeline).

### 7.5 Create & grade assignments
Create: pick plan/session, type (quiz/text/file/pdf/link), due date, max points, late-submissions toggle.
Grade: open **Submissions** → enter score + feedback → status auto-set to `graded`.

### 7.6 Mark attendance (live sessions)
**Attendance** → pick batch → pick session → set Present/Absent/Late/Excused per student + optional notes → **Save all** (bulk upsert).

### 7.7 Issue certificates
Confirm batch is **completed** and a template exists → **Generate for batch** → each enrolled student gets a rendered PDF emailed. Individual **Resend** available.

---

## 8. Admin journey — every feature, step by step

### 8.1 Admin dashboard
Revenue (and month-over-month), active students, courses/batches/instructors counts, pending grading, 30-day revenue chart, recent transactions, upcoming sessions.

**Technical:** `GET /admin/dashboard/stats`, `/revenue-chart?days=30`, `/recent-transactions`, `/upcoming-sessions`.

### 8.2 Course management
Create/edit/publish/unpublish/delete courses; upload banner + syllabus PDF; assign instructors.

Courses start as draft; toggle **Publish** to make them public. Deletion refused if a batch uses the course.

**Technical:** `GET/POST/PUT/DELETE /admin/courses`, `PATCH /courses/{id}/publish`.

### 8.3 Instructor management
Create instructor accounts (no self-signup), edit profiles, deactivate, assign to courses.

Adding an instructor without a password auto-generates a strong one, returns it in the toast, and emails it.

**Technical:** `GET/POST/PATCH /users/instructors`.

### 8.4 Student management
List/search students; manually create student accounts (e.g. for offline-paid learners). Profiles and batch counts eagerly loaded.

**Technical:** `GET/POST /users/students`.

### 8.5 Batch management with auto session planning
1. **Create** → choose course, instructor (only those assigned to that course), dates, capacity.
2. Define schedule: **weekly** (e.g. Mon/Wed 7–9pm) or **date-based** (specific dates/times).
3. System auto-creates N plan rows (Week/Day 1…N) + N sessions (from the schedule).
4. In batch detail: edit plan titles, re-sync sessions, enroll/unenroll students, **Complete** the batch.

**Technical:** `POST /admin/batches` + planning service (`ensure_batch_plans`, `sync_inherited_sessions`).

### 8.6 Enrollment management
See all student–batch enrollments; manually enroll students (auto-creates a paid Payment row marked `ADMIN_ENROLL` so admin enrollments count toward revenue).

### 8.7 Payments & settings
**Payment Settings:** configure Razorpay Key ID/Secret + mode (test/live). Key ID shown masked.
**Payments:** filterable, paginated table (paid/pending/failed) for reconciliation against Razorpay.

### 8.8 Certificate setup & generation
Upload background (image or PDF) per course → place name/course/date/QR fields by pixel coordinates with live preview → save template. Then generate for a completed batch.

Full detail in [§12](#12-deep-dive-certificates).

---

### 8.9 Webinar Management (all features)

The Webinar Management Module is accessed via **Events → Webinars** in the admin sidebar (`/admin/webinars`). It is a **tabbed interface**: **Webinars** tab (list + CRUD) and **Hosts** tab (brand entities).

#### 8.9.1 Manage hosts/brands

**What it is:** every webinar is associated with a host (brand entity). A default **Silicon Mango** host is seeded automatically at migration. The admin can create additional hosts (e.g. "EcoBasket Foundation", a guest speaker's brand) and assign any of them to a webinar.

**Flow:**
1. Go to **Events → Webinars → Hosts** tab.
2. Each host card shows: logo, name, description, website, contact email, number of webinars linked.
3. Click **Add Host** → fill in name, optional logo, description, website URL, contact email → save.
4. Click **Edit** on any host → update fields, upload a new logo image.
5. Click **Delete** on a non-default host → all webinars linked to that host retain their data; their `organization_id` is set to NULL and the public page automatically falls back to the Silicon Mango default brand. The default host cannot be deleted.

**Technical:** `GET/POST/PUT/DELETE /admin/organizations`, `POST /admin/organizations/{id}/logo`. Logos stored in `uploads/org_logos/`.

#### 8.9.2 Create a webinar

**Flow:**
1. Click **Create Webinar** → `/admin/webinars/create`.
2. Fill in **seven sections**:
   - **Info:** title, subtitle, description (plain text), category, language.
   - **Schedule:** start date+time, end date+time, timezone (default Asia/Kolkata). Duration is derived automatically.
   - **Registration:** registration-open date, registration-close date, max participants, allow waitlist toggle.
   - **Pricing:** Free toggle; if paid — enter price + currency (INR default).
   - **Access:** provider type (Manual Link / Zoom / Google Meet / Webex / Teams), meeting URL, meeting-link-public toggle. Meeting URL is validated (must start with `http://` or `https://`).
   - **Email settings:** toggles for each automated email (confirmation, 7-day reminder, 1-day reminder, 1-hour reminder, start-time, follow-up).
   - **FAQs:** add/remove question + answer pairs.
   - **SEO:** meta title, meta description, OG image URL.
   - **Host:** select from existing hosts (defaults to Silicon Mango).
3. Submit → webinar created in **draft** (unpublished) state. A URL slug is auto-generated from the title.
4. Upload a **flyer** (shown on listing card + detail page hero) and/or **banner** (used as detail page hero if present) from the detail view.

**Technical:** `POST /admin/webinars`. Times sent as naive `datetime-local` strings; backend converts to UTC using `to_utc(dt, tz_name)` with `zoneinfo.ZoneInfo`. Slug is auto-slugified and made unique.

#### 8.9.3 Publish / unpublish

**Flow:**
1. Open a webinar detail page (`/admin/webinars/{id}`).
2. Click **Publish** → webinar becomes visible on the public listing and detail pages.
3. Click **Unpublish** → removed from public view immediately (registrations retained).

Cancelled webinars cannot be re-published.

**Technical:** `POST /admin/webinars/{id}/publish`, `POST /admin/webinars/{id}/unpublish`.

#### 8.9.4 Edit / reschedule a webinar

**Flow:**
1. Click **Edit** or use the **Reschedule** modal from the Overview tab.
2. Change any fields including start/end times → save.
3. **If the webinar is published, has at least one verified registrant, and the start/end times changed:** the server automatically enqueues a `notify_webinar_reschedule` Celery task. The `worker-webinars` container picks it up and emails every verified registered + waitlisted participant with old/new times.

**Technical:** `PUT /admin/webinars/{id}`. Reschedule detection compares `old_start`/`old_end` before and after the update. Task routed to the `webinars` Celery queue.

#### 8.9.5 Cancel a webinar

**Flow:**
1. Open webinar detail → click **Cancel webinar** → confirm in the modal.
2. Webinar is marked cancelled with a `cancelled_at` timestamp.
3. Server immediately enqueues `notify_webinar_cancellation` → all verified registered + waitlisted participants receive a cancellation email.
4. The public detail page shows "Cancelled" badge; registration is disabled.

**Technical:** `POST /admin/webinars/{id}/cancel`. Task `tasks.notify_webinar_cancellation` routed to `webinars` queue.

#### 8.9.6 Upload flyer / banner

From a webinar's detail page → **Upload Flyer** or **Upload Banner** buttons. Stored in `uploads/webinar_flyers/` and `uploads/webinar_banners/` respectively. If no banner, the flyer is used as the hero image; if neither, a gradient placeholder is shown.

**Technical:** `POST /admin/webinars/{id}/flyer`, `POST /admin/webinars/{id}/banner`.

#### 8.9.7 Manage registrations

**Flow:**
1. Open webinar detail → **Registrations** tab.
2. Table shows: name, email, gender, date of birth, profession, registration date, verification status, attendance status.
3. Filter by status (pending/registered/waitlisted) or search by name/email.
4. Per-row actions:
   - **Mark attendance:** set Present or Absent.
   - **Change status:** promote waitlisted to registered, etc.
   - **Resend email:** re-sends the verification link (if pending) or confirmation email (if verified).
   - **Delete:** removes the registration (cascades dispatch records).
5. **Export CSV** button → downloads a `.csv` file with all columns, streamed directly from the server.

**Technical:** `GET /admin/webinars/{id}/registrations`, `PATCH /admin/webinars/{id}/registrations/{rid}`, `DELETE /admin/webinars/{id}/registrations/{rid}`, `POST …/resend`, `GET …/export`.

#### 8.9.8 Manual attendance marking

**Flow:**
1. Go to **Attendance** tab.
2. See the same table of registrations, each row has Present/Absent toggle buttons.
3. Mark each person — changes save immediately per click.

This is the MVP manual method. Future: automatic Zoom/Webex/Teams attendance sync.

#### 8.9.9 Send email campaigns

**Flow:**
1. Go to **Emails** tab → **Compose** form.
2. Enter subject and body (HTML supported).
3. Choose audience: **All** (non-cancelled), **Verified** (verified email), **Waitlisted**, or **Selected** (pick specific registrants from the table).
4. Click **Send** → campaign is saved with status `queued` → immediately enqueued as a Celery task → status updates to `sending` → `sent` when done.
5. Campaign history table shows past sends with status, sent count, and timestamp.

**Technical:** `POST /admin/webinars/{id}/emails`, `GET /admin/webinars/{id}/emails`. Task `tasks.send_webinar_campaign` processes the audience filter, sends via SMTP, updates counts.

#### 8.9.10 Automatic reminder emails

The Celery Beat scheduler runs `dispatch_webinar_reminders` **every 5 minutes**. It checks all published, non-cancelled webinars whose start time falls within a 7-day lookahead window. For each webinar, it checks four reminder windows:

| Reminder | When it fires | Setting key |
|---|---|---|
| 7-day | start_at − 7 days (within 6h tolerance) | `reminder_7d` |
| 1-day | start_at − 1 day (within 6h tolerance) | `reminder_1d` |
| 1-hour | start_at − 1 hour (within 6h tolerance) | `reminder_1h` |
| Start | exactly at start_at (within 2h window) | `start` |

Each reminder is sent once per registration via the `webinar_reminder_dispatch` ledger. The unique constraint `(registration_id, reminder_type)` makes the task **idempotent** — a worker restart or duplicate beat tick never double-sends.

Admin can disable individual reminders per webinar via the email settings toggles on the creation/edit form.

#### 8.9.11 View reports

**Flow:**
1. Go to **Reports** tab.
2. See: totals (total registrations, verified, attended, pending), conversion rates (verification rate %, attendance rate %).
3. Demographics bar charts: by **gender**, by **profession**, by **age group** (bucketed from date of birth: <18, 18–24, 25–34, 35–44, 45–54, 55+).

**Technical:** `GET /admin/webinars/{id}/reports`. All computed in-flight from registrations; no denormalized counters to go out of sync.

---

## 9. Deep dive: Authentication & security

**How it works:**
- **Signup** is email + 6-digit **OTP** (hashed in DB, ~5-minute expiry, max attempts) or **Google OAuth** (CSRF `state` cookie).
- **Passwords** hashed with **bcrypt (12 rounds)**.
- Login issues a **15-minute access token** + **7-day refresh token** as `HttpOnly SameSite=Lax Secure` cookies.
- **Refresh rotation:** each refresh issues a new pair and blacklists the old `jti` in Redis — stolen refresh tokens can't be reused.
- **Logout** blacklists both tokens immediately.
- The frontend axios interceptor catches `401`, calls `/auth/refresh` once (shared across concurrent requests), retries.
- **Roles** (`student`/`instructor`/`admin`) encoded in the token; backend `Depends(require_*)` gates every endpoint; frontend `ProtectedRoute` guards every page.
- **Rate limiting:** OTP 5/email/15min + 15/IP/15min; logins 20/IP/15min; webinar registrations 10/IP/hour + 5/email/hour — Redis sliding window. True client IP from `CF-Connecting-IP`.
- **Cloudflare Turnstile:** protects the public webinar registration form from bots. Disabled automatically when `TURNSTILE_SITE_KEY` is not set (dev/local).
- A **master admin** is seeded on first boot from `MASTER_ADMIN_EMAIL`/`MASTER_ADMIN_PASSWORD`.

**Why this design:** HttpOnly cookies beat `localStorage` for token safety; OTP confirms email ownership; refresh rotation + blacklist gives short-session security with long-session comfort; Redis makes revocation and rate-limiting instant.

Key files: [`backend/app/api/v1/auth.py`](backend/app/api/v1/auth.py), [`app/core/security.py`](backend/app/core/security.py), [`app/core/redis.py`](backend/app/core/redis.py), [`app/services/captcha_service.py`](backend/app/services/captcha_service.py).

---

## 10. Deep dive: The self‑paced video pipeline

Three stages: **upload → optimize → secure streaming.**

### Stage 1 — Upload (instructor)
Streams to disk in 1 MB chunks (never loads into memory); saves `Video` row (`status=uploaded`); enqueues an encode job.

### Stage 2 — Optimize (Celery + FFmpeg)
Worker picks pending videos one at a time (`FOR UPDATE SKIP LOCKED` — no race). FFmpeg probes the source, encodes **single 720p HLS** (`libx264`, CRF 23, capped bitrate), 6-second `.ts` chunks. CPU-throttled (`-threads 1`), nice + ionice, 30-min timeout, nightly + on-upload. On success, original deleted; on failure, error stored → instructor sees Retry.

### Stage 3 — Secure streaming
1. `playback-info` checks enrollment (Redis-cached 60s) + revocation; returns manifest URL + watermark email.
2. **Playlist** = single security gate (re-checks login + enrollment on every request, never cached).
3. **Chunks** = user-agnostic, signed, expiring URLs snapped to 10-min buckets → all concurrent viewers get the same URL → Cloudflare caches one copy, serves everyone.
4. **nginx validates** chunks via `secure_link` — zero Python, zero database.

**Watermark & anti-download:** email overlaid via CSS `mix-blend-mode: difference`; right-click/download/PiP disabled; `no-store` on playlists.

**Revocation:** unenrolling sets a Redis key; playlist gate refuses new issuances; old signed URLs expire within the bucket window.

Full spec: [`VIDEO_PIPELINE.md`](VIDEO_PIPELINE.md). Key files: [`app/services/stream_token_service.py`](backend/app/services/stream_token_service.py), [`app/tasks/encoding.py`](backend/app/tasks/encoding.py).

---

## 11. Deep dive: Payments & receipts

1. **Create order:** server validates profile complete + batch open + not already enrolled + computes `price − discount` → calls Razorpay to create order.
2. **Checkout:** frontend loads Razorpay `checkout.js` prefilled.
3. **Verify:** server verifies **HMAC-SHA256 signature** with the secret key → atomically creates Enrollment + Payment. **Idempotent** — retried verify returns existing enrollment without double-charging.
4. **Receipt:** branded PDF generated (reportlab), stored, emailed — best-effort so a receipt hiccup never undoes a completed payment.

**Capacity rule:** hard-checked before payment; soft-overridden after payment succeeds (a paying customer is never rejected for the last seat filling mid-checkout).

Key files: [`app/api/v1/student/payments.py`](backend/app/api/v1/student/payments.py), [`app/services/payment_service.py`](backend/app/services/payment_service.py).

---

## 12. Deep dive: Certificates

- **Template:** upload image/PDF background; configure pixel coordinates + font/size/color for name, course, date, and QR code; live preview (same math as render).
- **Issue:** Generate for batch → PDFs rendered per enrolled student (pypdf/Pillow overlay) → QR code links to public verify page → emailed.
- **Verify (public):** `GET /api/v1/public/verify-certificate/{cert_id}` — opaque UUID, uniform response.

Key files: [`app/services/certificate_render_service.py`](backend/app/services/certificate_render_service.py), [`app/services/certificate_issue_service.py`](backend/app/services/certificate_issue_service.py).

---

## 13. Deep dive: Webinar Management Module

### Data model (five tables)

**`organizations`** — host/brand entities.
- `id` (UUID PK), `name`, `logo_url?`, `description?`, `website?`, `contact_email?`, `is_default` (bool — the seeded Silicon Mango brand).

**`webinars`** — one row per webinar.
- Identity: `id`, `slug` (unique, URL-safe), `title`, `subtitle?`, `description?`, `category?`, `language`.
- Host: `organization_id` → `organizations` (SET NULL on delete; public page falls back to default brand).
- Media: `flyer_url?`, `banner_url?`.
- Schedule: `start_at`, `end_at` (both UTC with timezone), `timezone` (default Asia/Kolkata).
- Registration: `registration_open_at?`, `registration_close_at?`, `max_participants?`, `allow_waitlist`.
- Pricing (schema-ready): `is_free`, `price` Numeric(10,2), `currency`.
- Provider: `provider_type` enum (`manual_link | zoom | google_meet | webex | teams`), `meeting_url?`, `meeting_link_public` (false = link only emailed to registrants; true = shown on public page).
- Content: `faqs` JSONB (list of `{question, answer}`), `email_settings` JSONB (per-reminder booleans).
- SEO: `meta_title?`, `meta_description?`, `og_image_url?`.
- Lifecycle: `is_published`, `is_cancelled`, `cancelled_at?`, `created_by`.

**`webinar_registrations`** — one row per email per webinar.
- `id`, `webinar_id` (CASCADE on delete), `full_name`, `email`, `date_of_birth`, `gender` enum, `profession`.
- `status` enum (`pending_verification | registered | waitlisted | cancelled`).
- `verification_token` (unique), `verified_at?`.
- `attendance_status` enum (`not_marked | present | absent`).
- Payment (schema-ready): `payment_status`, `amount?`, `currency?`, `transaction_id?`, `razorpay_order_id?`.
- Capture: `ip_address?`, `user_agent?`, `referral_source?`, `utm` JSONB?.
- **`UniqueConstraint("webinar_id", "email")`** — prevents duplicate registrations at the DB level.

**`webinar_email_campaigns`** — admin bulk send records (also serves as an audit trail).
- `id`, `webinar_id`, `subject`, `body` (HTML), `audience` enum, `recipient_ids` JSONB?, `status` enum, `sent_count`, `created_by`, `sent_at?`.

**`webinar_reminder_dispatch`** — idempotency ledger for automatic / scheduled emails.
- `id`, `webinar_id`, `registration_id`, `reminder_type` enum.
- **`UniqueConstraint("registration_id", "reminder_type")`** — each email type sent exactly once per registration regardless of retries.

### Migration

File: [`backend/alembic/versions/0004_webinars.py`](backend/alembic/versions/0004_webinars.py). Down revision: `0003_student_name_parts`. Creates 8 Postgres enums (idempotent DO-block pattern), 5 tables, and seeds the default Silicon Mango organization with deterministic UUID `a0000000-0000-4000-8000-000000000001`.

### Services

**`webinar_service.py`:**
- `to_utc(dt, tz_name)` — converts naive datetime-local strings to UTC using `zoneinfo.ZoneInfo`.
- `format_local(dt, tz_name)` — renders UTC back to local time string for emails.
- `compute_status(webinar, now)` → `"cancelled" | "live" | "past" | "upcoming"` (computed, not stored).
- `registration_state(webinar, taken, now)` → `{state, seats_left, max_participants}` where state is `open | not_open | closed | full | waitlist`.
- `get_default_org(db)` — fetches the `is_default=True` organization.
- `resolve_host_org(db, webinar)` — uses `organization_id` if set, else falls back to default org.
- `build_ics(webinar, detail_url)` — hand-built RFC 5545 VCALENDAR string.
- `google_calendar_url(webinar, detail_url)` — Google Calendar `render` URL.

**`captcha_service.py`:**
- `verify_turnstile(token, ip)` — calls `https://challenges.cloudflare.com/turnstile/v0/siteverify` via httpx.
- Returns `True` when `settings.turnstile_enabled` is False (no keys set = dev mode).
- Fails closed on network errors (treats verification as failed).

### Celery queues and tasks

Webinar mail runs on its own **`webinars`** Celery queue, separate from the `encoding` queue. This ensures a multi-hour video encode never delays a time-sensitive "1 hour before" reminder.

| Task | Trigger | What it does |
|---|---|---|
| `tasks.dispatch_webinar_reminders` | Celery Beat, every 5 min | Finds webinars in [now−2h, now+7d+1h] window, checks 4 reminder windows per webinar, sends unsent reminders to verified registrants |
| `tasks.notify_webinar_reschedule` | On admin reschedule | Emails all verified registered + waitlisted with old/new times |
| `tasks.notify_webinar_cancellation` | On admin cancel | Emails all verified registered + waitlisted |
| `tasks.send_webinar_campaign` | On admin email compose | Sends campaign to the chosen audience; updates status + sent_count |

Each task creates its own SQLAlchemy engine (no cross-loop contamination from Celery's fork model).

### Email templates

All templates live in `email_service.py` and return `(subject, html, text)`:

| Function | Sent when |
|---|---|
| `render_webinar_verification_email` | Registration submitted (inline, not Celery) |
| `render_webinar_confirmation_email` | Email verified (inline, with ICS attachment) |
| `render_webinar_reminder_email(when_label)` | Reminder dispatch (Celery) |
| `render_webinar_rescheduled_email` | Reschedule notify (Celery) |
| `render_webinar_cancelled_email` | Cancel notify (Celery) |
| `render_webinar_followup_email` | Follow-up reminder (Celery) |
| `render_webinar_custom_email(subject, body_html)` | Admin campaign (Celery) |

### Anti-abuse measures

1. **Email verification** — mandatory before seat is confirmed.
2. **Rate limiting** — 10 registrations/IP/hour + 5/email/hour + 4 resends/email/15min (Redis sliding window).
3. **Cloudflare Turnstile** — CAPTCHA widget on the public registration form; skipped gracefully when keys absent.
4. **Duplicate prevention** — `UniqueConstraint(webinar_id, email)` at the DB level; duplicate attempts return a clear message + resend option.
5. **Meeting link privacy** — `meeting_link_public=false` by default; the join URL is only emailed to verified registrants, never shown publicly unless the admin explicitly opts in.

---

## 14. Deep dive: Load handling & deployment architecture

**The problem:** one small Oracle VM (**2 vCPU / 6 GB**) must serve 50–70 concurrent users, many streaming 720p video — which is ~150–200 Mbps and thousands of req/min.

**How we made it fit:**
- Video served by nginx + cached by Cloudflare → ~90% of video bandwidth never touches the origin.
- gunicorn with 3 async workers across 2 CPUs.
- Right-sized DB pooling: each worker uses `5 + 5`; total ~34 connections, well under `max_connections=60`.
- Redis capped (`maxmemory=256mb`, `noeviction`) with AOF persistence — encode queue never silently dropped.
- Per-container memory/CPU limits + `restart: unless-stopped`; 4 GB swap safety net.
- `worker-webinars` is tiny (`mem_limit: 256m`, `cpus: 0.25`, `--concurrency=2`) and idle-cheap — disjoint timing from nightly encoding peak.
- Migrations run once in a dedicated one-shot container.

Full production runbook: [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 15. Data model overview

| Table | Purpose |
|---|---|
| `users` | One row per account: email, password hash, role, auth provider, active flag |
| `student_profiles` / `instructor_profiles` | Role-specific details (name, phone, city, education/experience JSON; bio, skills, avatar) |
| `otps` | Hashed signup OTP codes with expiry/attempts |
| `courses` | Course templates: title, slug, description, type, duration, price/discount, syllabus & FAQs (JSON), publish flag |
| `course_instructors` | Which instructors may teach which course (many-to-many) |
| `batches` | A running cohort: course, instructor, dates, capacity, delivery mode, status |
| `batch_plans` | Auto-generated curriculum units (Week/Day 1…N) |
| `batch_schedule_slots` | Weekly or date-based class times |
| `sessions` | Individual classes/lessons (live time or recorded slot), linked to a plan |
| `session_resources` | Materials on a session (PDF/link/video; video uses a `video://uuid` sentinel) |
| `videos` / `video_renditions` | Uploaded lesson video metadata + its 720p HLS output location/status |
| `enrollments` | Student ↔ batch (unique per pair); drives access & revocation |
| `payments` / `payment_settings` | Razorpay transactions + receipt URLs; gateway credentials/mode |
| `attendance_records` | Per-session attendance (status, source, notes, who/when marked) |
| `assignments` / `submissions` | Assignment definitions and student submissions (content/file, score, feedback, status) |
| `certificate_templates` / `certificates` | Per-course template + field layout; issued per-student PDFs + email status |
| **`organizations`** | **Webinar host/brand entities (name, logo, description, website, contact email, is_default)** |
| **`webinars`** | **Webinar templates (title, slug, schedule, registration settings, pricing, provider, FAQs, email settings, SEO)** |
| **`webinar_registrations`** | **One row per email per webinar (status, verification, attendance, payment, UTM capture)** |
| **`webinar_email_campaigns`** | **Admin bulk email sends (audience, subject, body, status, sent count)** |
| **`webinar_reminder_dispatch`** | **Idempotency ledger for automatic/scheduled emails (one row per registration per reminder type)** |

The schema is versioned with **Alembic** (`backend/alembic/versions/` — migrations 0001 through 0004_webinars).

---

## 16. Project structure

```
Academy-Silicon-Mango/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── auth.py                    # signup / login / oauth / refresh / logout
│   │   │   ├── public.py                  # public catalog + certificate verify
│   │   │   ├── public_webinars.py         # public webinar list/detail/register/verify/ics
│   │   │   ├── admin/
│   │   │   │   ├── dashboard.py
│   │   │   │   ├── courses.py
│   │   │   │   ├── batches.py
│   │   │   │   ├── users.py
│   │   │   │   ├── enrollments.py
│   │   │   │   ├── certificates.py
│   │   │   │   ├── payments.py
│   │   │   │   ├── organizations.py       # webinar host/brand CRUD
│   │   │   │   └── webinars.py            # webinar CRUD + registrations + emails + reports
│   │   │   ├── instructor/                # batches, sessions, videos, assignments, attendance
│   │   │   └── student/                   # profile, payments, videos, assignments
│   │   ├── core/                          # config, security, redis, oauth, exceptions, utils
│   │   ├── db/                            # async engine/session, base, seed
│   │   ├── dependencies/                  # auth dependencies (require_student/instructor/admin)
│   │   ├── models/
│   │   │   ├── ...                        # existing models
│   │   │   └── webinar.py                 # Organization, Webinar, WebinarRegistration, etc.
│   │   ├── schemas/
│   │   │   └── webinar.py                 # Pydantic schemas for webinar endpoints
│   │   ├── services/
│   │   │   ├── captcha_service.py         # Cloudflare Turnstile siteverify
│   │   │   ├── webinar_service.py         # compute_status, registration_state, build_ics, etc.
│   │   │   └── ...                        # existing services
│   │   ├── tasks/
│   │   │   ├── encoding.py                # video encoding tasks
│   │   │   └── webinars.py                # reminder dispatch, reschedule/cancel notify, campaign send
│   │   ├── celery_app.py                  # Celery + beat schedule (encoding queue + webinars queue)
│   │   └── main.py
│   ├── alembic/versions/
│   │   ├── 0001_initial.py
│   │   ├── 0002_...
│   │   ├── 0003_student_name_parts.py
│   │   └── 0004_webinars.py               # 5 webinar tables + 8 enums + Silicon Mango org seed
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx                # + upcoming webinars section
│   │   │   ├── WebinarListing.tsx         # /webinars — Upcoming/Live/Past + search
│   │   │   ├── WebinarDetail.tsx          # /webinars/:idOrSlug — full detail + sidebar
│   │   │   ├── WebinarRegister.tsx        # /webinars/:idOrSlug/register — registration form
│   │   │   ├── public/
│   │   │   │   └── VerifyWebinarRegistration.tsx  # /webinars/verify/:token
│   │   │   ├── admin/
│   │   │   │   ├── Webinars.tsx           # /admin/webinars — list + Hosts tab
│   │   │   │   ├── WebinarForm.tsx        # /admin/webinars/create + /edit
│   │   │   │   └── WebinarDetailAdmin.tsx # /admin/webinars/:id — Overview/Registrations/Emails/Attendance/Reports
│   │   │   └── ...                        # existing pages
│   │   ├── components/
│   │   │   ├── shared/
│   │   │   │   ├── MetaTags.tsx           # document.title + OG meta (no react-helmet)
│   │   │   │   └── Turnstile.tsx          # Cloudflare Turnstile widget (lazy-loaded)
│   │   │   ├── webinar/
│   │   │   │   └── WebinarCard.tsx        # card + skeleton for listing page
│   │   │   └── layout/
│   │   │       ├── AdminChrome.tsx        # + Events → Webinars nav entry
│   │   │       └── PublicLayout.tsx       # + Webinars nav link + footer link
│   │   ├── services/
│   │   │   ├── webinar.service.ts         # public API client + DTOs + formatters
│   │   │   └── webinar.admin.service.ts   # admin API client + DTOs (incl. CSV download)
│   │   └── lib/
│   │       └── queryKeys.ts               # + public.webinars / public.webinar keys
│   ├── nginx.conf                         # base front door (HTTP)
│   ├── nginx.prod.conf                    # production (TLS + Cloudflare lock-down)
│   └── Dockerfile                         # + ARG/ENV VITE_TURNSTILE_SITE_KEY
├── docker-compose.yml                     # + worker-webinars service + VITE_TURNSTILE_SITE_KEY build arg
├── docker-compose.prod.yml                # production overlay (TLS, public 80/443)
├── DEPLOYMENT.md                          # production runbook
├── VIDEO_PIPELINE.md                      # in-depth video pipeline spec
└── README.md                              # this file
```

---

## 17. Configuration (environment variables)

Three env files — copy from the `.env.example` templates; **never commit real secrets**.

### Root [`.env`](.env.example)
Used by docker-compose:

| Variable | Description |
|---|---|
| `DB_PASSWORD` | PostgreSQL password for `sm_user` |
| `REDIS_PASSWORD` | Redis password |
| `SEGMENT_SIGNING_SECRET` | Shared HMAC secret for video chunk signing (must match `backend/.env`) |
| `SERVER_NAME` | nginx `server_name` — `_` locally, your domain in production |
| `ORIGIN_SHARED_SECRET` | Cloudflare origin lock-down shared secret (production only) |
| **`TURNSTILE_SITE_KEY`** | **Cloudflare Turnstile public site key — baked into the SPA at Docker build time. Leave blank to disable the CAPTCHA widget.** |

### [`backend/.env`](backend/.env.example)
Used by FastAPI + workers:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async URL (overridden by docker-compose in container) |
| `REDIS_URL` | Redis URL (overridden by docker-compose in container) |
| `SECRET_KEY` | JWT signing key — generate 64 hex chars |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Default `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Default `7` |
| `GOOGLE_CLIENT_ID` / `SECRET` / `REDIRECT_URI` | Google OAuth (optional) |
| `SMTP_HOST/PORT/USER/PASSWORD` | SMTP credentials (optional — emails printed to log if absent) |
| `FROM_EMAIL` | Sender display name + address |
| `RAZORPAY_KEY_ID` / `KEY_SECRET` | Razorpay keys (optional) |
| **`TURNSTILE_SITE_KEY`** | **Cloudflare Turnstile public site key** |
| **`TURNSTILE_SECRET_KEY`** | **Cloudflare Turnstile secret key for server-side verification** |
| `UPLOAD_DIR` | File storage directory (default `./uploads`) |
| `FRONTEND_URL` | Used in email links (e.g. `http://localhost:5185`) |
| `MASTER_ADMIN_EMAIL` / `PASSWORD` | Seeded admin account |
| `VIDEO_STREAM_SECRET` | HMAC key for per-user video playlists |
| `SEGMENT_SIGNING_SECRET` | Must match root `.env` |
| `SEGMENT_URL_TTL_SECONDS` | Chunk URL validity |
| `FFMPEG_THREADS` | CPU cap for encoding |
| `ENCODE_TIMEOUT_SECONDS` | Hard timeout for FFmpeg |
| `ENVIRONMENT` | `development` (default) or `production` |

### [`frontend/.env`](frontend/.env.example)
Used by Vite at dev time:

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Leave empty for same-origin production; set to `http://localhost:8090` for local without Docker |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |

> `VITE_TURNSTILE_SITE_KEY` is **not** in `frontend/.env` — it is passed as a **Docker build arg** (`VITE_TURNSTILE_SITE_KEY: ${TURNSTILE_SITE_KEY:-}` in docker-compose.yml) and baked into the SPA at build time.

Setting `ENVIRONMENT=production` enables Secure cookies, strict CORS (only `FRONTEND_URL`), and disables `/docs`.

---

## 18. Running the project

### Local — one command (HTTP only)

```bash
# 1. Copy environment templates
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env   # keep VITE_API_BASE_URL empty

# 2. Start the full stack
docker compose up -d --build
```

- App: **http://localhost:5185**
- API (loopback only): http://localhost:8090
- OTP codes and emails are **printed to the backend logs** if SMTP isn't configured.
- CAPTCHA is **automatically disabled** if `TURNSTILE_SITE_KEY` is left blank in `.env`.

**Services started:**
| Container | Role |
|---|---|
| `sm_postgres` | PostgreSQL 16 |
| `sm_redis` | Redis 7 |
| `sm_migrate` (exits) | Runs `alembic upgrade head` once |
| `sm_backend` | FastAPI (gunicorn × 3 workers) |
| `sm_worker` | Celery worker — `encoding` queue (video encoding) |
| `sm_beat` | Celery Beat — fires nightly encode scan + 5-min webinar reminders |
| `sm_worker_webinars` | Celery worker — `webinars` queue (all webinar emails) |
| `sm_frontend` | nginx (SPA + reverse proxy + static file server) |

### Production (Oracle VM behind Cloudflare)

Follow [`DEPLOYMENT.md`](DEPLOYMENT.md), then:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Local development without Docker

Run PostgreSQL + Redis locally, then:
```bash
# Backend
cd backend
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install && npm run dev

# Celery workers (separate terminals)
celery -A app.celery_app.celery worker -Q encoding --loglevel=info
celery -A app.celery_app.celery worker -Q webinars --loglevel=info
celery -A app.celery_app.celery beat --loglevel=info
```

For local video playback set `SERVE_SEGMENTS_FROM_APP=true` in `backend/.env`.

---

## 19. Step‑by‑step manual testing workflows

This section documents how to manually test each major feature from scratch. Follow these flows to verify the application is working correctly after deployment.

### 19.1 Admin login

1. Open http://localhost:5185/admin/login (or your domain `/admin/login`).
2. Log in with `MASTER_ADMIN_EMAIL` + `MASTER_ADMIN_PASSWORD` from `backend/.env`.
3. You should land on the admin dashboard (`/admin`).

---

### 19.2 Webinar host management workflow

1. Admin sidebar → **Events → Webinars** → click **Hosts** tab.
2. The **Silicon Mango** default host should already be visible (seeded at migration).
3. Click **Add Host** → fill: name="Test Corp", description="A test org", website="https://test.com", contact email="test@test.com" → save.
4. The new host card appears with a **0 webinars** count.
5. Click **Edit** on Test Corp → change description → save. Confirm change.
6. Click **Upload Logo** (if available) → upload any small PNG. Confirm logo appears.
7. Click **Delete** on Test Corp → confirm. Host is removed; default Silicon Mango host remains.

---

### 19.3 Full webinar lifecycle (create → publish → register → verify → attend → report)

**Step 1 — Create**
1. Admin sidebar → **Events → Webinars** → **Create Webinar**.
2. Fill in:
   - Title: "Demo Webinar"
   - Description: "Testing the full flow"
   - Schedule: start = tomorrow at 6:00pm, end = tomorrow at 7:00pm, timezone = Asia/Kolkata
   - Max participants: 5, allow waitlist: yes
   - Meeting URL: `https://meet.google.com/test-meeting`, meeting link public: OFF
   - Email settings: all enabled
   - Add one FAQ: "When is it?" → "Tomorrow at 6pm!"
3. Save → you're on the draft webinar detail page.
4. Upload a flyer (any JPEG/PNG) → confirm flyer_url updates.

**Step 2 — Publish**
1. Click **Publish** → status changes to Upcoming.
2. Open a new incognito tab → go to http://localhost:5185/webinars → the webinar should appear in the Upcoming tab.
3. Click the card → detail page loads with title, host (Silicon Mango default), description, FAQ, and sidebar. Meeting link should NOT be visible (meeting_link_public=false).

**Step 3 — Register (public)**
1. On the detail page, click **Register now** → registration form at `/webinars/demo-webinar/register`.
2. Fill: name, email (use a real email or check logs), DOB, gender, profession.
3. Submit → "Almost there! Check your inbox" screen appears.
4. Check the backend logs: `docker compose logs backend | grep "Sending email"` — you should see the verification email logged.
5. Find the `verify_url` in the log. Navigate to it (format: `http://localhost:5185/webinars/verify/<token>`).

**Step 4 — Verify email**
1. Open the verification URL → page says "Registration confirmed!".
2. Check logs again — confirmation email with ICS attachment should be logged.

**Step 5 — Admin: check registration**
1. Back in admin → webinar detail → **Registrations** tab → one row appears (your email, status=registered, verified_at set).
2. Click the row's **attendance** → mark as **Present**.

**Step 6 — Duplicate registration test**
1. Go back to the registration form for the same webinar.
2. Enter the same email → submit → should show "You're already registered" with Resend button.
3. Click **Resend confirmation** → check logs for a re-sent email.

**Step 7 — Export CSV**
1. Admin → Registrations tab → **Export CSV** → a `.csv` file downloads with one data row.

**Step 8 — Reports**
1. Admin → **Reports** tab → should show: registrations=1, verified=1, attended=1, verification_rate=100%, attendance_rate=100%.
2. Demographics should show your gender, profession, and age bucket.

---

### 19.4 Reschedule and auto-email workflow

1. Open an existing published webinar with at least one verified registrant.
2. Click **Edit** (or use the RescheduleModal) → change the start time by +1 day → save.
3. Check logs: `docker compose logs worker-webinars` → should show `[WEBINAR] reschedule notify done — webinar=... sent=1`.
4. The backend log should show a reschedule email sent to the registrant.

---

### 19.5 Cancel and auto-email workflow

1. Open a published webinar with verified registrants.
2. Click **Cancel webinar** → confirm.
3. Check worker-webinars logs → `[WEBINAR] cancellation notify done — sent=N`.
4. Public detail page now shows "Cancelled" badge; Register button is disabled.

---

### 19.6 Reminder email dispatch workflow

1. Create a webinar with start time **exactly 10 minutes from now**.
2. Publish it. Register and verify at least one email.
3. Wait for the next 5-minute beat tick: `docker compose logs beat` → you'll see `dispatch-webinar-reminders` fire.
4. Check worker-webinars logs: `[WEBINAR] reminder dispatch done — sent=1` (the "start" window fires when the webinar is ≤2h in the past).
5. Re-run the task manually to test idempotency: `docker compose exec worker-webinars celery -A app.celery_app.celery call tasks.dispatch_webinar_reminders` → `sent=0` (already dispatched).

---

### 19.7 Email campaign workflow

1. Admin → webinar detail → **Emails** tab → **Compose**.
2. Subject: "Test Campaign", body: "Hello everyone!", audience: "Verified".
3. Click **Send** → campaign appears with status `queued` → quickly refreshes to `sent`.
4. Backend logs should show the email being sent.
5. Campaign history shows the record with `sent_count=1`.

---

### 19.8 Multi-brand / host fallback workflow

1. Create a second host "Guest Speaker".
2. Create a webinar → assign it to "Guest Speaker".
3. Publish → public detail page shows "Guest Speaker" as host.
4. Admin → Hosts → delete "Guest Speaker".
5. Refresh the public detail page → host now shows **Silicon Mango** (the default fallback).

---

### 19.9 Capacity and waitlist workflow

1. Create a webinar with max_participants=1, allow_waitlist=true.
2. Register **email A** → verify. Registration status: `registered`.
3. Register **email B** → verify. Registration status: `waitlisted` (seat was taken).
4. Admin → Registrations → confirm email B has status `waitlisted`.
5. Admin: delete email A's registration → seat freed. Email B's status remains `waitlisted` (manual promotion is the current workflow; automatic promotion is a future enhancement).

---

### 19.10 Calendar / ICS workflow

1. On any published webinar detail page, click **Google** calendar button → Google Calendar opens with the event pre-filled.
2. Click **.ics** → a `.ics` file downloads. Import it into any calendar app (Outlook, Apple Calendar, etc.) — event should appear with correct title, start/end times, and description.
3. Check the ICS file contains `BEGIN:VCALENDAR`, `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, and `URL`.

---

### 19.11 Cloudflare Turnstile CAPTCHA workflow

1. Set `TURNSTILE_SITE_KEY` in root `.env` and `TURNSTILE_SECRET_KEY` in `backend/.env` (use Cloudflare test keys: site key `1x00000000000000000000AA`, secret key `1x0000000000000000000000000000000AA`).
2. Rebuild: `docker compose up -d --build frontend`.
3. Open the registration form → Turnstile widget should appear.
4. Try submitting without completing it → error "Please complete the CAPTCHA."
5. Remove the keys → rebuild → widget disappears, form works without CAPTCHA.

---

### 19.12 Smoke test of existing features (regression check)

After deploying the webinar module, verify existing features still work:

1. **Course catalog:** `/explore` loads courses; click one to see the detail page.
2. **Student signup:** sign up with a new email → receive OTP → complete profile.
3. **Enrollment (free course):** enroll in a free batch → enrollment created.
4. **Admin course management:** create a new course → publish → appears in explore.
5. **Admin batch creation:** create a batch for the course → auto-schedule creates sessions.
6. **Video upload (if FFmpeg configured):** instructor uploads a video → encoding starts → status transitions to `ready`.
7. **Certificate verification:** verify an existing certificate URL if any exist.

---

## 20. Useful commands & troubleshooting

```bash
# Status of every service (health included)
docker compose ps

# Live readable logs
docker compose logs -f backend
docker compose logs -f worker-webinars   # webinar email tasks
docker compose logs -f beat              # scheduler / reminder ticks

# Find one request across logs by request-id
docker compose logs backend | grep <request-id>

# Health checks
curl http://localhost:8090/health            # liveness
curl http://localhost:8090/health/detail     # DB + Redis + pool usage

# Manually trigger webinar reminders (for testing)
docker compose exec worker-webinars celery -A app.celery_app.celery call tasks.dispatch_webinar_reminders

# Manually trigger video optimization
docker compose exec worker celery -A app.celery_app.celery call tasks.optimize_pending_videos

# Inspect webinar tables
docker compose exec postgres psql -U sm_user silicon_mango \
  -c "SELECT title, is_published, is_cancelled, start_at FROM webinars ORDER BY created_at DESC LIMIT 10;"

docker compose exec postgres psql -U sm_user silicon_mango \
  -c "SELECT email, status, verified_at FROM webinar_registrations LIMIT 20;"

docker compose exec postgres psql -U sm_user silicon_mango \
  -c "SELECT reminder_type, COUNT(*) FROM webinar_reminder_dispatch GROUP BY reminder_type;"

# Inspect video statuses
docker compose exec postgres psql -U sm_user silicon_mango \
  -c "SELECT original_filename, status, error_message FROM videos ORDER BY created_at DESC LIMIT 10;"

# Check current migration version
docker compose exec postgres psql -U sm_user silicon_mango \
  -c "SELECT version_num FROM alembic_version;"
# Should be: 0004_webinars

# Create a new DB migration after changing models
docker compose exec backend alembic revision --autogenerate -m "describe change"
docker compose exec backend alembic upgrade head

# Frontend type-check
cd frontend && npx tsc -b

# Frontend production build (local test)
cd frontend && npm run build
```

### Common issues and fixes

| Symptom | Cause | Fix |
|---|---|---|
| Webinar registrations not showing | worker-webinars not running | `docker compose up -d worker-webinars`; check `docker compose ps` |
| Emails not sending | SMTP not configured | Check backend logs — emails print to console when SMTP is absent |
| Turnstile widget not appearing | `TURNSTILE_SITE_KEY` not set or frontend not rebuilt | Set key in root `.env`, then `docker compose up -d --build frontend` |
| Registration form returns 400 CAPTCHA_FAILED | Keys set but token not being sent | Check that `TURNSTILE_ENABLED` is true in the SPA build (check browser console) |
| Video says "Pending optimization" forever | FFmpeg worker stuck | Check `worker` logs; try `docker compose restart worker` |
| Video won't play in production | `SEGMENT_SIGNING_SECRET` mismatch | Ensure the value is **identical** in root `.env` and `backend/.env` |
| Rate-limit blocks all users at once | Misconfigured client IP | Ensure `CF-Connecting-IP` is reaching the app; check nginx/Cloudflare config |
| Default Silicon Mango host missing | Migration 0004 didn't run | `docker compose up migrate` or run `alembic upgrade head` directly |
| `worker-webinars` not processing reminders | Beat not running or queue mis-routed | Check beat logs; confirm `dispatch-webinar-reminders` appears in the beat schedule |
| Uploads over 100 MB fail through Cloudflare | Cloudflare free plan 100 MB body cap | See DEPLOYMENT.md §8 for the upload workaround |
