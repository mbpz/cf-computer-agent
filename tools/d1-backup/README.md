# D1 logical backup v1

Status: locally implemented and tested on synthetic databases. **Not yet approved for production capture.** This is an operations CLI, not an application route. It does not deploy, apply migrations, remove source FTS tables, or restore remotely.

## Commands and authorization

Run from this worktree with the repository's installed dependencies:

```bash
rtk proxy npm run test:ops:d1-backup
rtk proxy npm run ops:d1-backup -- migration-manifest
```

The second command only reads local migration files and emits their names, SHA-256 values and an aggregate digest. The applied source ledger must match a contiguous prefix. Local file hashes are **not evidence of the bytes historically applied remotely**.

Future capture requires separate approval of the exact account/database, protected destination, real-content export, maintenance window, retention and isolated restore drill. It also requires the remaining gates below. This template documents the interface; it is not an instruction to run it now:

```bash
rtk proxy npm run ops:d1-backup -- capture \
  --account ACCOUNT_ID --database DATABASE_UUID \
  --output /APPROVED/PRIVATE/PARENT/NEW_ARCHIVE_DIRECTORY \
  --migration-manifest-sha256 APPROVED_LOCAL_MANIFEST_SHA256 \
  --maintenance-reference APPROVED_MAINTENANCE_RECORD_ID \
  --acknowledge-remote-read --acknowledge-quiescence
```

- Supply a least-privilege, scoped read token through `CLOUDFLARE_D1_BACKUP_READ_TOKEN` using an approved interactive secret mechanism. Never put it in a command, transcript or tracked file. The tool does not load `.env`, `SECRETS_FILE`, Wrangler login state or application secrets.
- Parent directory must already exist outside every Git repository. The archive directory must **not** exist. The tool creates it with mode `0700`, and files with mode `0600`; no overwrite. This supersedes the older plan's manual creation of the archive directory itself.
- Account is 32 lowercase hex characters; database is a lowercase UUID. The maintenance reference is a non-sensitive identifier, at most 128 ASCII letters/digits/`_.:-` characters; not a secret or prose log.
- Acknowledgements are operator assertions, not an implemented write fence. Without independently demonstrated quiescence, do not capture, even if the command would accept its flags.
- The fixed HTTPS transport performs collector-generated read queries only, rejects redirects, does not retry and rejects write-reporting metadata. It does not create a transactional snapshot.
- Success emits only manifest/logical hashes and counts. Retain the emitted **manifest SHA-256 independently** in the approved evidence store. Do not copy the archive into Git, chat, tickets, attachments or general logs.

Verification and recovery checks are local and require the independently retained digest and identity:

```bash
rtk proxy npm run ops:d1-backup -- verify \
  --archive /APPROVED/PRIVATE/PARENT/ARCHIVE_DIRECTORY \
  --manifest-sha256 RETAINED_MANIFEST_SHA256 \
  --account ACCOUNT_ID --database DATABASE_UUID
rtk proxy npm run ops:d1-backup -- restore-check \
  --archive /APPROVED/PRIVATE/PARENT/ARCHIVE_DIRECTORY \
  --manifest-sha256 RETAINED_MANIFEST_SHA256 \
  --account ACCOUNT_ID --database DATABASE_UUID
```

`restore-check` creates a fresh disposable local Miniflare/Workerd D1 and disposes it afterward. It has no destination, persistence or remote option and no application bindings. It uses the repository's installed, lockfile-pinned Miniflare. All source DDL is treated as trusted database input and executed only in this isolated local engine. The command verifies data/schema equality, FKs, FTS integrity, sequences and ledger; application-specific behavioral assertions are currently in the synthetic test suite, not automatically run against real archives.

## Format, fidelity and limits

An archive has exactly three files:

| File | Contents |
| --- | --- |
| `schema.json` | Source table/index/view/trigger DDL, column metadata and AUTOINCREMENT sequences |
| `data.ndjson` | Ordered table/rowid records with SQLite-side typed cell encodings |
| `manifest.json` | Version/encoding/tool/runtime, UTC time, source identity, operator quiescence reference, local migration hashes, table counts, file lengths/hashes and logical hash |

