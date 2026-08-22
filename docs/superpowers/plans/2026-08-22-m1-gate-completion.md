# M1 Gate Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all 24 strict M1 acceptance atoms, preserve the Cloudflare Free-plan/private-team boundary, and collect enough production evidence to accept `GATE-M1` without weakening its criteria.

**Architecture:** Extend the current D1/FTS5/Computer vertical loop through one append-only `0004` migration and six reviewed product slices. Stable domain ports continue to separate parsing, review, publication, retrieval, AI, and browser state; production release remains an explicit final task after all local and Workerd gates pass.

**Tech Stack:** Cloudflare Workers, D1/SQLite FTS5, Durable Objects with `@cloudflare/computer`, Workers AI, TypeScript, Vitest/Workerd, plain browser ES modules, pinned local `markdown-it` and `DOMPurify` assets.

**Spec:** `docs/superpowers/specs/2026-08-22-m1-gate-completion-design.md`

## Global Constraints

- Preserve GitHub OAuth, D1 sessions, `__Host-memory-session`, signed automation plus `APP_TOKEN`, custom domain routing, and disabled workers.dev URLs.
- Preserve `KnowledgeBase`, Durable Object migration tag `v1`, VFS paths, journals, and immutable published content.
- Use only Cloudflare Free-plan-compatible bounded requests for a private 5–20-person workspace; no R2, Queue, Vectorize, CDN, or new paid dependency in M1.
- Never edit applied migrations `0001`–`0003`; all schema changes go in `migrations/0004_m1_gate_completion.sql`.
- Authorization precedes parsing/resource access; D1 visibility authorization precedes every DO content read.
- Logs, audit rows, and evidence never contain source/answer bodies, JWTs, Cookies, OAuth codes/callbacks, Secrets, signatures, paths, or hashes unless the existing internal persistence contract explicitly requires the path/hash.
- Every task uses RED→GREEN, ends with `rtk npm run check` and `rtk git diff --check`, receives an independent review, and commits only its scoped files.
- No remote migration, upload, deploy, smoke, browser action, or production evidence mutation occurs before Task 10 and fresh human authorization.

---

### Task 1: Add the append-only M1 completion schema and shared contracts

**Atoms:** Foundation for all 24 atoms.

**Files:**
- Create: `migrations/0004_m1_gate_completion.sql`
- Modify: `src/sources/types.ts`
- Modify: `src/submissions/types.ts`
- Modify: `src/publication/types.ts`
- Modify: `src/library/types.ts`
- Modify: `test/worker/migrations.test.ts`
- Modify: `scripts/verify-m1-migrations.mjs`
- Modify: `scripts/m1-release-contract.test.mjs`
- Modify: `docs/operations/m1-release.md`

**Interfaces:**
- Produces `ParserSchemaVersion = "m1-v2"` and code metadata fields on `SourceVersion`.
- Produces `SubmissionStatusFilter`, `supersedesSubmissionId`, `ReviewMetadataPatch`, an expanded existing `SearchStatus`, `SearchMatchedField`, `SearchHighlightRange`, `ChatScope`, and Revision reviewer/source metadata.
- Produces reviewed migration hash verification for exactly `0001`–`0004`.

- [ ] **Step 1: Write the migration RED assertions**

Add exact `PRAGMA table_info`, `index_xinfo`, foreign-key, and upgrade assertions for:

```ts
expect(sourceVersionColumns).toMatchObject({
  parser_schema_version: { notnull: 1 },
  code_language: { notnull: 0 },
  file_label: { notnull: 0 },
  line_baseline: { notnull: 1 },
});
expect(submissionColumns).toHaveProperty("supersedes_submission_id");
expect(reviewColumns).toMatchObject({
  requested_title: { notnull: 1 },
  final_space_id: { notnull: 1 },
  final_visibility: { notnull: 1 },
  visibility_reason_code: { notnull: 0 },
});
expect(revisionColumns).toHaveProperty("summary");
```

Assert the upgraded FTS table exposes `chunk_id,title,summary,tags,body,code`, and indexes exist for status-filtered own submissions, final review target lookup, Tag-filtered search, and current Revision/index status reads.

- [ ] **Step 2: Run the migration suite and capture RED**

Run:

```bash
rtk npx vitest run test/worker/migrations.test.ts
```

Expected: failures for missing `0004`, columns, FTS fields, and indexes; all `0001`–`0003` preservation assertions remain green.

- [ ] **Step 3: Create `0004_m1_gate_completion.sql`**

Use append-only SQL equivalent to:

```sql
ALTER TABLE source_versions ADD COLUMN parser_schema_version TEXT NOT NULL DEFAULT 'm1-v1';
ALTER TABLE source_versions ADD COLUMN code_language TEXT;
ALTER TABLE source_versions ADD COLUMN file_label TEXT;
ALTER TABLE source_versions ADD COLUMN line_baseline INTEGER NOT NULL DEFAULT 1 CHECK(line_baseline > 0);
ALTER TABLE submissions ADD COLUMN supersedes_submission_id TEXT REFERENCES submissions(id);
CREATE INDEX submissions_owner_status_page
  ON submissions(submitter_id, status, created_at DESC, id DESC);

ALTER TABLE reviews ADD COLUMN requested_title TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN requested_space_id TEXT REFERENCES spaces(id);
ALTER TABLE reviews ADD COLUMN requested_collection_id TEXT REFERENCES collections(id);
ALTER TABLE reviews ADD COLUMN requested_visibility TEXT NOT NULL DEFAULT 'shared'
  CHECK(requested_visibility IN ('shared','admin_only'));
ALTER TABLE reviews ADD COLUMN final_space_id TEXT REFERENCES spaces(id);
ALTER TABLE reviews ADD COLUMN final_collection_id TEXT REFERENCES collections(id);
ALTER TABLE reviews ADD COLUMN final_visibility TEXT NOT NULL DEFAULT 'shared'
  CHECK(final_visibility IN ('shared','admin_only'));
ALTER TABLE reviews ADD COLUMN visibility_reason_code TEXT;

ALTER TABLE revisions ADD COLUMN summary TEXT NOT NULL DEFAULT '';
```

