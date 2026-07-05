#!/usr/bin/env bash
set -euo pipefail

apply=false
swap_file="${SWAP_FILE:-/swapfile_madridlive}"
swap_size_gb="${SWAP_SIZE_GB:-4}"
swappiness="${SWAPPINESS:-15}"
vfs_cache_pressure="${VFS_CACHE_PRESSURE:-100}"

for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --plan|--dry-run) apply=false ;;
    *) echo "Unknown arg: $arg"; exit 2 ;;
  esac
done

if ! [[ "$swap_size_gb" =~ ^[0-9]+$ ]] || [[ "$swap_size_gb" -lt 1 ]]; then
  echo "SWAP_SIZE_GB must be a positive integer"
  exit 2
fi

if ! [[ "$swappiness" =~ ^[0-9]+$ ]] || [[ "$swappiness" -gt 100 ]]; then
  echo "SWAPPINESS must be 0-100"
  exit 2
fi

if ! [[ "$vfs_cache_pressure" =~ ^[0-9]+$ ]] || [[ "$vfs_cache_pressure" -gt 1000 ]]; then
  echo "VFS_CACHE_PRESSURE must be 0-1000"
  exit 2
fi

echo "swap_file=$swap_file"
echo "swap_size_gb=$swap_size_gb"
echo "swappiness=$swappiness"
echo "vfs_cache_pressure=$vfs_cache_pressure"

echo "current_swaps:"
sudo swapon --show || true

if [[ "$apply" != true ]]; then
  echo "mode=plan"
  echo "To apply: npm run ops:swap:apply"
  exit 0
fi

if sudo swapon --show | grep -q "$swap_file"; then
  echo "swap already active on $swap_file"
else
  if sudo test -f "$swap_file"; then
    echo "swap file exists; reusing $swap_file"
  else
    echo "creating swap file $swap_file (${swap_size_gb}G)"
    sudo fallocate -l "${swap_size_gb}G" "$swap_file" || sudo dd if=/dev/zero of="$swap_file" bs=1M count="$((swap_size_gb * 1024))" status=progress
  fi

  sudo chmod 600 "$swap_file"
  sudo mkswap "$swap_file"
  sudo swapon "$swap_file"
fi

if ! grep -q "^[^#]*[[:space:]]$swap_file[[:space:]]" /etc/fstab; then
  echo "persisting swap in /etc/fstab"
  echo "$swap_file none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

cat <<SYSCTL | sudo tee /etc/sysctl.d/99-madridlive-memory.conf >/dev/null
vm.swappiness=$swappiness
vm.vfs_cache_pressure=$vfs_cache_pressure
SYSCTL

sudo sysctl --system >/dev/null

echo "mode=apply"
echo "final_swaps:"
sudo swapon --show
free -h
