#!/usr/bin/env bash
# Starts the demo: background workers (mail, document deadlines, attendance
# reminders) and the production server on port 3000. Logs go to .local/logs/.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "Missing .env.local (see README)"; exit 1; }
[ -d .next ] || npm run build

mkdir -p .local/logs
for worker in mail docs attendance; do
  nohup npm run --silent "$worker:worker" > ".local/logs/$worker-worker.log" 2>&1 &
done
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

url=$(grep '^BETTER_AUTH_URL=' .env.local | cut -d= -f2-)
echo ""
echo "Powerchair Football Manager : ${url}/fr"
echo "Comptes de démo : president@demo.pfm, coach@demo.pfm, joueur@demo.pfm, parent@demo.pfm"
echo "Mot de passe : Demo-Powerchair-2026"
echo ""
npm start -- --hostname 0.0.0.0 --port 3000
