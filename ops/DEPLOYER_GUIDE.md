# Deployer Guide — Silicon Mango Academy
### What to do before and during this deployment, and why each step matters

---

## Read this first — what changed and why this matters

This deployment includes a **security hardening update**. The app now handles real student
payments and real personal data, so several vulnerabilities were fixed before going to
production.

**The most important change:** the app will now **refuse to start** if any secret password
or key is still set to its default "development" value. This is intentional. It means if you
forget to set a strong password, the app will print a clear error and stop — instead of
silently running with passwords that are publicly visible in the git repository.

Because of this, there are a few things that **must be done on the server before or during
this deploy**, things that can't be done by editing code in the repo. This guide walks you
through all of them step by step.

---

## Before you start: what you need

- SSH access to the Oracle VM where the app is running
- The root `.env` file on the VM (the one that lives next to `docker-compose.yml`)
- The `backend/.env` file on the VM (inside the `backend/` folder)
- About 15–20 minutes

---

## Step 1 — Rotate the Postgres database password
### (Do this FIRST, before pulling or redeploying anything)

**Why this step exists:** Postgres only reads the password from the environment **one time**
— when the database volume is first created. After that, the volume already exists, and
Postgres ignores the environment variable completely. It remembers the password internally.

What this means practically: if you change the `DB_PASSWORD` in `.env` and then redeploy,
the backend will try to connect using the new password, but the database still has the old
one. Every single request to the app will fail with a database connection error. The site
goes down completely.

The correct way to rotate the database password is to tell the database directly — while it
is still running — to change the password. Then update the `.env` to match. This way both
sides agree.

**Do this now, while the old deployment is still running:**

```bash
# Replace YOUR_NEW_STRONG_PASSWORD with the actual new password you chose.
# Use something long and random — e.g. generate it with:
#   python3 -c "import secrets; print(secrets.token_hex(32))"

docker exec -it sm_postgres psql -U sm_user -d silicon_mango \
  -c "ALTER USER sm_user WITH PASSWORD 'YOUR_NEW_STRONG_PASSWORD';"
```

You should see `ALTER ROLE` printed. That means it worked.

**Now immediately update the root `.env` file** on the server (the one next to
`docker-compose.yml`) so `DB_PASSWORD` equals that same new password:

```
DB_PASSWORD=YOUR_NEW_STRONG_PASSWORD
```

Keep this terminal open. Do not redeploy yet.

---

## Step 2 — Fill in all required secrets in both .env files

The app now has a boot guard that checks for weak secrets at startup. If a secret is still
set to its default development value, the app refuses to start and prints which variable
needs to be changed.

You need to set strong values for all of these before deploying.

**Generate a strong random secret** (run this command as many times as you need, once per
secret — each run gives a different value):

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

### Root `.env` (the file next to `docker-compose.yml`)

Open this file and make sure the following variables are set to strong values. If any of
them look like the examples below, **change them — those are the weak defaults that are
publicly visible in the code repository**:

| Variable | What it's for | Weak default to replace |
|---|---|---|
| `DB_PASSWORD` | Database password | `sm_secure_pass_2024` |
| `REDIS_PASSWORD` | Redis cache/queue password | `sm_redis_pass_2024` |
| `SEGMENT_SIGNING_SECRET` | Signs video segment URLs so students can't hotlink or share them | `dev_segment_secret_change_me` |
| `SERVER_NAME` | Your domain name, e.g. `academy.siliconmango.in` | `_` |

**What to set them to:** use the random generator above. Copy the output and paste it as
the value. Example of what the file should look like after:

```env
DB_PASSWORD=a3f9c2e7b1d4f6a8c0e2f4b6d8a0c2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6
REDIS_PASSWORD=b4e8c2f6a0d4e8b2c6f0a4e8c2f6a0d4e8b2c6f0a4e8c2f6a0d4e8b2c6f0a4e8
SEGMENT_SIGNING_SECRET=c5f9d3a7b1e5c9f3a7b1e5c9f3a7b1e5c9f3a7b1e5c9f3a7b1e5c9f3a7b1e5c9
SERVER_NAME=academy.siliconmango.in
```

---

### `backend/.env` (inside the `backend/` folder)

Open this file and set:

| Variable | What it's for | Weak default to replace |
|---|---|---|
| `SECRET_KEY` | Signs all login tokens. If someone knows this, they can forge an admin login without a password. | `change-me-in-production-this-is-a-dev-key-only` |
| `MASTER_ADMIN_PASSWORD` | The password for the main admin account | `Admin@12345` |
| `MASTER_ADMIN_EMAIL` | The email address for the main admin account | whatever the current value is — make sure it's the real admin email |
| `ENVIRONMENT` | **Must be exactly `production`** — this enables Secure cookies, hides the API docs page, and arms the boot guard | `development` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | How long a login session stays active. Setting this to `15` means if someone steals a token, it expires in 15 minutes instead of 24 hours. | (may not be set — add it) |

Set it like this:

```env
SECRET_KEY=d6a0e4c8f2b6a0e4c8f2b6a0e4c8f2b6a0e4c8f2b6a0e4c8f2b6a0e4c8f2b6a0
MASTER_ADMIN_PASSWORD=SomethingStrongYouWillRemember!42
MASTER_ADMIN_EMAIL=admin@yourdomain.com
ENVIRONMENT=production
ACCESS_TOKEN_EXPIRE_MINUTES=15
```

---

## Step 3 — Confirm the TLS certificates are in place

The production nginx configuration requires three certificate files to exist on the server
at `./certs/` (relative to the repository root). If these files are missing, nginx will
fail to start and the entire site will be down.

