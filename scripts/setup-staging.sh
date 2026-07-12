#!/usr/bin/env bash
set -euo pipefail
umask 077

MODE="${1:---plan}"

APP_USER="${APP_USER:-opsadmin}"
APP_GROUP="${APP_GROUP:-opsadmin}"
SOURCE_ENV="${SOURCE_ENV:-/opt/madridlive-app/.env}"
SOURCE_NODE_MODULES="${SOURCE_NODE_MODULES:-/opt/madridlive-app/node_modules}"
STAGING_APP_DIR="${STAGING_APP_DIR:-/opt/madridlive-app-staging}"
STAGING_ENV="${STAGING_ENV:-$STAGING_APP_DIR/.env}"
STAGING_DB="${STAGING_DB:-netiadmin_madrid_live_staging}"
STAGING_PORT="${STAGING_PORT:-3001}"
STAGING_HOST="${STAGING_HOST:-127.0.0.1}"
STAGING_SERVICE="${STAGING_SERVICE:-madridlive-app-staging.service}"
STAGING_BASE_URL="${STAGING_BASE_URL:-http://127.0.0.1:$STAGING_PORT}"
STAGING_EXPECTED_STAFF_COUNT="${STAGING_EXPECTED_STAFF_COUNT:-6}"
MYSQL_GRANT_HOST="${MYSQL_GRANT_HOST:-localhost}"
KEEP_EXISTING_DB="${KEEP_EXISTING_DB:-true}"

MYSQL_CLIENT="$(command -v mariadb || command -v mysql || true)"

usage() {
  cat <<USAGE
Usage: $0 [--plan|--apply]

Environment overrides:
  STAGING_APP_DIR=$STAGING_APP_DIR
  STAGING_DB=$STAGING_DB
  STAGING_PORT=$STAGING_PORT
  STAGING_HOST=$STAGING_HOST
  STAGING_SERVICE=$STAGING_SERVICE
  KEEP_EXISTING_DB=$KEEP_EXISTING_DB
USAGE
}

print_plan() {
  cat <<PLAN
[staging] mode=$MODE
[staging] app_dir=$STAGING_APP_DIR
[staging] env_file=$STAGING_ENV
[staging] database=$STAGING_DB
[staging] port=$STAGING_PORT
[staging] host=$STAGING_HOST
[staging] service=$STAGING_SERVICE
[staging] base_url=$STAGING_BASE_URL
[staging] source_env=$SOURCE_ENV
[staging] source_node_modules=$SOURCE_NODE_MODULES
[staging] keep_existing_db=$KEEP_EXISTING_DB

This creates an internal staging instance with an isolated MySQL database.
It does not modify production database contents.
PLAN
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "[staging] missing required file: $path" >&2
    exit 1
  fi
}

require_dir() {
  local path="$1"
  if [[ ! -d "$path" ]]; then
    echo "[staging] missing required directory: $path" >&2
    exit 1
  fi
}

get_env_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$SOURCE_ENV" | tail -n 1 | cut -d '=' -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0; prefix = key "=" }
    index($0, prefix) == 1 {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "$file" > "${file}.tmp"
  cat "${file}.tmp" > "$file"
  rm -f "${file}.tmp"
}

mysql_quote_identifier() {
  printf '%s' "$1" | sed 's/`/``/g'
}

mysql_quote_string() {
  printf "%s" "$1" | sed "s/'/''/g"
}

wait_for_staging() {
  for _ in $(seq 1 30); do
    if curl --connect-timeout 2 --max-time 4 -fsS "$STAGING_BASE_URL/api/health" >/dev/null; then
      return 0
    fi
    sleep 1
  done

  echo "[staging] service did not become healthy at $STAGING_BASE_URL/api/health" >&2
  return 1
}

if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$MODE" != "--plan" && "$MODE" != "--apply" ]]; then
  usage >&2
  exit 2
fi

print_plan
require_file "$SOURCE_ENV"
require_file "dist/server.cjs"
require_file "dist/index.html"
require_dir "dist/assets"
require_dir "$SOURCE_NODE_MODULES"

if [[ "$MODE" == "--plan" ]]; then
  if [[ -z "$MYSQL_CLIENT" ]]; then
    echo "[staging] mysql client missing: mariadb/mysql not found"
  else
    echo "[staging] mysql_client=$MYSQL_CLIENT"
  fi
  if ss -ltn | awk '{print $4}' | grep -Eq "(:|\\])${STAGING_PORT}$"; then
    echo "[staging] port_status=busy"
  else
    echo "[staging] port_status=free"
  fi
  systemctl show "$STAGING_SERVICE" -p LoadState -p ActiveState -p FragmentPath --no-pager 2>/dev/null || true
  exit 0
