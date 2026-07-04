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
printf '%s\n' "$DEPLOY_SSH_KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"

SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o BatchMode=yes
  -i "$KEY_FILE"
  -P "$DEPLOY_PORT"
)

# Use -O because this server does not expose the SFTP subsystem for SCP by default.
scp -O "${SSH_OPTS[@]}" -r dist "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"

# The service runs under opsadmin with Restart=always, so signaling the process
# triggers a clean systemd-managed restart without requiring sudo.
ssh "${SSH_OPTS[@]/-P/-p}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '/opt/madridlive-app/dist/server.cjs' || true"

for attempt in 1 2 3 4 5 6; do
  if curl -fsS "$DEPLOY_URL/api/health" | grep -q '"status":"ok"'; then
    echo "Health check passed."
    exit 0
  fi
  sleep 5
done

echo "Health check failed after deployment."
exit 1
