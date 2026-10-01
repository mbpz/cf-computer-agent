# Local public-image bundle (VM-033)

This is an **offline development export**, not a release or deployment. Only the
six `ALPINE_ISO_ARTIFACTS` code pins are selected by the CLI. Guest disks, files,
checkpoints, credentials, source directories and arbitrary directory contents
are never copied. The development pins do not grant redistribution permission
or replace a license inventory, reproducible build or signed release manifest.

## Commands (repository root)

```sh
# OUTPUT must not exist; its parent must exist. No download or deployment.
npm run build:browser-vm:images -- OUTPUT BOOT_DIR ISO_DIR [RESERVED_SITE_FILES]
npm run verify:browser-vm:images -- OUTPUT
```

The engine source is explicitly `node_modules/v86/build`; boot/ISO directories
are supplied by the operator. Existing output is never overwritten. Do not
serve a directory until export exits successfully. A failed export removes only
its newly created output, not any existing destination. These commands assume
exclusive local ownership of input/output directories during execution; they
are not a hostile concurrent-filesystem sandbox.

The output contains `/image-chunks/<original-sha256>/manifest.json`, bounded
`.bin` chunks, `_headers` and `image-bundle.json`. No full 51 MiB ISO is emitted.
The index is deterministic accounting, **not a trust anchor**. The independent
verifier checks inventory, regular files, size and digests, then reconstructs
all images through `createChunkedImageReader` against trusted source-code pins.
Even rewriting both the index and chunk manifest cannot authorize changed
original image bytes. Inputs and the local bundle have bounded total sizes.

## Platform policy and remaining acceptance

Official Pages documentation read successfully on **2026-10-01**:

- Source: `https://developers.cloudflare.com/pages/platform/limits/`
  Free sites: 20,000 files; single asset: 25 MiB. Local policy limits chunks to
  8 MiB and counts metadata (including `_headers`) conservatively. A stricter
  budget is allowed, never a larger one. `RESERVED_SITE_FILES` reserves count
  headroom for the rest of a future site; default zero verifies the bundle
  only. It does not inspect an account or certify an eventual merged site.
- Sources: the limits page above and
  `https://developers.cloudflare.com/pages/configuration/headers/`
  `_headers` has at most 100 rules and 2,000 characters per line. This export
  uses one rule, scoped only to `/image-chunks/*`, with octet-stream,
  `no-transform`, revalidation, and nosniff. It changes no global CORS/CSP or
  isolation headers. Pages parses `_headers` rather than serving it as an asset;
  these rules do not apply to Pages Functions responses.

`no-transform` is an intended deployment rule, **not proof of CDN behavior**.
The reader requires Content-Length to equal decoded bytes. A future authorized
HTTPS deployment must confirm status, redirects, MIME, encoding/Content-Length,
cache behavior and full digests in actual target browsers. Revalidate the
current target platform/plan and combined site inventory before that deploy.
Export verification cannot check these remotely and does not try to do so.

## Verification boundaries

`scripts/browser-vm-image-bundle.test.mjs`: deterministic round-trip, bad pins,
existing output, symlinks/traversal, budgets, extra/missing/truncated/tampered
files, rewritten index + manifest, and unchanged trusted original digest.

`tools/browser-vm/image-bundle.test.mjs`: real pinned Alpine export, independently
hosted disk files over loopback HTTP, cold and warm boot, kernel/command proof.
The test's Cache API adapter is not native browser persistence evidence. Guest
networking stays off. Full HTTPS/native-browser interrupt/upgrade/failure and
release acceptance remain open; VM-033, D04 and G0 are not closed by these tests.

## Local failure acceptance (no deployment)

Start the isolated host against an already exported bundle:

```sh
npm run dev:browser-vm:image-acceptance -- /absolute/path/to/exported-bundle
```

Use the printed loopback URL in the in-app browser after unlocking the desktop.
This is a separate local origin, not the existing hosted preview. Click the six
buttons in order: interruption → explicit resume → corrupt cache → explicit
retry → controlled cache-generation transition → warm boot. Every action uses
a fresh Worker. Interruption and corruption must report **expected rejection**,
not a successful VM boot. Recovery requires the next explicit click.

The interruption is an actual truncated HTTP response from the local server,
not a mocked fetch exception. The first action clears only the public-image
cache prefix at this dedicated origin; corruption deliberately changes one
public-template cache entry. The generation fixture changes the approved asset
set, not the OS version, and verifies preservation of an unrelated sentinel
cache. No private guest files or production caches are involved. Cancel or
leaving the page terminates the Worker; stale results cannot turn a timeout
into success. Stop the host with Ctrl-C after acceptance.

Automated evidence: `scripts/browser-vm-image-acceptance*.test.mjs` exercises
HTTP controls, explicit-action logic and browser lifecycle fixtures;
`tools/browser-vm/image-acceptance.test.mjs` uses actual HTTP and four real
offline Alpine boots, with an explicitly non-native Cache API adapter.
Neither substitutes for native CacheStorage/Worker/browser acceptance.
The 2026-10-01 native attempt was blocked by the locked Mac; that part and
actual HTTPS response/platform acceptance remain pending.
