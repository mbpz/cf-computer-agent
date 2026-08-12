# Phase 1 Identity and D1 Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cloudflare Access identity, a D1 member/space/submission control plane, role-enforced APIs, and a unified contributor/admin web shell while preserving Phase 0 legacy knowledge APIs and Durable Object data.

**Architecture:** Cloudflare Access authenticates GitHub users before requests reach the Worker; the Worker independently validates `Cf-Access-Jwt-Assertion`, maps the stable subject into D1, and authorizes capabilities through a policy layer. D1 is authoritative for members, spaces, collections, submissions, and audit events, while the deployed `KnowledgeBase` Durable Object remains the read-compatible legacy store. Automation enters through Access Service Auth plus constant-time APP_TOKEN verification and receives a restricted non-admin principal.

**Tech Stack:** TypeScript 7, Cloudflare Workers, Cloudflare Access, `jose`, D1 SQLite migrations, Durable Objects, `@cloudflare/computer`, Wrangler 4, Vitest 4 with `@cloudflare/vitest-pool-workers`, plain HTML/CSS/JavaScript.

## Global Constraints

- Preserve `KnowledgeBase`, migration `v1`, `personal`, `/workspace/.memory/index.json`, and existing note data.
- Preserve response compatibility for health, notes, search, and chat; only authorization changes by principal.
- Browser identity comes only from verified Access JWT; automation requires Access Service Auth plus APP_TOKEN.
- At most one active admin; Web APIs cannot modify the unique admin.
- `BOOTSTRAP_ADMIN_EMAIL` applies only while no admin exists; other first-login users become active contributors.
- Disabled members fail closed even when Access still allows them.
- Phase 1 creates `review_pending` submissions but no review decision, publication, Revision, file upload, R2, FTS5, Vectorize, or persistent Agent session.
- Seed one manageable default Space and one immutable legacy personal Space.
- Every list uses opaque keyset pagination, default 20, maximum 50; no unbounded D1 reads.
- Migrations are append-only. Secrets never enter config, generated types, CLI arguments, logs, audit metadata, or fixtures.
- Local tests use generated JWTs, local D1/DO and fake AI only.
- Use `rtk` for commands and `apply_patch` for edits.

## File Structure

| Path | Responsibility |
| --- | --- |
| `migrations/0001_phase1_control_plane.sql` | Tables, indexes, constraints, Space seeds |
| `src/identity/access-jwt.ts` | JWT/JWK verification and claim normalization |
| `src/identity/principal.ts` | Member/automation resolution |
| `src/authorization/policy.ts` | Capabilities and resource authorization |
| `src/members/*` | Member D1 access and bootstrap/status service |
| `src/spaces/*` | Space/Collection repository and rules |
| `src/submissions/*` | Submission ownership, pagination, validation |
| `src/audit/*` | Allowlisted audit writes and reads |
| `src/pagination.ts` | Cursor and limit validation |
| `src/routes/*` | Session, member, and admin HTTP routes |
| `test/fixtures/access-jwt.ts` | Local Access signing fixtures |
| `test/fixtures/d1.ts` | Migration fixture |
| `test/worker/phase1.test.ts` | Real workerd+D1+DO permission matrix |
| `docs/operations/access-setup.md` | GitHub/Access/D1 deployment runbook |

---

### Task 1: Add D1 binding, migration, and local harness

**Files:**
- Modify: `wrangler.jsonc`, `package.json`, `vitest.config.ts`
- Generate: `worker-configuration.d.ts`
- Create: `migrations/0001_phase1_control_plane.sql`
- Create: `test/fixtures/d1.ts`
- Create: `test/worker/migrations.test.ts`

**Interfaces:**
- Produces `Env.DB: D1Database`.
- Produces tables `members`, `spaces`, `collections`, `submissions`, `audit_events`.
- Produces `MIGRATIONS` loaded through `readD1Migrations("migrations")`.

- [ ] **Step 1: Write the failing workerd migration test**

Use `applyD1Migrations(env.DB, MIGRATIONS)`; assert all five tables exist and Space rows equal:

```ts
[
  { slug: "default", kind: "shared", read_only: 0 },
  { slug: "legacy-personal", kind: "legacy", read_only: 1 },
]
```

- [ ] **Step 2: Verify RED**

Run: `rtk npx vitest run test/worker/migrations.test.ts`

Expected: missing DB binding/migration fixture.

- [ ] **Step 3: Add D1 configuration**

Add binding `DB`, database name `memory-garden-control-plane`, migrations directory `migrations`. Use the provisioned non-secret database UUID. If not yet authorized/provisioned, stop before committing configuration rather than inventing an ID.

