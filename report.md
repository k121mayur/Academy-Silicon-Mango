# Silicon Mango Academy — Production Readiness Audit

**Date:** 2026-05-29
**Scope:** Full stack — FastAPI backend, React/Vite frontend, Postgres, Redis, Celery video pipeline, Docker Compose deployment.
**Method:** Manual code review of every core path (auth, payments, enrollment, video streaming/encoding, infra) plus three focused deep-dive sweeps (frontend, API authorization, database layer).

> **Bottom line:** The architecture is thoughtful and several hard parts are done well (HLS token signing, refresh-token rotation + blacklist, enrollment authorization, `Numeric` money types, path-traversal guards). But it is **not production-ready as configured.** There is one **show-stopping deployment bug**, one **major missing feature** (no real payment flow), a class of **financial/audit data-loss risks**, **disabled rate limits**, **default admin credentials**, an **unauthenticated file store**, and a **single-process server with no load balancing** — directly against your "large crowd / limited resources" requirement.

---

## Severity legend
- **🔴 Critical** — data loss, money, security breach, or total outage. Fix before any real users.
- **🟠 High** — exploitable or breaks under load / breaks a core flow.
- **🟡 Medium** — real risk, bounded by role or low probability.
- **🟢 Low** — hygiene, defense-in-depth, polish.

---

# 1. Top priorities (fix before launch)

