# M1 Gate Completion Design

**Date:** 2026-08-22  
**Status:** Approved design  
**Scope:** Complete every remaining P0/M1 product atom plus bilingual internationalization, then collect the production evidence required to accept `GATE-M1`.

## 1. Goal and non-negotiable boundary

This design completes the deployed M1 trusted-knowledge loop without weakening its existing acceptance criteria. The target remains a private knowledge base for 5–20 people using Cloudflare Free-plan-compatible primitives: Workers, D1, Durable Objects/Computer, Workers AI, and static Worker assets. GitHub OAuth, D1-backed sessions, signed automation plus `APP_TOKEN`, the `KnowledgeBase` Durable Object class, migration tag `v1`, current custom domain, and disabled workers.dev URLs remain unchanged.

`GATE-M1` is accepted only after all 24 atoms below have implementation, local/Workerd evidence, independent review, and the required production evidence. Deployment alone is not completion.

## 2. Required atoms

The existing 23 incomplete P0/M1 atoms remain authoritative:

- Source/parser/evaluation: `SRC-003`, `PAR-001`, `EVAL-001`, `EVAL-002`.
- Governance: `GOV-004`, `GOV-005`, `GOV-007`, `GOV-010`.
- Index/search: `IDX-001`, `IDX-002`, `IDX-004`, `IDX-006`, `SRCH-002`, `SRCH-003`, `SRCH-004`, `SRCH-007`.
- Reader/download authorization: `READ-003`, `READ-009`, `AUTH-015`.
- Grounded chat: `CHAT-002`, `CHAT-008`.
- Collaboration/operations: `COL-001`, `OPS-015`.

This design adds the 24th atom:

- `I18N-001`: complete `zh-CN` and `en` localization with browser-language selection, an in-product language switch, persistence, equivalent translation keys, localized accessible labels, and a CI hard-coded-copy gate.

## 3. Delivery architecture

The work is delivered as six independently reviewable vertical slices. Each slice includes its schema/domain/API/UI/tests/documentation when applicable. No slice may mark an atom complete from adjacent evidence.

1. Source, parser, and independent fixtures.
2. Review metadata governance and contributor resubmission.
3. FTS schema, synchronization, ranking, explanations, highlights, and Tag filtering.
4. Safe Markdown reader, Revision metadata, and authorized original download.
5. Explicit chat scopes and calibrated evidence refusal.
6. Submission filtering, bilingual UI, production D1 cost evidence, and final release evidence.

All D1 changes are append-only in `0004_m1_gate_completion.sql`. Applied migrations `0001`–`0003` are immutable. The release remains forward-only and never deletes or resets D1, Durable Object, VFS, index, or journal state.

## 4. Source and parser contract

### 4.1 Byte input

The HTTP boundary accepts source bytes through a dedicated fatal UTF-8 decoder. Invalid byte sequences fail with a stable 4xx error before normalization, hashing, SourceVersion creation, Submission creation, or audit. Newlines normalize deterministically to LF. Already-decoded JavaScript strings are not accepted as evidence for `PAR-001`.

### 4.2 Code metadata

A code source records an allowlisted language, a bounded safe file label, and a one-based original line baseline. These fields are server-normalized, included in the SourceVersion identity/hash contract, preserved into Revision metadata, and never inferred from executable content.

### 4.3 Independent fixtures

Parser fixtures are data, not implementation-generated expectations. The fixed matrix covers text, Markdown, and code across normal, empty, exact-boundary, over-limit, malformed UTF-8, malicious Markdown/URL, newline variants, language/file-label, and line-baseline cases. Every fixture defines expected normalized Markdown, structure, source location, warnings, error code, and persistence outcome.

## 5. Review governance

Review stores requested metadata separately from a final metadata patch. The patch may contain title, Space, Collection, visibility, and Tag IDs. Audit metadata is a strict discriminated allowlist containing only resource IDs, old/new bounded values, and reason codes; it never stores source text, Markdown, provider bodies, credentials, or free-form review notes.

