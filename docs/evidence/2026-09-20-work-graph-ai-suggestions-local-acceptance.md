# Work Graph AI suggestions local acceptance

- Date: 2026-09-20
- Scope: `GR-AI-01` / `WB-GR-001`
- Environment: local Worker test pool and local Vite build only

## Verified

- `test/unit/graph-ai-suggestions.test.ts` and `test/worker/graph-suggestions.test.ts`: 5/5 focused tests passed.
- AI output is strict JSON-only, capped at 8 suggestions, and bounded by a 5-second timeout.
- Supported suggestion atoms are `meeting_to_decision`, `decision_to_action_item`, and `task_to_knowledge`.
- Every returned suggestion has `citationIds`, an explicit `evidenceGap` state, and `promotionRequired: true`.
- Unknown citations, unknown node ids, malformed payloads, invalid pair kinds, duplicate provider ids, and provider failures are rejected; provider failures map to retryable `AI_UNAVAILABLE`.
- `/api/graph/suggestions` derives the member from the authenticated session, reuses the member-scoped graph projection, and performs no write or promotion mutation.
- The Graph page exposes a manual “Generate suggestions” action, localized English/Chinese copy, loading/error/empty states, evidence-gap badges, and no automatic write action.
- `npm run typecheck`, `npm run typecheck:landing`, `npm run build:ui`, i18n verification, frontend Graph regression tests (28/28), app/delivery contracts (36/36), and `git diff --check` passed.

## Red-run evidence

The initial focused run failed as expected before implementation: the adapter module was missing and the worker fixture exposed a foreign-key seed-order error. The fixture and implementation were then corrected before the passing run above.

## Boundary

- No D1 migration was added.
- No production migration, deployment, remote smoke, or browser acceptance was executed.
- `SECRETS_FILE` was not read, uploaded, or modified.
- Suggestions are display-only; user promotion remains a future explicit mutation flow.
