# Task 5 report: grounded Workers AI answer service

## Files changed

- `src/ai/answer-service.ts`: adds the mockable Workers AI boundary, grounded Chinese prompt, JSON-delimited inert source data, Unicode-safe bounded context, question validation, response normalization, and stable provider-failure mapping.
- `src/config.ts`: adds answer-service limits for questions, individual excerpts, total context, and generated answer tokens.
- `test/unit/answer-service.test.ts`: covers no-source behavior, JSON source numbering and bounds, source-instruction injection resistance, Unicode boundaries, string/object/empty response normalization, question validation, and retryable AI failures.

## TDD evidence

- RED: `rtk npx vitest run test/unit/answer-service.test.ts` failed with `Cannot find module '../../src/ai/answer-service'` before the service existed.
- GREEN: the focused suite passes 1 file and 10 tests after implementing the smallest service boundary and adding the context-limit assertions.
- Security/Unicode RED: the focused suite failed 4 of 13 tests because source data was plain text, the system prompt did not prohibit embedded instructions, and UTF-16 length rejected 4,000 emoji and could split emoji excerpts.
- Security/Unicode GREEN: the focused suite passes 1 file and 13 tests after JSON-delimiting each source and using code-point helpers for all question, excerpt, and context limits.

## Verification

- `rtk npx vitest run test/unit/answer-service.test.ts`: passed, 1 file and 13 tests.
- `rtk npm run test:unit`: passed, 5 files and 30 tests.
- `rtk npm run typecheck`: passed.
- `rtk npm run check`: passed: generated binding types, TypeScript, 30 unit tests, the currently empty Worker-test slice, and Wrangler dry deployment.
- `rtk git diff --check`: passed.

## Self-review

- `AnswerService` depends only on a narrow `AnswerAi` interface, so the future route can pass `env.AI` while tests use a deterministic fake without a provider call.
- Blank/non-text and over-limit questions fail before the no-source or AI paths; no-source answers preserve the legacy Chinese fallback and never call AI.
- The prompt now explicitly treats retrieved sources as untrusted inert data and forbids following instructions within them. Sources are JSON serialized as individually delimited objects with retained `[n]` citations, so title/excerpt text cannot escape into prompt structure.
- Each question, excerpt, and assembled serialized context is measured and truncated by Unicode code point, not UTF-16 code unit. The tests prove 4,000 emoji pass, 4,001 reject, and an odd code-point excerpt boundary never leaves a dangling surrogate.
- String and `{ response }` results are trimmed; blank, missing, or malformed results use the legacy empty-model fallback. Provider errors expose only stable retryable `AI_UNAVAILABLE` and no prompt or source content is logged.

## Sequencing note and concerns

- Task 5 deliberately does not wire routes. Task 6 must instantiate `AnswerService` with `env.AI` and keep the existing `/api/chat` response shape.
- Local test/build tooling emits the existing informational Workers AI binding warning. The task made no remote AI request, deployment, or provider-health claim.
