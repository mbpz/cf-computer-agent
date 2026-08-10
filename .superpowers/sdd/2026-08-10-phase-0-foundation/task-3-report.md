# Task 3 report: stable HTTP errors and authentication

## Files changed

- `src/http.ts`: adds `AppError`, request contexts, safe JSON responses, and stable JSON error responses carrying a request ID and security headers.
- `src/auth.ts`: adds the widened `AuthEnvironment` contract and async SHA-256 digest comparison for bearer credentials; absent secrets fail closed except for the explicit local-only `"true"` opt-in.
- `test/unit/auth.test.ts`: covers configured-token success, missing/incorrect credentials, missing-secret failure, and explicit insecure-local mode.
- `test/unit/http.test.ts`: covers the public error-response status, request-ID header and body, stable fields, and security headers.

## TDD evidence

- Auth test RED: `rtk npx vitest run test/unit/auth.test.ts` failed with `Cannot find module '../../src/auth'` before `src/auth.ts` existed.
- HTTP test RED: `rtk npx vitest run test/unit/http.test.ts` failed with `Cannot find module '../../src/http'` before `src/http.ts` existed.
- GREEN: focused auth/HTTP run passed 2 files and 5 tests; unit suite passed 3 files and 9 tests.

## Full verification

- `rtk npm run typecheck`: passed.
- `rtk npm run check`: passed: generated binding-type check, TypeScript, 9 unit tests, empty Worker-test slice, and Wrangler dry deployment.
- `rtk git diff --check`: passed.

## Self-review

- `AuthEnvironment` deliberately uses `ALLOW_INSECURE_LOCAL?: string`; it does not narrow or falsify generated deployment `Env`, which truthfully keeps the configured value literal `"false"`.
- Both supplied and configured tokens are always SHA-256 digested before equality comparison, including different lengths; the comparison iterates across the complete equal-size digest.
- Error responses expose only stable `code`, `message`, `retryable`, and `requestId` fields. They do not serialize error stacks.
- No runtime secret value was added to source, configuration, scripts, or this report.

## Concerns

- The global check retains Wrangler's existing informational warning about the AI binding. No remote deployment or remote verification was performed.
- API route integration is intentionally deferred to later tasks; Task 3 supplies the contracts only.
