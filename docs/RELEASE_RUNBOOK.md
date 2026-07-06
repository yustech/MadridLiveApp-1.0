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
