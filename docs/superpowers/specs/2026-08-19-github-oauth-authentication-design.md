# GitHub OAuth Authentication Design

## Goal

Replace Cloudflare Access with a Worker-native GitHub OAuth login, D1-backed browser sessions, and replay-resistant HMAC automation authentication so Memory Garden can operate without Cloudflare Zero Trust or a Zero Trust billing profile.

## Constraints

- Preserve the existing D1 members, roles, disabled state, submissions, audit relationships, Spaces, Collections, and pagination contracts.
- Preserve `KnowledgeBase`, Durable Object migration `v1`, `personal`, Computer VFS paths, note index, journal recovery, and all legacy API response bodies/status codes.
- Browser authentication must not use `APP_TOKEN`, localStorage credentials, GitHub tokens, or Cloudflare Access assertions.
- GitHub access tokens are request-scoped only and must never enter D1, cookies, logs, errors, audit metadata, or fixtures.
- Authentication migrations are append-only. Do not create a second D1 database or rewrite migration `0001`.
- All tests use local GitHub HTTP fakes, local D1/DO, and fake Workers AI. No test contacts GitHub, Cloudflare Access, remote D1, or production.
- Deployment, remote migration, secret writes, and production smoke remain separately authorized operations.

## Architecture

```text
Browser
  -> GET /auth/github
  -> GitHub OAuth authorization (state + PKCE S256)
  -> GET /auth/github/callback
  -> Worker exchanges code and reads /user + /user/emails
  -> allowlist + member resolution
  -> D1 auth_sessions
  -> __Host-memory-session cookie
  -> existing principal/capability/API layers

Automation
  -> HMAC request signature + APP_TOKEN
  -> D1 one-time nonce claim
  -> restricted automation principal
  -> legacy health/notes/search/chat only
```

Cloudflare remains the runtime, database, Durable Object, asset, and AI provider. Cloudflare Zero Trust is removed from the request path and production prerequisites.

## GitHub OAuth flow

### Start

`GET /auth/github` generates:

- a cryptographically random OAuth `state`;
- a cryptographically random PKCE `code_verifier`;
- an S256 `code_challenge`.

The Worker writes two ten-minute host-only cookies:

```text
__Host-oauth-state
__Host-oauth-verifier
```

Both cookies use `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`. The Worker redirects to GitHub with the exact production callback URL, `state`, `code_challenge`, `code_challenge_method=S256`, `scope=read:user user:email`, and `allow_signup=false`.

Only one in-progress OAuth flow per browser is supported. Starting another flow replaces the prior temporary cookies.

### Callback

`GET /auth/github/callback`:

1. Clears both temporary cookies on every terminal success or failure.
2. Rejects missing, malformed, expired, or mismatched state using a fixed content-free error.
3. Exchanges the temporary code using the client secret, exact redirect URI, and PKCE verifier.
4. Fetches the authenticated GitHub user and email list using explicit GitHub API version and media headers.
5. Requires a positive integer GitHub user ID and exactly one selected email that is both `verified` and `primary`.
6. Canonicalizes the email by trim and lowercase, then checks `ALLOWED_MEMBER_EMAILS`.
7. Resolves or creates the member, creates a browser session, and redirects to `/`.

GitHub denial and upstream/token/user/email failures produce stable errors without relaying GitHub response bodies or tokens. Token exchange and identity requests use bounded response reads, timeouts, no redirects, and HTTPS-only fixed GitHub endpoints.

## Member eligibility and migration

`ALLOWED_MEMBER_EMAILS` is a comma-separated Worker secret. Parsing trims, lowercases, rejects empty entries and duplicates, and fails closed when absent or invalid. `BOOTSTRAP_ADMIN_EMAIL` must be a member of this allowlist.

New GitHub subjects use:

```text
github:<numeric-user-id>
```

The database column `members.access_sub` remains unchanged for migration compatibility, while application types and service interfaces call it `identitySubject`.

Login resolution order:

1. Find `github:<id>`.
2. If absent, find members whose canonical email equals the verified GitHub email.
3. Exactly one match is atomically rebound to `github:<id>` without changing its member ID, role, status, submissions, or audit relationships.
4. Zero matches follow the existing conflict-safe first-login bootstrap: the configured bootstrap email may become the sole active admin only when no active admin exists; other eligible users become active contributors.
5. Multiple email matches fail closed with an identity-conflict error and no session.

Disabled members never receive a session. Existing disabled status remains authoritative on every authenticated request.

## Browser sessions

Migration `0002` creates `auth_sessions` with:

- opaque session ID/hash primary identity;
- `member_id` foreign key;
- `created_at`, `expires_at`, and `last_seen_at` timestamps;
- an index supporting member session count/oldest-session eviction;
- an index supporting bounded expiration cleanup.

The browser receives a 256-bit random token in:

```text
__Host-memory-session=<opaque-token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
```

D1 stores only SHA-256(token), never the raw token. Sessions have a seven-day absolute lifetime with no sliding extension. At most five unexpired sessions are retained per member; a successful sixth login deletes the oldest in the same coordinated service operation. Expired sessions are rejected and may be removed opportunistically with bounded queries.

`POST /auth/logout` validates same-origin `Origin`, deletes the matching session, and always clears the cookie. Logout is idempotent. Every request resolves the session against the current member row, so disabled members fail immediately even if the session has not expired.

All browser state-changing routes validate an exact same-origin HTTPS `Origin`. Missing or foreign origins fail closed. Automation requests do not use cookies and are governed by their signature.

## Principal resolution

Resolution is mutually exclusive:

- A valid session cookie selects the member path.
- An automation signature header selects the automation path and requires the complete automation scheme.
- Supplying both member cookie and automation credentials is rejected as ambiguous; credentials never elevate a member.
- Missing credentials return a stable 401.

Cloudflare `Cf-Access-Jwt-Assertion`, `CF-Access-Client-Id`, and `CF-Access-Client-Secret` have no authentication meaning and cannot select a principal.

## Automation authentication

Automation requests include:

```text
X-Automation-Id
X-Automation-Timestamp
X-Automation-Nonce
X-Automation-Signature
Authorization: Bearer <APP_TOKEN>
```

The canonical signing string is UTF-8 text with newline separators:

```text
<UPPERCASE_METHOD>
<pathname-and-query>
<unix-seconds>
<base64url-nonce>
<lowercase-hex-SHA256-body>
```

`X-Automation-Signature` is lowercase hexadecimal HMAC-SHA256 using `AUTOMATION_SECRET`. The Worker:

1. Requires an exact configured `AUTOMATION_CLIENT_ID` match without logging it.
2. Parses a safe integer timestamp and rejects clock skew greater than 300 seconds.
3. Validates a bounded canonical base64url nonce.
4. Reads the request body once with the existing route-specific byte limit, hashes the exact bytes, and makes the same bytes available to the route parser.
5. Computes HMAC and compares fixed-length decoded bytes without early exit.
6. Verifies `APP_TOKEN` with the existing fixed-length digest comparison.
7. Atomically inserts the nonce into D1; a unique conflict is a replay rejection.

Migration `0002` creates `automation_nonces` keyed by `(client_id, nonce)` with `expires_at` plus an expiration index. Cleanup is bounded and best-effort. A nonce is claimed only after both cryptographic checks pass and before business mutation dispatch.

Automation capabilities remain exactly `legacy:read` and `legacy:write`; it cannot call session, member, Space, Collection, submission, or audit APIs.

## Configuration

Required production secrets/configuration:

```text
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
BOOTSTRAP_ADMIN_EMAIL
ALLOWED_MEMBER_EMAILS
AUTOMATION_CLIENT_ID
AUTOMATION_SECRET
APP_TOKEN
```

The GitHub OAuth App uses:

```text
Homepage: https://memory.crgmhrc.asia
Callback: https://memory.crgmhrc.asia/auth/github/callback
```

Production no longer requires `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD`. Documentation and smoke configuration remove Access Service Token variables.

## UI behavior