Rebuild `chunks_fts` transactionally as the six-field table and backfill existing current chunks with empty `summary`/`code` fields without losing current searchability.

- [ ] **Step 4: Define the TypeScript contracts before behavior**

Add exact types:

```ts
export type ParserSchemaVersion = "m1-v1" | "m1-v2";
export interface CodeSourceMetadata {
  language: string;
  fileLabel: string;
  lineBaseline: number;
}
export type SubmissionStatusFilter = "review_pending" | "published" | "rejected" | "revision_requested";
export interface ReviewMetadataPatch {
  title: string;
  spaceId: string;
  collectionId: string | null;
  visibility: KnowledgeVisibility;
  tagIds: string[];
  visibilityReasonCode?: "admin_visibility_expansion";
}
export type SearchStatus = "pending" | "indexed" | "search_degraded" | "failed";
export type SearchMatchedField = "title" | "summary" | "tags" | "body" | "code";
export interface SearchHighlightRange { start: number; end: number }
export type ChatScope =
  | { kind: "all" }
  | { kind: "space"; spaceId: string }
  | { kind: "collection"; collectionId: string }
  | { kind: "items"; knowledgeItemIds: string[] };
```

Replace the existing three-value `SearchStatus` definition rather than adding a parallel status type. Make `PublishSubmissionInput` a compatibility alias of `ReviewMetadataPatch` (or remove it after all callers migrate in the same task), so review validation, persistence, audit, routes, and UI consume one authoritative final-metadata contract.

- [ ] **Step 5: Make fresh and upgrade migrations green**

Add fixtures proving `0001→0004` preserves members, sessions, Spaces, Collections, Submissions, SourceVersions, Reviews, KnowledgeItems, Revisions, Tags, Chunks, Jobs, and the `KnowledgeBase`/`v1` config. Run:

```bash
rtk npx vitest run test/worker/migrations.test.ts
rtk npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Pin the fourth migration and release ledger**

Update `verify-m1-migrations.mjs` to require four exact SHA-256 hashes and before/after ledgers `0001..0003` / `0001..0004`. Add mutations for edited, missing, reordered, extra, and already-applied states.

- [ ] **Step 7: Run the full gate and commit**

```bash
rtk npm run verify:m1:migrations -- --files
rtk npm run check
rtk git diff --check
rtk git add migrations/0004_m1_gate_completion.sql src/sources/types.ts src/submissions/types.ts src/publication/types.ts src/library/types.ts test/worker/migrations.test.ts scripts/verify-m1-migrations.mjs scripts/m1-release-contract.test.mjs docs/operations/m1-release.md
rtk git commit -m "feat: add M1 completion schema"
```

---

### Task 2: Implement fatal byte parsing, code metadata, and independent parser fixtures

**Atoms:** `SRC-003`, `PAR-001`, `EVAL-001`, `EVAL-002`.

**Files:**
- Create: `src/sources/decoder.ts`
- Create: `test/fixtures/m1-parser-cases.ts`
- Create: `test/unit/source-decoder.test.ts`
- Modify: `src/sources/parser.ts`
- Modify: `src/sources/types.ts`
- Modify: `src/submissions/service.ts`
- Modify: `src/submissions/repository.ts`
- Modify: `src/routes/member.ts`
- Modify: `test/unit/source-parser.test.ts`
- Modify: `test/unit/submissions-service.test.ts`
- Modify: `test/worker/m1-api.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `decodeSourceBytes(input: ArrayBuffer): string` using fatal UTF-8.
- Changes source creation to accept `contentBase64` rather than trusting an already-decoded JSON string for the M1 byte contract; retain `content` only as a backwards-compatible text input normalized by the same parser and do not count it toward `PAR-001` evidence.
- `parseSource` returns `parserSchemaVersion`, warnings, and normalized code metadata.

- [ ] **Step 1: Create the independent fixture table**

Define fixtures without calling production helpers:

```ts
export interface ParserCase {
  id: string;
  kind: "text" | "markdown" | "code";
  bytes: Uint8Array;
  metadata?: { language?: string; fileLabel?: string; lineBaseline?: number };
  expected:
    | { ok: true; markdown: string; lineCount: number; warnings: string[] }
    | { ok: false; code: "SOURCE_ENCODING_INVALID" | "SOURCE_EMPTY" | "SOURCE_TOO_LARGE" | "SOURCE_METADATA_INVALID" };
}
```

Include normal/empty/exact/over-limit/malformed UTF-8/malicious/newline cases for all three kinds, plus code language/file label/line baseline.

- [ ] **Step 2: Write decoder/parser RED tests**

Assert `TextDecoder("utf-8", { fatal: true })` behavior through the public decoder, LF normalization, code metadata allowlists, file-label CRLF/path rejection, line baseline `1..1_000_000`, and no persistence on every invalid fixture.

