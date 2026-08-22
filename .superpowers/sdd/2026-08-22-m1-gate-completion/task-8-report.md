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

## Fix round 1/5 — locale lifecycle and static gate

Date: 2026-08-23

### Findings resolved

- Replaced locale-triggered route reconstruction with explicit in-place translation bindings for text, safe visible attributes/ARIA, computed localized copy, and document title. A locale switch no longer closes dialogs, advances route generation, invokes `renderRoute()`, reconstructs route DOM, or starts a GET/mutation/AI call.
- Existing Home data, admin multi-fetch results, My Submissions accumulated pages/cursor/status, Search and Chat selections, form values, drawer/dialog state, active mutation ownership, and focus on the language selector remain in place. The current mutation completes once; an already-stale route completion remains rejected by the unchanged route guard. Normal navigation and browser back/forward retain their existing fetch behavior.
- Replaced the regex-only JavaScript scan with the pinned TypeScript compiler AST API. Dynamic translation maps such as API/runtime/controller errors are declared explicitly and their values are checked. HTML is parsed as DOM with script execution and external loading disabled.
- The gate checks direct and variable-indirected display sinks, `textContent`, `createTextNode`, visible `setAttribute` attributes, DOM helper options/children, dialogs, ARIA/title/error paths, concatenations, templates, decoded/escaped literals, and HTML text/attributes against a narrow documented technical-copy allowlist.
- Replaced the Markdown renderer's English thrown message with stable code `MARKDOWN_RENDERER_UNAVAILABLE`; the UI maps it through the bilingual `ERROR_MARKDOWN_RENDERER_UNAVAILABLE` key.

### RED evidence

- The new lifecycle contract failed with `createLocaleRefreshController is not a function`; the old controller closed dialogs and invoked route rendering.
- The translation-binding contract failed because `createTranslationBindings` was not exported.
- The stale-binding regression reproduced an old localized error returning after runtime text replacement and a later locale refresh.
- The old verifier passed a variable-indirected hard-coded title mutation and a thrown/displayed Markdown renderer message mutation.
- The existing asset contract failed because it still required `createLocaleRerenderController`.

### GREEN evidence

- `rtk npm run test:i18n`: 8/8 passed. Locale packs contain 349 keys and 45 placeholder occurrences.
- The mutation suite rejects missing keys, placeholder drift, direct English/Chinese, unknown direct and dynamic-map keys, variable indirection, `setAttribute`, `createTextNode`, DOM-helper children, templates, concatenation, Unicode-escaped English/Chinese, base64-decoded copy, HTML text/attributes, and thrown/displayed Markdown errors.
- `rtk npm run verify:i18n`: `[pass] i18n-hardcoded-copy ast=typescript html=dom`.
- Focused UI/asset run: 93/93 passed; focused lifecycle model run: 62/62 passed.
- JavaScript syntax checks and `rtk npm run typecheck` passed.
- Fresh `rtk npm run check` passed: pinned vendor bytes, Wrangler types, TypeScript, 37 smoke tests, 8 i18n tests, AST/DOM gate, 608 unit tests, 288 worker tests, and Wrangler dry-run build.

### Boundaries and concerns

- `COL-001` and `I18N-001` remain unchecked pending Task 9 acceptance.
- This round performed no deployment, network call, or migration and did not change CSP/vendor hashes, authentication/governance, D1 migrations, leases, dual FTS, Chat scope semantics, downloads, or KnowledgeBase-v1.
- The prototype own-property minor remains ledgered for final review and is intentionally outside this round.

## Fix round 2/5 — child-preserving bindings and verifier bypass closure

Date: 2026-08-23

### Findings resolved

- Translation text bindings now own or reuse a dedicated `Text` node and update only its `data`. They never assign `textContent` to a rendered element container. A real happy-dom regression covers localized label parents containing the same input, select, and textarea nodes across a locale switch, preserving their values, select choice, input selection range, and active focus.
- Pager buttons and the live Chat scope summary were also converted from locale effects that assigned container `textContent`; the checked-in browser asset contract now rejects any `textContent` assignment in `public/app.js`.
- Checked-in shell text is adopted rather than duplicated. `applyLocale()` binds checked-in `data-i18n` text and ARIA through the same registry, so a locale switch does not detach the managed logout, drawer, session, or loading nodes and later state changes remain live.
- Audit timestamps are computed locale bindings. Changing locale reformats the existing loaded audit rows without another `/api/admin/audit-events` request.
- Logout failures no longer surface `Response.statusText`. The request layer emits stable `LOGOUT_FAILED`; the app maps it to `SHELL_LOGOUT_ERROR`, and the displayed binding refreshes with the selected locale.
- Catalog lookup now uses own-property checks for both the active catalog and English fallback. `__proto__`, `constructor`, and `toString` are safe runtime unknown keys rather than inherited catalog values.
- The AST verifier now covers direct thrown values, direct and constructed `Error`/`TypeError`/`DOMException` messages, relevant `Promise.reject` values, stored constructed errors, stored object-property display values, and variable-provided element/dialog option objects. Visible `alt` and submit/reset/button `value` paths are checked while hidden form values remain non-visible. HTML template fragments are traversed explicitly, including direct template text.

### RED evidence

- The real-DOM label regression failed because refreshing the localized parent replaced the nested input node; the prototype-name regression threw because an inherited function reached interpolation.
- The checked-in shell regression found two text nodes after binding because the existing text node was not adopted.
- The logout unit regression received the raw `Upstream private detail` status text instead of `LOGOUT_FAILED`; the asset contract showed audit time was a primitive string.
- The original verifier passed direct `Error(...)`, variable-provided element options, dynamic `alt`, and direct template-text mutations. Tightening generic `value` scanning then intentionally exposed false positives for option/hidden values, leading to the element-type-aware rule.

### GREEN evidence

- `rtk npm run test:i18n`: 13/13 passed. Locale packs remain exactly 349 keys with 45 placeholder occurrences.
- `rtk npm run verify:i18n`: key/placeholder parity and `[pass] i18n-hardcoded-copy ast=typescript html=dom` passed.
- New isolated mutations reject direct thrown strings, direct `Error(...)`, `DOMException`, rejected and stored/displayed errors (including object-property storage), variable element options, dynamic `alt`, visible dynamic `value`, HTML `alt`, HTML submit value, and direct template content. A hidden technical form value remains accepted as non-visible.
- Focused workspace UI and asset suites: 94/94 passed, including stable logout errors, in-place locale lifecycle, shell binding source contracts, and computed audit time.
- JavaScript syntax checks for `public/i18n.js`, `public/app.js`, `public/workspace-ui.js`, `scripts/verify-i18n.mjs`, and `scripts/i18n-contract.test.mjs` passed. `rtk npm run typecheck` passed.
- Fresh `rtk npm run check` passed: vendor hashes, generated Wrangler types, TypeScript, 37 smoke tests, 13 i18n tests plus static verifier, 609 unit tests, 288 worker tests, and Wrangler dry-run build.
- `rtk git diff --check` passed before the full gate.

### Boundaries and concerns

- `COL-001` and `I18N-001` remain unchecked pending Task 9 acceptance.
- No remote request, deployment, or migration was performed. CSP, vendored hashes, authentication/governance, migration `0001`-`0004` bytes, Task 4 leases, dual FTS, Chat scope semantics, downloads, and KnowledgeBase-v1 remain unchanged.
- The worker suite continues to print its deliberate invalid-journal diagnostics while all 288 assertions pass and the full gate exits zero.
