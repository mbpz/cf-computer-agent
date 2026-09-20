# D1 non-destructive logical backup — synthetic feasibility evidence

## Decision and authorization boundary

**Local feasibility demonstrated; production backup, recovery and migration remain blocked.**

The user confirmed the bounded next step: design and test a backup/restore path with synthetic data without deleting production tables. This round connected to no production database, exported no real content, changed no application source or dependencies, and performed no deployment, commit or push. Prior production observations in the [preflight](./2026-09-17-production-d1-backup-preflight.md) were not refreshed in this round.

Recommended candidate: read-only logical collection of schema, ordinary table rows, stored FTS document rows, migration ledger and AUTOINCREMENT high-water marks; recreate them in a **fresh, disposable target**. Reconstruct FTS indexes in that target, never remove FTS tables from the source. This is a proposal supported by a local spike, not a production-ready backup command.

## Alternatives and scope

- Standard D1 export remains paused under the virtual-table limitation recorded in the preflight. No assumption that table filtering bypasses the database-level limitation, and no destructive workaround.
- Existing `src/ops/export-package.ts` is a bounded business export, not a full database backup: it explicitly excludes derived categories and does not cover all current workbench tables. `src/ops/restore-plan.ts` and `docs/operations/m7-restore-drill.md` describe dry-run validation with `writes: none`, not actual full restoration.
- Time Travel is a separate recovery option requiring authorization. A bookmark is not an independent backup, and this round did not exercise remote recovery.
- Proposed logical backup covers D1 only. R2 objects, Durable Object state, Vectorize, secrets, deployed configuration and external effects require separate inventory/recovery decisions. Do not advertise full-product disaster recovery.

## Candidate data contract

1. Discover actual schema using `sqlite_schema`, `PRAGMA table_list` and `table_xinfo`; distinguish FTS shadow tables by metadata. Preserve normal indexes, views and triggers, including access-control projections. Do not use the current migration files alone as a substitute for actual source DDL.
2. Copy all ordinary user tables, including `d1_migrations`. Copy `chunks_fts` and `chunks_fts_shared` stored document rows separately, keeping their rowids and corpus membership. Rebuild their shadow indexes by inserting those documents into new FTS tables. This preserves the source's logical FTS documents; it does not claim to correct pre-existing corpus errors or restore shadow pages byte-for-byte.
3. Serialize values **inside SQLite before crossing JSON/JavaScript**. Integers and rowids become decimal strings; TEXT becomes UTF-8 bytes represented as hexadecimal SQL literals; BLOB uses hexadecimal literals; REAL uses a round-trippable SQLite representation. Include NULL and `sqlite_sequence` high-water marks. Avoid Number conversion for 64-bit integers.
4. Use deterministic keyset pagination for supported rowid tables. The probe uses three rows per page. Production pagination must additionally bound returned bytes, query size and total memory; reject unsupported layouts explicitly.
5. Restore only into an empty disposable target: tables and required unique indexes first, then data under deferred foreign-key validation, then triggers. Do not load data with triggers active, which could duplicate notification intents or mutate copied projections. Check foreign keys and FTS integrity after restoration.
6. A failed restore must never be published or pointed at the application. The probe has a single transactional **data** batch; schema creation and later trigger installation are separate operations. It does not prove whole-restore atomicity, large-scale transactional limits or safe resumability.

## Consistency is a mandatory gate

The concurrent-write fixture atomically changes two existing rows after the first page is read, without changing row count. One modified row was already read and the other was still pending. The assembled backup differs from **both** the state before and after that write. A second scan detects this fixture's drift, but is not a general snapshot guarantee (including write/revert or ABA patterns).

Production therefore needs an approved writer-quiescence mechanism and drained in-flight work for the entire collection interval. Do not substitute a Sessions bookmark, two equal scans, an empty task count, blocking only POST requests, or closing the UI for that mechanism.

Local source evidence requiring a fuller writer inventory:

- `src/index.ts`: scheduled asset processing calls `processDue(3)` and can write through the assets repository.
- `src/members/service.ts`: resolving an existing member schedules `touchLastSeenIfStale` through `waitUntil`; a seemingly read-only authenticated request can cause a write.
- `src/identity/session.ts`: session creation writes to D1.
- Maintenance design must also inventory OAuth callbacks, agent/tool entry points, background/DO work, direct administrative CLI/API writes and other deployments. This list is a starting point, not a claim of exhaustive deployed-writer coverage.

A maintenance guard would need to run before authentication/background writes, block the relevant execution entry points, and account for in-flight requests. No such guard was implemented or deployed in this round. Current deployed Cron configuration and the actual deployment platform were not queried.

## Fresh local execution

Completed at **2026-09-17T15:33:15.330Z** (23:33:15 Asia/Shanghai).

- Node: `v24.14.1`; top-level Miniflare: `5.20260801.0-alpha`; top-level Wrangler: `4.119.0`; test pool package: `0.20.3`.
- Uses local Miniflare/Workerd D1 and the actual migration parser/files, with synthetic members, knowledge, tasks, FTS documents and edge-case value tables. No remote transport exists in the probe.
- Tests migration prefixes 0001–0032 and 0001–0051 independently; this round did not rerun the separate migration catch-up test suite.
- The local probe used a Wrangler-style `d1_migrations` table, rather than assuming the test helper's migration tracking is the production ledger.
- Synthetic counts include seeded defaults, the ledger and two edge-case probe tables; they are **not production counts**.

| Prefix | Logical tables | Schema objects | Rows | Canonical logical digest |
| --- | ---: | ---: | ---: | --- |
| 32 | 45 | 101 | 77 | `596364c2a1aa1816d7ec8c3551898cec03c0388de40c295bc025fcc25440ce4f` |
| 51 | 67 | 174 | 106 | `5602fefbf50fd8458f434eb437435751b70cd3015e18545df8a7571fe4306615` |

