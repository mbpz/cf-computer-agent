# D1 logical backup tooling — approved local implementation

Scope of the 2026-09-18 continuation: implement the proposed backup tool and local recovery checks; design maintenance. No production connection, real-content export, maintenance deployment, production migration/restore, commit or push in this round. Continue in `codex/admin-audit-recovery`; preserve preceding changes.

The approved candidate is described in `docs/operations/evidence/2026-09-17-d1-logical-backup-spike.md`. This plan refines its implementation tasks, not the production authorization.

## Implementation checklist

- [x] B1: test-first bounded logical codec/collector. SQLite-side typed encodings preserve int64, text bytes, BLOB, REAL and rowid. Discover ordinary tables and supported standalone FTS5; reject unsupported schemas. Verify migration ledger prefix and record local migration hashes, without claiming historical remote hashes are known.
- [x] B2: versioned archive with schema/data hashes, counts, source identity, tool/encoding metadata and operator quiescence reference. External manifest digest required on verification. Exclusive private files, no overwrite or symlinks, no archive under repository. Manifest is published last; only successful exit plus verification establishes completion, including when final directory flush fails. Errors never print data/SQL/token.
- [x] B3: bounded fixed-origin D1 read transport, explicit scope and maintenance acknowledgement, no mutation/redirect/retry. Offline tests for envelope/size/timeout/errors; no credentials loaded except the explicit read-token environment variable during a future authorized capture. Remote service compatibility remains unverified until separately approved synthetic remote checks.
- [x] B4: verified archive restored only to new in-memory Workerd/D1; no destination flag or remote restore. Schema/indexes then deferred data then triggers; compare logical results, FK/FTS integrity and exact migration ledger. Cover 32/51 migration fixtures and failure modes.
- [x] B5: document writer inventory, pre-auth maintenance design, in-flight drain, rollback/resume and external writer controls. No maintenance code deployed/enabled in this stage. See [design](../../operations/d1-backup-maintenance-design.md); the remote writer inventory is still an open gate.
- [x] B6: run focused tests, delivery contracts and diff checks; record evidence and update roadmap/ledger without promoting production acceptance. Backup 21/21, full `npm test`, typecheck, delivery 28/28 and `git diff --check` passed; see linked evidence for scope and remaining gates.

## Constraints

- Tool limits are conservative implementation bounds, not claimed Cloudflare quotas. Oversized input fails closed; no silent truncation and no partial success.
- A second scan is drift detection only, not snapshot proof. Operator acknowledgement records accountability, not proof of write quiescence.
- D1 only, not R2/DO/Vectorize/config/secrets. No automatic remote recovery or migration apply.
- Manifest hashes detect corruption against an independently retained digest, not authenticity when an attacker can replace both archive and digest. Source schema remains trusted database input; recovery executes it only in an isolated local engine.
- Completion of this plan means local tooling/test/design delivery. Production readiness additionally requires live read-transport checks, approved maintenance and a protected real-content backup/restore drill.

Operation and security boundaries: [tool README](../../../tools/d1-backup/README.md). Final evidence: [local delivery](../../operations/evidence/2026-09-18-d1-backup-tooling.md). No production acceptance is inferred from these checks.
