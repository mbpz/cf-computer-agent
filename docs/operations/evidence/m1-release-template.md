# M1 production release evidence — template

Copy this file for one authorized candidate. Do not overwrite this template. Store no source/answer body, Cookie, OAuth code, callback query, authorization/signature header, email, Secret, D1 export, or provider response here.

## Completion status

- [ ] Production evidence collection was explicitly authorized.
- [ ] Every required remote row below is complete and reviewed.
- [ ] `GATE-M0` remote prerequisites are archived.
- [ ] `GATE-M1` is eligible to be checked.

Current default decision: **M1 local acceptance pending; remote verification pending.**

## Candidate identity

| Field | Value |
| --- | --- |
| Evidence date/time (UTC) | `<pending>` |
| Operator/reviewer | `<pending>` |
| Candidate commit | `<pending>` |
| Working tree clean | `<pending>` |
| Production Worker | `memory-garden-agent` |
| Custom domain | `https://memory.crgmhrc.asia` |
| D1 database | `memory-garden-control-plane` |
| Uploaded version ID | `<pending>` |
| Deployed version ID | `<pending>` |

## M0 production prerequisites

| Check | Status | Version ID | Redacted request/evidence reference |
| --- | --- | --- | --- |
| Successful GitHub OAuth callback | [ ] pending | `<pending>` | `<pending>` |
| Valid signed automation | [ ] pending | `<pending>` | `<pending>` |
| Bad signature/token rejected | [ ] pending | `<pending>` | `<pending>` |
| Disabled contributor rejected | [ ] pending | `<pending>` | `<pending>` |
| Production/preview workers.dev disabled | [ ] pending | `<pending>` | `<pending>` |
| Durable Object cross-activation read | [ ] pending | `<pending>` | `<pending>` |

## D1 export and migration

| Check | Status | Evidence |
| --- | --- | --- |
| Pre-release remote export completed | [ ] pending | date `<pending>`; bytes `<pending>`; SHA-256 `<pending>` |
| Export stored outside repository with restricted access | [ ] pending | restricted reference `<pending>` |
| Reviewed `0001`/`0002`/`0003` SHA-256 verifier | [ ] pending | `rtk npm run verify:m1:migrations -- --files`; exact pass output `<pending>` |
| Pre-apply `d1_migrations` ledger exact | [ ] pending | `rtk npm run verify:m1:migrations -- --ledger-before "$M1_LEDGER_FILE"`; exact names/pass `<pending>` |
| `0003_m1_knowledge_loop.sql` reviewed in full | [ ] pending | reviewer `<pending>` |
| Local upgrade preservation and FK checks passed | [ ] pending | command/count `<pending>` |
| Remote `0003` applied once | [ ] pending | date/result `<pending>` |
| Post-apply `d1_migrations` ledger exact | [ ] pending | `rtk npm run verify:m1:migrations -- --ledger-after "$M1_LEDGER_FILE"`; exact names/pass `<pending>` |
| `KnowledgeBase` class and DO migration tag `v1` preserved | [ ] pending | inspected version reference `<pending>` |

Never attach the export or row contents. Never mark a reverse migration, table deletion, or Durable Object reset as rollback evidence.

## Local candidate gates

| Command | Status | Exact evidence |
| --- | --- | --- |
| `rtk npm run test:m1` | [ ] pending | files/tests/duration `<pending>` |
| Fixed evaluation | [ ] pending | cases `<pending>`; retrieval/answer/refusal denominators `<pending>`; Recall@5 `<pending>`; citation precision `<pending>`; citation recall `<pending>`; location `<pending>`; per-case outcomes `<pending>`; wrong citations `<pending>`; permission leaks `<pending>` |
| Local automation probe contracts | [ ] pending | `rtk npm run test:ops:m1`; tests/count `<pending>` |
| `rtk npm run typecheck` | [ ] pending | exit/result `<pending>` |
| `rtk npm run check` | [ ] pending | smoke/unit/Workerd counts and dry-run bindings `<pending>` |
| `rtk npm audit --omit=dev` | [ ] pending | vulnerabilities `<pending>` |
| `rtk git diff --check` | [ ] pending | exit/result `<pending>` |

The fixed evaluator is provider-free. Do not enter a Workers AI key, account token, or production source into it.