| # | Severity | Issue | Where |
|---|----------|-------|-------|
| 1 | 🔴 | nginx caps uploads at 25 MB but backend allows 500 MB videos → **every video upload >25 MB fails** in the Docker deployment | [frontend/nginx.conf:7](frontend/nginx.conf#L7) |
| 2 | 🔴 | Production server runs `uvicorn --reload`, **single process, no workers, no load balancer** | [backend/Dockerfile:30](backend/Dockerfile#L30), [docker-compose.yml](docker-compose.yml) |
| 3 | 🔴 | `Payment` rows **CASCADE-delete** when a batch or user is deleted → financial/audit records vanish | [backend/app/models/payment.py:29-32](backend/app/models/payment.py#L29-L32) |
| 4 | 🔴 | **Default master-admin credentials** (`admin@siliconmango.com` / `Admin@12345`) seeded on every boot | [backend/app/core/config.py:72-73](backend/app/core/config.py#L72-L73) |
| 5 | 🔴 | `/uploads/*` is served **with no authentication** — student submissions, receipts, certificates all publicly fetchable | [backend/app/main.py:87](backend/app/main.py#L87), [frontend/nginx.conf:19-21](frontend/nginx.conf#L19-L21) |
| 6 | 🟠 | Rate limits effectively **disabled** (1000 requests / 15 min) — login brute force + OTP email bombing | [backend/app/core/redis.py:86-93](backend/app/core/redis.py#L86-L93) |
| 7 | 🟠 | HLS **segment tokens (30 s TTL) baked into a VOD playlist** → playback breaks / hard-rebuffers every ~30 s | [backend/app/services/stream_token_service.py](backend/app/services/stream_token_service.py), [student/videos.py:130-139](backend/app/api/v1/student/videos.py#L130-L139) |
| 8 | 🟠 | **No real payment flow exists** — Razorpay is configured but there is no checkout/order/verify endpoint; students cannot self-enroll or pay | (absent) |
| 9 | 🟠 | ffmpeg subprocess has **no timeout** → one bad video hangs the single encoder worker forever | [backend/app/services/ffmpeg_service.py:198](backend/app/services/ffmpeg_service.py#L198) |
| 10 | 🟠 | Reverse-proxy IP handling is wrong → rate limits keyed on the proxy IP (one shared bucket) and stream-token IP binding is **spoofable** | [auth.py:83](backend/app/api/v1/auth.py#L83), [student/videos.py:27-31](backend/app/api/v1/student/videos.py#L27-L31) |

---

# 2. Deployment & load balancing (your explicit concern)

You said hosting is resource-limited and the crowd may be large. As configured, **the deployment cannot scale and has a hard upload bug.**

### 2.1 🔴 Single-process dev server in "production"
[backend/Dockerfile:30](backend/Dockerfile#L30)
```
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8085 --reload"]
```
- `--reload` is a **development-only** file-watcher: it spawns a reloader, watches the filesystem, and is explicitly unsupported for production. Combined with the `./backend/app:/app/app` bind-mount in [docker-compose.yml:62](docker-compose.yml#L62), you're running prod off live-mounted source with auto-reload.
- **One process, one core.** No `--workers`, no Gunicorn. A "large crowd" will serialize behind a single event loop. CPU-bound work (password hashing at bcrypt rounds=12, JSON, TLS) blocks everything.
- **No load balancer / no horizontal scaling.** Compose runs exactly one `backend` container; nginx `proxy_pass`es to a single upstream.

**Fix:** Run Gunicorn with uvicorn workers, sized to cores, no reload, no source mount:
```dockerfile
CMD ["sh","-c","alembic upgrade head && gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${WEB_CONCURRENCY:-3} -b 0.0.0.0:8085 --timeout 120 --graceful-timeout 30"]
```
For real load balancing, run N backend replicas behind nginx `upstream { server ...; }` (or `deploy.replicas`), and **make the DB pool size consistent with worker count** (see 6.5). Add `gunicorn` to `requirements.txt` (currently only `uvicorn[standard]` is present).

### 2.2 🔴 nginx body-size cap blocks video uploads
[frontend/nginx.conf:7](frontend/nginx.conf#L7) sets `client_max_body_size 25m`, but [config.py:51](backend/app/core/config.py#L51) sets `MAX_VIDEO_MB = 500`. Any video between 25 MB and 500 MB is rejected by nginx with `413` **before reaching the backend**. The whole self-paced video feature silently fails for any realistic lecture recording.
**Fix:** Raise `client_max_body_size` on the `/api/instructor/.../videos` location to match `MAX_VIDEO_MB` (e.g. `550m`), and keep the small cap elsewhere. Better: stream uploads or move large media to object storage with presigned PUTs so they don't transit the API at all.

### 2.3 🟠 No TLS anywhere, but cookies require it in prod
`cookie_secure` is `True` in production ([config.py:82-85](backend/app/core/config.py#L82-L85)), so auth cookies are marked `Secure` — yet nothing in the compose terminates TLS. Deployed as-is over plain HTTP, **browsers will refuse to send the auth cookies and nobody can stay logged in** (or you run insecure plaintext). You need a TLS terminator (nginx with certs / Caddy / a cloud LB) in front.

### 2.4 🟠 Single points of failure & resource sizing
- One Postgres, one Redis, one Celery worker (`--concurrency=1`), one beat. Acceptable for a small deployment, but document it: there is **no redundancy**. If the worker dies, no videos encode.
- The bind-mount `./backend/app:/app/app` ships your source into prod and defeats image immutability. Remove for production images.

### 2.5 🟢 CORS is dev-shaped
[main.py:66-83](backend/app/main.py#L66-L83) hard-codes `localhost:5173/5174/3000` and an `allow_origin_regex` for any localhost port, with `allow_credentials=True` and `expose_headers=["*"]`. The wildcard `expose_headers` with credentials is invalid per the CORS spec (browsers ignore it), and shipping localhost origins to prod is sloppy. Drive origins from config and drop the localhost regex in production.

### 2.6 🟢 `/docs` and `/redoc` exposed unconditionally
[main.py:62-63](backend/app/main.py#L62-L63). Gate behind `if not settings.is_production` or auth.

---

# 3. Authentication & sessions

### 3.1 🔴 Default admin credentials, seeded every boot
[config.py:72-73](backend/app/core/config.py#L72-L73) ship real, usable defaults; [db/seed.py](backend/app/db/seed.py) recreates the admin if missing. If `.env` omits these (or someone forgets to change them), the site launches with `admin@siliconmango.com` / `Admin@12345`. **Fix:** refuse to boot in production if the admin password equals the default; remove the literal defaults and require env injection.

### 3.2 🟠 Rate limiting is off
[redis.py:86-93](backend/app/core/redis.py#L86-L93): login = 1000/15min/IP, OTP = 1000/15min/email. Both are commented "tighten before production" — and weren't. Consequences:
- **Password brute force** is wide open (and bcrypt verification is CPU-heavy → also a DoS amplifier on your single worker).
- **OTP / email bombing**: 1000 OTP emails to any address in 15 min.
**Fix:** login ~5–10/15min, OTP ~3–5/15min/email **and** a per-IP cap, before launch.

### 3.3 🟠 Proxy-aware IP handling is wrong (two different bugs)
- Login rate limit uses `request.client.host` ([auth.py:83](backend/app/api/v1/auth.py#L83)). Behind nginx that's the **nginx container IP** → every user shares one bucket. Once you tighten limits (3.2), a few bad actors lock out everyone, or the limit is meaningless.
- Stream tokens use `request.headers["x-forwarded-for"].split(",")[0]` ([student/videos.py:27-31](backend/app/api/v1/student/videos.py#L27-L31)). The **client controls the first XFF value** (nginx appends, doesn't replace), so the IP binding on stream tokens is trivially spoofable — defeating its anti-sharing purpose. It also breaks legitimate mobile users who switch Wi-Fi↔cellular mid-video.
**Fix:** Add Starlette `ProxyHeadersMiddleware` (or uvicorn `--proxy-headers --forwarded-allow-ips`) with a trusted-proxy allowlist, then use `request.client.host` everywhere. Reconsider IP-binding stream tokens at all (bind to user+video+short TTL instead).

### 3.4 🟡 Password change does not revoke existing sessions
[auth.py:194-223](backend/app/api/v1/auth.py#L194-L223) updates the hash but never blacklists the caller's current access/refresh JTIs or re-issues cookies. A stolen/leaked session survives a password change — the one moment a user changes a password is usually *because* they fear compromise. **Fix:** on success, blacklist current tokens and set fresh cookies.

### 3.5 🟡 User enumeration on signup
[auth_service.py:90-92](backend/app/services/auth_service.py#L90-L92) raises `err_email_exists()` during `signup/request`, and login distinguishes "google account" vs "bad password" ([auth_service.py:66-71](backend/app/services/auth_service.py#L66-L71)). Both let an attacker enumerate which emails / which providers are registered. **Fix:** return a generic "if this email is valid, you'll get a code" for signup; keep login errors uniform.

### 3.6 🟢 Console logging of PII
Backend `print(...)` of emails/roles throughout auth, and the frontend logs `[LOGIN] OK <user object>`, `[AUTH] /me OK <email>` to the browser console unconditionally (authStore, Login, auth.service, ProtectedRoute). Strip/gate behind `DEV` before launch.

**Done well (no action):** refresh-token rotation with blacklist + TTL ([auth.py:149-160](backend/app/api/v1/auth.py#L149-L160)), OAuth `state` CSRF check ([auth.py:278-279](backend/app/api/v1/auth.py#L278-L279)), httpOnly/SameSite cookies, bcrypt rounds=12, OTP hashed + attempt-capped + expiring.

---

# 4. Payments & enrollment (financial integrity)

### 4.1 🟠 There is no payment flow
Razorpay keys, `PaymentSettings`, a `razorpay_signature` column, course `price`/`discount`, and an admin payments dashboard all exist — but **no endpoint creates a Razorpay order or verifies a payment signature** (confirmed: no `import razorpay`, no order/checkout/verify route anywhere). The only way a `Payment` row is created is admin-manual enrollment, which writes `status=paid, razorpay_order_id="ADMIN_ENROLL"` ([enrollments.py:103-112](backend/app/api/v1/admin/enrollments.py#L103-L112)). **Students cannot self-enroll or pay.** Either this is an unfinished core feature, or the paid-course UI is misleading. Decide and either build the checkout+signature-verification flow or hide pricing.

### 4.2 🔴 Payments cascade-delete with batches/users
[payment.py:29-32](backend/app/models/payment.py#L29-L32): `student_id` and `batch_id` are `ondelete="CASCADE"`. Deleting a batch or a user **permanently destroys the financial history**. Money/audit rows must never cascade. **Fix:** `RESTRICT` (block delete while payments exist) or `SET NULL` with nullable columns; prefer soft-deleting users. The same concern applies to certificates, attendance, and graded submissions ([certificate.py](backend/app/models/certificate.py), [attendance.py](backend/app/models/attendance.py), [assignment.py](backend/app/models/assignment.py)) — academic records erased on user delete.

### 4.3 🟠 No uniqueness on Razorpay IDs
[payment.py](backend/app/models/payment.py) has no unique constraint on `razorpay_payment_id` / `razorpay_order_id`. When you do add the real flow, a webhook retry or double-submit will insert duplicate paid rows → double-counted revenue / double enrollment. Add a partial unique index now.

### 4.4 🟡 Amount can be zero or negative
[enrollments.py:107](backend/app/api/v1/admin/enrollments.py#L107): `amount=(course.price - course.discount) if course else 0`. If `discount > price` it records a **negative** paid amount; if the course is missing it silently records **₹0 paid**. Validate `amount >= 0` and fail when the course is absent.

### 4.5 🟡 Enrollment race → 500 instead of clean error
[enrollments.py:81-99](backend/app/api/v1/admin/enrollments.py#L81-L99) is check-then-insert. The DB `uq_enrollment(batch_id, student_id)` correctly prevents duplicate data, but the code doesn't catch `IntegrityError`, so a concurrent double-enroll throws a 500 (and the same uncaught-`IntegrityError` pattern exists for signup and for admin seeding, which can **crash startup** if two instances boot together). Wrap inserts in `try/except IntegrityError`.

### 4.6 🟢 Razorpay paise conversion (when you build it)
Razorpay works in integer paise; amounts here are rupee `Numeric(10,2)`. Make sure the future order-creation path multiplies by 100 (and divides back), or amounts will be 100× wrong.

---

# 5. Video pipeline & streaming

### 5.1 🟠 Segment tokens expire inside the playlist (playback breaks)
`SEGMENT_TOKEN_TTL_SECONDS = 30` ([config.py:57](backend/app/core/config.py#L57)). For a VOD video, the variant playlist is generated **once** with every segment URL carrying a token that expires 30 s later ([student/videos.py:130-139](backend/app/api/v1/student/videos.py#L130-L139)). hls.js does **not** periodically reload a VOD media playlist, and the player only re-fetches on a *fatal error* ([SecureVideoPlayer.tsx:155-184](frontend/src/components/shared/SecureVideoPlayer.tsx#L155-L184)). Net effect: ~30 s into playback the segment tokens 403, hls.js raises a fatal error, and the player does a full re-fetch+re-attach → **visible rebuffer/stall roughly every 30 seconds** (and a risk of losing playback position). **Fix:** make segment-token TTL cover the whole video (or scope a single signed token to the video+rendition for the playback session), or have the player reload the media playlist before tokens expire. The current 30 s value is unworkable for anything but very short clips.

### 5.2 🟠 No ffmpeg timeout — one video can wedge the encoder
[ffmpeg_service.py:198](backend/app/services/ffmpeg_service.py#L198) (`subprocess.run(cmd, ...)`) and the `ffprobe` call have no `timeout` on the encode itself (`ffprobe` has 60 s, the encode has none). With Celery `--concurrency=1`, a single malformed/adversarial file that makes ffmpeg hang blocks **all** future encoding indefinitely. The 1-hour stale-`processing` reclaim ([encoding.py:84-90](backend/app/tasks/encoding.py#L84-L90)) doesn't help because the hung subprocess never returns to mark failure. **Fix:** add a wall-clock `timeout=` to `subprocess.run` proportional to expected duration; kill + mark failed on `TimeoutExpired`.

### 5.3 🟡 Encoding throughput vs. "large crowd"
One worker, `concurrency=1`, fires once nightly (`crontab(hour=0, minute=0)`, [celery_app.py:31](backend/app/celery_app.py#L31)). If many instructors upload in a day, sequential CPU encoding (libx264 `veryfast`, GPU off by default) may not finish overnight, and there's **no manual trigger** to encode on demand. Videos are also unavailable to students until the night runs at all. Consider on-upload queuing with a small concurrency, or document the once-a-day SLA clearly.

### 5.4 🟡 `video.uploaded_by` is `SET NULL` but `NOT NULL`
[models/video.py:34](backend/app/models/video.py#L34) (and migration `0002`) declare `uploaded_by` as `ondelete="SET NULL"` while the column is `nullable=False`. Deleting the uploader will **violate NOT NULL and fail/raise**. Make it nullable or use `RESTRICT`.

**Done well (no action):** path-traversal guards `safe_segment_path` / `safe_playlist_path` ([ffmpeg_service.py:205-233](backend/app/services/ffmpeg_service.py#L205-L233)); enrollment + revocation re-checked on **every** manifest/variant/segment request ([student/videos.py:34-62](backend/app/api/v1/student/videos.py#L34-L62)); HMAC-signed tokens with `hmac.compare_digest`; source file deleted after successful encode; `with_for_update(skip_locked=True)` job pickup. This is the most carefully built subsystem.

---

# 6. Database & data layer

### 6.1 🔴 / 🟠 Cascade deletes destroy financial & academic records
See 4.2. The single highest-impact data issue.

### 6.2 🟠 Unauthenticated static file store
[main.py:87](backend/app/main.py#L87) mounts `/uploads` via `StaticFiles`, and nginx proxies `/uploads/` straight through ([nginx.conf:19-21](frontend/nginx.conf#L19-L21)) **with no auth**. That directory holds `submissions/` (student work), `receipts/`, `certificate_templates/`, `certificates/`, `session_resources/`. Anyone with a URL (UUID-named, but URLs leak via history, referrer, logs, sharing) can fetch any document. The elaborate HLS token system is undermined by this open door. **Fix:** serve sensitive uploads through authenticated endpoints that check ownership/role; only truly public assets (course banners) should be static.

### 6.3 🟠 Missing indexes on hot paths (scale)
Postgres does **not** auto-index foreign keys. Missing where it matters:
- `Payment.status`, `Payment.created_at`, `Payment.student_id`, `Payment.batch_id` — the admin payments list filters/sorts/joins on all of these ([payment.py](backend/app/models/payment.py), [admin/payments.py:30-40](backend/app/api/v1/admin/payments.py#L30-L40)).
- `Enrollment.student_id` — every student dashboard query filters by it ([batch.py](backend/app/models/batch.py)).
- Most other FKs (`batch.course_id`, `session.batch_id`, `submission.assignment_id`, etc.) — also slows `CASCADE` deletes.
**Fix:** add `index=True` / composite indexes in a new migration. (`videos.status`/`updated_at` are indexed in the migration but **not** in the model — drift that will make `--autogenerate` try to drop them; see 6.6.)

### 6.4 🟠 N+1 queries in list endpoints
- [admin/enrollments.py:39-41](backend/app/api/v1/admin/enrollments.py#L39-L41) and [admin/payments.py:43-44](backend/app/api/v1/admin/payments.py#L43-L44): a per-row `SELECT StudentProfile` inside the page loop → ~101 queries per page of 100.
- [student/router.py:50-57](backend/app/api/v1/student/router.py#L50-L57) (`my_batches`): per-batch `db.get(Course)` + `SELECT InstructorProfile` → ~2N+1.
**Fix:** join or batch-load with `WHERE id IN (...)`.

### 6.5 🟠 Connection-pool sizing vs. worker count
[db/session.py:9-15](backend/app/db/session.py#L9-L15): `pool_size=10, max_overflow=20` = up to **30 connections per process**, and **no `pool_recycle`**. Today (single process) that's fine, but the moment you fix 2.1 and run, say, 4 Gunicorn workers, that's 120 connections + the Celery worker's pool — past Postgres's default `max_connections=100` → `FATAL: too many connections` under load. **Fix:** size the pool as `(max_connections − reserve) / total_processes`; add `pool_recycle=1800` and a `pool_timeout`. Coordinate this number with `WEB_CONCURRENCY`.

### 6.6 🟢 Migration drift
Only two migrations exist; `videos` indexes are in the migration but not the models ([models/video.py:43](backend/app/models/video.py#L43)). Several recommended indexes/constraints above aren't anywhere yet. Re-baseline: align models to the live schema, then add a `0003` migration carrying the index/constraint/cascade fixes.

**Verified OK:** money is `Numeric(10,2)` (no float bugs); all enum values match migrations exactly; the expected composite unique constraints (`uq_enrollment`, `uq_attendance`, `uq_certificate`, `uq_course_instructor`, profile `user_id`) are present; `pool_pre_ping=True`; student session/resource loading is correctly batched.

---

# 7. API authorization

### 7.1 🟠 Cross-batch IDOR on assignments/sessions
[instructor/router.py:713-773](backend/app/api/v1/instructor/router.py#L713-L773) (`create_assignment` / `update_assignment`) and `create_manual_session` accept `plan_id` / `session_id` from the request body and persist them after validating only the **batch**, not that the referenced plan/session belongs to that batch. An instructor on batch A can link to batch B's plan/session (another instructor's data). **Fix:** verify the referenced row's `batch_id` matches the asserted batch.

### 7.2 🟡 No router-level guard on `/admin/*`
[api/v1/router.py:23](backend/app/api/v1/router.py#L23) builds `admin_router` with only a prefix — every admin endpoint declares `require_admin` individually (currently complete), but one forgotten dependency on a future endpoint = open admin access. **Fix:** add `dependencies=[Depends(require_admin)]` at the router as defense-in-depth.

### 7.3 🟡 Mass-assignment via blind `setattr` loops
`for k, v in data.items(): setattr(obj, k, v)` appears in course/batch/instructor/assignment updates ([admin/courses.py:187-189](backend/app/api/v1/admin/courses.py#L187-L189), [admin/batches.py:220-222](backend/app/api/v1/admin/batches.py#L220-L222), [admin/users.py:175-178](backend/app/api/v1/admin/users.py#L175-L178), [instructor/router.py:762-770](backend/app/api/v1/instructor/router.py#L762-L770)). Safe **only** because the bound schemas happen to exclude sensitive fields — fragile the instant a schema gains a field like `is_published`/`status`/`instructor_id`. Use explicit allow-lists.

### 7.4 🟡 Sensitive data returned/leaked
- `create_instructor` returns the **plaintext temporary password** in the JSON body ([admin/users.py:127-136](backend/app/api/v1/admin/users.py#L127-L136)) — lands in browser history/proxy logs. Rely on the email instead.
- Public cert verification falls back to the student's **email** as `student_name` when no display name ([public.py:96](backend/app/api/v1/public.py#L96)) — leaks email on an unauthenticated endpoint. Use a placeholder.
- Instructor-set `recording_url` / `meeting_link` are stored unvalidated and shown to students raw ([instructor/router.py:516-521](backend/app/api/v1/instructor/router.py#L516-L521)) — phishing/SSRF-on-click surface. Validate scheme/host.

**Verified OK:** instructor object-level checks (`_assert_batch_assigned`, `_assert_session_in_assigned_batch`) are applied consistently; student endpoints all re-verify enrollment; admin enrollment-delete checks batch ownership; no student-to-student data access.

---

# 8. Frontend

### 8.1 🟠 Hand-rolled regex HTML sanitizer (stored XSS)
[RichTextView.tsx:9-30](frontend/src/components/shared/RichTextView.tsx#L9-L30) renders instructor/admin-authored HTML via `dangerouslySetInnerHTML` after a regex `sanitize()`. The event-handler regex only matches space-prefixed double-quoted handlers, so `<img src=x onerror=alert(1)>` and single-quoted variants survive; allowed tags keep arbitrary attributes. A malicious/compromised instructor can stored-XSS every student viewing the course. **Fix:** use DOMPurify with an explicit allowlist (it is not currently a dependency), or render as plain text.

### 8.2 🟡 Player stale-closure / unmount race
[SecureVideoPlayer.tsx:155-191](frontend/src/components/shared/SecureVideoPlayer.tsx#L155-L191): the fatal-error handler re-fetches and re-attaches HLS with no `cancelled` guard and a shared `retryCountRef`, so it can `setState`/attach after unmount or operate on a destroyed instance. Guard with a per-effect cancelled flag and check `hlsRef.current === hls`.

### 8.3 🟡 Client-only RBAC treated as authoritative
`ProtectedRoute` ([ProtectedRoute.tsx](frontend/src/router/ProtectedRoute.tsx)) gates on `user.role` from client memory. That only hides UI — fine **provided** every admin/instructor API enforces server-side (it does). Worth noting the in-code comments imply the guard is authoritative; it isn't, and shouldn't be relied on.

### 8.4 🟢 API base-URL drift
`lib/api.ts` falls back to same-origin, but [video.service.ts:3](frontend/src/services/video.service.ts#L3) and [SecureVideoPlayer.tsx:6](frontend/src/components/shared/SecureVideoPlayer.tsx#L6) hardcode `http://localhost:8085` while `.env` points at `:8090`. If `VITE_API_BASE_URL` is ever unset at build, video/upload calls hit a dead port. Centralize on one helper.

**Verified OK:** tokens live only in httpOnly cookies (no `localStorage`/`document.cookie` token storage); `withCredentials` everywhere; single-flight 401 refresh interceptor; `.env` is git-ignored; external links use `rel="noopener noreferrer"`.

---

# 9. Quick-win checklist (ordered)

1. **nginx**: raise `client_max_body_size` for the video-upload route (2.2).
2. **Dockerfile**: Gunicorn + workers, drop `--reload`, drop the source bind-mount; add TLS termination (2.1, 2.3).
3. **config/seed**: remove default admin password; refuse-to-boot guard in prod (3.1).
4. **redis.py**: real rate limits + proxy-aware client IP (3.2, 3.3).
5. **models**: change Payment/cert/attendance/submission cascades to `RESTRICT`/`SET NULL`; add Razorpay-ID uniqueness; add the missing indexes; fix `video.uploaded_by` nullability — all in one `0003` migration (4.2, 4.3, 6.3, 5.4).
6. **uploads**: move `submissions`/`receipts`/`certificates` behind authenticated endpoints (6.2).
7. **streaming**: fix segment-token TTL so VOD playback doesn't break (5.1); add an ffmpeg timeout (5.2).
8. **instructor router**: validate `plan_id`/`session_id` belong to the batch (7.1).
9. **frontend**: DOMPurify for rich text; player unmount guard; strip PII logs (8.1, 8.2, 3.6).
10. **decide the payment story**: build Razorpay checkout+verify, or hide pricing/self-enroll (4.1).

---

## Appendix — what's genuinely solid
Refresh-token rotation + Redis blacklist; OAuth state CSRF; bcrypt(12) + hashed/expiring/attempt-capped OTP; HLS HMAC tokens + per-request enrollment & revocation checks + path-traversal guards; `Numeric` money; correct composite unique constraints; consistent instructor/student object-level authorization; streaming upload with size cap + partial-file cleanup; `skip_locked` job pickup. The foundations are good — the gaps are concentrated in **deployment configuration, payment completeness, data-lifecycle (cascades), and the production-hardening that was deferred with "tighten before production" comments.**
