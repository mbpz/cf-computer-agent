# M1 trusted knowledge release runbook

This runbook is the exact release sequence for the M1 text/Markdown/code knowledge loop. It extends, and does not replace, the [production environment handbook](./production-environment-handbook.md), [GitHub OAuth setup](./github-oauth-setup.md), [signed automation smoke](./smoke-test.md), and [rollback rules](./rollback.md).

Writing or testing this runbook is local evidence only. Every command containing `--remote`, `versions upload`, `versions deploy`, or the production domain requires separate operator authorization. No such command was run while Task 11 was implemented.

## Evidence boundary and release invariant

- Local fixtures prove deterministic parser, chunker, authorization, retrieval, citation, UI, recovery, and failure contracts.
- Local Workerd proves the checked-in D1 schema and `KnowledgeBase` Durable Object integration, not production state.
- Production evidence requires a date, commit, exact Worker version ID, and redacted request IDs in [the M1 release evidence template](./evidence/m1-release-template.md).
- Preserve GitHub OAuth, D1 hashed sessions, `__Host-memory-session`, HMAC plus `APP_TOKEN` automation, the `KnowledgeBase` class, and Durable Object migration tag `v1`.
- Migration `0003_m1_knowledge_loop.sql` is forward-only. Once applied remotely, do not edit, reverse, or delete it. Never delete D1 rows/tables or Durable Object/VFS state to roll back a Worker.
- `GATE-M0` must have its missing remote evidence archived before a production M1 completion claim. While any current P0/M1 checklist atom remains unchecked, report **M1 local acceptance pending; remote verification pending.** Only after every local/workerd atom is satisfied, but before production evidence is complete, report **M1 implementation complete; remote verification pending.**

Use a fresh copy of [the evidence template](./evidence/m1-release-template.md) for one candidate. Do not place source text, response bodies, cookies, OAuth codes, authorization headers, secret values, or full callback URLs in it.

### Current checklist reconciliation

Task 11 compared the plan ranges to the current atomic checklist. The core vertical journey is locally verified, but the following current P0/M1 atoms remain unchecked and therefore block an M1 production release claim:

| Atom | Missing acceptance evidence |
| --- | --- |
| `SRC-003` | persisted code language, file tag, and line-baseline contract as specified |
| `GOV-004`, `GOV-005`, `GOV-007`, `GOV-010` | audited title patch; target change versus the intentionally fixed requested target; requested-visibility non-expansion; contributor revision-resubmission journey |
| `IDX-001`, `IDX-002`, `IDX-004`, `IDX-006` | full title/summary/tag/body/code schema acceptance; revision/trash FTS synchronization; production D1 fixed-set weight/ranking evidence; visible failed index state |
| `SRCH-002`, `SRCH-003`, `SRCH-004`, `SRCH-007` | production D1 ranking set; matched-field explanation; actual safe highlight; bounded multi-Tag AND/OR semantics |
| `READ-003`, `READ-009` | semantic safe Markdown rendering rather than inert raw display; visible reviewer/source-version Revision information |
| `CHAT-002` | explicit all/Space/Collection/selected-source scope contract |
| `COL-001` | My Submissions status filter in addition to owner-only bounded pagination |
| `AUTH-015` | original-download visibility path in addition to list/search/citation |
| `OPS-015` | remote synthetic D1 `rows_read`/`rows_written` evidence |

Do not silently reinterpret these acceptance statements or check them from adjacent tests. Resolve them in separately planned product slices, then rerun this release sequence.

## 1. Authorize and capture the candidate

Before any remote command, record the operator approval, candidate commit, working-tree state, production Worker name, D1 database name, and custom domain.

```bash
rtk git status --short
rtk git rev-parse HEAD
rtk npx wrangler whoami
```

Stop if the commit is not the reviewed candidate, the worktree is unexpectedly dirty, the Cloudflare account is wrong, `GATE-M0` evidence is missing, or the operator has not separately authorized the next remote action.

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

