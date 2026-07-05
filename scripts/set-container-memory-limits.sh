#!/usr/bin/env bash
set -euo pipefail

apply=false

containers=(
  "n8n-n8n-1:768m"
  "openclaw-openclaw-gateway-1:1024m"
  "n8n-task-runners-1:256m"
)

for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --plan|--dry-run) apply=false ;;
    *) echo "Unknown arg: $arg"; exit 2 ;;
  esac
done

echo "mode=$([[ "$apply" == true ]] && echo apply || echo plan)"

if ! sudo docker ps --format '{{.Names}}' >/dev/null 2>&1; then
  echo "docker not available or permission denied"
  exit 1
fi

for item in "${containers[@]}"; do
  name="${item%%:*}"
  limit="${item##*:}"

  if ! sudo docker ps --format '{{.Names}}' | grep -qx "$name"; then
    echo "skip=$name reason=not-running"
    continue
  fi

  if [[ "$apply" == true ]]; then
    sudo docker update --memory "$limit" --memory-swap "$limit" "$name" >/dev/null
    echo "updated=$name memory=$limit"
  else
    echo "plan=$name memory=$limit"
  fi
done

echo "current_container_memory:"
sudo docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}'
