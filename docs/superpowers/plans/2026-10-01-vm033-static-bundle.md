# VM-033 static public-image bundle: local implementation

Continue the approved VM-033 distribution work after `db6d735`, sequentially. No production publish, credentials, guest data, backup, encryption or GitHub access. Previous turn made verified progress; parent D04/G0 remains open.

- [x] RED: deterministic export + existing reader round-trip; original pin failure; existing output preservation; source/output symlinks; extra/missing/truncated/tampered files; malicious rewritten index; explicit file/size budgets.
- [x] Export only approved public templates into an exclusive output directory; independent disk verifier trusts caller/code pins, never the generated index. Scoped `_headers`, no global CSP/CORS changes or deploy commands.
- [x] Validate the current official free-tier asset file/count/header limits, record source/date and conservative local bounds. Bundle limits do not prove full-site/account headroom or release approval.
- [x] Run actual pinned Alpine export + boot through an independent static file server (not the in-memory builder), fast regression, typecheck/build/checklist.
- [x] Save receipts, update authoritative child checklists and make a local commit. Keep VM-033/D04/G0 open pending hosted HTTPS/browser/failure/release acceptance.

Verified: 10/10 new unit tests, 642/642 complete fast VM regression, 1/1 real Alpine test (two independent-disk-host boots), CLI export/verify, typecheck and UI build/isolation, 9/9 checklist tests. Receipt: `design/browser-vm/2026-10-01-static-image-bundle.json`. Overall 29/5/24 unchanged. Only this local slice is staged for commit; no release/production claim.
