# Native acceptance kit (LOCAL ONLY)

Status: local developer tooling for the remaining checklist items **D05** (real-identity
journeys), **D06** (real desktop-browser matrix), **D04/G0** (VM + release) and **D08**
(release). It is **not** product code, it is **not** wired into the application or the
`npm run check` gate, and it is **not** an acceptance result by itself.

> **Non-claims, read first**
>
> - The seeded members are **synthetic local identities**, not real accounts. A green
>   automated sweep is *not* D05 acceptance and does not stand in for a real admin /
>   contributor / second-member journey.
> - Every script here is **local only**. It runs `npx wrangler d1 execute … --local`,
>   never `--remote`, never a remote D1, never `wrangler deploy`, never a migration.
> - No script reads `.dev.vars`, `SECRETS_FILE`, Wrangler login state or any application
>   secret. It only writes synthetic rows to the local D1 and prints **synthetic** session
>   tokens (which are worthless outside the local stack) to stdout.
> - Running this kit **does not flip any checklist checkbox**. D04/D05/D06/D08 stay open
>   until real-identity / real-desktop / authorized-release evidence exists.
> - The D06 expectation table below reproduces observations from
>   [`docs/product/2026-10-11-native-matrix-evidence.md`](../../docs/product/2026-10-11-native-matrix-evidence.md)
>   so the user-gated run has a fixed target. It is a target to reproduce, not a claim that
>   it has been reproduced in *your* browser.

## Prerequisites

- Node **≥ 20** (this kit is written for the repo's `wrangler@4`; developed on Node 24) and
  `npx` available. `bun` is **not** required.
- The repository's installed dependencies (`npm install` has been run; `npx wrangler` must
  resolve to the local `wrangler`).
- A local **Chrome or Edge** for the user-gated D06 matrix (real desktop browser; the
  automated sweeps do not need a browser).
- The local D1 migrated to the current head: `npm run db:migrate:local`.
- Keep `wrangler dev` **stopped** while you seed or clean up. Running
  `wrangler d1 execute --local` against the same local D1 while `wrangler dev` is serving it
  has crashed the dev server before. Seed → start dev → check → stop dev → clean up.

## Files

| File | Purpose |
| --- | --- |
| `seed-local-members.mjs` | Idempotently seeds 1 synthetic admin + 2 synthetic contributors and `auth_sessions` into the **local** D1; prints each 43-char token and its `Cookie:` string; persists token/hash pairs to `.wrangler/acceptance-sessions.json` (gitignored). |
| `check-local-authorization.mjs` | Drives the HTTP authorization / isolation matrix against a locally running `wrangler dev` for the seeded members; asserts expected statuses; exits non-zero on any mismatch. |
| `check-local-contributor-journey.mjs` | Drives the contributor's **allowed** create/read journeys (submission draft, inbox item, task) against a locally running `wrangler dev`; asserts the write succeeds, the owner can read it back, and a **second** member cannot; exits non-zero on any mismatch. |
| `cleanup-local-members.mjs` | Removes the synthetic rows in a foreign-key-safe order and prints a residual-count check (all zero). |
| `README.md` | This runbook. |

The local stack is the repo's own Worker + local D1 (`memory-garden-control-plane`) on
`http://127.0.0.1:8787` (override with `ACCEPTANCE_BASE_URL`).

## (i) Seed synthetic members into the LOCAL D1

```bash
npm run db:migrate:local                 # only if the local D1 is not migrated yet
node tools/acceptance/seed-local-members.mjs
```

The seed script writes:

- `members`: `acceptance-admin` (role `admin`), `acceptance-contributor-1`,
  `acceptance-contributor-2` (role `contributor`).
- `role_members`: the admin linked to `role-admin`, each contributor to `role-contributor`
  (system roles seeded by migrations `0029`/`0032`/`0059`; capability masks `0x37ffff` and
  `0x1600c3`).
- `auth_sessions`: one fresh 43-char base64url token per member (`token_hash` = SHA-256
  hex, matching `src/identity/session.ts`), 7-day expiry. Existing sessions for the seeded
  members are replaced, so re-running is idempotent for the DB state.

It prints, per member, the role, the 43-char token and the exact cookie header, e.g.:

```
Cookie: __Host-memory-session=<43-char-token>
```

It also writes `token|hash` pairs to `.wrangler/acceptance-sessions.json`. **Do not commit
that file** (`.wrangler/` is gitignored) and do not paste it anywhere.

## (ii) Run the automated local checks

```bash
# terminal A
npx wrangler dev --port 8787        # wait for "Ready on http://127.0.0.1:8787"

# terminal B
node tools/acceptance/check-local-authorization.mjs
```

The checker asserts (and exits non-zero on any mismatch):

