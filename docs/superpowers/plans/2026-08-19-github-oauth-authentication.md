# GitHub OAuth Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cloudflare Access with GitHub OAuth browser login, D1-backed sessions, and replay-resistant HMAC automation authentication without changing existing knowledge, control-plane, role, or audit behavior.

**Architecture:** The Worker owns the OAuth start/callback flow and exchanges GitHub credentials through a fixed-origin client. Verified allowlisted GitHub identities resolve through the existing members table, browser principals resolve from hashed D1 sessions, and automation principals require both HMAC request signing and `APP_TOKEN` with D1 nonce replay protection. Existing capability enforcement and business services remain authoritative.

**Tech Stack:** Cloudflare Workers, D1, Durable Objects, Workers Assets, Web Crypto API, TypeScript 7, Vitest 4 with `@cloudflare/vitest-pool-workers`, vanilla browser JavaScript.

**Spec:** `docs/superpowers/specs/2026-08-19-github-oauth-authentication-design.md`

## Global Constraints

- Preserve `KnowledgeBase`, Durable Object migration `v1`, `personal`, Computer VFS paths, note index, journal recovery, and all legacy API response bodies/status codes.
- Preserve existing D1 member IDs, roles, disabled state, submissions, audit relationships, Spaces, Collections, and pagination contracts.
- Use append-only migration `0002`; never rewrite `migrations/0001_phase1_control_plane.sql` or create another D1 database.
- GitHub tokens, OAuth codes, cookie values, HMAC values, `APP_TOKEN`, emails, GitHub IDs, state, verifier, nonce, and upstream bodies must not enter logs or error responses.
- Browser state-changing routes require exact same-origin HTTPS `Origin`; automation never authenticates with cookies.
- Browser sessions expire absolutely after seven days and retain at most five live sessions per member.
- OAuth state/verifier cookies expire after ten minutes; GitHub calls use fixed HTTPS origins, no redirects, timeouts, and bounded response reads.
- Automation requires HMAC-SHA256, `APP_TOKEN`, timestamp skew at most 300 seconds, and a one-use D1 nonce; its capabilities remain exactly `legacy:read` and `legacy:write`.
- Tests must use local fakes only. Do not contact GitHub, Cloudflare Access, remote D1, Workers AI, or production.
- Do not apply remote migrations, write remote secrets, deploy, or run production smoke during implementation.

## File Structure

- `migrations/0002_github_auth.sql`: append-only session and automation nonce schema.
- `src/identity/github-oauth.ts`: OAuth configuration, PKCE/state, fixed-origin GitHub exchange, verified-primary identity extraction.
- `src/identity/oauth-cookies.ts`: strict temporary/session cookie parsing and serialization.
- `src/identity/session.ts`: session repository/service, hashing, expiry, eviction, logout, member lookup.
- `src/identity/automation.ts`: canonical request hashing, HMAC verification, APP token verification, nonce claim.
- `src/identity/principal.ts`: mutually exclusive session/automation principal selection.
- `src/members/{types,repository,service}.ts`: provider-neutral identity subject and atomic old-member linking.
- `src/routes/auth.ts`: `/auth/github`, callback, and logout HTTP behavior.
- `src/app.ts`: public auth routes, authenticated API composition, CSRF enforcement, request-body reuse.
- `public/{index.html,app.js,styles.css}`: anonymous login and authenticated logout UI.
- `scripts/{smoke.mjs,smoke.test.mjs}`: signed automation smoke and secret-redaction tests.
- `docs/operations/{github-oauth-setup,smoke-test,rollback}.md`, `README.md`: setup, migration, deployment, verification, rollback boundaries.

---

### Task 1: Append-only authentication schema and generated bindings

**Files:**
- Create: `migrations/0002_github_auth.sql`
- Modify: `src/env.d.ts`
- Modify: `config/types.env`
- Modify: `vitest.config.ts`
- Test: `test/worker/migrations.test.ts`