- [ ] **Step 3: Run focused RED**

```bash
rtk npx vitest run test/unit/source-decoder.test.ts test/unit/source-parser.test.ts test/unit/submissions-service.test.ts
```

Expected: missing decoder/types and failing metadata/persistence assertions.

- [ ] **Step 4: Implement the byte and metadata boundary**

Use:

```ts
const UTF8_FATAL = new TextDecoder("utf-8", { fatal: true });
export function decodeSourceBytes(bytes: ArrayBuffer): string {
  try { return UTF8_FATAL.decode(bytes); }
  catch { throw new AppError("SOURCE_ENCODING_INVALID", "Source encoding is invalid", 400); }
}
```

Normalize language to an allowlist (`plaintext`, `javascript`, `typescript`, `python`, `go`, `rust`, `java`, `sql`, `json`, `yaml`, `shell`), bound file labels to 128 UTF-8 bytes with no slash/backslash/control characters, and include the line baseline in Chunk locations.

- [ ] **Step 5: Persist the new SourceVersion contract atomically**

Extend `createWithSourceVersion` and its repository batch so normalized content, SHA-256, parser schema, code metadata, Source, SourceVersion, Submission, and audit either all persist or none do. Preserve idempotency and duplicate privacy.

- [ ] **Step 6: Wire the exact HTTP request shape**

Allow only:

```json
{
  "requestedSpaceId": "space-id",
  "requestedCollectionId": null,
  "kind": "code",
  "title": "Example",
  "contentBase64": "Y29uc3QgeCA9IDE7Cg==",
  "language": "javascript",
  "fileLabel": "example.js",
  "lineBaseline": 1
}
```

Reject mixed `content`+`contentBase64`, malformed base64, unknown fields, and automation before body parsing.

- [ ] **Step 7: Prove every fixture and persistence outcome**

```bash
rtk npx vitest run test/unit/source-decoder.test.ts test/unit/source-parser.test.ts test/unit/submissions-service.test.ts test/worker/m1-api.test.ts
rtk npm run check
```

- [ ] **Step 8: Update checklist evidence and commit**

Check exactly `SRC-003`, `PAR-001`, `EVAL-001`, `EVAL-002` with commands/fixtures in their status text, then:

```bash
rtk git add src/sources src/submissions src/routes/member.ts test/fixtures/m1-parser-cases.ts test/unit/source-decoder.test.ts test/unit/source-parser.test.ts test/unit/submissions-service.test.ts test/worker/m1-api.test.ts package.json docs/product/ai-knowledge-base-checklist.md
rtk git commit -m "feat: enforce source byte contracts"
```

---

### Task 3: Add audited metadata review and owner resubmission

**Atoms:** `GOV-004`, `GOV-005`, `GOV-007`, `GOV-010`.

**Files:**
- Modify: `src/audit/types.ts`
- Modify: `src/publication/types.ts`
- Modify: `src/publication/service.ts`
- Modify: `src/publication/repository.ts`
- Modify: `src/submissions/types.ts`
- Modify: `src/submissions/service.ts`
- Modify: `src/submissions/repository.ts`
- Modify: `src/routes/admin-review.ts`
- Modify: `src/routes/member.ts`
- Modify: `public/app.js`
- Modify: `public/workspace-ui.js`
- Modify: `public/workspace-ui.d.ts`
- Modify: `test/unit/audit.test.ts`
- Modify: `test/unit/publication-service.test.ts`
- Modify: `test/unit/submissions-service.test.ts`
- Modify: `test/unit/workspace-ui.test.ts`
- Modify: `test/worker/m1-publication.test.ts`
- Modify: `test/worker/m1-api.test.ts`

**Interfaces:**
- `publish(reviewer, submissionId, patch: ReviewMetadataPatch)` owns final metadata validation.
- `resubmit(memberId, priorSubmissionId, input, idempotencyKey)` creates a new linked Submission/SourceVersion.
- Audit actions add `review.metadata_changed`, `review.visibility_expanded`, and `submission.resubmitted` with primitive allowlisted metadata.

- [ ] **Step 1: Write service and audit RED tests**

Cover title patch bounds, active/writable Space, same-Space Collection/Tags, Space-change clearing, shared→admin_only narrowing, admin_only→shared without/with reason code, contributor expansion rejection, request/final metadata audit, and resubmission owner/state/idempotency.

- [ ] **Step 2: Write real D1 race/rollback RED tests**

In Workerd, mutate Space/Collection/Tag/status after preview but before final batch, collide the final audit ID, and race publish with decision/resubmission. Assert zero partial Review/Revision/intent/audit rows.

- [ ] **Step 3: Run focused RED**

```bash
rtk npx vitest run test/unit/audit.test.ts test/unit/publication-service.test.ts test/unit/submissions-service.test.ts test/worker/m1-publication.test.ts test/worker/m1-api.test.ts
```

- [ ] **Step 4: Implement patch validation before intent creation**

Add a normalized patch snapshot to `publication_intents`; exact retry equality includes title, final target, visibility, Tag IDs, and expansion reason. Any drift returns stable `PUBLICATION_STATE_CONFLICT` 409.

- [ ] **Step 5: Make finalization and audit one D1 batch**

Derive requested metadata from Submission and final metadata from the intent. Insert Review, Revision, current pointer, tags, chunks, index job, publication audit, and optional visibility-expansion audit in one guarded batch.

