#!/usr/bin/env bash
# Silicon Mango Academy — nightly backup script
#
# Dumps Postgres and rsyncs media/uploads to Oracle Object Storage.
# Install once on the VM:
#   chmod +x /path/to/repo/ops/backup.sh
#   crontab -e
#   # add:  17 2 * * *  /path/to/repo/ops/backup.sh >> /var/log/sm-backup.log 2>&1
#
# Required env vars (set in the VM's root .env or export before running):
#   DB_PASSWORD         Postgres password
#   OCI_BUCKET          Oracle Object Storage bucket name (e.g. sm-backups)
#   OCI_NAMESPACE       Oracle Object Storage namespace
#   OCI_PREFIX          Key prefix inside the bucket (e.g. silicon-mango)
#
# oci CLI must be installed and authenticated (instance principal or config file).
# Test a restore before launch: download the dump and run pg_restore against a
# fresh local Postgres — a backup you've never restored is not a backup.

set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_DIR="/tmp/sm-backup-${TIMESTAMP}"
mkdir -p "${DUMP_DIR}"

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }

# ---- 1. Postgres dump -------------------------------------------------------
log "Starting Postgres dump..."
DUMP_FILE="${DUMP_DIR}/postgres-${TIMESTAMP}.dump"
docker exec sm_postgres pg_dump \
    -U sm_user \
    -d silicon_mango \
    --format=custom \
    --no-password \
    > "${DUMP_FILE}"
log "Postgres dump complete: $(du -sh "${DUMP_FILE}" | cut -f1)"

# ---- 2. Media & uploads snapshot -------------------------------------------
log "Snapshotting media and uploads..."
MEDIA_TAR="${DUMP_DIR}/media-${TIMESTAMP}.tar.gz"
UPLOADS_TAR="${DUMP_DIR}/uploads-${TIMESTAMP}.tar.gz"
tar -czf "${MEDIA_TAR}"   -C "${REPO_DIR}/backend" media
tar -czf "${UPLOADS_TAR}" -C "${REPO_DIR}/backend" uploads
log "Archives: $(du -sh "${MEDIA_TAR}" | cut -f1) media, $(du -sh "${UPLOADS_TAR}" | cut -f1) uploads"

# ---- 3. Upload to Oracle Object Storage ------------------------------------
log "Uploading to OCI bucket ${OCI_BUCKET}..."
for FILE in "${DUMP_FILE}" "${MEDIA_TAR}" "${UPLOADS_TAR}"; do
    BASENAME=$(basename "${FILE}")
    oci os object put \
        --bucket-name "${OCI_BUCKET}" \
        --namespace "${OCI_NAMESPACE}" \
        --name "${OCI_PREFIX:-silicon-mango}/${TIMESTAMP}/${BASENAME}" \
        --file "${FILE}" \
        --force
    log "Uploaded: ${BASENAME}"
done

# ---- 4. Prune local temp files ---------------------------------------------
rm -rf "${DUMP_DIR}"
log "Temp files removed."

# ---- 5. Prune old remote backups (keep last 30 days) ----------------------
log "Pruning remote backups older than 30 days..."
CUTOFF=$(date -u -d "30 days ago" +"%Y%m%d" 2>/dev/null || date -u -v-30d +"%Y%m%d")
oci os object list \
    --bucket-name "${OCI_BUCKET}" \
    --namespace "${OCI_NAMESPACE}" \
    --prefix "${OCI_PREFIX:-silicon-mango}/" \
    --all \
    --query "data[?\"time-created\" < '${CUTOFF}'].name" \
    --output json 2>/dev/null \
    | python3 -c "
import sys, json
names = json.load(sys.stdin)
for n in names:
    print(n)
" | while read -r NAME; do
    oci os object delete \
        --bucket-name "${OCI_BUCKET}" \
        --namespace "${OCI_NAMESPACE}" \
        --object-name "${NAME}" \
        --force 2>/dev/null && log "Pruned: ${NAME}" || true
done

log "Backup complete."
