#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${SITE_URL:-http://127.0.0.1:3001}"
EXPECTED_STAFF_COUNT="${EXPECTED_STAFF_COUNT:-6}"

health_url="${SITE_URL%/}/api/health"
version_url="${SITE_URL%/}/api/version"
schema_url="${SITE_URL%/}/api/mysql/schema-check"
staff_url="${SITE_URL%/}/api/mysql/staff"

curl --connect-timeout 5 --max-time 10 -fsS "$health_url" | grep -q '"status":"ok"'
curl --connect-timeout 5 --max-time 10 -fsS "$version_url" | grep -q '"status":"ok"'
curl --connect-timeout 5 --max-time 10 -fsS "$schema_url" | grep -q '"success":true'

staff_count="$(
  curl --connect-timeout 5 --max-time 10 -fsS "$staff_url" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write(String(Array.isArray(a)?a.length:-1));});"
)"

if [[ "$staff_count" != "$EXPECTED_STAFF_COUNT" ]]; then
  echo "Unexpected staging staff count: got $staff_count, expected $EXPECTED_STAFF_COUNT" >&2
  exit 1
fi

echo "staging_smoke=ok"
echo "site_url=$SITE_URL"
echo "staff_count=$staff_count"
