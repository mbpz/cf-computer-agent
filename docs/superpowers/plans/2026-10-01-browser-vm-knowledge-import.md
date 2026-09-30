# VM-030 selected-file review submission

Approved anchor: 2026-09-09-browser-linux-vm-design.md section 7 / VM-030; G4a plan.

This slice: selected UTF-8 text/Markdown/code (<=128 KiB) from the runtime-owned shared root; show immutable literal content, explicit title/space/visibility and sensitive-content acknowledgement; POST only on confirmation via existing `/api/submissions`. Freeze key and payload before sending; uncertain response permits explicit same-intent retry, never automatic replay. Runtime/account change aborts and discards content/late results. Hidden directories, credential filenames and obvious private-key material fail closed. This is not a comprehensive secret scanner: confirmation remains required.

- [x] RED behavior tests: no network before consent; exact selected target; bounds/hidden/key rejection; unknown outcome retry; owner changes; literal preview and actual UI confirmation.
- [x] Implement target-aware existing submission adapter, volatile import controller and reusable file-panel integration.
- [x] GREEN focused regressions, full VM suite, typecheck and UI build.
- [x] Record evidence and local commit, without push/deploy/migration.

Remaining VM-030 scope: asset-backed formats through existing enabled/upload/parse/review workflow and real authenticated browser acceptance. Formal app mounting remains G0-gated. Native stream-save acceptance remains blocked until device unlock. This slice does not close D04 or VM-030. No file content is persisted in browser storage; after owner/session disposal uncertain submission must be checked in My submissions, not silently resubmitted.

Evidence: `design/browser-vm/2026-10-01-knowledge-import.json`. Focused 32/32; legacy adapters 18/18; full VM 515/515; real Alpine 1/1; strict component/project types and UI build passed. No authenticated submission or production acceptance claim.
