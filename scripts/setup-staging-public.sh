#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---plan}"
STAGING_DOMAIN="${STAGING_DOMAIN:-staging.inmosubastas.top}"
PUBLIC_IP="${PUBLIC_IP:-82.223.139.217}"
STAGING_TARGET="${STAGING_TARGET:-http://127.0.0.1:3001}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/conf.d/madridlive-staging.conf}"
ACME_ROOT="${ACME_ROOT:-/var/www/letsencrypt}"
CERT_PATH="${CERT_PATH:-/etc/letsencrypt/live/$STAGING_DOMAIN/fullchain.pem}"
CERT_KEY_PATH="${CERT_KEY_PATH:-/etc/letsencrypt/live/$STAGING_DOMAIN/privkey.pem}"

usage() {
  cat <<USAGE
Usage: $0 [--plan|--apply]

Environment overrides:
  STAGING_DOMAIN=$STAGING_DOMAIN
  PUBLIC_IP=$PUBLIC_IP
  STAGING_TARGET=$STAGING_TARGET
  NGINX_CONF=$NGINX_CONF
  ACME_ROOT=$ACME_ROOT
  CERT_PATH=$CERT_PATH
  CERT_KEY_PATH=$CERT_KEY_PATH
USAGE
}

print_plan() {
  local ns_records
  local a_records
  ns_records="$(dig +short NS "${STAGING_DOMAIN#*.}" 2>/dev/null | paste -sd ',' - || true)"
  a_records="$(dig +short A "$STAGING_DOMAIN" 2>/dev/null | paste -sd ',' - || true)"

  cat <<PLAN
[staging-public] mode=$MODE
[staging-public] domain=$STAGING_DOMAIN
[staging-public] public_ip=$PUBLIC_IP
[staging-public] target=$STAGING_TARGET
[staging-public] nginx_conf=$NGINX_CONF
[staging-public] acme_root=$ACME_ROOT
[staging-public] cert_path=$CERT_PATH
[staging-public] cert_key_path=$CERT_KEY_PATH
[staging-public] authoritative_ns=${ns_records:-<none>}
[staging-public] current_a=${a_records:-<none>}
PLAN
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

if [[ "$MODE" == "--plan" ]]; then
  if [[ "$(dig +short A "$STAGING_DOMAIN" 2>/dev/null | head -n 1 || true)" == "$PUBLIC_IP" ]]; then
    echo "[staging-public] dns_status=ready"
  else
    echo "[staging-public] dns_status=missing_or_not_propagated"
  fi
  if [[ -f "$NGINX_CONF" ]]; then
    echo "[staging-public] nginx_conf_status=exists"
  else
    echo "[staging-public] nginx_conf_status=missing"
  fi
  if [[ -f "$CERT_PATH" && -f "$CERT_KEY_PATH" ]]; then
    echo "[staging-public] tls_status=certificate_present"
  else
    echo "[staging-public] tls_status=certificate_missing"
  fi
  exit 0
fi

if [[ "$EUID" -ne 0 ]]; then
  exec sudo "$0" --apply
fi

install -d -m 0755 "$ACME_ROOT"

if [[ -f "$CERT_PATH" && -f "$CERT_KEY_PATH" ]]; then
  cat > "$NGINX_CONF" <<NGINX
server {
    listen $PUBLIC_IP:80;
    server_name $STAGING_DOMAIN;

    location /.well-known/acme-challenge/ {
        root $ACME_ROOT;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen $PUBLIC_IP:443 ssl http2;
    server_name $STAGING_DOMAIN;

    ssl_certificate $CERT_PATH;
    ssl_certificate_key $CERT_KEY_PATH;

    location / {
        proxy_pass $STAGING_TARGET;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
else
  cat > "$NGINX_CONF" <<NGINX
server {
    listen $PUBLIC_IP:80;
    server_name $STAGING_DOMAIN;

    location /.well-known/acme-challenge/ {
        root $ACME_ROOT;
    }

    location / {
        proxy_pass $STAGING_TARGET;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
fi

nginx -t
systemctl reload nginx

echo "[staging-public] setup=ok"
echo "[staging-public] domain=$STAGING_DOMAIN"
echo "[staging-public] nginx_conf=$NGINX_CONF"
