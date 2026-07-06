# Release Runbook

## Scope

Operational release flow for Madrid Live Access with dual-mode deploy validation.

## Preconditions

1. `main` is green in CI.
2. Local build passes: `npm run build`.
3. No unrelated local modifications in working tree.

## Release Steps

1. Confirm target commit
- `git log --oneline -n 3`

2. Push commit(s) to `main`
- `git push origin HEAD:main`

3. Launch dual-mode validation workflow
- Run `Deploy Dual-Mode Validation` manually (or wait for schedule).

4. Verify frontend publish mode
- Job: `Deploy (publish_public_frontend=true) / deploy`
- Must finish `Success`.

5. Verify backend-only mode
- Job: `Deploy (publish_public_frontend=false) / deploy`
- Must finish `Success`.

6. Check notification job behavior
- `notify_failure` should be `skipped` on success.
- If it runs, inspect email/webhook delivery.

7. Health verification
- `https://inmosubastas.top/api/health`
- `https://inmosubastas.top/api/mysql/staff`

8. Smoke verification
- `npm run smoke:prod`

9. Record run evidence
- Save run URL and duration in ops notes.

10. Tag stable state (optional but recommended)
- `git tag -a <tag-name> <sha> -m "..."`
- `git push origin <tag-name>`

## Rollback Trigger

Rollback immediately if any deploy mode fails and cannot be remediated within the release window.

## Rollback Command Path

- Workflow: `Rollback`
- Script fallback: `npm run rollback`

## Shift Integrity Triage (409)

Use this checklist when CI or canary reports shift-integrity failures.

1. Quick regression check
- `API_BASE_URL=https://inmosubastas.top npm run test:api:shifts:regression`
- Expected flags in output: `duplicateActiveBlocked=true`, `overlapRangeBlocked=true`, `contiguousRangeAllowed=true`.

2. Validate active-shift uniqueness
- `curl -s https://inmosubastas.top/api/mysql/shifts | jq '[.[] | select(.status=="Active") | .workerId] | group_by(.) | map(select(length>1)) | length'`
- Expected: `0` (no worker with more than one active shift).

3. Interpret common backend responses
- `409 Shift conflict: worker already has an active shift.`: duplicate active protection works.
- `409 Shift conflict: overlapping time range for worker.`: overlap protection works.
- `400 Cannot activate shifts for future event ...`: future-event guard works.

4. If data drift is suspected in occupancy widgets
- Compare `/api/mysql/staff` `status=="IN"` count vs unique active workers from `/api/mysql/shifts`.
- If drift exists, run controlled reconciliation and clean duplicate active shifts before next release window.

5. Daily proactive duplicate guard
- Workflow: `Active Shift Watchdog` (scheduled daily 09:00 Europe/Madrid + manual dispatch).
- Local/manual command: `npm run ops:active-shift-watchdog`.
- Trigger expectation: any `active_shift_duplicates > 0` fails the watchdog and sends alert.

6. Manual auto-remediation (optional)
- Workflow: `Active Shift Remediation`.
- Run first in dry mode (`apply_changes=false`) to inspect duplicate plan.
- If duplicates are confirmed, re-run with `apply_changes=true`.
- Local commands:
  - `npm run ops:active-shift-remediate:dry`
  - `npm run ops:active-shift-remediate:apply`