| Group | Request | Expected |
| --- | --- | --- |
| Session | `GET /api/session` (admin / contributor-1 / contributor-2) | 200 / 200 / 200 |
| Session | `GET /api/session` (no cookie) | 401 |
| Session | `GET /api/session` (bogus 43-char token) | 401 |
| Admin read (×9) | `/api/admin/menus`, `/api/admin/members`, `/api/admin/roles`, `/api/admin/spaces`, `/api/admin/assets`, `/api/admin/duplicates`, `/api/admin/audit-events?page=1&pageSize=20`, `/api/admin/analytics/overview?days=7&page=1&pageSize=20`, `/api/admin/submissions?page=1&pageSize=20` | contributor 403, admin 200 |
| Write boundary | `POST /api/admin/menus` with `Origin: https://memory.crgmhrc.asia` | contributor 403, admin 201 |
| Member scope | `PUT /api/knowledge/<unreadable>/favorite` with canonical `Origin` | contributor 404 |

Note: `pageSize` must be one of the API's `supportedPageSizes = [20, 50, 100]`
(`src/pagination.ts`); `pageSize=10` is rejected with `400 PAGE_INVALID` **before**
authorization is evaluated, so the admin column uses `pageSize=20`.

The canonical `Origin` is the app's hard-coded value in
[`src/config.ts`](../../src/config.ts) (`https://memory.crgmhrc.asia`); unsafe methods
without it are rejected by the same-origin (CSRF) guard, so the 403 must be produced *with*
the canonical Origin to be an authorization conclusion rather than a CSRF rejection.

It prints a compact PASS/FAIL table and a final `PASS`/`FAIL` verdict.

Then stop `wrangler dev` and clean up (see (iii)).

## (ii-bis) Positive-path contributor journey

`check-local-authorization.mjs` proves the **denial** side (contributor `403` on admin
surfaces, cross-member reads isolated). `check-local-contributor-journey.mjs` proves the
other half: for the flows a `role-contributor` mask (`0x1600c3` = bits `0,1,6,7,17,18,20`)
actually permits, the write **succeeds** *and* a second member (`acceptance-contributor-2`)
**cannot read it back** — allowed-and-isolated, not just allowed. Run it against the same
running `wrangler dev` (no extra setup):

```bash
# terminal B, with `npx wrangler dev --port 8787` still running
node tools/acceptance/check-local-contributor-journey.mjs
```

Every unsafe method is sent with the canonical `Origin: https://memory.crgmhrc.asia`
(`src/config.ts`), because `src/app.ts:204-206` runs `requireSameOrigin` for member
principals on unsafe methods — without it every write is a CSRF `403` and the check would be
meaningless. The script first discovers an active writable space via `GET /api/spaces` (the
draft write requires `kind != 'legacy' AND read_only = 0 AND status = 'active'`,
`src/submissions/repository.ts:95-117`), so it does not hard-code a fixture id.

| Flow | Request (method path — body) | Contributor-1 expected | Contributor-2 expected |
| --- | --- | --- | --- |
| Submission draft | `POST /api/submissions/drafts` — `{ requestedSpaceId, kind: "text", title, content }` | `201` | — |
| Submission draft | `GET /api/submissions/drafts/:id` | `200`, body `id` equals created id | `404` |
| Submission draft | `GET /api/submissions/mine` | `200`, list contains the draft id | `200`, list excludes it |
| Inbox item | `POST /api/inbox` — `{ clientKey, kind: "text", content }` | `201` | — |
| Inbox item | `GET /api/inbox/:id` | `200`, body `id` equals created id | `404` |
| Inbox item | `GET /api/inbox` | `200` | `200`, list excludes the item |
| Task | `POST /api/tasks` — `{ id: <uuid>, title }` | `201` | — |
| Task | `GET /api/tasks/:id` | `200`, body `task.id` equals created id | `404` |
| Task | `GET /api/tasks` | `200` | `200`, list excludes the task |

Permissions: draft create `submission:create` (bit 6), draft read / mine `submission:read-own`
(bit 7) (`src/routes/member.ts:363-390,431-441`); inbox and task routes require `tasks:use`
(bit 20) (`src/routes/inbox.ts:22`, `src/routes/tasks.ts:22`). The task body **must** carry a
client-generated `id` (the frontend sends `crypto.randomUUID()`,
`frontend/lib/tasks-data.ts:80-84`); an empty id is rejected `400 TASK_INVALID`
(`src/tasks/service.ts:401-407,504-506`).

The script prints a compact PASS/FAIL table with the raw status observed per step and a final
`PASS`/`FAIL` verdict; it exits non-zero on any mismatch. A green run leaves synthetic rows
behind, so run cleanup (iii) afterwards as usual.