### 5.1 Target changes

An admin may change the final Space and Collection before publication. The final Space must be active, writable, and non-legacy. The Collection must be active and belong to the selected Space. Changing Space clears incompatible Collection and Tag selections in the UI, while the server revalidates everything atomically during finalization. The review UI displays both requested and final targets.

### 5.2 Visibility

- Requested `shared` may remain `shared` or be narrowed to `admin_only`.
- Requested `admin_only` remains locked by default.
- Expanding `admin_only` to `shared` requires an explicit second confirmation, a bounded reason code, admin capability, and an audit event.
- Contributors cannot expand visibility.

### 5.3 Revision request

`revision_requested` remains terminal for the reviewed Submission but exposes a safe owner-only resubmission action. The new Submission references the prior Submission ID, uses a new idempotency key and immutable SourceVersion, preserves the requested target unless the owner changes it, and never mutates the rejected/revision-requested record.

## 6. Index and search

### 6.1 FTS document

The D1 FTS document has explicit searchable fields for title, summary, Tag text, body, and code. Index jobs remain D1-authoritative, idempotent, and separate from publication. Current Revision switching, retry, degraded recovery, and any future trash transition update or remove the same Revision’s FTS rows deterministically. Only the current readable Revision participates in normal search.

### 6.2 Ranking and explanations

Field weights are fixed and tested against a hand-labelled Chinese, English, code, title, and Tag query set. BM25 is used only within a result set and always has deterministic tie-breakers. Each hit returns an allowlisted `matchedFields` value and plain-text excerpt plus code-point-based highlight ranges. The server never returns generated highlight HTML.

### 6.3 Filters and status

Search supports bounded Space, Collection, and Tag filters. Tag mode is explicit `and` or `or`, Tag count is bounded, and all filters are scope-bound into opaque cursors. List, detail, review, and search expose a safe index status: `pending`, `indexed`, `search_degraded`, or `failed`. Selective indexes and real `EXPLAIN QUERY PLAN` tests prohibit unbounded request scans and temporary sorts on the Free-plan request paths.

## 7. Reader and download

### 7.1 Safe Markdown

The browser bundles pinned local versions of `markdown-it` and `DOMPurify`; no CDN is used. Markdown raw HTML is disabled before rendering, then DOMPurify applies a final allowlist. Scripts, forms, iframes, event attributes, dangerous URLs, and arbitrary HTML are removed. Links allow only `http`, `https`, and `mailto`; external links receive `noopener noreferrer`. Malicious fixtures are verified against a real DOM environment.

### 7.2 Revision information

The reader displays stable Revision identity/version, publish time, reviewer, SourceVersion identity, index status, and current/historical state. No email, storage path, content hash, or secret is exposed.

### 7.3 Original download

M1 text/Markdown/code original download reuses authorized immutable published content; it does not add R2. Every download reauthorizes active member, authoritative role, item status, Space status, Revision visibility, and current/historical semantics before the stored path/hash reaches the content reader. The response uses a bounded safe filename and attachment headers. List, search, detail, history, citation, and download share the same hidden-versus-absent contract.

## 8. Grounded chat

The UI supports exactly four source scopes:

- all currently visible knowledge;
- one Space;
- one Collection;
- 1–8 explicitly selected Knowledge Items.

The client submits only the question, scope kind, and resource IDs. The server reauthorizes every ID and derives all Revision, Chunk, citation, content, path, and hash values. Invalid or inaccessible scope members fail closed and never silently widen to all knowledge.

### 8.1 Evidence confidence

The answer eligibility score is a deterministic `0..1` `evidenceConfidence` based on normalized query-term coverage, exact phrase/adjacency, matched field weights, and consistent coverage across multiple authorized Chunks. BM25 absolute magnitude is excluded because it changes with corpus size; BM25 remains only a relative rank input. A fixed multilingual/code weak-relevance set calibrates and pins the threshold at `0.60`. Below threshold, the service does not call Workers AI and returns a localized suggestion to rewrite the question or expand scope.