**13 checks passed, exit 0:**

1. Prefix 32: exact logical schema/data/rowid/ledger/sequence roundtrip; source logical digest unchanged during collection/restore.
2. Prefix 32: FTS integrity, MATCH results and BM25 scores preserved; admin-only fixture term absent from shared corpus.
3. Prefix 32: int64 extremes, integer beyond JS safe range, embedded NUL, Chinese/quotes/newlines, empty BLOB, REAL extremes/subnormal and AUTOINCREMENT high-water preserved.
4. Prefix 32: refuse a non-empty restore target.
5. Prefix 51: exact logical roundtrip and unchanged source, as in check 1.
6. Prefix 51: FTS checks, as in check 2.
7. Prefix 51: value/high-water checks, as in check 3.
8. Prefix 51: refuse a non-empty target.
9. Prefix 51: restored task status creates a new notification intent; deleting owner A's task detaches its calendar reference while preserving owner/title, removes discussion access projection, and preserves owner B's task; FK check remains empty.
10. A deliberately invalid task foreign key rejects and rolls back the entire local data batch; target DDL may remain, so the target is still disposable.
11. Concurrent same-count writes produce a mixed-time export; a second scan detects this fixture's drift.
12. Oversized generated INSERT is rejected, not truncated (probe's conservative 90,000-byte threshold, **not** a claimed D1 service limit).
13. Unsupported WITHOUT ROWID table is rejected.

FTS isolation uses a deliberately synthetic extra admin-only document; it validates exact logical corpus separation, not application authorization or a real-user end-to-end journey. Trigger/member checks likewise do not replace two-user production acceptance.

### Reproduction artifacts (temporary, synthetic only)

```text
/private/tmp/workbench-d1-logical-spike-20260917.dZf1Fq/spike.mjs
SHA256 52233f613ca59c750e97146c320b19aeef130e5a7f31065809c3cc2992879c3a
/private/tmp/workbench-d1-logical-spike-20260917.dZf1Fq/results.json
SHA256 478a0174bd3c832cbf1815c2614665d52d397699e788bde64c3ee4fe7a6b793c
```

```bash
rtk proxy node /private/tmp/workbench-d1-logical-spike-20260917.dZf1Fq/spike.mjs
```

The probe starts local listeners and required sandbox permission. The temporary script contains machine-specific module paths; it is not a committed, portable test or a supported operational command. This document preserves the measured evidence; temporary files may expire. No full backup artifact was written, even from the synthetic database: roundtrips used an in-memory logical representation and wrote only a summary report.

Initial setup failures: the test-pool package has an ESM-only public import, so a CommonJS resolver failed before testing; corrected to the local ESM module. The first complete run passed prefix 32 then rejected a prefix-51 calendar fixture missing its required `client_key`; corrected only the synthetic fixture. No dependency, schema or production workaround was used.

Documentation verification after updating this evidence, the plan, Roadmap and ledger: `rtk proxy node --test scripts/delivery-status-contract.test.mjs` passed **28/28**, exit 0; `rtk proxy git diff --check` passed. Existing uncommitted migration/source-test changes were preserved. This round does not claim a fresh full application build or production-browser acceptance.

## Required before any real-content export

- [x] Compare non-destructive alternatives and demonstrate the current-schema logical roundtrip locally.
- [ ] Obtain design approval for production-grade tooling; turn the throwaway probe into portable, reviewed tests and a bounded collector/restore verifier. No remote restore command by default.
- [ ] Verify the selected remote **read** transport's actual D1 SQL/PRAGMA support and encoding, result pagination/byte limits, timeouts and response failures with disposable synthetic data. Local binding results are not evidence for the remote API transport.
- [ ] Define a versioned manifest with DB identity, schema and migration hashes, table/row counts, ordered per-file hashes, encoding and tool versions. Reject wrong target, altered/truncated files, missing tables, unsupported virtual-table options, generated columns, shadowed rowids and unsupported numeric values. Complete negative tests, including interrupted output and bounded resource usage.
- [ ] Approve and implement writer quiescence; inventory all writers, drain active work and define resume/rollback procedures. Deploying/enabling maintenance remains a separate production authorization.
- [ ] Reconfirm the real-content export destination/retention/access policy. Full D1 content can contain sessions and personal data: 0700 directory, 0600 files, exclusive creation, no console/stdout body, repo, attachment, telemetry or accidental diagnostic disclosure; no credential file reads. Decide durable protected storage rather than assuming `/private/tmp` is a lasting backup.
- [ ] Recheck current source version/binding/schema/migration hashes and obtain fresh recovery metadata inside the approved window; perform the separately authorized collection.
- [ ] Verify the resulting artifact, restore it into an approved isolated target, compare schema/data digests, test constraints/FTS, and document gaps for non-D1 resources. Local tests must keep real backup contents out of test reports.
- [ ] Only then seek separate approval for production migrations. Any real recovery is another explicit operation, not an automatic failure handler.

## References checked

Cloudflare official Markdown was used because the web renderer returned no extractable content. The database API page was fetched in this round; the import/export limitation is retained with its prior-round fetch evidence in the linked preflight.

```text
https://developers.cloudflare.com/d1/worker-api/d1-database/index.md
https://developers.cloudflare.com/d1/best-practices/import-export-data/index.md
```

The API documentation states transactional sequential execution for `batch()` and sequential consistency for Sessions. It does not supply a fixed multi-query snapshot guarantee for this paginated collector. The freeze requirement is the conservative design conclusion reinforced by the local concurrent-write test.