**Non-claims (same as the rest of this kit):** the seeded members are synthetic local
identities, so a green run is a local smoke test of the authorization wiring and is **not**
D05/D06/D04/D08 acceptance; it is local-only (never `--remote`), reads no secret, and flips no
checklist checkbox.

## (iii) Clean up the synthetic rows

```bash
# stop wrangler dev first
node tools/acceptance/cleanup-local-members.mjs
```

Deletes in the foreign-key-safe order learned the hard way (a first attempt failed with
`SQLITE_CONSTRAINT_FOREIGNKEY`): `private_note_shares` → `private_notes` →
`knowledge_favorite_operation_receipts` → `knowledge_favorites` → `task_links` →
`task_subtasks` → `task_dependencies` → `task_tags` → `tasks` → `inbox_items` → (set
`knowledge_items.current_revision_id = NULL` for the seeded items) → `chunks` → `revisions`
→ `knowledge_items` → `source_versions` → `sources` → `submissions` → probe menus →
`role_members` → `auth_sessions` → `members`. It then prints a residual count per table
(all zero). Deletes are scoped to the synthetic `acceptance-…` ids and the seeded member
ids, so unrelated local data is untouched.

## (iii-bis) User-gated: D05 real-identity journeys

These require **your real accounts** and are the only path to D05 acceptance. The synthetic
sweep above is a smoke test of the same endpoints, not a substitute.

Prerequisites: a real admin identity, a real contributor identity, and (for the second-member
leg) a second real member; the deployed or locally running app you intend to accept; the
canonical origin in use.

Steps and what to observe:

1. **Sign in as the real admin.** Open the app, complete the real sign-in. Observe the
   workspace shell renders and the admin navigation group is present.
2. **Admin surfaces load.** Open Administration → Menus, Members, Roles, Spaces, Assets,
   Duplicates, Audit events, Analytics overview, Submissions review queue. Each must render
   real data (no `403`, no blank/error state).
3. **Sign in as the real contributor (separate session/profile).** The admin navigation group
   must be **absent**; direct-navigating to `/admin`, `/admin/menus`, `/admin/members`,
   `/admin/roles`, `/admin/audit`, `/admin/analytics` must render the `403` access-denied
   message (`当前服务器会话没有访问此路由所需的能力`), never admin data or a blank screen.
4. **Contributor is denied at the API too** (browser devtools or `curl` with the contributor
   cookie and canonical `Origin`): every admin read endpoint in the table above returns
   `403`; `POST /api/admin/menus` returns `403`. The **same call as admin returns `200`/`201`**,
   proving the denial is authorization, not CSRF.
5. **Member-scoped data.** As the admin, favourite an item, add a private note, and submit
   something. As the contributor, confirm the admin's favourites/notes are invisible
   (favourite list empty, note `null`, "my submissions" empty) and that
   `GET /api/knowledge/favorites/operations/<admin-operation>` returns `404` (no disclosure).
6. **Second member.** Repeat 3–5 with a second real contributor; confirm member B cannot read
   member A's private note (`null`), favourites (empty) or operation receipts (`404`).

Expected: identical to the synthetic matrix — `403`/`404` for every unauthorized call, only
own-member data on scoped reads, no admin entry points in contributor navigation.

## (iii-ter) User-gated: D06 desktop-browser matrix

Run in the real desktop Chrome/Edge you intend to accept, with a signed-in session (a real
one for acceptance). For each width, use the browser's real device emulation / responsive
mode: **320 / 375 / 768 / 1280** CSS px wide. For each of `zh-CN`/`en` × light/dark.

| Width | `document.documentElement.scrollWidth − innerWidth` | workspace `nav a[href^='/']` count | docked sidebar box | Theme / copy `checks` |
| ---: | ---: | ---: | --- | --- |
| 320 | −15 (no horizontal overflow) | 22 | collapsed `0×0` (drawer closed) | see theme + copy rows |
| 375 | −15 | 22 | collapsed `0×0` | see theme + copy rows |
| 768 | −15 | 22 | collapsed `0×0` | see theme + copy rows |
| 1280 | 0 | 22 | docked `231×647` | see theme + copy rows |

Theme (evaluate `getComputedStyle(document.body)`):

| Theme | `html.classList` | `body` background | `body` foreground |
| --- | --- | --- | --- |
| light | no `dark` class | `oklch(0.985 0.004 255)` | `oklch(0.22 0.025 255)` |
| dark | contains `dark` | `oklch(0.17 0.02 255)` | `oklch(0.93 0.01 255)` |

Copy:

| Locale | skip link | nav control |
| --- | --- | --- |
| `zh-CN` | `跳到主要内容` | `打开导航` |
| `en` | `Skip to main content` | `Open navigation` |

Mobile drawer (≤768, collapsed by default):

