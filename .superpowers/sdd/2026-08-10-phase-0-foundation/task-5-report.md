# Task 5 report: grounded Workers AI answer service

## Files changed

- `src/ai/answer-service.ts`: adds the mockable Workers AI boundary, grounded Chinese prompt, bounded source context, question validation, response normalization, and stable provider-failure mapping.
- `src/config.ts`: adds answer-service limits for questions, individual excerpts, total context, and generated answer tokens.
- `test/unit/answer-service.test.ts`: covers no-source behavior, source numbering, model request bounds, string/object/empty response normalization, question validation, and retryable AI failures.

## TDD evidence

- RED: `rtk npx vitest run test/unit/answer-service.test.ts` failed with `Cannot find module '../../src/ai/answer-service'` before the service existed.
- GREEN: the focused suite passes 1 file and 10 tests after implementing the smallest service boundary and adding the context-limit assertions.

## Verification

- `rtk npx vitest run test/unit/answer-service.test.ts`: passed, 1 file and 10 tests.
- `rtk npm run test:unit`: passed, 5 files and 27 tests.
- `rtk npm run typecheck`: passed.
- `rtk npm run check`: passed: generated binding types, TypeScript, 27 unit tests, the currently empty Worker-test slice, and Wrangler dry deployment.
- `rtk git diff --check`: passed.

## Self-review

- `AnswerService` depends only on a narrow `AnswerAi` interface, so the future route can pass `env.AI` while tests use a deterministic fake without a provider call.
- Blank/non-text and over-limit questions fail before the no-source or AI paths; no-source answers preserve the legacy Chinese fallback and never call AI.
- The prompt preserves the existing grounded system instruction and source labels. Each excerpt is capped at 1,200 characters and the assembled context at 8,000 characters.
- String and `{ response }` results are trimmed; blank, missing, or malformed results use the legacy empty-model fallback. Provider errors expose only stable retryable `AI_UNAVAILABLE` and no prompt or source content is logged.

## Sequencing note and concerns

- Task 5 deliberately does not wire routes. Task 6 must instantiate `AnswerService` with `env.AI` and keep the existing `/api/chat` response shape.
- Local test/build tooling emits the existing informational Workers AI binding warning. The task made no remote AI request, deployment, or provider-health claim.