Record exact counts and command exit status. `test:m1` includes parser, chunker, publication/recovery, library/search, cited answer, HTTP API, workspace UI, and the fixed 24-case M1 evaluation. The evaluation uses deterministic in-memory D1/provider adapters and must report Recall@5 at least 0.85, citation precision 1, citation location rate 1, zero wrong citations, and zero permission leaks.

## 4. Inspect migration `0003` and preservation evidence

Read the entire migration and its upgrade tests before any remote apply:

```bash
rtk sed -n '1,260p' migrations/0003_m1_knowledge_loop.sql
rtk npx vitest run test/worker/migrations.test.ts
rtk git log -1 -- migrations/0003_m1_knowledge_loop.sql
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
```

Confirm all of the following in review:

- the submissions table copy preserves all legacy rows before the legacy table is dropped;
- `PRAGMA foreign_key_check` and the upgrade-preservation Workerd cases pass;
- `0001` and `0002` remain applied and unchanged;
- `0003` is the only pending M1 migration;
- `KnowledgeBase`, Durable Object migration tag `v1`, existing VFS paths, note journal, GitHub identities, sessions, and automation credentials are not migrated or reset.

If `0003` is already listed as applied, do not edit or replay its SQL directly. Investigate the release state and stop.

## 5. Apply the remote migration

With separate migration approval:

```bash
rtk npm run db:migrate:remote
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
```

Record the date and migration-list result without row contents. A failed apply blocks upload/deploy investigation; never repair it by deleting schema or data.

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
  rtk rm -f "$M1_SECRETS_FILE"
  rtk rmdir "$M1_SECRETS_DIR"
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

rtk npx wrangler versions upload --secrets-file "$M1_SECRETS_FILE" --strict --message "M1 trusted knowledge release candidate"
M1_UPLOAD_STATUS=$?
cleanup_m1_secret_bundle
trap - EXIT HUP INT TERM
test "$M1_UPLOAD_STATUS" -eq 0
```

This must be the single candidate upload. Do not use `wrangler secret put`, `wrangler versions secret bulk`, plain `wrangler deploy`, or `npm run deploy`; those paths can separate reviewed code from the complete secret-bearing version.

## 7. Inspect the exact uploaded version

Record the returned ID as `<M1_VERSION_ID>`. The version is not serving traffic yet.

```bash
rtk npx wrangler versions view <M1_VERSION_ID>
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

```bash
rtk npx wrangler versions deploy <M1_VERSION_ID>@100% --yes
rtk npx wrangler deployments status
```

Confirm the deployed version ID is exactly `<M1_VERSION_ID>` before beginning production validation.

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

## 10. Verify bad and valid signed automation

First prove a wrong HMAC secret is rejected without exposing the real secret. The smoke stops at the first `401`; a zero exit is a release failure.

```bash
set +x
read -r "AUTOMATION_CLIENT_ID?AUTOMATION_CLIENT_ID: "
read -rs "APP_TOKEN?APP_TOKEN: "; printf '\n'
M1_BAD_AUTOMATION_SECRET="$(rtk openssl rand -base64 48)"
export AUTOMATION_CLIENT_ID APP_TOKEN
export AUTOMATION_SECRET="$M1_BAD_AUTOMATION_SECRET"
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
if rtk npm run smoke; then
  unset AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN MEMORY_GARDEN_BASE_URL M1_BAD_AUTOMATION_SECRET
  printf 'unexpected bad-signature success\n'
  exit 1
fi
unset AUTOMATION_SECRET M1_BAD_AUTOMATION_SECRET
```

Then read the approved real automation secret and run the existing signed smoke:

```bash
read -rs "AUTOMATION_SECRET?AUTOMATION_SECRET: "; printf '\n'
export AUTOMATION_SECRET
rtk npm run smoke
unset AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN MEMORY_GARDEN_BASE_URL
```

Archive only the script's step/status/request-ID/elapsed output. Automation remains limited to legacy health/notes/search/chat and never calls an M1 admin route.

## 11. Verify a normal cross-activation read