fi

if [[ "$EUID" -ne 0 ]]; then
  exec sudo "$0" --apply
fi

if [[ -z "$MYSQL_CLIENT" ]]; then
  echo "[staging] mariadb/mysql client not found" >&2
  exit 1
fi

if [[ ! -f dist/build-info.json ]]; then
  build_info_sha="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
  build_info_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  build_info_run="${GITHUB_RUN_ID:-local}"
  cat > dist/build-info.json <<META
{
  "commitSha": "${build_info_sha}",
  "generatedAt": "${build_info_ts}",
  "source": "staging-setup-script",
  "runId": "${build_info_run}"
}
META
  echo "[staging] generated_build_info=dist/build-info.json"
fi

mysql_user="$(get_env_value MYSQL_USER)"
if [[ -z "$mysql_user" ]]; then
  echo "[staging] MYSQL_USER missing in $SOURCE_ENV" >&2
  exit 1
fi

if [[ "$KEEP_EXISTING_DB" != "true" ]]; then
  "$MYSQL_CLIENT" -e "DROP DATABASE IF EXISTS \`$(mysql_quote_identifier "$STAGING_DB")\`;"
fi

"$MYSQL_CLIENT" -e "CREATE DATABASE IF NOT EXISTS \`$(mysql_quote_identifier "$STAGING_DB")\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
"$MYSQL_CLIENT" -e "GRANT ALL PRIVILEGES ON \`$(mysql_quote_identifier "$STAGING_DB")\`.* TO '$(mysql_quote_string "$mysql_user")'@'$(mysql_quote_string "$MYSQL_GRANT_HOST")'; FLUSH PRIVILEGES;"

install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$STAGING_APP_DIR"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$STAGING_APP_DIR/dist"

rsync -a --delete dist/ "$STAGING_APP_DIR/dist/"
chown -R "$APP_USER:$APP_GROUP" "$STAGING_APP_DIR/dist"

if [[ -L "$STAGING_APP_DIR/node_modules" || -e "$STAGING_APP_DIR/node_modules" ]]; then
  rm -rf "$STAGING_APP_DIR/node_modules"
fi
ln -s "$SOURCE_NODE_MODULES" "$STAGING_APP_DIR/node_modules"
chown -h "$APP_USER:$APP_GROUP" "$STAGING_APP_DIR/node_modules"

cp "$SOURCE_ENV" "$STAGING_ENV"
set_env_value "$STAGING_ENV" MYSQL_DATABASE "$STAGING_DB"
set_env_value "$STAGING_ENV" PORT "$STAGING_PORT"
set_env_value "$STAGING_ENV" HOST "$STAGING_HOST"
set_env_value "$STAGING_ENV" WATCHDOG_ALERT_WEBHOOK ""
set_env_value "$STAGING_ENV" WATCHDOG_EXPECTED_STAFF_COUNT "$STAGING_EXPECTED_STAFF_COUNT"
chown "$APP_USER:$APP_GROUP" "$STAGING_ENV"
chmod 0600 "$STAGING_ENV"

cat > "/etc/systemd/system/$STAGING_SERVICE" <<UNIT
[Unit]
Description=MadridLive App Staging
After=network.target mariadb.service

[Service]
Type=simple
WorkingDirectory=$STAGING_APP_DIR
Environment=NODE_ENV=production
EnvironmentFile=$STAGING_ENV
ExecStart=/usr/bin/node $STAGING_APP_DIR/dist/server.cjs
Restart=always
RestartSec=5
User=$APP_USER
Group=$APP_GROUP
MemoryHigh=256M
MemoryMax=512M
MemorySwapMax=1G
OOMPolicy=stop

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$STAGING_SERVICE"
systemctl restart "$STAGING_SERVICE"

wait_for_staging

admin_token="$(grep -E '^ADMIN_API_TOKEN=' "$STAGING_ENV" | tail -n 1 | cut -d '=' -f2-)"
if [[ -z "$admin_token" ]]; then
  echo "[staging] ADMIN_API_TOKEN missing in staging env" >&2
  exit 1
fi

curl --connect-timeout 3 --max-time 20 -fsS \
  -X POST \
  -H "x-admin-token: $admin_token" \
  "$STAGING_BASE_URL/api/mysql/reset-initial" >/dev/null

curl --connect-timeout 3 --max-time 10 -fsS "$STAGING_BASE_URL/api/mysql/schema-check" | grep -q '"success":true'

echo "[staging] setup=ok"
echo "[staging] service=$STAGING_SERVICE"
echo "[staging] base_url=$STAGING_BASE_URL"
echo "[staging] database=$STAGING_DB"
