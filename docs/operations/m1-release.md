# M1 trusted knowledge release runbook

This runbook is the exact release sequence for the M1 text/Markdown/code knowledge loop. It extends, and does not replace, the [production environment handbook](./production-environment-handbook.md), [GitHub OAuth setup](./github-oauth-setup.md), [signed automation smoke](./smoke-test.md), and [rollback rules](./rollback.md).

Writing or testing this runbook is local evidence only. Every command containing `--remote`, `versions upload`, `versions deploy`, or the production domain requires separate operator authorization. No such command was run while Task 9 was implemented.

## Evidence boundary and release invariant

- Local fixtures prove deterministic parser, chunker, authorization, retrieval, citation, UI, recovery, and failure contracts.
- Local Workerd proves the checked-in D1 schema and `KnowledgeBase` Durable Object integration, not production state.
- Production evidence requires a date, commit, exact Worker version ID, and redacted request IDs in [the M1 release evidence template](./evidence/m1-release-template.md).
- Preserve GitHub OAuth, D1 hashed sessions, `__Host-memory-session`, HMAC plus `APP_TOKEN` automation, the `KnowledgeBase` class, and Durable Object migration tag `v1`.
- Migrations `0001` through `0004_m1_gate_completion.sql` are forward-only. Once applied remotely, do not edit, reverse, or delete them. Never delete D1 rows/tables or Durable Object/VFS state to roll back a Worker.
- `GATE-M0` remote evidence is archived for this candidate: OAuth callback, disabled-member rejection, normal Durable Object lifecycle read, signed automation, and Dashboard workers.dev/preview closure. The current status is **M1 production gate accepted**; subsequent code changes require a new evidence record.

Use a fresh copy of [the evidence template](./evidence/m1-release-template.md) for one candidate. Do not place source text, response bodies, cookies, OAuth codes, authorization headers, secret values, or full callback URLs in it.

### Current checklist reconciliation

The fixed provider-free gate proves all 23 local/Workerd M1 atoms, including bilingual UI, exact byte parsing, audited review/resubmission, complete FTS fields, deterministic ranking/highlights/Tag modes, safe Markdown, original download authorization, explicit chat scopes, and confidence refusal. Production `0004`, exact version deployment, signed automation, 13 D1 cost paths, OAuth callback, disabled-member rejection, normal DO lifecycle read, and Dashboard URL closure are archived. `GATE-M1` is accepted for the reviewed version.

## 1. Authorize and capture the candidate

Before any remote command, record the operator approval, candidate commit, working-tree state, production Worker name, D1 database name, and custom domain.

M1 evidence command: `migration-hash-verification`
```bash
rtk npm run verify:m1:migrations -- --files
```

The `M1 evidence command` label identifies an exact, tested, single-line release evidence block. Mandatory blocks use a bare lowercase `bash` or `zsh` info string. For the forbidden-command scan, the first whitespace-delimited info-string word is the language and ASCII case is ignored, so `BASH title=release` is executable shell. Do not combine a mandatory line with another command, continuation, pipe, heredoc, or shell expression. Raw HTML blocks are forbidden everywhere outside fenced code; use Markdown prose instead.

```bash
rtk git status --short
rtk git rev-parse HEAD
rtk npx wrangler whoami
```

The reviewed migration provenance is immutable for this candidate:

| File | Reviewed SHA-256 |
| --- | --- |
| `0001_phase1_control_plane.sql` | `3218f4f3d7a285eb3ee9a4f3a07efa6136c350cc3956564759dbed18f180a929` |
| `0002_github_auth.sql` | `b7dd6aac5cfa4f38aac8b242a3d06d787ec202ec64d09ae4ae3d8ec68d384fc1` |
| `0003_m1_knowledge_loop.sql` | `cfbccb43485043ad2d125f0e6b8238b1e311c18abe12ddeb6bcc8b79e4bb74a3` |
| `0004_m1_gate_completion.sql` | `ebda7d5e04fbded4a2503c28a44160325fefcaef4b354a8e25865d68f1ec81bb` |
| `0005_m2_asset_ingestion.sql` | `49a215ee9af462235989217ec365bacb1adfebb2e585df2ec31fbcdb5180667c` |
| `0006_m2_source_reparse.sql` | `fd77510c130d08650de95fa28a2434158ca0a489dd292c490dfe6460c31dcaff` |
| `0007_m2_chunk_locations.sql` | `0c000b8a2da9c96120d963c290c209dc6dc18a0f42853131d0e7e551c83d50c8` |
| `0008_m2_parent_chunks.sql` | `b9f524d90e2614571178ecb63b2d3386c06ee7936b4662c49b28ca37d9ff5205` |