Do not delete, reset, or force-evict the Durable Object. Record a successful read request ID for the synthetic published item, allow a normal new `KnowledgeBase` activation to occur through idle/runtime lifecycle or a later forward-compatible version activation, confirm the new activation in Cloudflare observability, then read the same Revision/citation again.

- [ ] Before/after reads return the same Revision, Chunk location, and content hash outcome.
- [ ] The evidence contains the version ID, two redacted request IDs, and redacted activation correlation only.
- [ ] No D1 row, Durable Object storage, VFS file, index, or journal was deleted or rewritten to manufacture the result.

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
- D1 export digest/size and applied `0003` status;
- local `test:m1`, full `check`, audit, and diff evidence;
- redacted request IDs for OAuth/session, submit/idempotency, preview/publish, search, reader, citation, chat, forbidden visibility, disabled member, bad/valid automation, and cross-activation read;
- remote D1 query-cost rows read/written; and
- a reviewed forward-compatible rollback target and decision.

If any local atom above remains incomplete, leave `GATE-M1` unchecked and publish **M1 local acceptance pending; remote verification pending.** If local/workerd acceptance later becomes complete but any production item is absent, publish **M1 implementation complete; remote verification pending.**

## 14. Forward-compatible rollback

Rollback changes Worker code only. It never reverses `0003`, edits applied migration files, deletes D1 rows/tables, deletes/reset Durable Objects, removes VFS content, changes `KnowledgeBase`/`v1`, or redeploys an old Access-era build.

Before selecting a target, prove it reads the current D1 schema and current Durable Object/VFS/journal state. If no already-reviewed version is compatible, make a forward-compatible emergency fix and run the full local gate. Then upload and inspect it without traffic:

```bash
rtk npm run test:m1
rtk npm run check
rtk npx wrangler versions upload --strict --message "M1 forward-compatible emergency rollback"
rtk npx wrangler versions view <M1_EMERGENCY_VERSION_ID>
```

The emergency upload must preserve the already configured complete secret set. If a complete secret bundle must be changed, use the protected seven-secret JSON workflow above; never use a plain deploy, secret bulk, or per-secret deploy. With separate authorization, deploy only the inspected ID:

```bash
rtk npx wrangler versions deploy <M1_EMERGENCY_VERSION_ID>@100% --yes
rtk npx wrangler deployments status
```

Repeat browser OAuth/session, shared/admin-only M1 reads, citation, bad/valid automation, and cross-activation verification. Record new redacted request IDs. If the target cannot read the forward schema or preserved DO data, stop and make another forward-compatible fix.

## Local fault and free-tier evidence references

The following local evidence must stay green for every candidate:

| Boundary | Local evidence |
| --- | --- |
| Fixed M1 quality gate | `test/fixtures/m1-evaluation.ts`, `test/unit/m1-evaluation.test.ts`, `rtk npm run test:m1` |
| D1 schema upgrade/preservation | `test/worker/migrations.test.ts` |
| Ambiguous DO response and stable replay | `test/unit/publication-service.test.ts`, `test/worker/m1-publication.test.ts` |
| D1 finalization batch rollback | `test/worker/m1-publication.test.ts` |
| Failed FTS remains readable and recovers | `test/unit/publication-service.test.ts`, `test/worker/m1-publication.test.ts`, `test/worker/m1-library.test.ts` |
| Permission-scoped list/search/citation | `test/unit/library-service.test.ts`, `test/worker/m1-library.test.ts`, `test/worker/m1-api.test.ts` |
| Default/max limits and keyset cursors | `test/unit/pagination.test.ts`, `test/worker/spaces.test.ts`, `test/worker/submissions.test.ts`, `test/worker/members.test.ts`, `test/worker/m1-api.test.ts`, `test/worker/m1-publication.test.ts` |
| Bounded AI context/provider-free refusal | `test/unit/cited-answer-service.test.ts`, `test/unit/m1-evaluation.test.ts` |

These tests establish deterministic structural bounds suitable for D1/Workers Free operation. They do not establish current Cloudflare account quota, billing state, provider availability, remote D1 cost, or production recovery. Those values stay unchecked in the evidence template until collected from the authorized deployment.
