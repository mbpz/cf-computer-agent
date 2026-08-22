# Task 8 Implementation Report

Date: 2026-08-23

## Outcome

Implemented owner-only My Submissions status filtering and complete authenticated-workspace localization for `zh-CN` and `en`. The two milestone checklist boxes remain unchecked; their status text now records local/worktree evidence only.

## RED evidence

- Added the real-D1 owner/status pagination contract first. The focused worker test failed because rows from statuses other than the requested status leaked into the page.
- Added the locale engine contract first. The Node contract test failed because `public/i18n.js` did not exist.
- Added the static localization contract first. It failed because `scripts/verify-i18n.mjs` did not exist.
- Added locale-rerender and current-Collection-scope tests first. The focused unit suite failed because the rerender controller and current-scope summary model were absent.

## GREEN evidence

- `rtk npm run test:i18n`: 5/5 passed, including all verifier mutations.
- `rtk npm run verify:i18n`: passed with 348 keys, 45 placeholder occurrences, and 6 scanned UI modules/documents; hard-coded-copy gate passed.
- Focused Vitest run: 136/136 passed across navigation, workspace UI, submissions, M1 API, and asset contracts.
- JavaScript syntax checks for the app, workspace UI, navigation, locale engine, and both locale packs passed.
- `rtk npm run typecheck`: passed.
- `rtk npm run check`: passed end to end: pinned vendor bytes, Wrangler types, TypeScript, 37 smoke tests, 5 i18n tests, static i18n verification, 608 unit tests, 288 worker tests, and Wrangler dry-run build.

## My Submissions status and paging

- `/api/submissions/mine` accepts only the exact `review_pending`, `published`, `rejected`, and `revision_requested` status values; unknown or repeated status parameters fail closed.
- The repository applies `submitter_id` and optional `status` predicates in D1 before keyset paging. It requests `limit + 1`, defaults to 20, caps at 50, and performs no post-filtering, `COUNT`, or full-table scan.
- Opaque canonical cursors bind owner, status, and the `created_at DESC, id DESC` sort through a server-derived scope digest. Forged, drifted, cross-owner, cross-status, and admin-pending cursor replays fail closed without widening data.
- The real-D1 test uses 120 submissions across two owners, all four statuses, and repeated timestamps. Repeated page traversal has no gaps or duplicates. `EXPLAIN QUERY PLAN` confirms use of the selective `submissions_owner_status_page` index.

## Locale engine and UI behavior

- Central locale packs have identical 348-key sets and matching 45 interpolation placeholders.
- Initial selection prefers a valid persisted value; otherwise browser languages beginning with `zh` select `zh-CN`, and all other cases select `en`. Storage read/write failures safely fall back.
- The accessible page switch updates `lang`, title, navigation, current route, dynamic labels, dialogs, notifications, focus/ARIA text, and status/error mappings without restarting authentication or replaying a mutation.
- Route-generation guards suppress stale async completions after a locale switch. Mobile drawer state, route owner, keyboard operation, and browser back/forward behavior are preserved.
- Interpolation produces text/attribute values only through existing safe DOM construction. Values are never interpreted as HTML. Runtime missing keys fall back to English; checked-in missing or unknown keys fail CI.
- Dynamically loaded Collection scope changes now refresh the localized “current scope” status immediately, without starting another retrieval or AI request.

## Static localization gate

`verify:i18n` scans checked-in public JavaScript and HTML, including dynamic dialogs and ARIA/title/label attributes. It enforces exact locale-key parity, placeholder parity, known translation calls, and the absence of hard-coded user-facing English or Chinese outside the documented technical/fixture allowlist. Mutation tests prove rejection of:

1. a missing locale key;
2. placeholder mismatch;
3. hard-coded English;
4. hard-coded Chinese;
5. an unknown checked-in translation key; and
6. a bypass form using string concatenation.

## Files

- Locale runtime and packs: `public/i18n.js`, `public/i18n.d.ts`, `public/locales/en.js`, `public/locales/zh-CN.js`
- Localized shell/workspace: `public/app.js`, `public/index.html`, `public/navigation.js`, `public/navigation.d.ts`, `public/workspace-ui.js`, `public/workspace-ui.d.ts`, `public/styles.css`
- Submission filtering: `src/routes/member.ts`, `src/submissions/types.ts`, `src/submissions/service.ts`, `src/submissions/repository.ts`
- Gates and tests: `scripts/verify-i18n.mjs`, `scripts/i18n-contract.test.mjs`, `test/unit/workspace-ui.test.ts`, `test/worker/assets.test.ts`, `test/worker/m1-api.test.ts`, `test/worker/phase1.test.ts`, `test/worker/submissions.test.ts`, `package.json`
- Evidence status: `docs/product/ai-knowledge-base-checklist.md`

## Concerns and preserved boundaries

- `COL-001` and `I18N-001` remain unchecked pending Task 9 acceptance.
- This is local/worktree evidence only; no remote browser, deployment, or migration was performed.
- Existing CSP, vendored dependency hashes, migration `0001`-`0004` hashes, authentication/governance behavior, leases, dual FTS paths, Chat scopes, download behavior, and KnowledgeBase-v1 format remain unchanged.
- The worker suite intentionally emits existing journal-corruption exception diagnostics while its assertions pass; the full gate exits zero.