`verify:m1:migrations` hard-codes the reviewed M1/M2 forward-migration hashes above and compares them with the checked-in file bytes. The checksum command must pass before `whoami`, export, migration, upload, or any other remote action. Stop if any hash differs, the commit is not the reviewed candidate, the worktree is unexpectedly dirty, the Cloudflare account is wrong, `GATE-M0` evidence is missing, or the operator has not separately authorized the next remote action.

Publication recovery treats a legacy intent whose normalized source is semantically empty or produces more than 256 chunks as terminally invalid. The recovery job records no content, revision, review, audit, or indexing job for a pending-content invalid intent and excludes its `failed_terminal` intent from later retries; investigate the underlying submission instead of changing the intent state by hand.

## 2. Export D1 before migration

This is the first remote mutation-adjacent step and needs explicit authorization. Keep the export outside the repository with restrictive permissions; record only its timestamp, byte count, and SHA-256 digest in restricted evidence.

```bash
set +x
M1_BACKUP_DIR="$(rtk mktemp -d -t memory-garden-m1-d1.XXXXXX)"
rtk chmod 700 "$M1_BACKUP_DIR"
M1_BACKUP_FILE="$M1_BACKUP_DIR/pre-m1-release.sql"
rtk npx wrangler d1 export memory-garden-control-plane --remote --output "$M1_BACKUP_FILE"
rtk chmod 600 "$M1_BACKUP_FILE"
rtk shasum -a 256 "$M1_BACKUP_FILE"
rtk wc -c "$M1_BACKUP_FILE"
```

Do not print, attach, or commit the export. Retain it only in the approved backup location. Failure to export blocks migration.

## 3. Run the complete local gate

These commands make no intentional provider or production request. `build` is Wrangler dry-run only.

```bash
rtk npm run test:m1
rtk npm run check
rtk npm audit --omit=dev
rtk git diff --check
```

Record exact counts and command exit status. `test:m1` includes migration/docs/i18n truth gates, release/probe contracts, parser, audit, index-document, search-policy, Markdown-renderer, evidence-confidence, publication/recovery, library/search, cited answer, HTTP API, workspace UI, and the fixed 24-case M1 evaluation. The parser denominator is derived from the independent 34-case fixture; the gate also reports 20 expected retrieval citations; 16 required/returned citations; 16 answers, seven refusals, and one denial; eight language cases; eight download-authorization cases; four ranking cases; and five highlight-safety cases. Recall@5 is at least 0.85; citation precision, recall, and location are 1; per-case outcomes are exact; wrong citations and permission leaks are zero. Removing any required direct production suite fails the release contract. The confidence corpus independently calibrates strong and weak evidence in Latin and Han text; weak evidence refuses before provider invocation.

## 4. Inspect migration `0004` and preservation evidence

Read the entire migration and its upgrade tests before any remote apply:

```bash
rtk sed -n '1,260p' migrations/0004_m1_gate_completion.sql
rtk npx vitest run test/worker/migrations.test.ts
rtk git log -1 -- migrations/0004_m1_gate_completion.sql
set +x
M1_LEDGER_DIR="$(rtk mktemp -d -t memory-garden-m1-ledger.XXXXXX)"
rtk chmod 700 "$M1_LEDGER_DIR"
M1_LEDGER_FILE="$M1_LEDGER_DIR/before-0004.json"
: > "$M1_LEDGER_FILE"
rtk chmod 600 "$M1_LEDGER_FILE"
M1_PENDING_FILE="$M1_LEDGER_DIR/legacy-pending.json"
: > "$M1_PENDING_FILE"
rtk chmod 600 "$M1_PENDING_FILE"
```

M1 evidence command: `pre-ledger-capture`
```bash
rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id" --json > "$M1_LEDGER_FILE"
```

