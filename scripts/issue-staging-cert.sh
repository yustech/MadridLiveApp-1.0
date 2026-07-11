#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---plan}"
STAGING_DOMAIN="${STAGING_DOMAIN:-staging.inmosubastas.top}"
ACME_ROOT="${ACME_ROOT:-/var/www/letsencrypt}"
CERT_PATH="${CERT_PATH:-/etc/letsencrypt/live/$STAGING_DOMAIN/fullchain.pem}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<USAGE
Usage: $0 [--plan|--issue]

Environment overrides:
  STAGING_DOMAIN=$STAGING_DOMAIN
  ACME_ROOT=$ACME_ROOT
  LETSENCRYPT_EMAIL=<optional contact email>
USAGE
}

certbot_status() {
  if command -v certbot >/dev/null 2>&1; then
    echo "installed"
  else
    echo "missing"
  fi
}

cert_status() {
  if [[ -f "$CERT_PATH" ]]; then
    echo "present"
  else
    echo "missing"
  fi
}

print_plan() {
  local cloudflare_a
  local google_a
  local email_status="unset"

  cloudflare_a="$(dig +short A "$STAGING_DOMAIN" @1.1.1.1 2>/dev/null | paste -sd ',' - || true)"
  google_a="$(dig +short A "$STAGING_DOMAIN" @8.8.8.8 2>/dev/null | paste -sd ',' - || true)"
  if [[ -n "${LETSENCRYPT_EMAIL:-}" ]]; then
    email_status="configured"
  fi

  cat <<PLAN
[staging-cert] mode=$MODE
[staging-cert] domain=$STAGING_DOMAIN
[staging-cert] acme_root=$ACME_ROOT
[staging-cert] certbot=$(certbot_status)
[staging-cert] certificate=$(cert_status)
[staging-cert] public_dns_1_1_1_1=${cloudflare_a:-<none>}
[staging-cert] public_dns_8_8_8_8=${google_a:-<none>}
[staging-cert] letsencrypt_email=$email_status
PLAN
}

if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$MODE" != "--plan" && "$MODE" != "--issue" ]]; then
  usage >&2
  exit 2
fi

print_plan

if [[ "$MODE" == "--plan" ]]; then
  exit 0
fi

if [[ "$EUID" -ne 0 ]]; then
  exec sudo \
    STAGING_DOMAIN="$STAGING_DOMAIN" \
    ACME_ROOT="$ACME_ROOT" \
    LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}" \
    "$0" --issue
fi

if ! command -v certbot >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y certbot
fi

install -d -m 0755 "$ACME_ROOT"

account_args=(--agree-tos --non-interactive)
if [[ -n "${LETSENCRYPT_EMAIL:-}" ]]; then
  account_args+=(--email "$LETSENCRYPT_EMAIL" --no-eff-email)
else
  account_args+=(--register-unsafely-without-email)
fi

certbot certonly \
  --webroot \
  -w "$ACME_ROOT" \
  -d "$STAGING_DOMAIN" \
  --keep-until-expiring \
  "${account_args[@]}"

"$SCRIPT_DIR/setup-staging-public.sh" --apply

echo "[staging-cert] issue=ok"
echo "[staging-cert] domain=$STAGING_DOMAIN"