## Uploaded version inspection

| Check | Status | Evidence |
| --- | --- | --- |
| One `versions upload --strict` candidate | [ ] pending | uploaded version `<pending>` |
| Complete seven-secret **names** present | [ ] pending | names-only inspection `<pending>` |
| `DB` binding exact | [ ] pending | `<pending>` |
| `KNOWLEDGE` / `KnowledgeBase` / `v1` exact | [ ] pending | `<pending>` |
| `AI` and `ASSETS` bindings exact | [ ] pending | `<pending>` |
| Custom domain exact; no route drift | [ ] pending | `<pending>` |
| production and preview workers.dev disabled | [ ] pending | `<pending>` |
| Exact inspected version deployed at 100% | [ ] pending | deployment status `<pending>` |

No secret value, JSON bundle path, or terminal transcript containing hidden input belongs in this record.

## Production browser journey

| Journey | Status | HTTP outcome | Redacted request ID(s) | Notes without body/content |
| --- | --- | --- | --- | --- |
| OAuth start/callback/session | [ ] pending | `<pending>` | `<pending>` | `<pending>` |
| Contributor source submit | [ ] pending | `<pending>` | `<pending>` | synthetic fixture ID only `<pending>` |
| Idempotency replay | [ ] pending | `<pending>` | `<pending>` | same Submission confirmed `<pending>` |
| Admin raw/normalized/Chunk preview | [ ] pending | `<pending>` | `<pending>` | `<pending>` |
| Admin publish | [ ] pending | `<pending>` | `<pending>` | visibility `<pending>` |
| Contributor list/search | [ ] pending | `<pending>` | `<pending>` | `<pending>` |
| Current Revision reader | [ ] pending | `<pending>` | `<pending>` | `<pending>` |
| Citation exact location readback | [ ] pending | `<pending>` | `<pending>` | heading/line numbers only `<pending>` |
| Grounded chat | [ ] pending | `<pending>` | `<pending>` | citation count only `<pending>` |
| `admin_only` list/search/detail hidden | [ ] pending | `<pending>` | `<pending>` | no metadata/body captured |
| `admin_only` citation/chat hidden | [ ] pending | `<pending>` | `<pending>` | no metadata/body captured |
| Disabled existing session rejected | [ ] pending | `<pending>` | `<pending>` | `<pending>` |
| Logout clears session | [ ] pending | `<pending>` | `<pending>` | `<pending>` |

## Automation compatibility

| Check | Status | Version ID | Redacted output/request IDs |
| --- | --- | --- | --- |
| `rtk npm run probe:automation:invalid`: random wrong HMAC `GET /api/health` exactly `401` | [ ] pending | `<pending>` | `[pass] invalid-signature-health status=401 request_id=sha256-<12hex> elapsed_ms=<integer>` |
| `rtk npm run probe:automation:admin-forbidden`: valid fresh HMAC `POST /api/admin/publications/recover` exactly `403` | [ ] pending | `<pending>` | `[pass] automation-admin-forbidden status=403 request_id=sha256-<12hex> elapsed_ms=<integer>` |
| Valid HMAC plus `APP_TOKEN` smoke passes | [ ] pending | `<pending>` | `<pending>` |

## Cross-activation published read

| Check | Status | Evidence |
| --- | --- | --- |
| Read before normal new DO activation | [ ] pending | version/request ID `<pending>` |
| New activation observed without reset/delete | [ ] pending | redacted activation reference `<pending>` |
| Same Revision/citation read after activation | [ ] pending | version/request ID `<pending>` |
| Revision, Chunk location, and content-hash outcome unchanged | [ ] pending | IDs/location/hash-result only `<pending>` |

## Remote D1 query-cost evidence

Capture D1 metadata correlated to a synthetic request. Never paste result rows, query/source text, member email, session information, or credentials.

