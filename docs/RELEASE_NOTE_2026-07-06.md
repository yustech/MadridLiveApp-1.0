# Release Note - 2026-07-06

## Scope

Stability hardening, deploy validation, canary observability, and frontend bundle optimization for production.

## Included Changes

- Deploy workflow hardened for full and backend-only modes.
- Dual-mode validation workflow enabled with failure notifications.
- Production canaries enhanced with structured `status` and `duration_ms` logging.
- Shifts API regression script added for lifecycle and future-event guard checks.
- Runbooks added for release execution and bundle optimization strategy.
- Frontend lazy-loading introduced for main screens and DB manager modal.
- Scanner optimized with dynamic import of `html5-qrcode`.
- Manual chunking configured in Vite for `react-vendor`, `scanner-vendor`, and `icons-vendor`.
- CI guardrail added to report top JS assets and warn on size threshold breaches.

## Key Metrics (Before -> After)

- Main entry bundle: `~736 KB` -> `~30-33 KB`.
- Scanner screen chunk: `~356 KB` -> `~19 KB`.
- React vendor isolated: `~194 KB` (dedicated chunk).
- Scanner vendor isolated: `~375 KB` (loaded on demand).

## Validation Evidence

- Production smoke: OK.
- History canary: OK.
- Shifts guard canary: OK.
- Shifts API regression: OK.
- Dual deploy validation (`publish_public_frontend=true/false`): OK.
- `notify_failure` path not triggered on successful runs.

## Rollback Reference

- Optimized baseline tag: `prod-optimized-baseline-2026-07-06-196cdd4`.
- Previous hardening baseline tag: `prod-post-hardening-2026-07-06-ab69567`.

## Operational Notes

- CI bundle guardrail is non-blocking and emits warnings only.
- Threshold can be tuned with repository variable `BUNDLE_WARN_THRESHOLD_KB` (default `260`).
