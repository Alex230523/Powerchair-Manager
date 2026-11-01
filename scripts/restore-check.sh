#!/usr/bin/env bash
# B2: restores an encrypted copy into a THROWAWAY database and checks it.
#   BACKUP_PASSPHRASE=... RESTORE_URL=postgresql://.../pfm_restore [SOURCE_URL=...] scripts/restore-check.sh <file>
# With SOURCE_URL, the row counts of the main tables must match the source.
# Never point RESTORE_URL at the production database: the restore runs with --clean.
set -euo pipefail
file="${1:?usage: restore-check.sh <file.dump.enc>}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
: "${RESTORE_URL:?RESTORE_URL (a throwaway database) is required}"
if [ -f "$file.sha256" ]; then sha256sum --check --status "$file.sha256"; fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$file" \
  | pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error --dbname "$RESTORE_URL"
tables="organization \"user\" club_person team calendar_event mail_job document_version funding_task contact schema_migrations"
status=0
for t in $tables; do
  restored=$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM $t" 2>/dev/null || echo "missing")
  if [ -n "${SOURCE_URL:-}" ]; then
    source=$(psql "$SOURCE_URL" -Atc "SELECT count(*) FROM $t" 2>/dev/null || echo "missing")
    if [ "$restored" != "$source" ]; then echo "MISMATCH $t: source=$source restored=$restored" >&2; status=1; else echo "ok $t $restored"; fi
  else
    echo "$t $restored"
  fi
done
exit $status
