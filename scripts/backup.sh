#!/usr/bin/env bash
# B2: an encrypted copy of the database (pg_dump custom format, already
# compressed, then AES-256 with a passphrase that never leaves the secrets).
#   DATABASE_URL=... BACKUP_PASSPHRASE=... scripts/backup.sh [file]
# Writes <file> and <file>.sha256. Restore: scripts/restore-check.sh.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
if [ "${#BACKUP_PASSPHRASE}" -lt 24 ]; then echo "BACKUP_PASSPHRASE must have at least 24 characters" >&2; exit 2; fi
out="${1:-pfm-$(date -u +%Y%m%dT%H%M%SZ).dump.enc}"
umask 077
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$out"
sha256sum "$out" > "$out.sha256"
echo "$out"
