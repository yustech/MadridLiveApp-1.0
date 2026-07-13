# Production Observability

This checklist keeps production verification simple and repeatable for Madrid Live Access.

## External Health Monitor

Set up an external HTTP monitor on:

- `https://madridliveapp.top/api/health`
## Internal Watchdog

Production also runs a local systemd watchdog every 5 minutes:

- `madridlive-watchdog.timer`
- `madridlive-watchdog.service`

It checks both:

- `https://madridliveapp.top/api/health`
- `https://madridliveapp.top/api/mysql/health-count`

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

## Monitorización activa (estado tras la consolidación 2026-07-12)

**El único monitor de producción activo es el watchdog systemd** (`madridlive-watchdog.timer`, cada 5 min). Comprueba tres cosas:

- **Salud**: `/api/health` devuelve `{"status":"ok"}`.
- **Memoria**: `MemAvailable` por encima de `WATCHDOG_MIN_MEMAVAILABLE_KIB` (default 512 MiB).
- **Staff (suelo, no exacto)**: `/api/mysql/health-count` responde con `counts.staff` ≥ `WATCHDOG_MIN_STAFF_COUNT` (default 1). No expone filas ni datos personales y no es un conteo exacto de validacion funcional: tolera que la plantilla crezca. Ver el incidente del conteo exacto más abajo.

Los **workflows programados de GitHub Actions están desactivados** (schedule quitado, solo `workflow_dispatch`) desde 2026-07-12, porque la app aún no está en uso real y duplicaban este watchdog o presuponían operación en vivo. Detalle y justificación por workflow en `docs/CI_CONSOLIDATION_PLAN.md`. `health-audit.yml` se eliminó por redundancia total con el watchdog.

### Runbook: reactivar monitorización al go-live

Cuando la app entre en uso real (personal y eventos reales), reactivar reponiendo el bloque `schedule:` (cada workflow lleva su cron original en un comentario `RE-ENABLE`):

1. `active-shift-watchdog.yml` — integridad de turnos activos duplicados (requiere fichajes reales).
2. `ops-weekly-integrity-report.yml` — KPI de deriva de ocupación (requiere ocupación real).
3. Reconsiderar `e2e-prod-nightly.yml` / `e2e-staging-nightly.yml` y `ops-watchdog.yml` según haga falta.
4. Revisar `WATCHDOG_MIN_STAFF_COUNT` en `/opt/madridlive-app/.env`: subirlo de 1 a un suelo realista (p. ej. un mínimo por debajo de la plantilla habitual) si se quiere detectar pérdidas parciales, no solo el vaciado total.

## Release Verification

After each deploy, verify:

1. `npm run smoke:prod`
2. `https://madridliveapp.top/api/health`
3. `https://madridliveapp.top/api/version`
4. `https://madridliveapp.top/api/mysql/health-count`
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
2. Check the MySQL health-count endpoint.
3. Compare the current bundle name with the one in the last successful deploy.
4. If needed, run rollback immediately.

## Maintenance Cadence

- Weekly: smoke test production and confirm the external monitor is UP.
- Monthly: run a rollback drill.
- After every deploy: verify health, version, MySQL health-count, and bundle target.

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

- Root cause 1: UI canaries were still running when `publish_public_frontend=false` in the old static-frontend architecture, but public `index.html` could point to non-published hashed assets, causing blank page and selector timeouts.
- Root cause 2: Frontend publish path removed `public_html/assets` (`rm -rf`) and failed in some hosts due to ownership/permission mismatch.
- Root cause 3: `e2e-shifts-guard-canary` used date assumptions that were sensitive to runtime day-boundary/timezone and event catalog composition.

Fixes applied:

- Deploy workflow gates UI canaries behind `inputs.publish_public_frontend == 'true'`.
- Frontend publish uses additive copy (`mkdir -p` + `cp -a`) and no longer deletes `assets`.
- Shifts guard canary now discovers allowed/future events by API behavior (`201` vs `400 future event`) and tolerates environments without canonical timestamp fields.

Validation runs:

- Deploy success (`publish_public_frontend=true`): https://github.com/yustech/MadridLiveApp-1.0/actions/runs/28764537338
- Deploy success (`publish_public_frontend=false`): https://github.com/yustech/MadridLiveApp-1.0/actions/runs/28764609900

Historical operational takeaway:

- This applied to the retired static-frontend architecture. In the current full-proxy architecture, `publish_public_frontend=false` is the normal deploy mode and post-deploy UI canaries should run.
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

## Deploy Incident Closure 2026-07-12

Summary: production backend was reachable directly from the public internet,
unencrypted, bypassing nginx/TLS entirely.

- Root cause: an older `server.ts` defaulted `HOST` to `0.0.0.0` when the env
  var was unset. Staging's `.env` set `HOST=127.0.0.1` explicitly; production's
  `.env` never set it, so prod fell back to binding all interfaces.
- Impact confirmed live: the host's public IP on port 3000 served the full
  app directly — including `/api/auth/login` — over plain HTTP, with none of
  the protections the public vhost provides (TLS, domain
  routing, and only the `/api/` path proxied). The app has no
  `helmet`/rate-limiting of its own, so this was the only layer of defense
  and it was bypassable. (Exact reproduction details intentionally omitted
  from this public repo; ask an operator with server access if needed.)
- Fix applied: added `HOST=127.0.0.1` to `/opt/madridlive-app/.env`
  (matching staging), then restarted `madridlive-app.service` (SIGTERM to
  let `Restart=always` relaunch it, since non-interactive `sudo systemctl
  restart` isn't available in this shell — see `DEPLOY_RESTART_STRATEGY` in
  `DEPLOY.md`).
- Validation: `ss -tlnp` shows the app now listening on `127.0.0.1:3000`
  only, no longer reachable from the public IP; `https://madridliveapp.top/api/health`
  and `http://127.0.0.1:3000/api/health` both still return `{"status":"ok"}`.

Operational takeaway — **read this before touching `HOST`, deploy scripts, or
any production `.env`**:

- Production `.env` MUST always set `HOST=127.0.0.1`. Never remove this line
  or rely only on the `server.ts` default. The current default is also
  `127.0.0.1`, but explicit `.env` is the operational guardrail.
- `.env.example` now documents `HOST` for this reason — copy it into any new
  environment's `.env` verbatim, don't skip vars that "look optional."
- If you ever need the backend reachable directly from outside `127.0.0.1`
  (e.g. a health-check appliance on another host), do it via an explicit
  firewall allowlist rule, not by rebinding the app to `0.0.0.0`.
- After any change to `.env`, `server.ts` startup, or the systemd unit,
  re-run the external-exposure check from a shell on the box (use the
  server's own public IP, not a value hardcoded here):
  `curl -m 5 -o /dev/null -w "%{http_code}\n" http://$(curl -s ifconfig.me):3000/`
  — anything other than a timeout/refused connection is a regression of
  this incident.
