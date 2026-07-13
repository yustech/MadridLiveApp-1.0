#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${SITE_URL:-http://127.0.0.1:3001}"
# 7 = the 6-row demo seed + 1 staff member the owner added by hand on 2026-07-13.
EXPECTED_STAFF_COUNT="${EXPECTED_STAFF_COUNT:-7}"
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

if [[ "$staff_count" != "$EXPECTED_STAFF_COUNT" ]]; then
  echo "Unexpected staging staff count: got $staff_count, expected $EXPECTED_STAFF_COUNT" >&2
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