```bash
M1_LEDGER_STATUS=$?
test "$M1_LEDGER_STATUS" -eq 0 || exit "$M1_LEDGER_STATUS"
```

M1 evidence command: `pre-ledger-verification`
```bash
rtk npm run verify:m1:migrations -- --ledger-before "$M1_LEDGER_FILE"
```

M1 evidence command: `legacy-pending-capture`
```bash
rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT count(*) AS legacy_review_pending_without_source_versions FROM submissions WHERE status = 'review_pending'" --json > "$M1_PENDING_FILE"
```

```bash
M1_PENDING_STATUS=$?
test "$M1_PENDING_STATUS" -eq 0 || exit "$M1_PENDING_STATUS"
```

M1 evidence command: `legacy-pending-verification`
```bash
rtk npm run verify:m1:migrations -- --legacy-pending "$M1_PENDING_FILE"
```

Migration `0003` deliberately aborts before its first schema change if any pre-M1 `review_pending` Submission remains. Those rows have no immutable SourceVersion, so copying them into the M1 queue would create queued records that preview and publication cannot read.

If this verifier reports a nonzero count, stop. In a separately approved, reviewed D1 change, resolve each identified row individually to `rejected` while preserving its title/content bytes and append a same-transaction system audit event recording only the Submission ID and reason code `m1_legacy_pending_guard`; never bulk-convert, delete, or fabricate a SourceVersion. If the source is still wanted, resubmit it through the M1 API after migration with a new idempotency key. After all rows are resolved, rerun the zero-count capture, take a new pre-migration export because D1 changed, and restart this runbook from candidate authorization. Draft and already-rejected legacy rows remain byte-preserved by the migration.

Confirm all of the following in review:

- the fail-closed legacy-pending guard reports zero before any schema change, and the submissions table copy preserves all remaining draft/rejected legacy rows before the legacy table is dropped;
- `PRAGMA foreign_key_check` and the upgrade-preservation Workerd cases pass;
- the actual Wrangler `d1_migrations` ledger is an exact prefix of the reviewed ordered set `0001` through `0008`, with no missing, renamed, reordered, or extra row;
- the local reviewed set contains the complete ordered `0001` through `0008` forward-migration set;
- `KnowledgeBase`, Durable Object migration tag `v1`, existing VFS paths, note journal, GitHub identities, sessions, and automation credentials are not migrated or reset.

The verifier requires the reviewed pre-`0004` state, or an exact post-`0004` through post-`0008` prefix, and fails closed for any unexpected ledger state. Do not edit or replay SQL directly; investigate and stop. Keep the restricted ledger file out of the repository and never attach raw command output.

## 5. Apply the remote migration

With separate migration approval:

M1 evidence command: `migration-apply`
```bash
rtk npm run db:migrate:remote
```

```bash
M1_LEDGER_FILE="$M1_LEDGER_DIR/after-0004.json"
: > "$M1_LEDGER_FILE"
rtk chmod 600 "$M1_LEDGER_FILE"
```

M1 evidence command: `post-ledger-capture`
```bash
rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id" --json > "$M1_LEDGER_FILE"
```

```bash
M1_LEDGER_STATUS=$?
test "$M1_LEDGER_STATUS" -eq 0 || exit "$M1_LEDGER_STATUS"
```

M1 evidence command: `post-ledger-verification`
```bash
rtk npm run verify:m1:migrations -- --ledger-after "$M1_LEDGER_FILE"
```

```bash
rtk rm -f "$M1_LEDGER_DIR/before-0004.json" "$M1_LEDGER_DIR/after-0004.json" "$M1_LEDGER_DIR/legacy-pending.json"
rtk rmdir "$M1_LEDGER_DIR"
unset M1_LEDGER_FILE M1_PENDING_FILE M1_LEDGER_DIR M1_LEDGER_STATUS M1_PENDING_STATUS
```

The post-apply verifier requires exactly `0001_phase1_control_plane.sql`, `0002_github_auth.sql`, `0003_m1_knowledge_loop.sql`, and `0004_m1_gate_completion.sql`, in that order, with no missing or extra row. Record only the date and verifier pass line; the commands then remove only the three explicitly named temporary JSON files and their dedicated temporary directory. A failed apply or unexpected ledger blocks upload/deploy investigation; never repair it by deleting schema or data.