**Interfaces:**
- Consumes: existing `Env.DB: D1Database` and migration runner from `test/fixtures/d1.ts`.
- Produces: `auth_sessions(token_hash, member_id, created_at, expires_at, last_seen_at)` and `automation_nonces(client_id, nonce, expires_at)` plus environment fields `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `ALLOWED_MEMBER_EMAILS`, `AUTOMATION_CLIENT_ID`, `AUTOMATION_SECRET`, and `APP_TOKEN`.

- [ ] **Step 1: Write failing migration tests**

Add a fresh-D1 test that applies all migrations and asserts the two tables and required indexes exist, foreign keys reject an unknown `member_id`, duplicate `(client_id, nonce)` fails, and migration `0001` data remains readable after `0002`.

```ts
expect(await tableNames(env.DB)).toEqual(expect.arrayContaining(["members", "auth_sessions", "automation_nonces"]));
await expect(env.DB.prepare("INSERT INTO automation_nonces (client_id, nonce, expires_at) VALUES (?, ?, ?)")
  .bind("smoke", "same", future).run()).resolves.toBeDefined();
await expect(env.DB.prepare("INSERT INTO automation_nonces (client_id, nonce, expires_at) VALUES (?, ?, ?)")
  .bind("smoke", "same", future).run()).rejects.toThrow();
```

- [ ] **Step 2: Run the migration test and verify RED**

Run: `rtk npx vitest run test/worker/migrations.test.ts`

Expected: FAIL because migration `0002` and its tables do not exist.

- [ ] **Step 3: Add the schema and environment declarations**

Use `token_hash TEXT PRIMARY KEY`, a foreign key to `members(id)`, ISO timestamp text fields, `(member_id, expires_at, created_at)` and `expires_at` indexes. Use `(client_id, nonce)` as the nonce primary key and add an `expires_at` index. Add only fake non-secret values to `config/types.env` and local Vitest bindings.

- [ ] **Step 4: Generate and verify Worker types**

Run: `rtk npx wrangler types`

Run: `rtk npm run types:check && rtk npm run typecheck && rtk npx vitest run test/worker/migrations.test.ts`

Expected: generated types current, TypeScript PASS, migration test PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add migrations/0002_github_auth.sql src/env.d.ts worker-configuration.d.ts config/types.env vitest.config.ts test/worker/migrations.test.ts
rtk git commit -m "feat: add GitHub authentication schema"
```

### Task 2: GitHub OAuth protocol and strict cookie primitives

**Files:**
- Create: `src/identity/github-oauth.ts`
- Create: `src/identity/oauth-cookies.ts`
- Create: `test/unit/github-oauth.test.ts`
- Create: `test/unit/oauth-cookies.test.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Consumes: Web Crypto, injected `fetch`, and the configured canonical origin `https://memory.crgmhrc.asia`.
- Produces:

```ts
export interface GitHubIdentity { subject: `github:${string}`; githubUserId: string; email: string }
export interface OAuthStart { authorizationUrl: string; state: string; verifier: string }
export interface GitHubOAuthClient {
  createStart(): Promise<OAuthStart>;
  resolveCallback(code: string, verifier: string): Promise<GitHubIdentity>;
}
export function readUniqueCookie(request: Request, name: string, maxBytes: number): string | undefined;
export function oauthCookie(name: "__Host-oauth-state" | "__Host-oauth-verifier", value: string): string;
export function clearCookie(name: string): string;
```

- [ ] **Step 1: Write failing PKCE and callback tests**

Cover random state/verifier, RFC 7636 S256 challenge, exact callback/scope/`allow_signup=false`, token exchange body, `GET /user`, `GET /user/emails`, API version/media headers, and selection of exactly one `primary && verified` email.

```ts
expect(start.authorizationUrl).toContain("code_challenge_method=S256");
expect(identity).toEqual({ subject: "github:42", githubUserId: "42", email: "admin@example.test" });
```

Also cover malformed/duplicate primary emails, non-positive/non-integer IDs, non-HTTPS or redirected upstream responses, timeouts, oversized bodies, stable errors, and absence of upstream bodies/tokens in errors.

- [ ] **Step 2: Write failing cookie tests**

Cover duplicate cookie names, oversized/malformed values, exact host cookie attributes, ten-minute temporary cookies, seven-day session cookie, and deletion via `Max-Age=0`.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `rtk npx vitest run test/unit/github-oauth.test.ts test/unit/oauth-cookies.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement the minimal fixed-origin OAuth client and cookies**

Use injected dependencies for `fetch`, `now`, and random bytes. Decode bounded JSON only after checking status/content type; always request `redirect: "error"`; map all GitHub failures to `AppError` codes such as `OAUTH_UPSTREAM_UNAVAILABLE` without attaching a cause or response body. Cookie readers return at most one canonical ASCII value and reject ambiguity.

- [ ] **Step 5: Run focused and static checks**

Run: `rtk npx vitest run test/unit/github-oauth.test.ts test/unit/oauth-cookies.test.ts && rtk npm run typecheck`

Expected: all focused tests PASS and TypeScript PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/identity/github-oauth.ts src/identity/oauth-cookies.ts src/config.ts test/unit/github-oauth.test.ts test/unit/oauth-cookies.test.ts
rtk git commit -m "feat: implement GitHub OAuth protocol"
```

