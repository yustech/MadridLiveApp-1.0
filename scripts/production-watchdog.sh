#!/usr/bin/env bash
set -euo pipefail

site_url="${WATCHDOG_SITE_URL:-${DEPLOY_URL:-https://inmosubastas.top}}"
health_url="${WATCHDOG_HEALTH_URL:-$site_url/api/health}"
staff_url="${WATCHDOG_STAFF_URL:-$site_url/api/mysql/staff}"
expected_staff_count="${WATCHDOG_EXPECTED_STAFF_COUNT:-9}"
alert_webhook="${WATCHDOG_ALERT_WEBHOOK:-${DEPLOY_ALERT_WEBHOOK:-}}"
alert_contact="${WATCHDOG_ALERT_CONTACT:-cyuste@gmail.com}"
service_name="${WATCHDOG_SERVICE_NAME:-madridlive-app.service}"

notify_failure() {
  local message="$1"

  logger -t madridlive-watchdog -p daemon.err "$message" || true

  if [[ -n "$alert_webhook" ]]; then
    curl --connect-timeout 3 --max-time 10 --fail -sS \
      -H 'Content-Type: application/json' \
      -d "$(printf '{"text":"%s"}' "${message//"/\\"}")" \
      "$alert_webhook" >/dev/null || true
  fi
}

check_health() {
  local response
  response="$(curl --connect-timeout 3 --max-time 10 --fail -sS "$health_url")"
  printf '%s' "$response" | grep -q '"status":"ok"' || {
    notify_failure "[madridlive-watchdog] health check failed for $service_name at $health_url"
    printf '%s\n' "health response: $response" >&2
    exit 1
  }
}

check_staff() {
  local response count
  response="$(curl --connect-timeout 3 --max-time 10 --fail -sS "$staff_url")"
  count="$(printf '%s' "$response" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s);process.stdout.write(String(Array.isArray(a)?a.length:-1));}catch{process.stdout.write('-1');}})")"

  if [[ "$count" != "$expected_staff_count" ]]; then
    notify_failure "[madridlive-watchdog] staff count check failed for $service_name at $staff_url (expected $expected_staff_count, got $count; contact $alert_contact)"
    printf '%s\n' "staff response: $response" >&2
    exit 1
  fi
}

check_health
check_staff

logger -t madridlive-watchdog -p daemon.info "[madridlive-watchdog] checks passed for $service_name"