- [ ] **Step 4: Write the migration**

Implement approved columns/check constraints/foreign keys and:

```sql
CREATE UNIQUE INDEX one_active_admin ON members(role)
WHERE role='admin' AND status='active';
CREATE INDEX submissions_owner_page
ON submissions(submitter_id, created_at DESC, id DESC);
CREATE INDEX submissions_admin_page
ON submissions(status, created_at DESC, id DESC);
CREATE INDEX audit_page ON audit_events(created_at DESC, id DESC);
```

Seed deterministic default and legacy Spaces with `INSERT OR IGNORE`.

- [ ] **Step 5: Add migration scripts and generate types**

Add `db:migrate:local` and `db:migrate:remote` using the database name. Run `rtk npx wrangler types --env-file config/types.env`; assert generated Env includes DB.

- [ ] **Step 6: Verify and commit**

Run migration test and `rtk npm run check`. Commit: `feat: add Phase 1 D1 control plane`.

---

### Task 2: Validate Cloudflare Access JWTs

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/config.ts`, `src/env.d.ts`
- Create: `src/identity/access-jwt.ts`
- Create: `test/fixtures/access-jwt.ts`
- Create: `test/unit/access-jwt.test.ts`

**Interfaces:**
- Produces `AccessIdentity { sub: string; email: string }`.
- Produces `verifyAccessJwt(request, env, options?): Promise<AccessIdentity>`.
- Secret fields: `ACCESS_TEAM_DOMAIN?`, `ACCESS_AUD?`, `BOOTSTRAP_ADMIN_EMAIL?`.

- [ ] **Step 1: Install `jose@latest`** using npm; commit the resolved lockfile version.
- [ ] **Step 2: Create local keypair/JWK fixtures** using `generateKeyPair`, `exportJWK`, and `SignJWT`.
- [ ] **Step 3: Write RED tests** for valid JWT, missing assertion, bad signature, wrong issuer/audience, expired/not-before, missing sub/email, and missing config.
- [ ] **Step 4: Implement verification** from `Cf-Access-Jwt-Assertion` using `jwtVerify` with exact issuer/audience. Convert all jose failures to stable content-free AppErrors.
- [ ] **Step 5: Cache remote JWK sets** once per normalized team domain; never cache verified identities or JWT results.
- [ ] **Step 6: Verify** focused tests, unit suite, and typecheck.
- [ ] **Step 7: Commit** `feat: verify Cloudflare Access identities`.

---

### Task 3: Implement member bootstrap and admin protection

**Files:**
- Create: `src/members/types.ts`, `repository.ts`, `service.ts`
- Create: `test/unit/members-service.test.ts`
- Create: `test/worker/members.test.ts`

**Interfaces:**
- Produces `Member` and `MembersService.resolveFirstLogin(identity)`.
- Produces `setContributorStatus(actor, memberId, status)`.

- [ ] **Step 1: Write unit RED tests** for bootstrap admin, normal contributor, no late promotion, disabled member, protected admin, and rate-limited last_seen.
- [ ] **Step 2: Define repository methods**: find by sub/id, has active admin, insert, conditional last_seen, paged list, contributor status update.
- [ ] **Step 3: Implement conflict-safe bootstrap**: read by sub; decide role; insert; on unique conflict re-read by sub/admin and retry contributor once. Never turn arbitrary D1 errors into accounts.
- [ ] **Step 4: Implement last_seen window** without making authorization depend on the write.
- [ ] **Step 5: Add real D1 concurrency tests** proving one active admin under concurrent first login and disabled member rejection.
- [ ] **Step 6: Run focused/full checks.**
- [ ] **Step 7: Commit** `feat: bootstrap Access members in D1`.

---

### Task 4: Resolve principals and enforce capabilities

**Files:**
- Modify: `src/auth.ts`
- Create: `src/identity/principal.ts`
- Create: `src/authorization/policy.ts`
- Create: `test/unit/principal.test.ts`, `policy.test.ts`

**Interfaces:**
- Produces `Principal = MemberPrincipal | AutomationPrincipal`.
- Produces `resolvePrincipal`, `requireCapability`, `capabilitiesFor`.
- Capability union: `legacy:read`, `legacy:write`, `submission:create`, `submission:read-own`, `submission:read-all`, `member:manage`, `space:manage`, `audit:read`.

- [ ] **Step 1: Write RED policy matrix tests** for contributor/admin/automation.
- [ ] **Step 2: Write RED resolution tests** for valid member, valid automation, disabled member, invalid JWT, wrong APP_TOKEN, and member assertion plus APP_TOKEN (must remain member, never elevate).
- [ ] **Step 3: Implement selection**: member assertion selects verified member path; absence selects constant-time APP_TOKEN automation path.
- [ ] **Step 4: Preserve fixed-length digest comparison** from Phase 0 while removing general all-route authorization.
- [ ] **Step 5: Verify focused tests and typecheck.**
- [ ] **Step 6: Commit** `feat: enforce principal capabilities`.

---

### Task 5: Add pagination and Space/Collection management

**Files:**
- Create: `src/pagination.ts`
- Create: `src/spaces/types.ts`, `repository.ts`, `service.ts`
- Create: `test/unit/pagination.test.ts`, `spaces-service.test.ts`
- Create: `test/worker/spaces.test.ts`

**Interfaces:**
- Produces `PageRequest { limit; cursor? }`, `Page<T> { items; nextCursor? }`.
- Produces list/create/update Space and Collection service methods.

- [ ] **Step 1: Write cursor RED tests** for base64url versioned `{v:1,sort,id}`, malformed/oversized/version mismatch, default 20/max 50.
- [ ] **Step 2: Implement cursor encoding/decoding and verify tests.**
- [ ] **Step 3: Write Space RED tests** for validation, duplicate slug, legacy mutations, cross-Space parent, disabled parent, ordering.
- [ ] **Step 4: Implement keyset SQL** ordered by `position,id`, fetching `limit+1`; never routine COUNT.
- [ ] **Step 5: Enforce legacy read-only and same-Space parent rules.**
- [ ] **Step 6: Add D1 integration** with 55 records, proving no pagination gaps/duplicates and immutable legacy seed.
- [ ] **Step 7: Run full check and commit** `feat: manage D1 spaces and collections`.

---

### Task 6: Add owned submissions and allowlisted audit

**Files:**
- Create: `src/submissions/types.ts`, `repository.ts`, `service.ts`
- Create: `src/audit/types.ts`, `repository.ts`
- Create: `test/unit/submissions-service.test.ts`, `audit.test.ts`
- Create: `test/worker/submissions.test.ts`

**Interfaces:**
- Produces create/list-own/list-pending submission methods.
- Produces typed `writeAudit` and paged `listAudit`.

- [ ] **Step 1: Write submission RED tests**: only text/markdown/code, trimmed title, 1..128KiB content, active non-legacy Space, same-Space Collection, always review_pending.
- [ ] **Step 2: Write audit RED tests** with a discriminated action map; runtime validator must reject token/JWT/content/arbitrary metadata keys.
- [ ] **Step 3: Put ownership in SQL** with `WHERE submitter_id=?`; contributor routes receive no unrestricted find-by-id method.
- [ ] **Step 4: Write submission+audit together** using D1 batch; test and document actual failure semantics rather than claiming unsupported transactionality.
- [ ] **Step 5: Add cross-user leakage tests** across pagination and route-shaped inputs; admin sees both users.
- [ ] **Step 6: Verify/full check and commit** `feat: add review-pending submissions`.

---

### Task 7: Compose Phase 1 APIs and preserve legacy routes

**Files:**
- Create: `src/routes/session.ts`, `member.ts`, `admin.ts`
- Modify: `src/app.ts`, `src/http.ts`
- Create: `test/worker/phase1.test.ts`
- Modify: `test/worker/app.test.ts`

**Interfaces:**
- Produces exact approved Session, Submission, Member, Space/Collection, Audit APIs.
- Preserves legacy response bodies and DO recovery.

- [ ] **Step 1: Write the real workerd permission matrix RED test**:
  - contributor: session, spaces, create/list-own submission, legacy read/search/chat;
  - admin: contributor plus admin APIs and legacy write;
  - automation: health and legacy read/write/search/chat only;
  - disabled: no business API.
- [ ] **Step 2: Resolve one principal per API request** and pass a request-scoped service context; no repeated JWT verification.
- [ ] **Step 3: Add exact method/path matching**, stable 404/405 and Allow headers.
- [ ] **Step 4: Enforce legacy capabilities**: reads require legacy:read; POST notes requires legacy:write; response shapes unchanged.
- [ ] **Step 5: Implement session response** containing member id/email/role, capabilities, and Access logout URL—never sub/JWT/bootstrap email/token.
- [ ] **Step 6: Test contributor direct access to every admin endpoint, automation restriction, request IDs, error redaction, and Phase 0 journal/concurrency regressions.**
- [ ] **Step 7: Run full check and commit** `feat: expose role-aware Phase 1 APIs`.

---

### Task 8: Build the unified contributor/admin web shell

**Files:**
- Replace: `public/index.html`, `styles.css`, `app.js`
- Create: `public/navigation.js`
- Create: `test/unit/navigation.test.ts`
- Create: `test/worker/assets.test.ts`

**Interfaces:**
- Consumes `/api/session` and Phase 1 APIs.
- Produces routes `/`, `/submit`, `/knowledge`, `/search`, `/agent`, `/my-submissions`, and approved admin routes.

- [ ] **Step 1: Write RED pure-navigation tests**: contributor has no admin links; admin has all five; automation has no UI.
- [ ] **Step 2: Build semantic shell** with persistent sidebar, top bar, main outlet, mobile drawer, loading/error states, skip link, focus-visible, aria-current, and live regions.
- [ ] **Step 3: Bootstrap session before navigation** and use an explicit History API route table. Non-admin admin routes show 403 while server remains authoritative.
- [ ] **Step 4: Implement pages**: Home, Submit, Knowledge, Search, Agent, My submissions, Admin dashboard, Pending queue (read-only/Phase 3 notice), Members, Spaces, Audit.
- [ ] **Step 5: Remove APP_TOKEN browser UX**: no prompt, localStorage token, or Authorization injection. Assert `rtk rg -n "memory-token|设置令牌" public` has no matches.
- [ ] **Step 6: Add asset integration tests** for CSP/request ID, unified shell, navigation capability mapping, and server 403.
- [ ] **Step 7: Run full check and commit** `feat: add role-aware knowledge workspace`.

---

### Task 9: Update smoke and Access operations

**Files:**
- Modify: `scripts/smoke.mjs`, `smoke.test.mjs`
- Create: `docs/operations/access-setup.md`
- Modify: `docs/operations/smoke-test.md`, `rollback.md`, `README.md`, `ROADMAP.md`
- Finalize: `wrangler.jsonc`, generated types after authorized D1 provisioning

**Interfaces:**
- Consumes `MEMORY_GARDEN_ACCESS_CLIENT_ID`, `MEMORY_GARDEN_ACCESS_CLIENT_SECRET`, `MEMORY_GARDEN_TOKEN`, `MEMORY_GARDEN_BASE_URL`.

- [ ] **Step 1: Write RED smoke tests** requiring both Access headers plus APP_TOKEN, failing before network when missing, and proving output redacts all three secrets. Assert smoke never calls admin APIs.
- [ ] **Step 2: Send service-token headers** on every smoke request; retain HTTPS-only remote and opt-in loopback HTTP. Test only automation-authorized legacy paths.
- [ ] **Step 3: Write exact runbook**: GitHub OAuth homepage/callback, IdP test, self-hosted application, email Allow policy, separate Service Auth policy, audience tag, secret setup, workers.dev disabled, Access-first deployment, rollback.
- [ ] **Step 4: Provision remote D1 only with explicit authorization**:
  `rtk npx wrangler d1 create memory-garden-control-plane` then remote migration apply. Store only the returned UUID.
- [ ] **Step 5: Update evidence boundaries** in README/ROADMAP; do not mark remote GitHub/D1/disabled/service-token/DO evidence complete until verified.
- [ ] **Step 6: Run** smoke tests, full check, diff check, and `npm audit --omit=dev`; never use audit fix --force.
- [ ] **Step 7: Commit** `docs: add Phase 1 Access operations`.

---

## Final Review Gate

1. Generate a full base-to-HEAD diff.
2. Independently review JWT/JWK validation, Service Token separation, D1 ownership, unique admin bootstrap, legacy API/DO compatibility, UI capability rendering, secret/log safety, migrations, and rollback.
3. Fix every P0/P1 and applicable P2 with regression tests.
4. Run a fresh `rtk npm run check` on the exact integration tree.
5. Do not deploy, create D1, apply remote migrations, configure Access, or run remote smoke without explicit authorization.

## Remote Completion Checklist

- [ ] D1 created and migrations applied remotely.
- [ ] GitHub IdP test succeeds.
- [ ] Unauthenticated custom-domain browser redirects to Access.
- [ ] Bootstrap email becomes the only active admin.
- [ ] Another allowlisted email becomes active contributor.
- [ ] Disabled contributor is rejected by the application.
- [ ] Contributor receives 403 for every admin API.
- [ ] Service Token + APP_TOKEN smoke passes without exposing secrets.
- [ ] Legacy notes remain readable after later DO activation.
- [ ] Production and preview workers.dev URLs remain disabled.