### Task 3: Allowlisted member resolution and identity linking

**Files:**
- Modify: `src/members/types.ts`
- Modify: `src/members/repository.ts`
- Modify: `src/members/service.ts`
- Modify: `src/audit/types.ts`
- Modify: `src/audit/repository.ts`
- Modify: `src/identity/principal.ts`
- Modify: `src/routes/admin.ts`
- Modify: `test/unit/members-service.test.ts`
- Modify: `test/unit/audit.test.ts`
- Modify: `test/unit/policy.test.ts`
- Modify: `test/unit/principal.test.ts`
- Modify: `test/worker/members.test.ts`
- Modify: `test/worker/phase1.test.ts`

**Interfaces:**
- Consumes: `GitHubIdentity` and canonical allowlist configuration.
- Produces:

```ts
export interface MemberIdentity { identitySubject: string; email: string }
export interface MembersRepositoryPort {
  findByIdentitySubject(subject: string): Promise<Member | null>;
  findByCanonicalEmail(email: string, limit: 2): Promise<Member[]>;
  linkIdentityWithAudit(memberId: string, expectedSubject: string, newSubject: string, updatedAt: string, audit: CreateAuditEvent): Promise<Member | null>;
}
export class MembersService {
  resolveGitHubLogin(identity: GitHubIdentity): Promise<Member>;
}
```

- [ ] **Step 1: Write failing service tests**

Cover absent/invalid/duplicate allowlist entries, bootstrap email outside allowlist, allowed contributor, sole bootstrap admin, disabled member, exact canonical email link, multiple email rows fail closed, subject conflict, and arbitrary repository errors never create/link accounts.

- [ ] **Step 2: Write failing D1 concurrency/audit tests**

Run two simultaneous first logins for the bootstrap email and assert one admin only; run subject linking and assert member ID/role/status unchanged plus exactly one `member.identity_linked` audit with metadata `{ provider: "github" }` and no email/GitHub ID/subject.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `rtk npx vitest run test/unit/members-service.test.ts test/unit/audit.test.ts test/worker/members.test.ts`

Expected: FAIL on missing GitHub resolver/linking contract and audit action.

- [ ] **Step 4: Implement provider-neutral member names and atomic linking**

Keep the SQL column `access_sub`, but replace every application/test use of `accessSub` with `identitySubject`, including `MemberPrincipal` and the admin DTO omission. Use conditional SQL `UPDATE ... WHERE id = ? AND access_sub = ?`, pair it with audit through `D1Database.batch`, require exactly one change for both statements, and recover only classified subject/admin conflicts. Do not update role/status/email during linking.

- [ ] **Step 5: Run focused and regression tests**

Run: `rtk npx vitest run test/unit/members-service.test.ts test/unit/audit.test.ts test/worker/members.test.ts && rtk npm run typecheck`

Expected: all tests PASS; existing status/pagination behavior remains green.

- [ ] **Step 6: Commit**

```bash
rtk git add src/members src/audit src/identity/principal.ts src/routes/admin.ts test/unit test/worker/members.test.ts test/worker/phase1.test.ts
rtk git commit -m "feat: link GitHub member identities"
```

### Task 4: D1 browser sessions and CSRF boundary

**Files:**
- Create: `src/identity/session.ts`
- Create: `test/unit/session.test.ts`
- Create: `test/worker/session.test.ts`
- Modify: `src/http.ts`

**Interfaces:**
- Consumes: `MembersRepositoryPort.findById`, `__Host-memory-session`, D1, injected clock/random source.
- Produces:

```ts
export interface SessionPrincipalRecord { member: Member; tokenHash: string }
export class SessionService {
  create(member: Member): Promise<{ token: string; expiresAt: string }>;
  resolve(request: Request): Promise<Member>;
  logout(request: Request): Promise<void>;
}
export function requireSameOrigin(request: Request, canonicalOrigin: string): void;
```

- [ ] **Step 1: Write failing unit tests**

