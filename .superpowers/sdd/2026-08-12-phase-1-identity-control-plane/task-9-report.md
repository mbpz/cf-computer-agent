# Task 9 report: Access smoke and operations

## Delivered

- Updated `scripts/smoke.mjs` to require `MEMORY_GARDEN_ACCESS_CLIENT_ID`, `MEMORY_GARDEN_ACCESS_CLIENT_SECRET`, `MEMORY_GARDEN_TOKEN`, and `MEMORY_GARDEN_BASE_URL` before any network request. Every smoke request carries `CF-Access-Client-Id`, `CF-Access-Client-Secret`, and `Authorization: Bearer <APP_TOKEN>`.
- Kept HTTPS mandatory for remote smoke and restricted HTTP to the explicit loopback-only local opt-in. Removed the unauthenticated-health probe from automation smoke because Access correctly stops that request before it can test Worker behavior.
- Restricted smoke coverage to the automation-authorized legacy compatibility paths: health, notes, search, and chat. Tests prove no `/api/admin/*` request is made and all three test credentials are absent from output.
- Set `workers_dev: false` and `preview_urls: false` in `wrangler.jsonc`, with a local regression test. This is checked-in configuration intent, not remote dashboard confirmation.
- Added the Access-first GitHub OAuth / IdP / self-hosted application / email Allow / separate Service Auth / audience / secrets / D1 / deployment / rollback runbook at `docs/operations/access-setup.md`.
- Updated smoke, rollback, README, and roadmap documentation to preserve D1 and Durable Object state on rollback and explicitly separate local evidence from pending remote validation.

## Verification

- RED then GREEN: `rtk npm run test:smoke`
  - 4 smoke-contract tests passed: HTTP restriction, workers.dev/preview configuration, missing credentials before network, and service-token-header/redaction/legacy-path behavior.
- `rtk npm run check` passed on the task tree:
  - generated types current;
  - TypeScript passed;
  - 4 smoke contracts, 121 unit tests, and 80 workerd tests passed;
  - Wrangler dry build passed with D1, Durable Object, AI, and asset bindings.
- `rtk git diff --check` passed.
- `rtk npm audit --omit=dev` passed after the initially sandbox-blocked registry lookup was retried with read-only network permission: `found 0 vulnerabilities`.

The workerd suite prints expected corrupt-journal diagnostics from its intentional Durable Object recovery coverage, but exits successfully. The dry build prints its existing Workers AI remote-resource warning; it performs no deployment.

## Evidence boundary

No remote D1 migration, deployment, Access/GitHub configuration, secret write, dashboard change, or remote smoke was performed. The remote D1 database binding already present in `wrangler.jsonc` was preserved. The still-pending remote evidence is explicitly listed in `ROADMAP.md`: D1 migration/seed, GitHub IdP and Access policy behavior, bootstrap/disabled members, service-token smoke, deployed workers.dev/preview disablement, custom-domain routing, and Durable Object cross-activation recovery.
