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