- [ ] **Step 6: Implement owner-only resubmission**

Require prior status `revision_requested`, same active owner, new idempotency key, and a new source parse. Link `supersedes_submission_id`; never update the old Submission/SourceVersion.

- [ ] **Step 7: Update API and UI**

Publish body accepts exactly `title,spaceId,collectionId,visibility,tagIds,visibilityReasonCode`. Review UI displays requested/final columns and requires a second confirmation for visibility expansion. My Submissions exposes “Revise and resubmit” only to the owner.

- [ ] **Step 8: Run full gates and commit**

```bash
rtk npx vitest run test/unit/audit.test.ts test/unit/publication-service.test.ts test/unit/submissions-service.test.ts test/unit/workspace-ui.test.ts test/worker/m1-publication.test.ts test/worker/m1-api.test.ts
rtk npm run check
rtk git diff --check
rtk git add src/audit src/publication src/submissions src/routes/admin-review.ts src/routes/member.ts public/app.js public/workspace-ui.js public/workspace-ui.d.ts test docs/product/ai-knowledge-base-checklist.md
rtk git commit -m "feat: govern review metadata changes"
```

---

### Task 4: Complete FTS document synchronization and visible index states

**Atoms:** `IDX-001`, `IDX-002`, `IDX-006`.

**Files:**
- Create: `src/indexing/document.ts`
- Modify: `src/publication/types.ts`
- Modify: `src/publication/service.ts`
- Modify: `src/publication/repository.ts`
- Modify: `src/library/types.ts`
- Modify: `src/library/repository.ts`
- Modify: `test/unit/publication-service.test.ts`
- Create: `test/unit/index-document.test.ts`
- Modify: `test/worker/m1-publication.test.ts`
- Modify: `test/worker/m1-library.test.ts`
- Modify: `test/fixtures/m1-evaluation.ts`

**Interfaces:**
- Produces `buildIndexDocument(revision, chunks, tags): IndexDocument` with separate title/summary/tags/body/code.
- Expands the existing safe visible `SearchStatus = pending|indexed|search_degraded|failed`, derived from KnowledgeItem plus current Job; do not introduce a second status type.

- [ ] **Step 1: Write index-document RED fixtures**

Use independent fixtures proving title, deterministic 240-code-point summary, normalized Tag text, prose body, and fenced-code body are assigned to the correct FTS fields without executing Markdown.

- [ ] **Step 2: Write synchronization RED tests**

Cover first publish, idempotent replay, current Revision switch, old-current removal, trashed item removal, failed_retryable visibility, retry to indexed, degraded readability, and terminal index failure visibility.

- [ ] **Step 3: Run focused RED**

```bash
rtk npx vitest run test/unit/index-document.test.ts test/unit/publication-service.test.ts test/worker/m1-publication.test.ts test/worker/m1-library.test.ts
```

- [ ] **Step 4: Implement deterministic index documents**

Define:

```ts
export interface IndexDocument {
  revisionId: string;
  title: string;
  summary: string;
  tags: string;
  body: string;
  code: string;
}
```

Split fenced code from prose using parser/chunker structure, not regex over rendered HTML. Bound every serialized field before D1 write.

- [ ] **Step 5: Implement replace/remove synchronization**

One index Job deletes all FTS rows for the KnowledgeItem’s non-current Revisions, then inserts the current document rows. If item status is `trashed`, delete all rows and complete the Job. Failures update only Job/status and keep canonical Revision readable.

- [ ] **Step 6: Expose safe index state**

Library and Review queries derive `failed` only from an authoritative current `failed_terminal` Job; never expose error text or provider/database messages.

- [ ] **Step 7: Verify and commit**

```bash
rtk npx vitest run test/unit/index-document.test.ts test/unit/publication-service.test.ts test/worker/m1-publication.test.ts test/worker/m1-library.test.ts
rtk npm run check
rtk git add src/indexing src/publication src/library test docs/product/ai-knowledge-base-checklist.md
rtk git commit -m "feat: synchronize complete FTS documents"
```

---

### Task 5: Add stable ranking, match explanations, safe highlights, and Tag logic

**Atoms:** `IDX-004`, `SRCH-002`, `SRCH-003`, `SRCH-004`, `SRCH-007`.

**Files:**
- Create: `src/library/search-policy.ts`
- Modify: `src/library/lexical.ts`
- Modify: `src/library/types.ts`
- Modify: `src/library/service.ts`
- Modify: `src/library/repository.ts`
- Modify: `src/routes/library.ts`
- Modify: `public/app.js`
- Modify: `public/workspace-ui.js`
- Modify: `public/workspace-ui.d.ts`
- Create: `test/fixtures/m1-search-ranking.ts`
- Create: `test/unit/search-policy.test.ts`
- Modify: `test/unit/library-service.test.ts`
- Modify: `test/unit/workspace-ui.test.ts`
- Modify: `test/worker/m1-library.test.ts`
- Modify: `test/worker/m1-api.test.ts`
- Modify: `test/fixtures/m1-evaluation.ts`

**Interfaces:**
- `SearchRequest` adds `tagIds?: string[]` and `tagMode?: "and" | "or"` with max 8 Tags.
- `SearchHit` adds `matchedFields: SearchMatchedField[]` and `highlights: SearchHighlightRange[]`.
- Search cursor scope hash includes normalized query, member, role, Space, Collection, Tag IDs/mode, and limit-independent ordering policy version.

- [ ] **Step 1: Define the hand-labelled ranking fixture**