## 6. Upload one reviewed version with the complete secret bundle

Use the seven already approved production values. Do not regenerate automation credentials during release. Keep tracing disabled, use hidden reads for sensitive values, and serialize JSON outside the repository so `#`, quotes, backslashes, and commas round-trip safely.

```bash
set +x
M1_SECRETS_DIR="$(rtk mktemp -d -t memory-garden-m1-secrets.XXXXXX)"
rtk chmod 700 "$M1_SECRETS_DIR"
M1_SECRETS_FILE="$M1_SECRETS_DIR/worker-secrets.json"
: > "$M1_SECRETS_FILE"
rtk chmod 600 "$M1_SECRETS_FILE"

cleanup_m1_secret_bundle() {
  unset GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET BOOTSTRAP_ADMIN_EMAIL ALLOWED_MEMBER_EMAILS AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN
  M1_SECRET_CLEANUP_STATUS=0
  rtk rm -f -- "$M1_SECRETS_FILE" || M1_SECRET_CLEANUP_STATUS=$?
  test ! -e "$M1_SECRETS_FILE" || M1_SECRET_CLEANUP_STATUS=1
  rtk rmdir -- "$M1_SECRETS_DIR" || M1_SECRET_CLEANUP_STATUS=$?
  test ! -e "$M1_SECRETS_DIR" || M1_SECRET_CLEANUP_STATUS=1
  return "$M1_SECRET_CLEANUP_STATUS"
}
trap cleanup_m1_secret_bundle EXIT HUP INT TERM

read -r "GITHUB_OAUTH_CLIENT_ID?GITHUB_OAUTH_CLIENT_ID: "
read -rs "GITHUB_OAUTH_CLIENT_SECRET?GITHUB_OAUTH_CLIENT_SECRET: "; printf '\n'
read -rs "BOOTSTRAP_ADMIN_EMAIL?BOOTSTRAP_ADMIN_EMAIL: "; printf '\n'
read -rs "ALLOWED_MEMBER_EMAILS?ALLOWED_MEMBER_EMAILS: "; printf '\n'
read -r "AUTOMATION_CLIENT_ID?AUTOMATION_CLIENT_ID: "
read -rs "AUTOMATION_SECRET?AUTOMATION_SECRET: "; printf '\n'
read -rs "APP_TOKEN?APP_TOKEN: "; printf '\n'

GITHUB_OAUTH_CLIENT_ID="$GITHUB_OAUTH_CLIENT_ID" \
GITHUB_OAUTH_CLIENT_SECRET="$GITHUB_OAUTH_CLIENT_SECRET" \
BOOTSTRAP_ADMIN_EMAIL="$BOOTSTRAP_ADMIN_EMAIL" \
ALLOWED_MEMBER_EMAILS="$ALLOWED_MEMBER_EMAILS" \
AUTOMATION_CLIENT_ID="$AUTOMATION_CLIENT_ID" \
AUTOMATION_SECRET="$AUTOMATION_SECRET" \
APP_TOKEN="$APP_TOKEN" \
rtk node -e '
  const keys = ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET", "BOOTSTRAP_ADMIN_EMAIL", "ALLOWED_MEMBER_EMAILS", "AUTOMATION_CLIENT_ID", "AUTOMATION_SECRET", "APP_TOKEN"];
  const bundle = Object.fromEntries(keys.map((key) => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing ${key}`);
    return [key, value];
  }));
  if (bundle.AUTOMATION_SECRET === bundle.APP_TOKEN) throw new Error("Automation secrets must differ");
  process.stdout.write(`${JSON.stringify(bundle)}\n`);
