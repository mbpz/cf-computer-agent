# VM-033: local chunked public boot images

Scope: approved VM-033 distribution work; sequential local implementation only. No production entry, upload, deployment, signed release claim, guest data cache or network relay change.

- [x] RED: cold/warm reads, interrupted chunk resume, corrupt bytes/manifest/cache, whole-image digest, bounded streaming, cancellation/deadline, cache failures, generation upgrade.
- [x] Implement content-addressed manifest/chunk builder (8 MiB default local cap) and pinned reader. The existing whole-artifact pins remain authoritative; a chunk manifest alone is not trusted.
- [x] Opt-in local server routes and terminal Worker boot integration; no production CSP changes. Cache only public templates, bounded to the explicit approved artifact set; failure falls back without claiming persistent caching.
- [x] GREEN: focused tests, existing VM regression, actual pinned Alpine cold/warm boot, typecheck and checklist audit. Native browser CacheStorage/production hosting acceptance remains separate.
- [x] Record evidence and include only this slice in the local commit. Parent VM-033 / D04 / G0 remain open until their full acceptance is proven.

Verified: 632/632 fast VM, 14/14 real Linux/server, 29/29 focused; typecheck/build/checklist passed. Native loopback warm receipt 0 requests/18 hits/6 full pins, real guest commands passed; full HTTPS/platform acceptance stays open. Evidence: `design/browser-vm/2026-10-01-chunked-images.json`.
