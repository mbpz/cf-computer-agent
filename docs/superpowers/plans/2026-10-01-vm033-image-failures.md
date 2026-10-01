# VM-033 actual transport failure and browser cache acceptance

Continue sequentially after `923e9d4`, without deployment or changing the user's
preview. Previous turn made code/test/commit progress. Native browser inspection
on this turn reports the Mac locked; do not bypass this through another browser
or control path. Continue authorized local work, leave native results pending.

- [x] RED/GREEN isolated loopback acceptance host: verified exported disk files,
  fixed same-origin fault controls, real truncated TCP response, bounded receipt;
  no arbitrary paths, forwarding, production routes, CORS or global policy changes.
- [x] Explicit-action browser/Worker acceptance: interruption must fail without
  boot/retry; next click resumes verified chunks; corrupted native cache must fail
  and evict; separate retry recovers; generation fixture preserves unrelated cache.
- [x] Real Alpine over the actual faulty local HTTP transport, no guest network;
  fast regression, typecheck/build, checklist tests; receipts and local commit.
- [ ] After unlock, operate the in-app browser and capture native CacheStorage
  evidence. Local automated cache adapters do not close this item.

Overall scope remains 29 parents / 5 complete / 24 remaining. VM-033/D04/G0 stay
open pending native and actual HTTPS/release acceptance. No push/deploy/secrets.

Verified: fast VM 650/650, real Alpine 1/1 (four boots), typecheck, UI build/isolation, checklist 9/9. Receipt: `design/browser-vm/2026-10-01-image-failure-acceptance.json`. Local commit contains this slice; native acceptance is still pending.