' > "$M1_SECRETS_FILE"
M1_SERIALIZE_STATUS=$?
unset GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET BOOTSTRAP_ADMIN_EMAIL ALLOWED_MEMBER_EMAILS AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN
test "$M1_SERIALIZE_STATUS" -eq 0 || exit "$M1_SERIALIZE_STATUS"
```

M1 evidence command: `version-upload`
```bash
rtk npx wrangler versions upload --secrets-file "$M1_SECRETS_FILE" --strict --message "M1 trusted knowledge release candidate"
```

```bash
M1_UPLOAD_STATUS=$?
M1_CLEANUP_STATUS=0
cleanup_m1_secret_bundle || M1_CLEANUP_STATUS=$?
test "$M1_UPLOAD_STATUS" -eq 0 || exit "$M1_UPLOAD_STATUS"
test "$M1_CLEANUP_STATUS" -eq 0 || exit "$M1_CLEANUP_STATUS"
trap - EXIT HUP INT TERM
unset M1_UPLOAD_STATUS M1_CLEANUP_STATUS M1_SECRET_CLEANUP_STATUS
```

This must be the single candidate upload. The stage succeeds only after the protected secret file and its dedicated directory are both absent. Any removal error or remaining protected path fails the stage while the EXIT trap stays armed for one safe retry; do not report an upload success until cleanup succeeds. Do not use `wrangler secret put`, `wrangler versions secret bulk`, plain `wrangler deploy`, or `npm run deploy`; those paths can separate reviewed code from the complete secret-bearing version.

## 7. Inspect the exact uploaded version

Copy the exact version ID returned by the successful upload into the current shell. The version is not serving traffic yet. This input is an identifier, not a secret, but do not derive it from `versions list` or inspect a different version.

```bash
printf '%s' 'M1_VERSION_ID from the exact upload output: '
IFS= read -r M1_VERSION_ID
export M1_VERSION_ID
```

M1 evidence command: `version-id-precondition`
```bash
test -n "${M1_VERSION_ID:-}"
```

M1 evidence command: `version-inspect`
```bash
rtk npx wrangler versions view "${M1_VERSION_ID}"
```

```bash
rtk npx wrangler versions list
rtk npx wrangler deployments status
```

Verify the exact version contains only the intended commit/assets and preserves:

- bindings `DB`, `KNOWLEDGE`, `AI`, and `ASSETS`;
- D1 database `memory-garden-control-plane`;
- Durable Object class `KnowledgeBase` and migration tag `v1`;
- production and preview workers.dev URLs disabled;
- the approved custom domain with no route drift; and
- all seven secret **names** with no secret values in evidence.

Any mismatch blocks deployment. Do not remove `--strict` or patch remote settings ad hoc.

## 8. Deploy only the inspected version

With separate deployment approval:

M1 evidence command: `version-deploy`
```bash
rtk npx wrangler versions deploy "${M1_VERSION_ID}@100%" --yes
```

```bash
rtk npx wrangler deployments status
```

Confirm the deployed version ID is exactly `${M1_VERSION_ID}` before beginning production validation.

## 9. Run the browser M1 journey on the custom domain

Use fresh browser sessions at `https://memory.crgmhrc.asia`; never paste or replay a callback URL. Capture only redacted request IDs and outcome metadata.

- [ ] Anonymous `/auth/github` starts GitHub OAuth; callback establishes the existing `__Host-memory-session` and `/api/session` returns the expected active contributor.
- [ ] Contributor submits one synthetic text or Markdown source with a unique non-sensitive title and `Idempotency-Key`; the same key does not create another Submission.
- [ ] Active admin opens the exact Submission, compares raw and normalized content, checks server-created Chunk locations, and publishes to the fixed reviewed target.
- [ ] Contributor lists and searches the published item, opens the current Revision, follows its citation to the exact heading/line range, and receives a grounded cited answer.
- [ ] Admin publishes a separate synthetic `admin_only` item; contributor list/search/detail/history/citation/chat attempts reveal neither its content nor metadata.
- [ ] Disable the synthetic contributor through the approved admin flow; its existing GitHub session is rejected. Re-enable only if the release test account policy requires it, recording the audited action.
- [ ] Logout clears the existing session cookie. GitHub OAuth and D1 session behavior remain unchanged from M0.

Do not store source or answer bodies in evidence. Record version ID and redacted request IDs for submit, duplicate replay, preview, publish, list/search, reader, citation, chat, forbidden visibility, disabled session, and logout.

## 10. Verify bad signature, valid forbidden M1 access, and legacy automation

Read the approved credentials once with shell tracing disabled. The dedicated probe generates its own random wrong HMAC secret, makes exactly one signed `GET /api/health` and requires exactly `401`, then makes exactly one freshly signed `POST /api/admin/publications/recover` with body `{"limit":1}` and requires exactly `403`. It follows no redirect, retries nothing, reads/logs no response body, hashes valid request IDs to a 12-hex evidence token, and fails on every network/TLS/redirect/other-status outcome.

