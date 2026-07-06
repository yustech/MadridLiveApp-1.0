# Production Observability

This checklist keeps production verification simple and repeatable for Madrid Live Access.

## External Health Monitor

Set up an external HTTP monitor on:

- `https://inmosubastas.top/api/health`
## Internal Watchdog

Production also runs a local systemd watchdog every 5 minutes:

- `madridlive-watchdog.timer`
- `madridlive-watchdog.service`

It checks both:

- `https://inmosubastas.top/api/health`
- `https://inmosubastas.top/api/mysql/staff`

If a check fails, it logs an error to journald and, when configured, can send a webhook alert via `WATCHDOG_ALERT_WEBHOOK` or `DEPLOY_ALERT_WEBHOOK`.

Recommended settings:

- Monitor type: `HTTP(s)`
- Check interval: 5 minutes
- Timeout: 10 seconds
- Failures before alert: 2 or 3
- Alert contacts: `cyuste@gmail.com`

Expected response:

- HTTP 200
- Body contains `{"status":"ok"}`

## Release Verification

After each deploy, verify:

1. `npm run smoke:prod`
2. `https://inmosubastas.top/api/health`
3. `https://inmosubastas.top/api/version`
4. `https://inmosubastas.top/api/mysql/staff`
5. The public bundle should reference `/api/mysql`

## Rollback Drill

Run a rollback drill periodically:

1. Pick a known-good release snapshot.
2. Run `npm run rollback` or the GitHub Actions `Rollback` workflow.
3. Re-run `npm run smoke:prod`.
4. Confirm the UI still shows 6 members.
5. Confirm the bundle still points to `/api/mysql`.

## Incident Response

If health fails:

1. Check the public version endpoint.
2. Check the staff endpoint.
3. Compare the current bundle name with the one in the last successful deploy.
4. If needed, run rollback immediately.

## Maintenance Cadence

- Weekly: smoke test production and confirm the external monitor is UP.
- Monthly: run a rollback drill.
- After every deploy: verify health, version, staff count, and bundle target.

## Memory Pressure Hardening

To reduce host-level hangs caused by low available RAM:

1. Plan swap setup:
   ```bash
   npm run ops:swap:plan
   ```
2. Apply swap setup (idempotent):
   ```bash
   npm run ops:swap:apply
   ```
3. Plan Docker memory limits:
   ```bash
   npm run ops:containers:plan
   ```
4. Apply Docker memory limits:
   ```bash
   npm run ops:containers:apply
   ```

Notes:

- Swap script creates and enables `/swapfile_madridlive` (default 4G).
- It persists swap in `/etc/fstab` and writes `/etc/sysctl.d/99-madridlive-memory.conf`.
- Watchdog now checks `MemAvailable` before staff check.
- Tune threshold with `WATCHDOG_MIN_MEMAVAILABLE_KIB` (default `524288`, i.e. 512 MiB).

Verification:

1. Check active swap:
   ```bash
   sudo swapon --show
   free -h
   ```
2. Check watchdog logs for memory alerts:
   ```bash
   sudo journalctl -u madridlive-watchdog.service --since '2 hours ago' --no-pager
   ```
3. Confirm container limits:
   ```bash
   sudo docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}'
   ```

## Systemd Service Memory Limits

Add service-level memory guardrails for the app process:

1. Review planned override:
   ```bash
   npm run ops:systemd:plan
   ```
2. Apply override and restart service:
   ```bash
   npm run ops:systemd:apply
   ```

Defaults applied by script:

- `MemoryHigh=256M`
- `MemoryMax=512M`
- `MemorySwapMax=1G`
- `OOMPolicy=stop`

To tune values for your host:

```bash
MEMORY_HIGH=320M MEMORY_MAX=640M MEMORY_SWAP_MAX=2G npm run ops:systemd:apply
```

Post-check:

```bash
sudo systemctl show madridlive-app.service -p MemoryCurrent -p MemoryHigh -p MemoryMax -p MemorySwapMax -p DropInPaths
```

## Deploy Incident Closure 2026-07-06

Summary of production deploy instability and final remediation:

- Root cause 1: UI canaries were still running when `publish_public_frontend=false`, but public `index.html` could point to non-published hashed assets, causing blank page and selector timeouts.
- Root cause 2: Frontend publish path removed `public_html/assets` (`rm -rf`) and failed in some hosts due to ownership/permission mismatch.
- Root cause 3: `e2e-shifts-guard-canary` used date assumptions that were sensitive to runtime day-boundary/timezone and event catalog composition.

Fixes applied:

- Deploy workflow gates UI canaries behind `inputs.publish_public_frontend == 'true'`.
- Frontend publish uses additive copy (`mkdir -p` + `cp -a`) and no longer deletes `assets`.
- Shifts guard canary now discovers allowed/future events by API behavior (`201` vs `400 future event`) and tolerates environments without canonical timestamp fields.

Validation runs:

- Deploy success (`publish_public_frontend=true`): https://github.com/yustech/MadridLiveApp-1.0/actions/runs/28764537338
- Deploy success (`publish_public_frontend=false`): https://github.com/yustech/MadridLiveApp-1.0/actions/runs/28764609900

Operational takeaway:

- Treat `publish_public_frontend=false` as backend-only mode; do not run UI Playwright canaries in this mode.
- Avoid destructive cleanup in shared `public_html` trees unless ownership is guaranteed.

## Weekly Integrity KPI Report

A weekly KPI report now runs in GitHub Actions to track occupancy integrity drift.

- Workflow: `Ops Weekly Integrity Report`
- Schedule: every Monday at 09:15 Europe/Madrid (DST-safe gate)
- Manual run: `workflow_dispatch`
- Local command: `npm run ops:weekly-integrity-report`

KPI thresholds (enforced in workflow):

- `active_shift_duplicates` must be `0`
- `occupancy_drift_vs_unique_active` must be `0`

Any threshold breach marks the run as failed and triggers configured email/webhook notifications.