| Operation / statement path | Route and page limit | Status | Returned rows | rows_read | rows_written | Index/plan evidence | Redacted request ID |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Contributor knowledge list, first page | `<pending>` | [ ] pending | `<pending>` | `<pending>` | `<pending>` | `<pending>` | `<pending>` |
| Contributor knowledge list, cursor page | `<pending>` | [ ] pending | `<pending>` | `<pending>` | `<pending>` | `<pending>` | `<pending>` |
| Contributor FTS search, first page | `<pending>` | [ ] pending | `<pending>` | `<pending>` | `<pending>` | `<pending>` | `<pending>` |
| Contributor FTS search, cursor page | `<pending>` | [ ] pending | `<pending>` | `<pending>` | `<pending>` | `<pending>` | `<pending>` |
| Contributor own Submissions | `<pending>` | [ ] pending | `<pending>` | `<pending>` | `<pending>` | `<pending>` | `<pending>` |
| Admin review queue | `<pending>` | [ ] pending | `<pending>` | `<pending>` | `<pending>` | `<pending>` | `<pending>` |
| Same-Space Tag list/cursor | `<pending>` | [ ] pending | `<pending>` | `<pending>` | `<pending>` | `<pending>` | `<pending>` |
| Bounded recovery scan | `<pending>` | [ ] pending | `<pending>` | `<pending>` | `<pending>` | `<pending>` | `<pending>` |

`OPS-015` stays unchecked until every required remote cost row is reviewed. Local indexes, `EXPLAIN QUERY PLAN`, and `LIMIT + 1` tests are not substitutes for these values.

## Current free-tier bounds review

Do not reuse historical quota numbers from the design specification. Recheck official Cloudflare documentation and the target account at release time.

| Product | Status | Official-doc review date/reference | Target account plan/quota check | Implemented hard bound/degradation evidence |
| --- | --- | --- | --- | --- |
| Workers | [ ] pending | `<pending>` | `<pending>` | bounded bodies/pages/steps `<pending>` |
| D1 | [ ] pending | `<pending>` | `<pending>` | indexes/keysets/cost rows `<pending>` |
| Durable Objects / Computer | [ ] pending | `<pending>` | `<pending>` | `KnowledgeBase` v1, bounded RPC/recovery `<pending>` |
| Workers AI | [ ] pending | `<pending>` | `<pending>` | bounded context/output/timeout and no-evidence degradation `<pending>` |

Record no account identifier, payment method, secret, source text, or provider body.

## Local recovery and degraded evidence

| Fault boundary | Status | Focused command/result |
| --- | --- | --- |
| Ambiguous DO response replays exactly one Revision | [ ] pending | `<pending>` |
| VFS failure leaves recoverable intent | [ ] pending | `<pending>` |
| D1 finalization failure leaves recoverable content | [ ] pending | `<pending>` |
| Final D1 batch failure rolls back every relational row | [ ] pending | `<pending>` |
| Response loss replays only the durable index job | [ ] pending | `<pending>` |
| FTS failure keeps Revision readable and marks degraded | [ ] pending | `<pending>` |
| Bounded recovery reaches indexed without duplicate Revision/audit | [ ] pending | `<pending>` |

Reference `test/unit/publication-service.test.ts`, `test/worker/m1-publication.test.ts`, and `test/worker/m1-library.test.ts`; do not invent production recovery evidence from local results.

## Forward-compatible rollback readiness

| Check | Status | Evidence |
| --- | --- | --- |
| Target reads current D1 schema including `0003` | [ ] pending | `<pending>` |
| Target preserves GitHub OAuth/session and automation | [ ] pending | `<pending>` |
| Target preserves `KnowledgeBase` class, `v1`, VFS, index, journal | [ ] pending | `<pending>` |
| Target was locally gated, uploaded with `--strict`, and inspected | [ ] pending | emergency version `<pending>` |
| No reverse migration, D1/DO deletion, old Access build, secret bulk, or plain deploy | [ ] pending | reviewer `<pending>` |

If rollback is executed, add the exact emergency version ID plus new OAuth/session, M1 read/citation, bad/valid automation, and cross-activation request IDs. Never describe data deletion as rollback.

## Final decision

- [ ] All local, Workerd, remote provider, custom-domain, cost, and recovery evidence required by M1 is present.
- [ ] No permission leak or wrong citation occurred.
- [ ] The independent Task 11 correctness/security review distinguishes local/Workerd facts from production facts.
- [ ] `GATE-M1` may be checked.

Decision: `<M1 local acceptance pending; remote verification pending | M1 implementation complete; remote verification pending | M1 production gate accepted>`

Reviewer notes (no sensitive data): `<pending>`
