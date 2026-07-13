#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${SRC_DIR:-$(pwd)/dist}"
DST_DIR="${DST_DIR:-/home/netiadmin/web/madridliveapp.top/public_html}"
SITE_URL="${SITE_URL:-https://madridliveapp.top}"
BACKUP_BASE="${BACKUP_BASE:-$(pwd)/deploy_backups_local}"
STRICT_NO_FIREBASE="${STRICT_NO_FIREBASE:-true}"

if [[ ! -f "$SRC_DIR/index.html" ]] || [[ ! -d "$SRC_DIR/assets" ]]; then
  echo "Build frontend missing in $SRC_DIR. Run: npm run build"
  exit 1
fi

if [[ ! -d "$DST_DIR" ]]; then
  echo "Destination web root not found: $DST_DIR"
  exit 1
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_BASE/madridliveapp.top_frontend_$TS"
mkdir -p "$BACKUP_DIR"

# Backup current live static files before replacing.
cp -a "$DST_DIR"/. "$BACKUP_DIR"/

mkdir -p "$DST_DIR/assets"
cp -a "$SRC_DIR/index.html" "$DST_DIR/index.html"
cp -a "$SRC_DIR/assets"/. "$DST_DIR/assets"/

BUNDLE="$(curl -fsS "$SITE_URL" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -n 1 || true)"
if [[ -z "$BUNDLE" ]]; then
  echo "Could not detect served JS bundle in $SITE_URL"
  exit 1
fi

BUNDLE_URL="$SITE_URL/assets/$BUNDLE"
BUNDLE_CONTENT="$(curl -fsS "$BUNDLE_URL")"

if [[ "$BUNDLE_CONTENT" != *"/api/mysql"* ]]; then
  echo "Validation failed: served bundle does not reference /api/mysql"
  echo "Bundle URL: $BUNDLE_URL"
  exit 1
fi

if [[ "$STRICT_NO_FIREBASE" == "true" ]] && [[ "$BUNDLE_CONTENT" == *"firebase"* ]]; then
  echo "Validation failed: served bundle still contains firebase references"
  echo "Bundle URL: $BUNDLE_URL"
  exit 1
fi

STAFF_COUNT="$(curl -fsS "$SITE_URL/api/mysql/staff" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write(String(a.length));});")"

echo "Frontend deploy OK"
echo "backup=$BACKUP_DIR"
echo "served_bundle=$BUNDLE"
echo "public_staff_count=$STAFF_COUNT"
