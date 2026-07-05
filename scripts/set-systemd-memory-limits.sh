#!/usr/bin/env bash
set -euo pipefail

apply=false
service_name="${SERVICE_NAME:-madridlive-app.service}"
memory_high="${MEMORY_HIGH:-256M}"
memory_max="${MEMORY_MAX:-512M}"
memory_swap_max="${MEMORY_SWAP_MAX:-1G}"
override_dir="/etc/systemd/system/${service_name}.d"
override_file="${override_dir}/10-memory-limits.conf"

for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --plan|--dry-run) apply=false ;;
    *) echo "Unknown arg: $arg"; exit 2 ;;
  esac
done

echo "mode=$([[ "$apply" == true ]] && echo apply || echo plan)"
echo "service_name=$service_name"
echo "memory_high=$memory_high"
echo "memory_max=$memory_max"
echo "memory_swap_max=$memory_swap_max"
echo "override_file=$override_file"

cat <<CONF
[Service]
MemoryHigh=$memory_high
MemoryMax=$memory_max
MemorySwapMax=$memory_swap_max
OOMPolicy=stop
CONF

if [[ "$apply" != true ]]; then
  echo "To apply: npm run ops:systemd:apply"
  exit 0
fi

sudo mkdir -p "$override_dir"
cat <<CONF | sudo tee "$override_file" >/dev/null
[Service]
MemoryHigh=$memory_high
MemoryMax=$memory_max
MemorySwapMax=$memory_swap_max
OOMPolicy=stop
CONF

sudo systemctl daemon-reload
sudo systemctl restart "$service_name"
sudo systemctl is-active --quiet "$service_name"

sudo systemctl show "$service_name" -p MemoryCurrent -p MemoryHigh -p MemoryMax -p MemorySwapMax -p DropInPaths
