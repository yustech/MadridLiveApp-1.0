#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d dist ]]; then
  echo "dist/ not found. Run npm run build first."
  exit 1
fi

: "${DEPLOY_HOST:?Set DEPLOY_HOST}"
: "${DEPLOY_USER:?Set DEPLOY_USER}"
: "${DEPLOY_SSH_KEY:?Set DEPLOY_SSH_KEY}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/madridlive-app}"
DEPLOY_URL="${DEPLOY_URL:-https://inmosubastas.top}"

KEY_FILE="$(mktemp)"
trap 'rm -f "$KEY_FILE"' EXIT
printf '%s
' "$DEPLOY_SSH_KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"

scp   -i "$KEY_FILE"   -P "$DEPLOY_PORT"   -r dist   "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"

ssh   -i "$KEY_FILE"   -p "$DEPLOY_PORT"   "$DEPLOY_USER@$DEPLOY_HOST"   'sudo systemctl restart madridlive-app.service && sudo systemctl is-active --quiet madridlive-app.service'

for attempt in 1 2 3 4 5 6; do
  if curl -fsS "$DEPLOY_URL/api/health" | grep -q '"status":"ok"'; then
    echo "Health check passed."
    exit 0
  fi
  sleep 5
done

echo "Health check failed after deployment."
exit 1