Cover 256-bit token generation, SHA-256-only persistence, exact seven-day expiry, no sliding extension, malformed/duplicate cookies, expired session, disabled member, missing member, exact/foreign/missing `Origin`, and idempotent logout.

- [ ] **Step 2: Write failing real-D1 tests**

Create six sessions and assert only the five newest unexpired rows remain. Run concurrent sixth/seventh session creation and assert the bound still holds. Assert raw token is absent from all D1 text fields.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `rtk npx vitest run test/unit/session.test.ts test/worker/session.test.ts`

Expected: FAIL because `SessionService` is missing.

- [ ] **Step 4: Implement bounded D1 session operations**

Store lowercase hex SHA-256 only. Execute a transactional `D1Database.batch` containing the session insert followed by a bounded delete of the same member's rows selected by `ORDER BY expires_at DESC, created_at DESC, token_hash DESC LIMIT -1 OFFSET 5`; require one inserted row and verify parallel logins retain exactly five. Resolve sessions by joining `auth_sessions` to `members`, reject expiry/status before constructing a principal, and delete expired rows through a separate bounded `LIMIT 50` cleanup statement registered with `waitUntil`. Do not use an in-memory mutex.

- [ ] **Step 5: Run focused and static checks**

Run: `rtk npx vitest run test/unit/session.test.ts test/worker/session.test.ts && rtk npm run typecheck`

Expected: focused tests and TypeScript PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/identity/session.ts src/http.ts test/unit/session.test.ts test/worker/session.test.ts
rtk git commit -m "feat: add D1 browser sessions"
```

### Task 5: Replay-resistant automation authentication

**Files:**
- Create: `src/identity/automation.ts`
- Create: `test/unit/automation.test.ts`
- Create: `test/worker/automation.test.ts`
- Modify: `src/http.ts`
- Modify: `src/auth.ts`

**Interfaces:**
- Consumes: exact request method, `pathname + search`, timestamp, canonical base64url nonce, raw request bytes, `AUTOMATION_SECRET`, and `APP_TOKEN`.
- Produces:

```ts
export interface VerifiedAutomationRequest { bodyBytes: Uint8Array }
export class AutomationAuthenticator {
  verify(request: Request, maxBodyBytes: number): Promise<VerifiedAutomationRequest>;
}
export function requestFromVerifiedBytes(request: Request, bodyBytes: Uint8Array): Request;
```

- [ ] **Step 1: Write failing canonicalization/crypto tests**

Use fixed vectors for empty-body SHA-256, non-ASCII body bytes, path+query ordering, timestamp at ±300 seconds, lower-case hex HMAC, invalid hex/nonce/ID, wrong HMAC, wrong APP token, missing factor, and fixed-length comparison behavior.

- [ ] **Step 2: Write failing D1 replay tests**

Send one valid signed request twice; first succeeds and second returns stable replay rejection. Verify invalid signatures do not consume nonces, cleanup is bounded, and parallel same-nonce requests yield exactly one winner.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `rtk npx vitest run test/unit/automation.test.ts test/worker/automation.test.ts`

Expected: FAIL because automation authentication is missing.

- [ ] **Step 4: Implement signature verification and exact-body reuse**

Read the body once up to the route's transport cap, hash those exact bytes, verify HMAC and `APP_TOKEN`, then insert the nonce before returning a reconstructed request over the same bytes. Reject all partial header sets. Never log header values or attach crypto errors as causes.

- [ ] **Step 5: Run focused and static checks**

Run: `rtk npx vitest run test/unit/automation.test.ts test/worker/automation.test.ts && rtk npm run typecheck`

Expected: focused tests and TypeScript PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/identity/automation.ts src/http.ts src/auth.ts test/unit/automation.test.ts test/worker/automation.test.ts
rtk git commit -m "feat: authenticate signed automation requests"
```

### Task 6: Principal composition and OAuth/session HTTP routes

**Files:**
- Create: `src/routes/auth.ts`
- Modify: `src/identity/principal.ts`
- Modify: `src/app.ts`
- Modify: `src/routes/session.ts`
- Modify: `src/authorization/policy.ts`
- Modify: `test/unit/principal.test.ts`
- Modify: `test/unit/policy.test.ts`
- Modify: `test/worker/app.test.ts`
- Modify: `test/worker/phase1.test.ts`