The static shell remains publicly retrievable, but no knowledge or member data is embedded in it. `/api/session` returns 401 for an anonymous browser. The application renders a GitHub login action pointing to `/auth/github`; it does not render member navigation or issue business API requests until session bootstrap succeeds.

Authenticated contributor/admin navigation and pages remain unchanged. Logout posts to `/auth/logout`, clears local UI state, and returns to the login view.

## Audit behavior

The existing `member.login` action records only successful new member creation. Rebinding an existing member records a new allowlisted `member.identity_linked` event containing member ID and provider name only; it contains no email, GitHub ID, OAuth code, token, cookie, or subject. Routine session creation, use, expiration, and logout are not audited to avoid high-volume security-noise records. Authentication failures are content-free operational logs with request ID only.

Automation nonce claims are not audit events. Existing business-action auditing remains unchanged.

## Error and security boundaries

- OAuth endpoints never redirect to arbitrary user-provided URLs; successful login returns to `/` only.
- External fetches use fixed GitHub origins, reject redirects, set timeouts, and bound response sizes.
- OAuth codes, access tokens, cookie values, HMAC values, APP_TOKEN, emails, GitHub IDs, state, verifier, nonce, and upstream bodies are never logged.
- Authentication errors use stable codes and generic messages.
- Cookie parsing rejects duplicates, malformed encoding, oversized values, and ambiguous authentication inputs.
- D1 list and cleanup operations remain bounded; no routine authentication query uses `COUNT(*)` or an unbounded read.

## Testing

Tests must cover:

- state/PKCE generation, callback matching, ten-minute cookies, cookie clearing, and GitHub denial;
- fixed HTTPS GitHub requests, redirect rejection, timeouts, bounded/error-redacted responses;
- verified-primary email selection, allowlist parsing, bootstrap email membership, and non-allowlisted denial;
- new GitHub member, sole bootstrap admin, contributor, disabled member, exact old-member email claim, multiple-email conflict, and concurrent first login;
- session hashing, seven-day absolute expiry, five-session eviction, logout, disabled-member immediate rejection, malformed/duplicate cookies, and CSRF Origin checks;
- HMAC canonicalization, body reuse, wrong signature, wrong APP_TOKEN, missing factor, timestamp boundaries, replayed nonce, nonce cleanup, ambiguous cookie+automation credentials, and capability matrix;
- login UI, logout, anonymous session behavior, deep links, and absence of Access/APP_TOKEN browser code;
- all Phase 0 Durable Object journal/concurrency/API regressions and Phase 1 D1 submission/audit regressions;
- updated local smoke signing without any real GitHub/Cloudflare network request;
- migrations, generated types, dry-run build, secret/documentation redaction, rollback, and release instructions.

## Rollout and rollback

The rollout order is:

1. Create the GitHub OAuth App and store secrets.
2. Apply append-only D1 migration `0002`.
3. Set new Worker secrets and retain APP_TOKEN.
4. Deploy the Worker.
5. Verify anonymous login, bootstrap admin, contributor, disabled user, logout, and signed automation smoke.
6. Remove obsolete Access secrets only after the new flow passes.

Rollback changes Worker code/configuration only. Migration `0002` remains in D1. Every persisted `github:<id>` subject—on both newly created GitHub members and rebound existing members—is unreadable by the old Access verifier, so the old Access build is unsafe after the first successful GitHub login. Recovery uploads a locally reviewed, forward-compatible emergency version, inspects its exact returned version ID, and deploys only that ID with separate authorization. Durable Object, D1, and legacy note data are never reverted or deleted.

## Success criteria

- Browser users can authenticate through GitHub without a Cloudflare Zero Trust organization.
- Only explicitly allowlisted verified-primary emails receive sessions.
- The first eligible bootstrap email becomes the only active admin; existing roles and disabled state survive identity linking.
- Raw browser session and GitHub token material never persists server-side.
- Automation requires both replay-resistant HMAC and APP_TOKEN and retains only legacy capabilities.
- Existing control-plane, legacy note, search, Agent, audit, and UI behavior remains compatible.
- Local full verification passes without remote OAuth, Access, D1, AI, or production calls.