Include at least 30 current Revisions with Chinese, English, code identifiers, title-only, Tag-only, body-only, mixed-field, repeated-position, admin_only, disabled Space, and unrelated rows. Each query defines exact expected top-five IDs and matched fields.

- [ ] **Step 2: Write ranking/filter/highlight RED tests**

Assert exact order, deterministic ties, AND/OR semantics, max Tag count, cross-Space Tag rejection, cursor replay rejection, plain-text excerpts, code-point ranges, NFKC/case/Han/underscore handling, and no HTML markers.

- [ ] **Step 3: Run focused RED**

```bash
rtk npx vitest run test/unit/search-policy.test.ts test/unit/library-service.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts
```

- [ ] **Step 4: Implement one versioned ranking policy**

Use fixed FTS weights:

```ts
export const SEARCH_POLICY = Object.freeze({
  version: 2,
  weights: { title: 8, summary: 4, tags: 6, body: 1, code: 3 },
  maxTags: 8,
  maxHighlights: 8,
});
```

Map `highlight()`/field-specific match evidence into enum values and compute ranges against inert excerpt text using the shared lexical tokens. Never return FTS-generated HTML.

- [ ] **Step 5: Implement bounded Tag AND/OR SQL**

Use bound parameters and indexed `revision_tags`; AND uses grouped `HAVING count(DISTINCT tag_id)=?`, OR uses `IN`/`EXISTS`. Apply D1 authorization before FTS candidate materialization and preserve keyset order.

- [ ] **Step 6: Render explanations safely**

UI maps matched-field enums to localized labels and constructs highlighted text from text nodes/ranges; it never assigns server text to `innerHTML`.

- [ ] **Step 7: Prove scale shape and fixed ranking**

Add real `EXPLAIN QUERY PLAN` assertions for Space/Collection/Tag modes and 10,000-row scale-shaped fixtures; reject temp sorts/full scans on request paths.

- [ ] **Step 8: Verify and commit**

```bash
rtk npx vitest run test/unit/search-policy.test.ts test/unit/library-service.test.ts test/unit/workspace-ui.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts
rtk npm run check
rtk git add src/library src/routes/library.ts public/app.js public/workspace-ui.js public/workspace-ui.d.ts test docs/product/ai-knowledge-base-checklist.md
rtk git commit -m "feat: explain and filter FTS search"
```

---

### Task 6: Bundle safe Markdown, expose Revision metadata, and authorize downloads

**Atoms:** `READ-003`, `READ-009`, `AUTH-015`.

