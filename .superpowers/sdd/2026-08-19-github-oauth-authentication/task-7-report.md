# Task 7 report: anonymous GitHub login workspace UI

## Controller ruling

The signed automation smoke migration was already moved earlier to preserve standalone Access-dependency removal. `scripts/smoke.mjs` and `scripts/smoke.test.mjs` were treated as inherited green interfaces and were not changed. The existing signed smoke contract remains covered by the final local run.

## RED to GREEN evidence

- RED: added `sessionBootstrapState` tests; the focused unit run failed because the helper did not exist.
- RED: updated the served asset test; it failed on the old `/cdn-cgi/access/logout` link and Access session copy.
- RED: added `postLogout` request-boundary test; the focused unit run failed because the helper did not exist.
- GREEN: the focused UI/asset suite passed 22 tests and `npm run test:smoke` passed all 6 local signing/redaction tests.
- Final verification: `rtk npm test` passed 6 smoke tests, 241 unit tests, and 131 worker tests; `rtk npm run typecheck` and `rtk git diff --check` passed.

## Delivered behavior

- A 401 `/api/session` response renders exactly one GitHub login action at `/auth/github`, clears member navigation, and keeps the shell inert.
- The authenticated session path retains capability-driven navigation and renders the current browser path without replacing it.
- Browser logout posts `/auth/logout` with `credentials: "same-origin"`, then clears the member UI and returns to the anonymous login view.
- Browser assets no longer contain Access logout/copy, APP_TOKEN, automation secrets/header generation, or GitHub token handling.

## UI and security self-review

- Anonymous routes cannot invoke `renderRoute`, so no business API fan-out occurs before a successful session bootstrap.
- Logout invalidates pending route work through the route generation, hides the logout button, disables the drawer, and removes sidebar interaction.
- Served-asset tests exercise the public Worker asset boundary and scan the delivered HTML/application JavaScript for the prohibited browser secrets and obsolete Access remnants.
- Existing worker warnings about intentionally invalid pending note journals appeared during full worker verification; all 131 worker tests passed.

## Commit

`39fce70 feat: add GitHub login workspace UI`

## Concerns

No open Task 7 concerns. No remote, deployment, migration, or secret operation was performed.