Run:

```bash
ls /path/to/repo/certs/
```

You should see these three files:

```
cloudflare-origin-pull-ca.pem
origin.key
origin.pem
```

**If any of these are missing:** do not proceed with the deploy. Contact Siddh — these
files need to be placed on the server before the new deployment will work. They are
Cloudflare origin certificates and are never stored in the git repository (for security
reasons).

---

## Step 4 — Deploy

Once steps 1–3 are done, run the standard deploy commands:

```bash
docker-compose down
git pull
docker-compose up --build
```

Watch the terminal output. The backend will print boot messages. If any secret is still
weak, you will see something like:

```
[BOOT][FATAL] Refusing to start in production with insecure configuration:
  - SECRET_KEY is still the default development value
```

If you see this: **the app did not start**. Go back to Step 2, fix the variable it names
in the appropriate `.env` file, and re-run `docker-compose up --build`. The app is
protecting you — it is not a bug.

If the boot succeeds, you will see the normal startup logs and the containers will come up.

---

## Step 5 — Smoke test (confirm the site is working)

After the containers are up, quickly verify the critical path works:

1. Open the site in a browser. The homepage should load.
2. Log in as a student. The dashboard should load.
3. Open the admin panel. It should require the new `MASTER_ADMIN_PASSWORD` you set.
4. Check that `/api/docs` returns **404** (not the Swagger UI — in production this is
   hidden on purpose).
5. Try accessing a receipt URL directly in the browser — something like
   `https://yourdomain.com/uploads/receipts/anything.pdf`. It should return **404**.
   If it returns a file, stop and contact Siddh — something is wrong with the nginx config.

---

## Step 6 — Install the nightly backup

**This is the single most important thing that can't be undone later.** If the server's
disk fails before a backup is installed, every payment record, certificate, and enrollment
is permanently gone. There is no recovery. Installing this takes two minutes.

The backup script lives at `ops/backup.sh` in the repository. It dumps the database,
archives the uploaded files and videos, and sends them to Oracle Object Storage every night.

**One-time setup:**

```bash
# Make the script executable
chmod +x /path/to/repo/ops/backup.sh

# Set the required environment variables the script needs.
# Add these to the server's environment or to a wrapper script.
export OCI_BUCKET=sm-backups          # your Oracle bucket name
export OCI_NAMESPACE=your-namespace   # your Oracle namespace
export OCI_PREFIX=silicon-mango       # prefix for the files inside the bucket

# Install the cron job (edit your crontab)
crontab -e
```

Inside the crontab editor, add this line at the bottom:

```
17 2 * * *  DB_PASSWORD=yourpassword OCI_BUCKET=sm-backups OCI_NAMESPACE=yournamespace OCI_PREFIX=silicon-mango /path/to/repo/ops/backup.sh >> /var/log/sm-backup.log 2>&1
```

(Replace the variable values with the real ones. The `17 2 * * *` means "2:17 AM every day".)

**Run it once by hand immediately and confirm it works:**

```bash
DB_PASSWORD=yourpassword OCI_BUCKET=sm-backups OCI_NAMESPACE=yournamespace \
  OCI_PREFIX=silicon-mango /path/to/repo/ops/backup.sh
```

You should see log lines like:
```
[2026-06-16T...] Starting Postgres dump...
[2026-06-16T...] Postgres dump complete: 4.2M
[2026-06-16T...] Snapshotting media and uploads...
[2026-06-16T...] Uploaded: postgres-....dump
[2026-06-16T...] Backup complete.
```

Then go to the Oracle Object Storage console and confirm the files are there.

**If the backup script fails:** do not launch the live site until it works. An untested
backup is not a backup.

---

## Troubleshooting common errors

**"DB_PASSWORD must be set in .env"**
The root `.env` file is missing `DB_PASSWORD` or it is empty. Add the variable and re-run.

**"connection refused" or "could not connect to server"**
The database password in `.env` does not match what Postgres has internally. This means
Step 1 was either skipped or the password values don't match. Re-run the `ALTER USER`
command from Step 1 and make sure the password is exactly the same in both places.

**"host not found in upstream backend" from nginx**
The backend container crashed at startup. Run `docker-compose logs backend` to see why.
Usually a missing `.env` variable or a weak-secret boot guard rejection.

**"origin.pem: No such file or directory"**
The certificates in `certs/` are missing. See Step 3.

**The site loads but CSS/JS is missing**
The frontend build failed. Run `docker-compose logs frontend` to see the build error.

**"[BOOT][FATAL] Refusing to start in production with insecure configuration"**
A secret is still set to its known-weak default value. The log line will name which
variable. Fix that variable in the appropriate `.env` file and re-run `docker-compose up --build`.

---

## Summary checklist

Before calling the deploy done, confirm each item:

- [ ] Postgres password rotated with `ALTER USER` while the old containers were still running
- [ ] Root `.env` has strong values for `DB_PASSWORD`, `REDIS_PASSWORD`, `SEGMENT_SIGNING_SECRET`, `SERVER_NAME`
- [ ] `backend/.env` has strong values for `SECRET_KEY`, `MASTER_ADMIN_PASSWORD`, and `ENVIRONMENT=production`
- [ ] `certs/` directory contains all three certificate files
- [ ] `docker-compose down && git pull && docker-compose up --build` completed without FATAL errors
- [ ] Homepage loads in a browser
- [ ] Admin panel requires the new admin password
- [ ] `/api/docs` returns 404
- [ ] A direct `/uploads/receipts/anything` URL returns 404
- [ ] Backup script ran by hand and files appeared in Oracle Object Storage
- [ ] Backup cron installed in crontab