Encoding uses null, decimal int64, SQLite `%!.26g` finite REAL, and hex TEXT/BLOB tags. It preserves rowid, large integers without JavaScript numeric conversion, embedded NUL and byte contents. Standalone FTS5 corpus rows are read separately from shadow tables; restore rebuilds the index from the original corpus rather than re-generating it from unrelated tables. `chunks_fts` and `chunks_fts_shared` remain separate.

V1 intentionally supports the current project schemas, not arbitrary SQLite databases. Unsupported identifiers, WITHOUT ROWID, generated columns, shadowed rowid aliases, external/contentless FTS, non-finite REAL or unfamiliar virtual tables fail closed. Exact D1 internal tables and SQLite internals are excluded; `sqlite_sequence` is handled explicitly. No byte-for-byte copy of physical D1 storage, internal metadata or FTS shadow storage is claimed.

| Bound | Default / maximum |
| --- | --- |
| Total logical rows, including ledger and separate FTS corpus rows | 10,000 |
| Logical archive payload | 16 MiB |
| Encoded row / schema payload | 64 KiB / 1 MiB |
| Objects / columns per table | 1,000 / 128 |
| Page size / SQL statement | 20 rows / 90,000 bytes |
| HTTP response / requests | 2 MiB / 5,000 |
| Request / total transport deadline | 30 seconds / 20 minutes |

These are conservative tool bounds, **not Cloudflare quotas or measured production capacity**. Encoded data can be substantially larger than source storage. API/library options can lower bounds; the CLI cannot raise them. Exceeding a bound fails, never truncates. Real source size and restore resource requirements remain unmeasured. A two-pass scan detects common drift, not transient ABA changes or all concurrent writes.

Restore refuses a nonempty target, creates tables/indexes/views, inserts rows and restores sequences in one deferred-FK D1 batch, checks FKs and FTS, then installs triggers and compares a complete logical scan. Failed data batches roll back; DDL may remain in the disposable target, which must not be reused. It never repairs a partially populated destination.

## Failures and custody

Errors are fixed codes without source rows, SQL, provider bodies or tokens. `SOURCE_QUERY_FAILED` may represent a rejected API query, envelope, timeout or read budget; intentionally do not obtain private diagnostics by enabling verbose logging. Investigate compatibility on approved synthetic data first.

An archive writes exclusive files and flushes them, then renames the manifest last and flushes the directory. A manifest alone is not proof of success: require successful command exit, independently recorded digest, `verify`, and the approved recovery drill. Failure can leave a private incomplete directory; do not reuse or publish it. Its disposition requires the operator's approved retention/deletion decision; no automatic deletion occurs.

Reads reject unexpected/missing files, root/file symlinks, file hardlinks, wrong owner, exposed permissions, oversized files, mismatched identity, digests, counts, malformed rows or unsupported versions. Hashes provide integrity relative to the independently trusted digest, not authentication against an attacker replacing both archive and digest. Same-user malicious filesystem races and a compromised runtime are outside this tool's security boundary.

File modes are not encryption or a retention policy. Session/private data is included. Approve encrypted storage, access, retention, independent recovery custody and cleanup before real capture. `/private/tmp` is only a temporary staging option, never a durable backup. This tool covers **D1 only**, not R2, Durable Objects, Vectorize, configuration, secrets or external effects.

## Open production gates

1. Approve a synthetic remote D1 check separately: verify the scoped read token, `table_list`/`table_xinfo`, typed encoding and actual query-envelope metadata. Creating or modifying a synthetic remote fixture needs separate authorization. The current transport tests use an offline HTTP-shaped fixture backed by local Workerd, not the live API.
2. Approve and implement the [maintenance design](../../docs/operations/d1-backup-maintenance-design.md), inventory every writer, deploy only with authorization, and prove drain/fail-closed behavior. An environment flag or UI banner alone is insufficient.
3. Refresh candidate Git/Worker/binding/migration provenance and source bounds; approve exact archive custody, real-content export and window. The September 17 source snapshot is historical, not a current check.
4. Capture, verify and rehearse isolated recovery under that authorization. Record only non-content evidence. Migration and remote recovery remain separately authorized actions.

Official API reference reviewed for transport shape (not live compatibility evidence): `https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/`.