**Files:**
- Create: `scripts/vendor-browser-deps.mjs`
- Create: `public/markdown-renderer.js`
- Create: `public/markdown-renderer.d.ts`
- Create: `public/vendor/markdown-it.min.js`
- Create: `public/vendor/purify.min.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `public/workspace-ui.js`
- Modify: `public/workspace-ui.d.ts`
- Modify: `src/library/types.ts`
- Modify: `src/library/repository.ts`
- Modify: `src/library/service.ts`
- Modify: `src/routes/library.ts`
- Create: `test/unit/markdown-renderer.test.ts`
- Modify: `test/unit/workspace-ui.test.ts`
- Modify: `test/worker/m1-library.test.ts`
- Modify: `test/worker/m1-api.test.ts`
- Modify: `test/worker/assets.test.ts`

**Interfaces:**
- `renderSafeMarkdown(markdown: string): DocumentFragment` is the only semantic Markdown renderer.
- `RevisionDetail` adds `reviewerId`, `sourceVersionOrdinal`, `parserSchemaVersion`, code metadata, and `indexStatus`.
- Adds `GET /api/knowledge/:itemId/revisions/:revisionId/download` returning an authorized attachment.

- [ ] **Step 1: Pin local browser dependencies**

Install exact versions, not ranges:

```bash
rtk npm install --save-exact markdown-it dompurify
rtk npm install --save-dev --save-exact happy-dom
```

The vendor script copies the exact reviewed minified distributions into `public/vendor`; tests compare package version/hash and forbid CDN URLs.

- [ ] **Step 2: Write malicious Markdown RED fixtures**

Cover script/style/iframe/form, raw HTML, event attributes, SVG/MathML, `javascript:`, encoded/whitespace-obfuscated URLs, data URLs, target links, tables, fenced code, nested lists, and benign `http/https/mailto` links.

- [ ] **Step 3: Write Revision/download authorization RED**

Use real D1/DO content and assert shared/admin_only across list, search, current detail, history, citation, and download for admin/contributor/disabled/forged principals. Hidden and absent downloads share 404; no user path/hash is accepted.

- [ ] **Step 4: Run focused RED**

```bash
rtk npx vitest run test/unit/markdown-renderer.test.ts test/unit/workspace-ui.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts test/worker/assets.test.ts
```

- [ ] **Step 5: Implement the double safety boundary**

Configure `markdown-it({ html: false, linkify: true, breaks: false })`; reject unsafe protocols in `validateLink`; sanitize the rendered DOM with a fixed DOMPurify allowlist; add `rel="noopener noreferrer"` to external links. Return a `DocumentFragment`, never an HTML string consumed by application code.

- [ ] **Step 6: Add Revision metadata and download**

Join Review/SourceVersion only after visibility authorization. Construct the attachment filename from the bounded file label or title, remove controls/slashes/CRLF, and set:

```http
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="safe-name.md"
X-Content-Type-Options: nosniff
```

- [ ] **Step 7: Render metadata and Markdown**

The Reader inserts the returned fragment, displays current/historical/index status, reviewer ID label, SourceVersion ordinal/schema, and code metadata through text nodes. Citation focus runs only after render.

- [ ] **Step 8: Verify supply chain, security, and commit**

```bash
rtk node scripts/vendor-browser-deps.mjs
rtk npx vitest run test/unit/markdown-renderer.test.ts test/unit/workspace-ui.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts test/worker/assets.test.ts
rtk npm audit --omit=dev
rtk npm run check
rtk git add package.json package-lock.json scripts/vendor-browser-deps.mjs public src/library src/routes/library.ts test docs/product/ai-knowledge-base-checklist.md
rtk git commit -m "feat: render and download knowledge safely"
```

---

### Task 7: Add explicit chat scopes and corpus-stable evidence confidence

**Atoms:** `CHAT-002`, `CHAT-008`.

**Files:**
- Create: `src/ai/evidence-confidence.ts`
- Modify: `src/ai/cited-answer-service.ts`
- Modify: `src/library/types.ts`
- Modify: `src/library/service.ts`
- Modify: `src/library/repository.ts`
- Modify: `src/routes/library.ts`
- Modify: `public/app.js`
- Modify: `public/workspace-ui.js`
- Modify: `public/workspace-ui.d.ts`
- Create: `test/fixtures/m1-evidence-confidence.ts`
- Create: `test/unit/evidence-confidence.test.ts`
- Modify: `test/unit/cited-answer-service.test.ts`
- Modify: `test/unit/library-service.test.ts`
- Modify: `test/worker/m1-library.test.ts`
- Modify: `test/worker/m1-api.test.ts`
- Modify: `test/fixtures/m1-evaluation.ts`
- Modify: `test/unit/m1-evaluation.test.ts`

**Interfaces:**
- Adds `search(scope, request, chatScope?: ChatScope)` with server-side scope authorization.
- `CitedAnswerResult` includes `evidenceConfidence` for successful/refusal UI display but no internal score components.
- `computeEvidenceConfidence(query, hits): number` returns a deterministic `0..1` score.

- [ ] **Step 1: Create a hand-labelled confidence corpus**

Include strong/weak English, Chinese, code, phrase adjacency, scattered terms, title-only, Tag-only, multi-Chunk consistency, query stuffing, tiny/large corpus, admin_only, disabled, and selected-item loss cases. Each case defines expected score band and whether AI may be called.

- [ ] **Step 2: Write scope authorization RED tests**

Cover all/Space/Collection/1–8 items, zero/9 items, duplicates, inactive/hidden/mixed IDs, role drift, cursor scope replay, and prove unauthorized IDs never reach DO/AI.

- [ ] **Step 3: Write confidence RED tests**

Define the score:

```ts
confidence = clamp01(
  0.45 * termCoverage
  + 0.20 * phraseAdjacency
  + 0.20 * matchedFieldQuality
  + 0.15 * multiChunkConsistency
);
```

Pin threshold `0.60`, exact rounding to four decimals, and no AI call below threshold.

- [ ] **Step 4: Run focused RED**

```bash
rtk npx vitest run test/unit/evidence-confidence.test.ts test/unit/cited-answer-service.test.ts test/unit/library-service.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts
```

- [ ] **Step 5: Implement scope authorization before retrieval**

Resolve Space/Collection/items through D1 using active member/role/visibility predicates. Produce an internal authorized filter; never pass raw client IDs to content readers or AI context.

- [ ] **Step 6: Implement confidence and refusal**

Use shared lexical tokens and matched-field enums, not BM25 absolute scores. Below `0.60`, return fixed `KNOWLEDGE_EVIDENCE_INSUFFICIENT` data with suggested actions and do not call AI. Above threshold, retain all existing provider/citation validation.

- [ ] **Step 7: Wire exact HTTP/UI contracts**

Chat accepts only:

```json
{ "question": "...", "scope": { "kind": "collection", "collectionId": "..." } }
```

The Agent page exposes accessible all/Space/Collection/items controls, shows current scope and localized confidence refusal, and never serializes hits/citations/content.

- [ ] **Step 8: Verify corpus invariance and commit**

```bash
rtk npx vitest run test/unit/evidence-confidence.test.ts test/unit/cited-answer-service.test.ts test/unit/library-service.test.ts test/unit/m1-evaluation.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts
rtk npm run check
rtk git add src/ai src/library src/routes/library.ts public/app.js public/workspace-ui.js public/workspace-ui.d.ts test docs/product/ai-knowledge-base-checklist.md
rtk git commit -m "feat: scope and calibrate grounded answers"
```

---

### Task 8: Add Submission status filtering and complete bilingual UI

**Atoms:** `COL-001`, `I18N-001`.

**Files:**
- Create: `public/i18n.js`
- Create: `public/i18n.d.ts`
- Create: `public/locales/en.js`
- Create: `public/locales/zh-CN.js`
- Create: `scripts/verify-i18n.mjs`
- Create: `scripts/i18n-contract.test.mjs`
- Modify: `src/submissions/types.ts`
- Modify: `src/submissions/repository.ts`
- Modify: `src/submissions/service.ts`
- Modify: `src/routes/member.ts`
- Modify: `public/index.html`
- Modify: `public/navigation.js`
- Modify: `public/app.js`
- Modify: `public/workspace-ui.js`
- Modify: `public/styles.css`
- Modify: `test/unit/navigation.test.ts`
- Modify: `test/unit/workspace-ui.test.ts`
- Modify: `test/worker/submissions.test.ts`
- Modify: `test/worker/m1-api.test.ts`
- Modify: `test/worker/assets.test.ts`
- Modify: `package.json`

**Interfaces:**
- `SubmissionPageRequest` adds `status?: SubmissionStatusFilter`; cursor scope binds owner and status.
- `createI18n({ navigatorLanguage, storedLocale, storage })` returns `locale`, `t`, `setLocale`, and `subscribe`.

- [ ] **Step 1: Write owner/status pagination RED tests**

Seed at least 55 mixed-status Submissions for two members. Assert exact owner-only status pages, repeated timestamps, opaque cursor scope, cross-status/owner replay rejection, default/max limits, no gaps/duplicates, and no `COUNT(*)`.

- [ ] **Step 2: Write locale parity and hard-coded-copy RED tests**

Require exact key/interpolation parity between `en` and `zh-CN`; browser-language fallback (`zh-*→zh-CN`, otherwise `en`); stored override; unknown-key English fallback; current-route rerender; no mutation replay. Scan shipped UI modules for user-visible literals outside explicit technical allowlists.

- [ ] **Step 3: Run RED**

```bash
rtk node --test scripts/i18n-contract.test.mjs
rtk npx vitest run test/unit/navigation.test.ts test/unit/workspace-ui.test.ts test/worker/submissions.test.ts test/worker/m1-api.test.ts test/worker/assets.test.ts
```

- [ ] **Step 4: Implement status-filtered D1 paging**

Validate status before cursor decode; bind `{kind:"own-submissions",memberId,status}` into the cursor digest; use `submissions_owner_status_page`; preserve hidden owner IDs.

- [ ] **Step 5: Implement the locale engine**

Use immutable nested-free key maps and `{name}` interpolation with exact parameter validation. Persist only `memory-garden-locale = "en" | "zh-CN"`; catch unavailable storage without breaking rendering.

- [ ] **Step 6: Replace every shipped string with translation keys**

Cover anonymous/login, session, navigation, Submission, Review, Spaces, Collections, Library, Search, Reader, Agent, status/error/empty/loading, confirmations, pagination, dialogs, drawer, language selector, focus summaries, and ARIA labels. Keep API codes and technical IDs untranslated.

- [ ] **Step 7: Add accessible switching and stale safety**

Language switch rerenders the current route through a new generation, closes stale dialogs, preserves session and selected IDs/cursors when safe, and never repeats an in-flight mutation. Set `<html lang>` to the active locale.

- [ ] **Step 8: Integrate verification into `check`**

Add:

```json
{
  "test:i18n": "node --test scripts/i18n-contract.test.mjs",
  "verify:i18n": "node scripts/verify-i18n.mjs"
}
```

Run both from `test:smoke`/`check`.

- [ ] **Step 9: Verify both languages and commit**

```bash
rtk npm run test:i18n
rtk npm run verify:i18n
rtk npx vitest run test/unit/navigation.test.ts test/unit/workspace-ui.test.ts test/worker/submissions.test.ts test/worker/m1-api.test.ts test/worker/assets.test.ts
rtk npm run check
rtk git add public src/submissions src/routes/member.ts scripts/i18n-contract.test.mjs scripts/verify-i18n.mjs test package.json docs/product/ai-knowledge-base-checklist.md
rtk git commit -m "feat: localize the M1 workspace"
```

---

### Task 9: Reconcile the fixed evaluation, checklist, and release evidence

**Atoms:** All local/workerd evidence for 24 atoms; production part of `OPS-015` remains pending.

**Files:**
- Modify: `test/fixtures/m1-evaluation.ts`
- Modify: `test/unit/m1-evaluation.test.ts`
- Modify: `package.json`
- Modify: `scripts/verify-m1-docs.mjs`
- Modify: `scripts/m1-release-contract.test.mjs`
- Modify: `docs/product/ai-knowledge-base-checklist.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/operations/m1-release.md`
- Modify: `docs/operations/evidence/m1-release-template.md`
- Create: `.superpowers/sdd/2026-08-22-m1-gate-completion/task-9-report.md`

**Interfaces:**
- `test:m1` becomes the complete provider-free/local M1 acceptance gate.
- Documentation truth derives all P0/M1 atom counts, including `I18N-001`, rather than hard-coding obsolete totals.

- [ ] **Step 1: Write evaluation mutation RED tests**

Mutate each required feature independently: fatal decode, code metadata, metadata audit, target validation, visibility expansion, resubmission, each FTS field, current switch, index status, ranking, matched fields, highlights, Tag AND/OR, Markdown sanitization, Revision metadata, download visibility, chat scopes/confidence, status filter, and translation keys. Each mutation must fail a per-case assertion, not only an aggregate.

- [ ] **Step 2: Expand the fixed corpus and denominators**

Report exact counts for parser cases, retrieval cases, answer/refusal/denial cases, language cases, required/returned citations, download authorization, ranking agreement, highlight safety, and all 24 atom outcomes. Zero denominators fail closed.

- [ ] **Step 3: Run evaluation RED then GREEN**

```bash
rtk npm run test:m1
```

Expected RED before fixture/report updates; GREEN only after every case has a non-vacuous result.

- [ ] **Step 4: Update checklist truth**

Check all local/workerd atoms except `OPS-015` remote cost and `GATE-M1`. Status text names exact files/commands and does not claim production evidence.

- [ ] **Step 5: Update the release runbook and template**

Pin `0004` hash/ledger; add bilingual journey, original download visibility, explicit chat scopes, visibility expansion audit, resubmission, ranking/highlight/Tag evidence, and D1 cost rows. Keep every remote checkbox unchecked.

- [ ] **Step 6: Run documentation/security gates**

```bash
rtk npm run test:m1
rtk npm run verify:m1:migrations -- --files
rtk npm run verify:m1:docs
rtk npm run verify:i18n
rtk npm run check
rtk npm audit --omit=dev --offline
rtk git diff --check
```

- [ ] **Step 7: Commit the local acceptance candidate**

```bash
rtk git add test package.json scripts docs README.md ROADMAP.md .superpowers/sdd/2026-08-22-m1-gate-completion/task-9-report.md
rtk git commit -m "test: gate strict M1 acceptance"
```

---

### Task 10: Run final review, production release, and accept `GATE-M1`

**Atoms:** `OPS-015`, `GATE-M1`, production evidence for all 24 atoms.

**Files:**
- Create: `docs/operations/evidence/m1-release-YYYY-MM-DD.md`
- Modify only after evidence review: `docs/product/ai-knowledge-base-checklist.md`
- Modify only after evidence review: `ROADMAP.md`

**Interfaces:**
- Consumes the exact clean candidate commit from Task 9.
- Produces one reviewed production evidence record with no sensitive content.

- [ ] **Step 1: Run an independent whole-branch review**

Review the merge-base-to-HEAD diff for schema preservation, authorization-before-access, audit redaction, FTS bounds, citation grounding, Markdown/XSS, i18n completeness, D1 cost shape, and release-command safety. Fix every Critical/Important finding and rerun review.

- [ ] **Step 2: Run the final local gate on the exact candidate**

```bash
rtk npm run test:m1
rtk npm run check
rtk npm audit --omit=dev
rtk npm run verify:m1:migrations -- --files
rtk npm run verify:m1:docs
rtk npm run verify:i18n
rtk git diff --check
rtk git status --short
rtk git rev-parse HEAD
```

- [ ] **Step 3: Stop and obtain explicit production authorization**

Report the exact commit, migration hash, test counts, remaining unchecked remote rows, backup sensitivity, and irreversible forward migration. Do not infer authorization from earlier deployments.

- [ ] **Step 4: Export D1 and verify the pre-`0004` ledger**

Follow `docs/operations/m1-release.md` exactly: restricted backup, hash/size only, exact `0001..0003` ledger, legacy/current preconditions, no row content in evidence.

- [ ] **Step 5: Apply `0004` once and verify the post-ledger**

Use `rtk npm run db:migrate:remote`; require exact `0001..0004`. Any unexpected state stops upload/deploy; never reverse or edit applied SQL.

- [ ] **Step 6: Upload, inspect, and deploy one exact version**

Use the protected complete seven-secret bundle with `versions upload --strict`, inspect the exact version ID/bindings/routes/secret names/`KnowledgeBase`/`v1`, and deploy only `${M1_VERSION_ID}@100%` after separate approval.

- [ ] **Step 7: Run the complete bilingual production journey**

Collect redacted request IDs for English and Chinese GitHub/session navigation, byte submission/idempotency, metadata patch/visibility expansion, revision-requested resubmission, publication, ranking/explanation/highlight/Tag modes, safe reader/download, Revision metadata/history, all chat scopes/confidence refusal/citations, owner status filter, disabled session, logout, bad/valid automation, and cross-activation read.

- [ ] **Step 8: Capture `OPS-015` D1 cost evidence**

For default/max/cursor list, mixed status submissions, review queue, Tag AND/OR, ranking search, detail/history/download authorization, chat scope resolution, index Job, and recovery, record operation, route/limit, returned rows, `rows_read`, `rows_written`, index/plan reference, and redacted request ID—never row/query/source content.

- [ ] **Step 9: Review current Cloudflare limits**

Use official Cloudflare documentation and target Dashboard on the release date. Record only plan/quota confirmation and hard-bound/degradation evidence; do not record account IDs, payment data, or historical spec numbers as current facts.

- [ ] **Step 10: Accept the gate only after independent evidence review**

When every row is present, zero permission leaks/wrong citations occurred, and rollback compatibility is reviewed, check `OPS-015`, `I18N-001`, and `GATE-M1`; set decision to `M1 production gate accepted`. Otherwise leave them unchecked and state the precise pending evidence.

- [ ] **Step 11: Commit evidence without sensitive data**

```bash
rtk git add docs/operations/evidence/m1-release-YYYY-MM-DD.md docs/product/ai-knowledge-base-checklist.md ROADMAP.md
rtk git diff --cached --check
rtk git commit -m "docs: accept M1 production gate"
```

## Spec Coverage Matrix

| Requirement | Task |
| --- | --- |
| `SRC-003`, `PAR-001`, `EVAL-001/002` | 1–2, 9 |
| `GOV-004/005/007/010` | 1, 3, 9 |
| `IDX-001/002/006` | 1, 4, 9 |
| `IDX-004`, `SRCH-002/003/004/007` | 5, 9 |
| `READ-003/009`, `AUTH-015` | 6, 9 |
| `CHAT-002/008` | 7, 9 |
| `COL-001`, `I18N-001` | 8–9 |
| `OPS-015`, full production evidence, `GATE-M1` | 10 |