**Interfaces:**
- Consumes: `GitHubOAuthClient`, `MembersService.resolveGitHubLogin`, `SessionService`, and `AutomationAuthenticator`.
- Produces public `GET /auth/github`, `GET /auth/github/callback`, `POST /auth/logout`; cookie-authenticated `/api/session`; mutually exclusive member/automation `Principal` resolution.

- [ ] **Step 1: Write failing principal boundary tests**

Cover valid session member, signed automation, no credentials, invalid session, partial automation headers, cookie plus any automation header, ignored `Cf-Access-*` headers, disabled session member, and proof that a valid member cookie plus APP token cannot become automation.

- [ ] **Step 2: Write failing Worker OAuth route tests**

Cover start redirect and two temporary cookies; callback state mismatch/denial/upstream failure with both cookies cleared; allowlisted success creating the session cookie and redirecting only to `/`; anonymous `/api/session` 401; authenticated session response with `/auth/logout`; logout CSRF and clearing behavior.

- [ ] **Step 3: Write failing route-capability and request-body tests**

Assert automation can call only health/notes/search/chat; member capabilities remain unchanged; member unsafe requests require same-origin `Origin`; signed POST bytes reach existing JSON parsing unchanged; all stable API status/body contracts remain intact.

- [ ] **Step 4: Run focused tests and verify RED**

Run: `rtk npx vitest run test/unit/principal.test.ts test/unit/policy.test.ts test/worker/app.test.ts test/worker/phase1.test.ts`

Expected: FAIL because the app still selects Cloudflare Access and has no auth routes.

- [ ] **Step 5: Compose auth services and routes**

Dispatch `/auth/*` before API authentication and before asset fallback. Construct request-scoped D1 repositories, pass `ExecutionContext.waitUntil` only for bounded background cleanup/last-seen work, reconstruct signed requests before JSON parsing, and preserve the single safe error/log boundary. Change the session response `logoutUrl` to `/auth/logout`.

- [ ] **Step 6: Remove Access runtime code after all callers are migrated**

Delete `src/identity/access-jwt.ts` and `test/fixtures/access-jwt.ts`; remove `jose`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, Access verifier injection, and Access-specific tests/config. Run `rtk npm install` only to update the lockfile after dependency removal.

- [ ] **Step 7: Run focused and full API regression tests**

Run: `rtk npx vitest run test/unit/principal.test.ts test/unit/policy.test.ts test/worker/app.test.ts test/worker/phase1.test.ts`

Run: `rtk npm run typecheck`

Expected: focused tests and TypeScript PASS; no source reference to `Cf-Access-Jwt-Assertion` except explicit ignored-header regression/documentation.

- [ ] **Step 8: Commit**

```bash
rtk git add src test package.json package-lock.json vitest.config.ts
rtk git commit -m "feat: compose GitHub session authentication"
```

### Task 7: Anonymous login UI and signed local smoke

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `public/navigation.js`
- Modify: `test/unit/navigation.test.ts`
- Modify: `test/unit/workspace-ui.test.ts`
- Modify: `test/worker/assets.test.ts`
- Modify: `scripts/smoke.mjs`
- Modify: `scripts/smoke.test.mjs`

**Interfaces:**
- Consumes: anonymous `/api/session` 401, `/auth/github`, `/auth/logout`, and the automation signing contract from Task 5.
- Produces: public anonymous GitHub login view, authenticated role-aware shell, POST logout, and locally testable signed automation smoke.

- [ ] **Step 1: Write failing UI and asset tests**

Assert anonymous bootstrap renders the GitHub login action without member navigation/API fan-out; authenticated bootstrap remains capability-driven; logout performs POST and returns to login; browser assets contain no `APP_TOKEN`, automation secret/header generation, GitHub token, Access logout URL, or Access copy.

- [ ] **Step 2: Write failing smoke contract tests**

Use a local server to validate all five automation headers, recompute the canonical HMAC over exact body bytes, reject redirects before credentials can cross origin, and reflect each configured secret through response/request-ID fields to prove output redaction.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `rtk npx vitest run test/unit/navigation.test.ts test/unit/workspace-ui.test.ts test/worker/assets.test.ts && rtk npm run test:smoke`

Expected: FAIL because UI assumes Access session and smoke uses Access service headers.

- [ ] **Step 4: Implement anonymous/authenticated UI states**

Keep the shell public but inert until `/api/session` succeeds. Treat 401 as anonymous rather than a page error, render one `/auth/github` link, retain deep-link path across successful session bootstrap only through the current browser URL, and post logout with same-origin credentials.