```bash
set +x
read -r "AUTOMATION_CLIENT_ID?AUTOMATION_CLIENT_ID: "
read -rs "AUTOMATION_SECRET?AUTOMATION_SECRET: "; printf '\n'
read -rs "APP_TOKEN?APP_TOKEN: "; printf '\n'
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
export AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN MEMORY_GARDEN_BASE_URL
```

Run the invalid-signature stage first. It makes exactly one request and accepts only `401`.

M1 evidence command: `invalid-signature-probe`
```bash
rtk npm run probe:automation:invalid
```

Only after that pass, run the valid signed M1-admin stage. It makes exactly one request and accepts only `403`.

M1 evidence command: `admin-forbidden-probe`
```bash
rtk npm run probe:automation:admin-forbidden
```

The exact successful output shape to archive is:

```text
[pass] invalid-signature-health status=401 request_id=sha256-<12hex> elapsed_ms=<integer>
[pass] automation-admin-forbidden status=403 request_id=sha256-<12hex> elapsed_ms=<integer>
```

Then run the existing valid legacy automation smoke with the same approved credentials:

```bash
rtk npm run smoke
unset AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN MEMORY_GARDEN_BASE_URL
```

Archive only the scripts' step/status/redacted-request-ID/elapsed output. The `403` proves valid automation remains limited to legacy health/notes/search/chat and cannot call the selected M1 administrative recovery route.

## 11. Verify a normal cross-activation read

Do not delete, reset, or force-evict the Durable Object. Record a successful read request ID for the synthetic published item, allow a normal new `KnowledgeBase` activation to occur through idle/runtime lifecycle or a later forward-compatible version activation, confirm the Durable Object request/error metrics in Cloudflare observability, then read the same Revision/citation again.

- [x] Before/after reads return the same legacy note set: 4 records, 1,270 bytes, and SHA-256 `451cacf160c1e2e50c0b0955e97067d5c8d8c2a39c4c731d1877aeff97e0e4d0`.
- [x] The evidence contains deployed version `ce88dab4-e452-4225-adf5-abfab7adb704` and redacted request IDs `a2f6cd84bfbf0713` / `a2f6cfae5e92f325`; Dashboard DO metrics show successful requests and zero errors after the read.
- [x] No D1 row, Durable Object storage, VFS file, index, or journal was deleted or rewritten to manufacture the result.

## 12. Record D1 Free query-cost evidence

Use only the synthetic release records. For each operation below, capture Cloudflare's D1 `rows_read` and `rows_written` metadata correlated to the redacted request ID. Do not export SQL result rows, source text, search text, emails, session data, cookies, or credentials.

- contributor knowledge list, default and maximum bounded page;
- contributor FTS search, first page and cursor continuation;
- contributor own Submissions and admin review queue;
- same-Space active Tag list, including cursor continuation; and
- bounded publication recovery scan.

Record the statement/operation name, route, page limit, returned row count, `rows_read`, `rows_written`, index/plan evidence, and request ID in the template. `OPS-015` remains incomplete until these remote values exist. Local `EXPLAIN QUERY PLAN`, selective-index, `LIMIT + 1`, cursor replay, and default/max tests are implementation evidence, not remote billing evidence.

Before accepting the cost rows, recheck the current Workers, D1, Durable Objects, and Workers AI limits in the official Cloudflare documentation and the target account Dashboard. Record the review date and account-plan/quota evidence without account identifiers or billing details. Historical numbers in the product specification are not release evidence and must not be copied forward as current limits.

## 13. Archive evidence and decide

Complete the template without replacing unchecked facts with prose. `GATE-M1` is eligible only when the same evidence record contains:

- date, candidate commit, exact deployed version ID, custom domain, and operator;
- D1 export digest/size and applied `0004` status;
- local `test:m1`, full `check`, audit, and diff evidence;
- redacted request IDs for OAuth/session, submit/idempotency, preview/publish, search, reader, citation, chat, forbidden visibility, disabled member, bad/valid automation, and cross-activation read;
- remote D1 query-cost rows read/written; and
- a reviewed forward-compatible rollback target and decision.

