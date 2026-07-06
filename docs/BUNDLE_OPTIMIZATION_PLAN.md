# Bundle Optimization Plan

## Current Signal

Recent builds report a large JS chunk (`dist/assets/index-*.js`) above Vite's default warning threshold.

## Goal

Reduce initial payload for first paint while preserving the current UX and CI/deploy stability.

## Step-by-Step Plan

1. Baseline current bundle profile
- Run `npm run build` and capture asset sizes from output.
- Save output in PR description for before/after comparison.

2. Split route/screen-level code
- Lazy-load high-cost screens mounted from `App.tsx` (for example KPIs and DB manager paths).
- Keep critical navigation shell eagerly loaded.

3. Isolate chart/math heavy logic
- Move heavy chart helpers into modules imported only inside KPI screen.
- Avoid pulling dashboard/KPI rendering utilities into the default entry chunk.

4. Review icon import strategy
- Keep using `lucide-react` named imports and avoid wildcard exports.
- Validate tree-shaking in production build output.

5. Evaluate vendor chunk policy
- Add `build.rollupOptions.output.manualChunks` only if route-level lazy loading is insufficient.
- Start with `react-vendor` and screen-specific chunks.

6. Guardrail in CI
- Add a non-blocking size check warning when main JS grows above an agreed threshold.
- Log top 5 largest emitted assets per build.

## Acceptance Criteria

- Main entry JS reduced by at least 15% from the recorded baseline.
- No regression in `npm run build` and deploy workflows.
- No change in functional behavior of scanner/history/deploy canaries.
