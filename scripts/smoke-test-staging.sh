#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${SITE_URL:-http://127.0.0.1:3001}"
# Minimum-floor check, mirroring smoke-test-prod.sh: staging now carries the
# real roster (not the demo seed), so we only fail on catastrophic loss.
# EXPECTED_STAFF_COUNT kept as an alias for backwards compatibility.
MIN_STAFF_COUNT="${MIN_STAFF_COUNT:-${EXPECTED_STAFF_COUNT:-1}}"
EXPECTED_COMMIT_SHA="${EXPECTED_COMMIT_SHA:-}"

health_url="${SITE_URL%/}/api/health"
version_url="${SITE_URL%/}/api/version"
mysql_health_url="${SITE_URL%/}/api/mysql/health-count"

curl --connect-timeout 5 --max-time 10 -fsS "$health_url" | grep -q '"status":"ok"'
version_response="$(curl --connect-timeout 5 --max-time 10 -fsS "$version_url")"
printf '%s' "$version_response" | grep -q '"status":"ok"'
mysql_health_response="$(curl --connect-timeout 5 --max-time 10 -fsS "$mysql_health_url")"
printf '%s' "$mysql_health_response" | grep -q '"success":true'

staff_count="$(
  printf '%s' "$mysql_health_response" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.stdout.write(String(x?.counts?.staff ?? x?.staffCount ?? -1));});"
)"

if ! [[ "$MIN_STAFF_COUNT" =~ ^[0-9]+$ ]]; then
  echo "Invalid MIN_STAFF_COUNT value: $MIN_STAFF_COUNT" >&2
  exit 1
fi
if ! [[ "$staff_count" =~ ^[0-9]+$ ]]; then
  echo "Invalid staff count payload: $staff_count" >&2
  exit 1
fi
if (( staff_count < MIN_STAFF_COUNT )); then
  echo "Staff floor check failed: got $staff_count, minimum $MIN_STAFF_COUNT" >&2
  exit 1
fi

version_commit="$(
  printf '%s' "$version_response" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.stdout.write(String(x.commitSha||''));});"
)"
version_source="$(
  printf '%s' "$version_response" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.stdout.write(String(x.source||''));});"
)"

if [[ -n "$EXPECTED_COMMIT_SHA" && "$version_commit" != "$EXPECTED_COMMIT_SHA" ]]; then
  echo "Unexpected staging commit: got $version_commit, expected $EXPECTED_COMMIT_SHA" >&2
  exit 1
fi

echo "staging_smoke=ok"
echo "site_url=$SITE_URL"
echo "staff_count=$staff_count"
echo "commit_sha=$version_commit"
echo "version_source=$version_source"
