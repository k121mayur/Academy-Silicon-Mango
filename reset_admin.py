"""Reset admin email + password in Silicon Mango Academy database."""
import sys

import bcrypt
import psycopg2

# ── Config ─────────────────────────────────────────────────────────────
OLD_EMAIL = "admin@siliconamngo.com"
NEW_EMAIL = "admin@siliconmango.in"
NEW_PASSWORD = "Admin@123"

# Docker DB: sm_postgres on 127.0.0.1:5435
DB_HOST = "127.0.0.1"
DB_PORT = 5435
DB_NAME = "silicon_mango"
DB_USER = "sm_user"
DB_PASS = "Sm@SecurePass2024!"

# ── Hash new password (bcrypt rounds=12, matching passlib CryptContext) ─
new_hash = bcrypt.hashpw(
    NEW_PASSWORD.encode("utf-8"),
    bcrypt.gensalt(rounds=12),
).decode("utf-8")

# ── Connect and update ─────────────────────────────────────────────────
try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
    )
    conn.autocommit = True
    cur = conn.cursor()

    # Check old user exists
    cur.execute("SELECT id, email, role FROM users WHERE email = %s", (OLD_EMAIL,))
    row = cur.fetchone()
    if row is None:
        print(f"ERROR: No user found with email '{OLD_EMAIL}'")
        sys.exit(1)

    user_id, old_email_db, role = row
    print(f"Found user: {old_email_db} [role={role}, id={user_id}]")

    # Update email + password
    cur.execute(
        "UPDATE users SET email = %s, hashed_password = %s WHERE id = %s",
        (NEW_EMAIL, new_hash, user_id),
    )
    print(f"Updated: email → '{NEW_EMAIL}', password → '{NEW_PASSWORD}' ({cur.rowcount} row)")

    # Verify
    cur.execute("SELECT email, hashed_password FROM users WHERE id = %s", (user_id,))
    row2 = cur.fetchone()
    if row2 is None:
        print("ERROR: User vanished after update")
        sys.exit(1)

    stored_email, stored_hash = row2
    assert stored_email == NEW_EMAIL, f"Email mismatch: {stored_email}"
    assert bcrypt.checkpw(NEW_PASSWORD.encode("utf-8"), stored_hash.encode("utf-8")), \
        "Password verification FAILED"

    print(f"SUCCESS: {stored_email} — password verified OK")

    cur.close()
    conn.close()

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
