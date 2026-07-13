#!/usr/bin/env bash
set -euo pipefail

# Clean restart for the MadridLive services, with health verification.
#
# Prefers a real systemd restart via the scoped passwordless sudoers rule
# (/etc/sudoers.d/madridlive-restart, installed 2026-07-13 for audit task #6:
# it allows opsadmin to run ONLY `systemctl restart` on the two app services).
# Falls back to the legacy MainPID-signal + Restart=always relaunch when the
# rule is absent — that path has a known EADDRINUSE race (2026-07-08 incident)
# and should only be a last resort.
#
# Usage: restart-service.sh <prod|staging>

TARGET="${1:?Usage: restart-service.sh <prod|staging>}"

case "$TARGET" in
  prod)
    SERVICE="madridlive-app.service"
    HEALTH_URL="http://127.0.0.1:3000/api/health"
    ;;
  staging)
    SERVICE="madridlive-app-staging.service"
    HEALTH_URL="http://127.0.0.1:3001/api/health"
    ;;
  *)
    echo "Unknown target: $TARGET (use prod|staging)" >&2
    exit 2
    ;;
esac

if sudo -n systemctl restart "$SERVICE" 2>/dev/null; then
  echo "[restart] strategy=systemd service=$SERVICE"
else
  echo "[restart] sudo -n unavailable; falling back to signal restart (EADDRINUSE race possible)" >&2
  main_pid="$(systemctl show "$SERVICE" -p MainPID --value)"
  if ! [[ "$main_pid" =~ ^[0-9]+$ ]] || (( main_pid <= 0 )); then
    echo "[restart] cannot resolve MainPID for $SERVICE" >&2
    exit 1
  fi
  kill "$main_pid"
fi

for _ in $(seq 1 15); do
  sleep 2
  if systemctl is-active --quiet "$SERVICE" \
    && curl --connect-timeout 2 --max-time 4 -fsS "$HEALTH_URL" | grep -q '"status":"ok"'; then
    echo "[restart] service=$SERVICE healthy"
    exit 0
  fi
done

echo "[restart] $SERVICE did not become healthy in time" >&2
exit 1
