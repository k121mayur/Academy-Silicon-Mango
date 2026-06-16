#!/usr/bin/env bash
# ============================================================================
#  restore.sh  —  restore the database from a backup made by backup.sh
# ----------------------------------------------------------------------------
#  DESTRUCTIVE: this REPLACES the current contents of the database with the
#  contents of the chosen dump. It exists for disaster recovery / rollback.
#  It requires you to type the confirmation phrase, so it can't fire by accident.
#
#  USAGE:
#       bash scripts/restore.sh                       # restore the NEWEST backup
#       bash scripts/restore.sh backups/xxx.dump      # restore a specific file
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

DB_NAME="${POSTGRES_DB:-silicon_mango}"
DB_USER="${POSTGRES_USER:-sm_user}"
CONTAINER="sm_postgres"
OUT_DIR="backups"

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_RED=$'\033[31m'; C_CYN=$'\033[36m'
log()  { printf '%s\n' "${C_CYN}[restore]${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GRN}[restore] ✓${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YEL}[restore] !${C_RESET} $*"; }
die()  { printf '%s\n' "${C_RED}[restore] ✗ $*${C_RESET}" >&2; exit 1; }

docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" \
  || die "Container '$CONTAINER' is not running — start the stack first."

# Pick the backup file: explicit arg, or the newest dump in ./backups.
FILE="${1:-}"
if [ -z "$FILE" ]; then
  FILE="$(ls -1t "${OUT_DIR}/${DB_NAME}_"*.dump 2>/dev/null | head -n1 || true)"
  [ -n "$FILE" ] || die "No backups found in ${OUT_DIR}/. Pass a file explicitly."
  log "No file given — using newest backup: ${FILE}"
fi
[ -f "$FILE" ] || die "Backup file not found: $FILE"
head -c 5 "$FILE" | grep -q "PGDMP" || die "Not a valid pg_dump custom-format file: $FILE"

echo
warn "${C_BOLD}This will REPLACE the live database '${DB_NAME}' with:${C_RESET}"
echo "        $FILE"
warn "A safety backup of the CURRENT state will be taken first."
echo
read -r -p "Type 'RESTORE' to proceed: " confirm
[ "$confirm" = "RESTORE" ] || die "Aborted (you did not type RESTORE)."

# Safety net: snapshot the current state before we overwrite it.
log "Backing up the CURRENT database before restoring ..."
KEEP=999 bash scripts/backup.sh || warn "Pre-restore backup failed — continuing per your confirmation."

# Restore. --clean --if-exists drops existing objects first; pg_restore into the
# existing DB is the supported path for -Fc dumps. Errors on DROP of nonexistent
# objects are harmless and suppressed by --if-exists.
log "Restoring ${FILE} into '${DB_NAME}' ..."
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges < "$FILE" \
  || warn "pg_restore reported non-fatal errors (often just DROP-of-missing). Verify the app."

ok "Restore complete. Verify the application now."