If any local atom or required production row remains incomplete, leave `GATE-M1` unchecked. Once all rows are present and independently reviewed, publish **M1 production gate accepted for the reviewed version** and start a new evidence record for any later code change.

## 14. Forward-compatible rollback

Rollback changes Worker code only. It never reverses `0004`, edits applied migration files, deletes D1 rows/tables, deletes/reset Durable Objects, removes VFS content, changes `KnowledgeBase`/`v1`, or redeploys an old Access-era build.

Before selecting a target, prove it reads the current D1 schema and current Durable Object/VFS/journal state. If no already-reviewed version is compatible, make a forward-compatible emergency fix and run the full local gate. Then upload and inspect it without traffic:

```bash
rtk npm run test:m1
rtk npm run check
rtk npx wrangler versions upload --strict --message "M1 forward-compatible emergency rollback"
printf '%s' 'M1_EMERGENCY_VERSION_ID from the exact upload output: '
IFS= read -r M1_EMERGENCY_VERSION_ID
export M1_EMERGENCY_VERSION_ID
test -n "${M1_EMERGENCY_VERSION_ID:-}"
rtk npx wrangler versions view "${M1_EMERGENCY_VERSION_ID}"
```

The emergency upload must preserve the already configured complete secret set. If a complete secret bundle must be changed, use the protected seven-secret JSON workflow above; never use a plain deploy, secret bulk, or per-secret deploy. With separate authorization, deploy only the inspected ID:

```bash
rtk npx wrangler versions deploy "${M1_EMERGENCY_VERSION_ID}@100%" --yes
rtk npx wrangler deployments status
```

Repeat browser OAuth/session, shared/admin-only M1 reads, citation, bad/valid automation, and cross-activation verification. Record new redacted request IDs. If the target cannot read the forward schema or preserved DO data, stop and make another forward-compatible fix.

## Local fault and free-tier evidence references

The following local evidence must stay green for every candidate:

| Boundary | Local evidence |
| --- | --- |
| Fixed M1 quality gate | `test/fixtures/m1-evaluation.ts`, `test/unit/m1-evaluation.test.ts`, `test/fixtures/m1-mutation-matrix.ts`, `test/unit/m1-mutation-matrix.test.ts`, `rtk npm run test:m1` |
| Exact automation rejection probe | `scripts/automation-probe.mjs`, `scripts/automation-probe.test.mjs`, `rtk npm run test:ops:m1` |
| Migration byte/ledger provenance | `scripts/verify-m1-migrations.mjs`, `scripts/m1-release-contract.test.mjs`, `rtk npm run verify:m1:migrations -- --files` |
| D1 schema upgrade/preservation | `test/worker/migrations.test.ts` |
| Selective Job/Tag query plans | `test/worker/migrations.test.ts` real scale-shape `EXPLAIN QUERY PLAN` assertions |
| Ambiguous DO response and stable replay | `test/unit/publication-service.test.ts`, `test/worker/m1-publication.test.ts` |
| D1 finalization batch rollback | `test/worker/m1-publication.test.ts` |
| Failed FTS remains readable and recovers | `test/unit/publication-service.test.ts`, `test/worker/m1-publication.test.ts`, `test/worker/m1-library.test.ts` |
| Permission-scoped list/search/citation | `test/unit/library-service.test.ts`, `test/worker/m1-library.test.ts`, `test/worker/m1-api.test.ts` |
| Default/max limits and keyset cursors | `test/unit/pagination.test.ts`, `test/worker/spaces.test.ts`, `test/worker/submissions.test.ts`, `test/worker/members.test.ts`, `test/worker/m1-api.test.ts`, `test/worker/m1-publication.test.ts` |
| Explicit bounded resource option paging | `test/unit/workspace-ui.test.ts` |
| Bounded AI context/provider-free refusal | `test/unit/cited-answer-service.test.ts`, `test/unit/m1-evaluation.test.ts` |

These tests establish deterministic structural bounds suitable for D1/Workers Free operation. They do not establish current Cloudflare account quota, billing state, provider availability, remote D1 cost, or production recovery. Those values stay unchecked in the evidence template until collected from the authorized deployment.