- [ ] **Step 5: Implement signed smoke without printing credentials**

Read `AUTOMATION_CLIENT_ID`, `AUTOMATION_SECRET`, and `APP_TOKEN` from environment; generate timestamp/nonce per request; sign method/path/query/body; keep `redirect: "error"`; sanitize request IDs against all configured credentials; continue exercising only health/notes/search/chat.

- [ ] **Step 6: Run focused tests**

Run: `rtk npx vitest run test/unit/navigation.test.ts test/unit/workspace-ui.test.ts test/worker/assets.test.ts && rtk npm run test:smoke`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add public test/unit/navigation.test.ts test/unit/workspace-ui.test.ts test/worker/assets.test.ts scripts/smoke.mjs scripts/smoke.test.mjs
rtk git commit -m "feat: add GitHub login workspace UI"
```

### Task 8: Operations, rollback, and full acceptance gate

**Files:**
- Create: `docs/operations/github-oauth-setup.md`
- Modify: `docs/operations/smoke-test.md`
- Modify: `docs/operations/rollback.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `wrangler.jsonc`
- Test: `test/worker/migrations.test.ts`
- Test: `scripts/smoke.test.mjs`

**Interfaces:**
- Consumes: all Tasks 1–7.
- Produces: exact local/remote commands and explicit evidence boundaries; no remote action is performed by this task.

- [ ] **Step 1: Write the operations contract**

Document GitHub OAuth App creation with homepage `https://memory.crgmhrc.asia` and callback `https://memory.crgmhrc.asia/auth/github/callback`; distinguish non-secret IDs from secrets; list exact `wrangler secret put` commands; provide local migration/check commands and separately labeled authorized remote migration/deploy/smoke commands.

- [ ] **Step 2: Document safe rollout and rollback**

Order rollout as OAuth App → migration `0002` → secrets → deploy → browser/admin/contributor/disabled/logout/signed-smoke checks → obsolete Access secret removal. State that D1 migration and Durable Object data must never be rolled back/deleted, and that a linked `github:<id>` subject requires a forward-compatible emergency Worker rather than the old Access build.

- [ ] **Step 3: Remove obsolete Access operations/config references**

Remove Access Service Token variables, Zero Trust onboarding, `/cdn-cgi/access/logout`, and Access policy instructions. Retain `workers_dev: false`, `preview_urls: false`, `KnowledgeBase` migration `v1`, D1 binding ID, and asset Worker-first configuration.

- [ ] **Step 4: Run secret and stale-reference scans**

Run:

```bash
rtk rg -n "CF_ACCESS_CLIENT|ACCESS_TEAM_DOMAIN|ACCESS_AUD|cdn-cgi/access|Cf-Access-Jwt-Assertion" README.md ROADMAP.md docs scripts src public test wrangler.jsonc config
rtk rg -n "GITHUB_OAUTH_CLIENT_SECRET|AUTOMATION_SECRET|APP_TOKEN" public
```

Expected: first scan finds only explicitly documented removal/migration history or ignored-header security regression; second scan returns no browser secret references.

- [ ] **Step 5: Run the fresh full gate**

Run: `rtk npm run check`

Expected: generated types current, TypeScript PASS, smoke/unit/real-workerd suites PASS, Wrangler dry-run build PASS.

Run: `rtk npm audit --omit=dev`

Expected: zero production vulnerabilities.

Run: `rtk git diff --check && rtk git status --short`

Expected: no whitespace errors; only the intended Task 8 files are modified before commit.

- [ ] **Step 6: Commit**

```bash
rtk git add README.md ROADMAP.md docs/operations wrangler.jsonc test/worker/migrations.test.ts scripts/smoke.test.mjs
rtk git commit -m "docs: add GitHub authentication operations"
```

## Final Review Checklist

- [ ] Map every design-spec section to at least one passing test or operations instruction.
- [ ] Independently review authentication ambiguity, OAuth redirect/fetch boundaries, session concurrency, member-link audit atomicity, HMAC body reuse, nonce replay, CSRF, secret redaction, and rollback compatibility.
- [ ] Run `rtk npm run check`, `rtk npm audit --omit=dev`, `rtk git diff --check`, and `rtk git status --short` from a clean post-review worktree.
- [ ] Record that remote migration, secret writes, deployment, GitHub OAuth registration, and production smoke were not performed.
