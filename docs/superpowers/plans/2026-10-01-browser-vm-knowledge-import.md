# VM-030 selected-file review submission

Approved anchor: 2026-09-09-browser-linux-vm-design.md section 7 / VM-030; G4a plan.

This slice: selected UTF-8 text/Markdown/code (<=128 KiB) from the runtime-owned shared root; show immutable literal content, explicit title/space/visibility and sensitive-content acknowledgement; POST only on confirmation via existing `/api/submissions`. Freeze key and payload before sending; uncertain response permits explicit same-intent retry, never automatic replay. Runtime/account change aborts and discards content/late results. Hidden directories, credential filenames and obvious private-key material fail closed. This is not a comprehensive secret scanner: confirmation remains required.

- [x] RED behavior tests: no network before consent; exact selected target; bounds/hidden/key rejection; unknown outcome retry; owner changes; literal preview and actual UI confirmation.
- [x] Implement target-aware existing submission adapter, volatile import controller and reusable file-panel integration.
- [x] GREEN focused regressions, full VM suite, typecheck and UI build.
- [x] Record evidence and local commit, without push/deploy/migration.

Remaining VM-030 scope: asset-backed formats through existing enabled/upload/parse/review workflow and real authenticated browser acceptance. Formal app mounting remains G0-gated. Native stream-save acceptance remains blocked until device unlock. This slice does not close D04 or VM-030. No file content is persisted in browser storage; after owner/session disposal uncertain submission must be checked in My submissions, not silently resubmitted.

Evidence: `design/browser-vm/2026-10-01-knowledge-import.json`. Focused 32/32; legacy adapters 18/18; full VM 515/515; real Alpine 1/1; strict component/project types and UI build passed. No authenticated submission or production acceptance claim.

## Follow-on: selected asset import (2026-10-01, local only)

Approved anchor remains VM-030 / design section 7. The existing asset workflow is reused, not a second publication API. The storage feature gate is read before VM bytes and again before actions; no provisioning or paid storage is enabled by this implementation.

- [x] RED → GREEN: existing asset review intent preserves selected space/collection/visibility across explicit retry and reload; old intents retain their original default target; corrupt targets fail closed.
- [x] Dedicated `readSubmissionAsset` RPC rejects hidden paths and all symlinks while paused, enforces min(server limit, 20 MiB) before copying, and returns detached binary bytes. Real Alpine guest-created binary receipt and bounds verified.
- [x] Reusable file panel: explicit original-file upload consent, manual parse/readback, literal parsed preview, separate title/space/visibility review confirmation; no HTML/PDF execution or automatic mutations. Member binding required.
- [x] Pending member-scoped metadata reuses existing recovery storage; file bytes remain volatile. Unknown outcomes keep original keys; explicit stop aborts local work but does not claim server rollback. Owner/environment invalidation clears content and ignores late receipts.
- [x] Focused controller/React/adapter regressions, existing adapter compatibility, full VM suite, strict component/project typechecks and UI build.
- [ ] Real authenticated browser journey through configured asset storage and parsers, with space permission checks and review receipt; formal mount stays G0-gated. Fixture HTTP tests and separate real Alpine RPC are not this acceptance.

Evidence: `design/browser-vm/2026-10-01-asset-import.json`. This local implementation does not close D04/VM-030, change production, enable R2, retry GitHub, or install APKs. Asset content is never stored in localStorage; existing recovery metadata (filename/hash/title/target/idempotency keys) is stored member-scoped. These metadata are not encrypted, consistent with the user's requested scope. Explicit upload and parsed-content acknowledgements remain necessary; filename filtering is not a comprehensive secret scanner.
