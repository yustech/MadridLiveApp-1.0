# Copilot instructions for MadridLiveApp-1.0

Full project context (architecture, UI conventions, data rules) lives in
[`AGENTS.md`](../AGENTS.md) at the repo root — read it first. This file only
adds the critical operational rules that must never regress, so they're
visible regardless of which instruction file a given tool prioritizes.

## Critical: production network binding (incident 2026-07-12)

`server.ts` binds with `HOST = process.env.HOST || "0.0.0.0"`. Production's
`/opt/madridlive-app/.env` was missing `HOST`, so the backend defaulted to
`0.0.0.0` and was reachable directly on the public IP at port 3000 —
unencrypted, bypassing nginx/TLS, including `/api/auth/login`.

Rules going forward:

- Production and staging `.env` files **must** set `HOST=127.0.0.1`. Do not
  remove this, do not change the `server.ts` default to `0.0.0.0`.
- `.env.example` documents `HOST` — when scaffolding a new environment,
  copy every var, don't skip ones that look optional.
- If a change touches `server.ts` startup, the systemd units, or any `.env`,
  verify exposure before calling it done:
  `curl -m 5 -o /dev/null -w "%{http_code}\n" http://82.223.139.217:3000/`
  should time out / refuse — not return `200`.
- Full incident writeup: `docs/PRODUCTION_OBSERVABILITY.md` → "Deploy
  Incident Closure 2026-07-12".

## Other standing rules (see AGENTS.md for full detail)

- Don't commit directly to `main`; small atomic commits, staging-first
  deploys (`docs/RUNBOOK.md`).
- Never print or log secrets/tokens/`.env` values in commits, PRs, or issues.
- Deploys are release-snapshot based (`/opt/madridlive-app/releases/<ts>-<sha>`);
  the checked-out `.git` state inside `/opt/madridlive-app` itself is stale
  tooling residue, not the source of truth — don't trust `git status` there.