The existing inert-source prompt, bounded context, provider schema validation, claim-level citation allowlist, counterfeit-marker construction invariant, and citation readback remain mandatory.

## 9. Collaboration and internationalization

My Submissions remains owner-only, keyset-paginated, and gains a validated status filter bound into its opaque cursor. Status changes or forged owner IDs cannot widen the result set.

The authenticated UI has complete `zh-CN` and `en` language packs. Initial locale comes from browser language; a user switch overrides it and persists in `localStorage`. Locale is not stored in D1. Navigation, headings, buttons, forms, validation, server error-code mappings, status names, empty/loading/error states, confirmation dialogs, notifications, pagination, focus text, dialog labels, and ARIA strings use translation keys. Unknown keys fall back to English and are test failures in checked-in UI code.

Language packs must have identical key sets and interpolation parameters. A static gate rejects new hard-coded user-visible strings outside allowlisted technical tokens, IDs, and fixtures. Changing locale rerenders the current route without restarting authentication or issuing duplicate mutations.

## 10. Error, security, and concurrency boundaries

- Principal resolution and capability authorization precede path/query/body/resource parsing according to the existing route contract.
- Client role, member ID, source content, citation IDs, storage paths, hashes, final review state, or audit metadata are never trusted.
- Every mutation is single-flight and route-owner-bound in the browser; stale dialogs and completions cannot start or alter mutations.
- D1 paired mutations and audits fail inside the same batch. DO content remains immutable and publication/recovery remains idempotent.
- Stable server error codes remain language-neutral. The browser translates codes without reflecting provider or database messages.
- Logs and evidence contain request ID, stage, and allowlisted reason only—never source text, answer text, JWT, Cookie, OAuth callback/code, Secret, or authorization/signature header.

## 11. Test and acceptance strategy

Each slice follows RED→GREEN and receives an independent correctness/security review.

- Unit: fatal decoding, parser fixtures, metadata patches, visibility transitions, scoring, highlight ranges, locale keys, interpolation, and status filtering.
- Workerd: real D1/FTS5/DO, fresh and `0001→0004` migration, FK preservation, ranking, current switch, recovery, download authorization, history, concurrency, and rollback.
- Browser/static: local bundled Markdown dependencies, DOMPurify malicious fixtures, bilingual route coverage, no hard-coded copy, locale persistence, accessibility, and stale async ownership.
- Evaluation: fixed hand-labelled parser and retrieval corpora with non-vacuous denominators, exact per-case outcomes, Recall@5, stable ranking, evidence-confidence refusals, citation precision/recall/location, zero wrong citations, and zero permission leaks.
- Operations: migration hashes/ledger, complete-secret exact-version deployment, request-ID-redacted probes, no destructive rollback commands, and truthful evidence templates.

## 12. Production completion sequence

After all 24 atoms pass locally and in Workerd:

1. Export remote D1 to a restricted backup and record only size/digest.
2. Verify the exact pre-`0004` ledger and preconditions; apply `0004` once; verify the post-ledger.
3. Upload one complete-secret Worker version with `--strict`, inspect the exact ID, then deploy only that ID at 100%.
4. Run the bilingual GitHub OAuth/session and complete Submission→Review→Publish→Search→Reader→Download→Chat journey.
5. Verify shared/admin-only isolation across list, search, detail, history, citation, download, and chat.
6. Verify disabled session, invalid/valid automation, normal cross-activation read, degraded indexing, and forward-compatible rollback readiness.
7. Capture remote D1 `rows_read`/`rows_written` for every required bounded list/search/review/Tag/recovery operation without storing row contents.
8. Review every atom and production evidence row independently. Only then check `GATE-M1` and report `M1 production gate accepted`.

Rollback changes Worker code only. It never reverses `0004`, changes `KnowledgeBase`/`v1`, deletes D1/DO/VFS data, or deploys an old Access-era build.

