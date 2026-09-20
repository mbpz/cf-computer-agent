# Work Graph release-readiness local gate

- Date: 2026-09-20
- Scope: `GR-REL-01` / `WB-GR-001`
- Environment: local repository, local D1/Worker test pool, local Vite/Wrangler dry-run

## Gate results

- `npm run typecheck`: passed.
- `npm run typecheck:landing`: passed.
- `npm run test:unit`: passed.
- `npm run test:worker`: passed, including the production-shaped UI build pre-step.
- `npm run build`: passed through Vite, landing asset checks, secret scan, legacy audit, and `wrangler deploy --dry-run`.
- `npm run test:smoke`: passed: smoke/ops contracts 53/53, i18n contracts 13/13, delivery contracts 29/29.
- Targeted Graph app/delivery contracts after the Task 4 additions: 38/38.
- `git diff --check`: passed.

## Contract coverage

- Cytoscape remains behind one dynamic `GraphCanvas` import; the graph canvas has one page mount, bounded graph payloads, mobile semantic fallback, and existing lifecycle/accessibility checks.
- `/api/graph` and `/api/graph/suggestions` require `tasks:use`, derive the member from the authenticated session, reject malformed cursor usage, and keep evidence-gap suggestions read-only.
- Graph UI source remains free of `undefined` visible copy and keeps English/Chinese catalog parity.

## Boundary

- This is local readiness only. No remote migration, production deployment, production smoke, or signed browser acceptance was executed.
- The Wrangler step was `deploy --dry-run`; it did not mutate Cloudflare.
- `SECRETS_FILE` was not read, uploaded, or modified.
