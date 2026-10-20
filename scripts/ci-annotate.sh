#!/usr/bin/env bash
# Runs a command and, when it fails, repeats the end of its output as a pull
# request annotation (the job log itself is not always reachable from where
# the code is written). Usage: scripts/ci-annotate.sh "<step name>" <command...>
set -o pipefail
name="$1"; shift
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  # Lines that look like errors first, each as its own annotation (at most 8),
  # then the tail of the output as one annotation.
  grep -nE "error|Error|FAIL|✘|×|failed|Expected|Received|Cannot|Type '" "$log" | grep -v "node_modules/" | head -8 | while IFS= read -r line; do
    printf '::error title=%s::%s\n' "$name" "${line//$'\r'/}"
  done
  tail -n 80 "$log" | tr -d '\r' | sed 's/%/%25/g' | awk 'BEGIN{ORS="%0A"} {print}' | { read -r body; printf '::error title=%s (last lines)::%s\n' "$name" "$body"; }
fi
rm -f "$log"
exit "$status"