- The mobile navigation is a native `<details>` whose `<summary>` is the "打开导航 / Open
  navigation" control: **360×44** at 375, **305×44** at 320.
- Activating the summary opens an inner `<nav>` of **239×1096** containing **25** links;
  `Escape` closes it (`details[open]` removed) and it can be reopened.
- Pitfall: `document.querySelector("nav")` may return the *hidden docked sidebar* (`0×0`).
  The usable drawer nav is the one **inside** `<details>`; do not conclude "the mobile nav
  cannot open" from the first match.

`<html lang>` follows the selected locale in **both** the workspace and the public landing
page:

- Workspace: switch language via the shell language menu; `document.documentElement.lang`
  tracks the choice (`zh-CN` → `zh-CN`, `en` → `en`).
- Landing page: drive the native control `select[aria-label="切换语言"]`; `lang` follows the
  selected option in both directions.

## (iii-quater) User-gated: G0 desktop admission matrix (preparation only)

The G0 first-connection admission matrix lives in
[`G0-desktop-matrix.md`](G0-desktop-matrix.md): the step-by-step desktop Chrome/Edge runbook
for the handshake / allow / deny / revoke / stop matrix under default security settings, using
only the repo's existing handshake-only probe (`npm run dev:browser-vm:connector`, the published
`https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev/probe` page) and the automated
`npm run test:browser-vm:connector` regression.

The page/deployment id above is **as recorded in
[`design/browser-vm/local-connector-probe-evidence.md`](../../design/browser-vm/local-connector-probe-evidence.md)**
(preview published 2026-09-12, desktop admission matrix 2026-09-29); **this kit did not
re-verify it**, so re-check that the preview still exists/points at the expected deployment
before treating the matrix as runnable — and if it is gone, Step 0 of the runbook must use
whatever valid HTTPS page the user's environment provides, per the G0 requirement.
Re-publishing a preview is a deploy and is out of scope here.

**It cannot be executed from this environment** — there is no unlocked target desktop and no
relay/resource authorization here — so the file is **preparation only**: it documents the
commands and the expected observations, and does not itself produce G0 evidence. Running it
does not close D04/G0 (LC-010–015 and the production relay authorization remain open), does not
authorize D08, and changes no checklist counts.

## (iv) Optional: local native UI write journey on the canonical origin

The automated checks above drive writes over HTTP with an explicit canonical `Origin`. To
drive a **real browser UI write** locally, the browser must present the canonical origin
(`https://memory.crgmhrc.asia`, [`src/config.ts`](../../src/config.ts)), because the app pins
it and rejects localhost origins with the same-origin (CSRF) guard. This harness does that —
it is **local-only** and must **never** be pointed at the deployed app or real credentials.

1. **Self-signed cert for the canonical host.**
   ```bash
   openssl req -x509 -newkey rsa:2048 -nodes \
     -keyout /tmp/mg-tls.key -out /tmp/mg-tls.crt -days 1 \
     -subj "/CN=memory.crgmhrc.asia" \
     -addext "subjectAltName=DNS:memory.crgmhrc.asia"
   ```
2. **Local HTTPS front on `127.0.0.1:9443` proxying `wrangler dev` (:8787)**, injecting the
   synthetic session cookie *and rewriting the `Origin` header to
   `https://memory.crgmhrc.asia`*. The rewrite is the harness; a real deployment validates the
   real `Origin`.
3. **Headed Chrome** with the host mapping and the local TLS accepted:
   ```bash
   --ignore-certificate-errors --no-proxy-server \
   --host-resolver-rules="MAP memory.crgmhrc.asia:9443 127.0.0.1:9443"
   ```
   `--no-proxy-server` is required: the system proxy otherwise bypasses the mapping and the
   page fails with `ERR_CONNECTION_CLOSED`.

Then browse `https://memory.crgmhrc.asia:9443/tasks` and exercise the native create → edit →
delete flows. A worked example (with the observed dialog copy and DB counts) is recorded in
[`docs/product/2026-10-11-headed-route-sweep-evidence.md`](../../docs/product/2026-10-11-headed-route-sweep-evidence.md).

> **Warning** — this is a local harness technique (self-signed TLS + a rewritten `Origin`). It
> must **never** be used against production or with real accounts: it exists only to let a
> local browser satisfy the same-origin guard for local write journeys, and a run here is not
> D05/D06/D04 acceptance and flips no checklist checkbox.

## Notes on scope

- Seed/check/cleanup only touch the **local** D1 and a locally running `wrangler dev`.
- The synthetic tokens exist only in `.wrangler/acceptance-sessions.json` and on stdout;
  they are not valid anywhere but the local stack.
- A passing automated sweep is evidence that the local authorization wiring is intact. It is
  **not** D05, D06, D04 or D08 acceptance, and it changes no counts.
