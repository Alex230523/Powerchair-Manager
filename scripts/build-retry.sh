#!/usr/bin/env bash
# The build downloads the two Google fonts once (next/font serves them from the
# site afterwards). When the font server does not answer, the build fails with
# « next/font/google » errors that say nothing about the code: tried again, at
# most twice, after a pause. Any other failure stops at once.
set -o pipefail
for attempt in 1 2 3; do
  log="$(mktemp)"
  npm run build 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  if [ "$status" -eq 0 ] || ! grep -q "next/font/google" "$log" || [ "$attempt" -eq 3 ]; then
    rm -f "$log"
    exit "$status"
  fi
  rm -f "$log"
  echo "::warning title=Build::Google fonts unreachable (attempt $attempt), trying again in 20 s"
  sleep 20
done
