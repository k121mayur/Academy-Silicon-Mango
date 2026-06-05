# Email not working in production — handoff for whoever has server access

**Symptom:** No emails are delivered from the live site. Confirmed via admin → **Create
Instructor**: the account is created but the welcome email (login + password) never
arrives. The same applies to every email feature, because they all share one function
(`backend/app/services/email_service.py → send_email`): signup OTP, student/instructor
welcome emails, session-change notices, certificate PDFs, payment receipts.

> **TL;DR for the fix:** This cannot be fixed from the website or admin panel — SMTP is
> configured only via the server's `backend/.env`. It needs someone with server access.
> The code and the Gmail credentials are already proven correct (see below), so the fix is
> small: it's either (A) the server's `.env` is missing SMTP creds, or (B) the host
> (Oracle Cloud) is blocking the outbound SMTP port. Run the one check in step 2 to tell
> which, then apply the matching fix in step 3.

---

## 1. What we already verified (so you don't have to)

- ✅ **The code is correct.** `send_email` builds and sends the message properly.
- ✅ **The Gmail credentials are valid.** We connected to `smtp.gmail.com:465`, completed
  the TLS handshake, and **authenticated successfully** using the App Password from the
  developer's `.env`. Login returned OK.
- ✅ **Locally it works.** From a machine that does *not* block SMTP ports, the exact
  production settings authenticate fine.

➡️ Therefore the failure is **environmental on the server**, not a code or password bug.

---

## 2. Decide the cause — run this ON THE SERVER (30 seconds)

```bash
# Is SMTP even enabled in the running container?
docker logs sm_backend 2>&1 | grep CONFIG
#   "...smtp=off (console)..."  → CAUSE A  (creds missing on the server → go to 3A)
#   "...smtp=on..."             → continue to the next command

# What happened on the last send attempt?
docker logs sm_backend 2>&1 | grep EMAIL
#   "[EMAIL][CONSOLE FALLBACK]"      → CAUSE A
#   "[EMAIL][ERROR] Failed to send"  → CAUSE B (port blocked / unreachable → go to 3B)

# Decisive test: can the server actually reach the SMTP port?
docker exec sm_backend python -c "import socket; socket.create_connection(('smtp.gmail.com',465),10); print('OPEN')"
docker exec sm_backend python -c "import socket; socket.create_connection(('smtp.gmail.com',587),10); print('OPEN')"
#   prints "OPEN"            → port reachable (not a block)
#   hangs then TimeoutError  → CAUSE B: the host is blocking outbound SMTP
```

---

## 3. Fix

### Fix A — server `.env` is missing/blank SMTP creds
Edit **`backend/.env`** on the server and set these four (Gmail example, App Password
required — not the normal account password):

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-account@gmail.com
SMTP_PASSWORD=your-16-char-app-password   # https://myaccount.google.com/apppasswords
FROM_EMAIL=Silicon Mango Academy <your-account@gmail.com>   # keep this = SMTP_USER to avoid spam/SPF issues
```

Then recreate the containers so the new env is read (a plain `restart` may not reload it):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate backend worker
```

### Fix B — the host is blocking the SMTP port (most likely on Oracle Cloud)
Oracle Cloud (and most cloud hosts) block outbound ports 25/465/587 by default. Gmail only
offers 465 and 587, so **Gmail SMTP cannot work from that server** until the block is
lifted. Two options, both keep the existing SMTP code unchanged:

1. **Switch to a provider that listens on port `2525`** (rarely blocked). Free tiers exist:
   **Brevo** (300/day), **SendGrid**, **Mailgun**, **Mailjet**. Then in `backend/.env`:
   ```ini
   SMTP_HOST=smtp-relay.brevo.com     # example (Brevo)
   SMTP_PORT=2525
   SMTP_USER=<provider SMTP login>
   SMTP_PASSWORD=<provider SMTP key>
   FROM_EMAIL=Silicon Mango Academy <a-verified-sender@yourdomain.com>
   ```
   Note: `SMTP_PORT=2525` uses STARTTLS automatically (the code uses implicit TLS only for
   465). Recreate containers as in Fix A.

2. **Or** open an Oracle support request to unblock outbound SMTP (slower, not guaranteed).

> Caveat even if you stay on Gmail: free Gmail caps at ~500 emails/day and may flag bulk
> sending. For an academy with many students, a transactional provider (option 1) is the
> sturdier long-term choice.

---

## 4. Also deploy the code change (makes failures visible, so this never hides again)

A code change is included in this repo that makes admin **Create Instructor / Create
Student** report `email_sent: false` with a clear warning when the email doesn't go out
(instead of silently showing success). Files changed:
`backend/app/api/v1/admin/users.py`, `frontend/src/services/admin.service.ts`,
`frontend/src/pages/admin/Instructors.tsx`, `frontend/src/pages/admin/Students.tsx`.

Deploy it by rebuilding the images (after merging/pulling the branch):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## 5. Verify after the fix
- `docker logs sm_backend 2>&1 | grep CONFIG` shows `smtp=on`.
- Create a test instructor in the admin panel → the welcome email arrives (check spam once).
- `docker logs sm_backend 2>&1 | grep EMAIL` shows `[EMAIL] Sent to ...` (not `[ERROR]`).

---

## Important note on the OTP / "admin sign-in" report
The tester's note that "admin is not receiving OTP while signing in" is based on a
misunderstanding: **this app has no OTP step at login for anyone.** The admin signs in
with email + password (the master-admin credentials in `backend/.env`). An OTP email is
only sent during **new student self-signup**. That OTP wasn't arriving for the *same*
reason as everything else — the SMTP problem above. Fixing SMTP fixes the signup OTP too.
