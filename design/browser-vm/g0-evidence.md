# Browser Linux G0 — local evidence, incomplete gate

G0 is **not complete**. No environment management API, personal/temporary product UI, encrypted persistent storage or production relay has been delivered. The observations below are local development evidence only.

## Inputs and provenance

Engine: npm `v86@0.5.458`, installed package internal version `0.5.458+gd96be77`; package-declared BSD-2-Clause license. npm integrity: `sha512-ixQE0RyfjMgrBvx5O+kq1AXPZwhUJVqD5Vhl2LBm8L4jgV2fVczYalbG4thu0vWSl42Q71DOwjIl5Y8mZHNpyA==`.

| Development input | Bytes | SHA-256 |
| --- | ---: | --- |
| `libv86.mjs` | 359445 | `329a9185f889230dfc54c75213e1e6a855b0459d134fe5cbd18cbd402f7cdd30` |
| `v86.wasm` | 2101621 | `6121632f6d657d03f2286341ed87edcafd4945fa65ae765b4c7fd0bf2554a9c7` |
| `seabios.bin` | 131072 | `73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98` |
| `vgabios.bin` | 36352 | `a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880` |
| `buildroot-bzimage68.bin` | 10068480 | `507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c` |
| `alpine-minirootfs-3.24.1-x86.tar.gz` | 3538048 | `634355e2245c9d56186d1b86fb6e034453eb303aea15b573ca250b343376fffd` |

Development download sources (not runtime dependencies of the public site):

```text
https://copy.sh/v86/bios/seabios.bin
https://copy.sh/v86/bios/vgabios.bin
https://i.copy.sh/buildroot-bzimage68.bin
https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-minirootfs-3.24.1-x86.tar.gz
```

Alpine's official x86 release metadata was read before downloading and its expected digest matched the downloaded bytes. The probe rejects a changed size/digest before constructing the engine. The verified archive decompresses to 7,475,200 bytes and is extracted only inside the guest. Buildroot's boot root is embedded; no fictitious external disk is declared.

**Release gaps:** full BIOS/kernel/rootfs license and source inventories, build provenance/reproduction, maintained production kernel/image selection, final asset manifest and distribution approvals are not complete. The development binaries remain outside public/static and outside Git. The generic manifest verifier's license field validation is not a legal/source inventory review.

## Actual Node and browser runs

Node: real v86 execution, not mocked shell output. Base Linux, bidirectional file exchange, explicit nonzero command exit, destroy/new-instance restoration and Alpine `apk` execution/restoration have passed. Negative tests independently exercise unavailable boot prompts, stalled cleanup, malformed resources and Worker cancellation.

Browser: Codex in-app Chromium `151.0.0.0`, reported Mac Intel OS X 10_15_7 user agent; this is the browser's reported platform string, not a hardware/OS certification.

| Observation | Dedicated Worker base run | Dedicated Worker Alpine run |
| --- | ---: | ---: |
| Linux startup to real prompt | 1374 ms | 1364 ms |
| Configured guest memory | 256 MiB | 256 MiB |
| Full state buffer | 54,547,608 bytes | 63,993,220 bytes |
| Page heartbeat ticks during run | 19 | 29 |
| Largest observed 100 ms heartbeat gap | 103 ms | 102 ms |
| Host file read inside guest | `vm-host-to-guest` | `vm-host-to-guest` |
| Guest file read by host and after restoration | `vm-guest-to-host` | `vm-guest-to-host` |
| RAM-root private file after new-instance restoration | `vm-private-memory-file` | `vm-private-memory-file` |
| Post-restore shell output | `vm-restored-shell` | `vm-restored-shell` |
| Deliberate failed command exit | 23 | 23 |
| Network verified | **false** | **false** |

Kernel output: `Linux version 6.8.12`, i686, Buildroot `2021.11-11272-ge2962af`, GCC 13.2.0, binutils 2.42, kernel build dated August 31, 2024. It remains a demonstration kernel.

Base guest provides sh, BusyBox, curl and wget; Git, apk, apt-get, Python, Node and openssl executables were not found. `/etc/ssl/certs/ca-certificates.crt` was absent. These are measured absences, not assumed compatibility.

Alpine chroot: release `3.24.1`; `apk-tools 3.0.6-r0, compiled for x86.`; `/etc/ssl/cert.pem` nonempty. Both release and package-manager output match after destroying the first emulator and restoring into a second. No package-install, HTTPS request or Git clone is implied by these results. The observed Alpine-run guest UTC time was `2026-09-09T23:57:07Z`; clock synchronization under sleep/resume has not been tested.

The browser's **取消验证** button was clicked during a real run; it terminated the dedicated Worker and showed cancellation rather than success. Main-thread heartbeat observations are not peak CPU/memory measurements, mobile acceptance, long-session performance or tab-suspension guarantees.

## Controlled networking follow-up — September 10, 2026

A loopback-only development WISP relay and disposable-Worker socket wrapper now exist. Networking remains explicitly opt-in. The local page obtains a short-lived, single-use capability through a same-origin POST; the wrapper sends it in the first WebSocket frame, never in the URL. Until accepted, the relay performs neither DNS nor TCP work. This capability is **not** production account authorization.

The proof restricts destinations to synthetic addresses mapped to `dl-cdn.alpinelinux.org`, `github.com` and `api.github.com`, validates every DNS answer as public IPv4, and connects to the validated numeric address without a second resolution. Tests cover unknown/expired/replayed credentials, origin and URL rejection, private-address/port/UDP denial, pending-DNS cancellation, stream/session bounds and flow-control overflow. The socket wrapper suppresses native automatic reconnection and reports unexpected disconnection. These are bounded local tests, not a completed production security assessment or durable per-member quota system.

| Actual run | Result | Boundary |
| --- | --- | --- |
| Node Linux through authenticated local relay | `apk add --no-cache git curl` and `git --version` completed | Real guest package installation; does not prove browser performance |
| Node guest HTTPS Git | Exit 128: `TLS connect error: error:0A000126:SSL routines::unexpected eof while reading` for the public `octocat/Hello-World` repository | Certificate validation remained enabled; Git acceptance failed |
| Node guest API and network checkpoint restoration | Not reached after Git failure | No guest API or network-restoration success claimed |
| Browser Worker with Alpine and networking enabled | Package progress reached 79%, then the 90-second guest serial deadline expired; page displayed failure and re-enabled Run | Browser package installation, Git and API acceptance remain incomplete |
| Independent host TLS diagnostic for `github.com` | Timed out after 20 seconds against the policy-resolved public address | Evidence of a host-path problem, not proof that all VM network failures share that cause |
| Independent host TLS diagnostic for `api.github.com` | Authorized TLS 1.3 handshake | Host TLS only, not a guest HTTP/API test |

Fresh verification on September 10, 2026: `test:browser-vm` **62 passed, zero skipped**; opt-in `test:browser-vm:linux` **2 passed, zero skipped**; `typecheck` passed; `build:ui` passed with its existing large-chunk warning. The opt-in real-network test **failed** at HTTPS Git. Fast tests and offline restoration do not override that failure. No full-project `check`, physical-device acceptance or production acceptance is claimed by this verification batch.

### Later repetitions and transport diagnostics — September 10, 2026

These observations supersede neither the earlier failures nor each other:

- One actual Node run completed in **18,021 ms** (one test passed, zero skipped): 13 packages installed, Git 2.54.0, HTTPS clone commit `7fd1a60b01f91b314f59955a4e4d4e80d8edf11d`, guest API HTTP **200**, `full_name=octocat/Hello-World`, snapshot **105,633,164 bytes**, and new-engine file/shell restoration. TLS verification and destination policy were unchanged. The restored engine had no network device; renewable authorization was not exercised.
- Subsequent browser runs timed out at **26%** and **57%** package progress. The instrumented 57% run booted in **1,353 ms**, failed its package phase at **90,002 ms**, recorded **926** page heartbeats, maximum 100 ms heartbeat gap **103 ms**, and only `visible` document state. This is not evidence of background throttling, peak memory or CPU usage.
- A subsequent instrumented Node run also timed out at **33%**, so the failure is not established as browser-specific. That run overlapped a browser run and is not a controlled performance comparison.
- A later Node-only transport-diagnostic run timed out at **20%**. At package phase 15/30/45/60/75/90 seconds, relay TCP received **1,140,565 / 1,892,365 / 2,373,965 / 3,112,185 / 3,711,569 / 4,205,755 bytes**. Every sample showed zero queued frames, zero pending socket writes, positive flow credits, and an established guest TCP connection with `pending=false` and zero buffered bytes. These samples show continued slow ingress and no observed queue stall; they do not prove which upstream component caused the slowdown or rule out stalls between samples.
- Independent host HTTPS main-index download: HTTP **200**, **526,057 bytes**, **1.139181 s**. A further direct request pinned to the policy-resolved public address `199.232.162.132`, with hostname/certificate verification retained, returned the same size and HTTP **200** in **2.882618 s**. This small-file observation is not equivalent to the entire guest package workload and cannot by itself assign blame to the relay or emulator.

The diagnostics are bounded, read-only and local: no HTTP inspection route, capabilities, payloads or socket objects are exposed. Closed relay sessions discard diagnostic state. Worker progress cannot extend the absolute deadline. The engine's instruction counter is a wrapping **32-bit** diagnostic delta, not a total instruction count or CPU metric.

Fresh checks for this diagnostic batch: **66 fast tests passed, zero skipped**, and `typecheck` passed. The latest actual network test failed as described above. Earlier offline/build results remain earlier-batch evidence, not freshly rerun claims. G0 and product completion remain unchecked.

### Checkpoint guard and complete Alpine ISO experiment — September 10, 2026

`probe-checkpoint.mjs` is now called by the actual Node/browser development
probe before restoring a fresh engine. It verifies schema, byte length (maximum
512 MiB), SHA-256 and declared engine/image/memory/filesystem compatibility.
Private copies are taken before asynchronous hashing; changes to the input
cannot substitute the bytes handed to the engine. Eight new tests cover actual
digest bytes, corrupt/truncated/malformed/oversized records, compatibility
mismatches, engine error propagation and mutation during hashing. The browser
resource-server test also checks that this module can actually be loaded.

The declared identity is **not yet bound to a verified release manifest**. This
unencrypted envelope is not an authenticity mechanism: a party able to rewrite
the state and its digest can forge it. It is not the product checkpoint store.
Copying adds transient memory overhead; no process-memory bound is claimed.

Fresh results for this batch:

- Fast suite: **74 passed, zero skipped**; actual Node Linux suite: **2 passed,
  zero skipped**, 5,735 ms total; `typecheck` passed.
- Actual browser Worker, Alpine option on/network off: boot **1,376 ms**;
  checkpoint **64,050,564 bytes**, digest and declared compatibility checks
  passed; private file, 9p file, shell and Alpine/apk restored after engine
  replacement. SHA-256 `d924ece41519edb53e11cb937e9acae0881da48c477d9899fc1fe726883ac732`.
  Page heartbeats **31**, maximum 100 ms gap **102 ms**, document `visible`;
  reported browser Chrome **151.0.0.0**. This run still used Buildroot 6.8.12,
  not the new ISO. No network, physical-device or production acceptance claimed.
- The first new server invocation mistakenly supplied an environment variable;
  this CLI requires a positional asset directory. It exited before listening;
  the corrected invocation served the browser run. No product server changed.

Separately, an official ISO was downloaded only to
`/private/tmp/workbench-vm-image.vxg71E/alpine-virt-3.24.1-x86.iso` from
`https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-virt-3.24.1-x86.iso`.
The initial bounded download timed out at **17,301,360 bytes**; resumption
completed. Full file size **51,380,224 bytes** and SHA-256
`9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209`
match the fetched official `.sha256` file. Only then were the kernel, initramfs
and kernel configuration extracted to that same temporary directory.

Two disposable experiments (not the maintained test suite) used the pinned
v86/BIOS, 256 MiB memory, this ISO and its kernel/initramfs:

1. Actual serial login and commands returned **Linux 6.18.35-0-virt**, Alpine
   **3.24.1**, `apk-tools 3.0.6-r0, compiled for x86`; **17,445 ms** overall.
   The first attempt timed out because its shell-prompt matcher expected a
   different prompt, even though Linux had logged in. Matching the observed
   `localhost:~# ` fixed the experiment; no kernel fix is claimed.
2. Loaded `9pnet_virtio`/`9p`, mounted `host9p` at **`/mnt/work`**, verified
   host→guest and guest→host actual contents, wrote `/root/private.txt`, saved
   **137,254,136 bytes**, destroyed the engine and restored in a new one.
   Private/shared file contents, kernel, release and apk commands matched;
   **18,309 ms** overall. The same **read-only ISO was reattached**. This is
   RAM-root/9p restoration, not an independent writable disk delta, browser
   ISO acceptance, package-download test or production image release.

Experiment scripts remain in the explicit temporary directory. License/source
review, reproducible packaging, durable test integration, browser performance
and networking for this image remain open. The prior network failures remain
unresolved; this batch did not repeat or supersede them. No fresh UI build or
full-project check is claimed in this batch.

### Maintained complete Alpine profile — September 10, 2026

The complete ISO experiment is now integrated into the maintained Node and
browser Worker probes. The explicit `alpine-iso` selection verifies the exact
length and SHA-256 of six pinned boot resources before constructing an engine:
WASM, BIOS, VGA BIOS, kernel, initramfs and ISO. Browser reads are bounded to
the pinned length and cancel invalid responses. WASM is compiled from those
verified bytes; boot buffers are privately copied for each engine. No fallback
to a different image occurs on verification failure.

Checkpoint image identity is derived from those six verified artifact records:
`alpine-virt-3.24.1-x86@bbf4ade0b2f6042efb391f2a2c12f47c2846b9ef7d12741f3d9514339c8bb1b6`.
The JavaScript engine module is still a declared pinned dependency, not a
loader-authenticated release. This is neither a signed image manifest nor an
encrypted/authenticated checkpoint format. The disk model remains RAM root,
in-memory 9p and a reattached read-only ISO.

Fresh checks in this batch:

- Fast suite: **84 passed, zero failed/skipped**. Actual Node offline suite:
  **3 passed, zero skipped**, 23,872 ms total; the complete ISO case took
  18,436 ms, boot 17,297 ms and checkpoint 136,873,200 bytes. `typecheck` passed.
- Actual browser Worker, complete ISO selected, network off: two successful
  runs with a real cancel/Worker termination between them. Latest run boot
  **17,390 ms**, checkpoint **136,885,480 bytes**, SHA-256
  `60c30e1d56e060a1bee3fd2011b304b56eda65958e150212e3341a901fee13d7`.
  Real guest returned Linux **6.18.35-0-virt**, Alpine **3.24.1**, apk
  **3.0.6-r0** and a CA bundle. `/mnt/work` bidirectional file contents,
  private file, shell exit status and apk were verified after fresh-engine
  restoration. Page heartbeats **365**, maximum gap **103 ms**, visible
  document, reported Chrome **151.0.0.0**. These are not CPU/process-memory,
  background-tab, physical-device or production acceptance measurements.
- Actual complete-ISO network test **failed** at the unchanged 90-second
  package deadline, with `apk add --no-cache git curl` at **1%**, installing
  brotli-libs. Boot was 17,870 ms. At the deadline the relay had received
  3,067,421 bytes, with zero pending writes/queued frames; guest connection
  was established with no pending/buffered bytes. Git/API and subsequent
  network-run checkpoint checks were not reached.

Bounded host comparisons retained certificate/hostname verification and the
same destination policy. Direct HTTPS to the resolved public address returned
main index 526,057 bytes/1,716 ms, community index 2,310,803 bytes/16,907 ms,
and brotli package 409,406 bytes/6,934 ms (all HTTP 200). A disposable host
TLS-over-local-WISP diagnostic, **without a VM**, returned the main index in
5,409 ms and brotli in 1,294 ms, but the community request disconnected before
TLS was established after 15,010 ms and zero response bytes. Diagnostic process
exit success is not three successful requests. These separate samples show
that at least one failure can occur without the guest; they do not establish
the cause of all guest slow downloads. No timeouts, certificate checks or
destination restrictions were relaxed.

The browser selector and fixed-command probe are development diagnostics,
not the product terminal or environment-management UI. Reviewed distribution
inputs, stable networking, interactive serial input, product authorization,
encrypted persistence and both environment types remain open. No fresh full
UI build or full-project check is claimed for this batch.

## September 10, 2026 — interactive offline serial batch

Added an offline interactive session over the same verified complete ISO,
owned by a dedicated browser Worker. UTF-8 input uses the engine's byte API;
inputs over 4096 encoded bytes are rejected in full. Input acknowledgements
do not imply command completion, and commands are not retried. Output is
pull-based with a 65,536-byte ring, explicit dropped-byte reporting and a
bounded plain-text page history. Duplicate request IDs fail closed. Stop,
boot/request errors and page exit terminate the Worker; late boot completion
cannot resurrect a closed session.

Fresh verification for this batch:

- **100 fast tests passed**, zero failures/skips; typecheck passed.
- **4 real Linux tests passed**, zero failures/skips, in 42,518 ms: complete
  ISO boot/new-engine restore, Buildroot file/restore, Alpine userspace/restore,
  and interactive ISO UTF-8/file/interrupt. The complete ISO probe booted in
  17,786 ms and produced a 136,762,604-byte development checkpoint.
- In the actual local browser page, a manually entered command wrote and read
  `浏览器独立 Linux` in `/mnt/work/browser.txt`, and `uname -r` returned
  `6.18.35-0-virt`. A foreground process printed `LONG-SLEEP-STARTED` before
  entering a 300-second sleep; Ctrl+C returned the prompt before expiry and a
  subsequent command printed `AFTER-LONG-INTERRUPT`.
- Stop disabled input; cancel during startup returned to stopped. A fresh
  subsequent instance reported `FRESH-INSTANCE-FILE-ABSENT` for the earlier
  `/mnt/work/browser.txt`. That instance was then stopped.

The first Node interrupt test incorrectly synchronized on echoed command text
and failed waiting for the prompt. The regression now waits for an actual
newline-delimited process sentinel before interrupting. An initial browser
30-second sleep ended naturally before interruption and is **not** used as
interrupt evidence; the separate 300-second run above is the accepted check.
A late-session boot-rejection test also exposed an unhandled rejection after
close; the endpoint now observes readiness before handling late closure.

This remains an offline diagnostic with a plain serial textarea, not a full
terminal emulator, product file manager or either delivered environment type.
No fresh network success, full-project check, UI build or production acceptance
is claimed. The network failures above and incomplete G0 gate are unchanged.

## September 10, 2026 — real guest network recovery batch

Added `tools/browser-vm/network-recovery.test.mjs` to the real Linux suite.
It runs the verified complete Alpine ISO, actual WISP/first-frame authorization,
and actual checkpoint/restore in three separate emulator instances. Only the
upstream DNS/dial boundary targets an isolated loopback HTTP fixture; no public
relay or Internet connection is used by this test.

The initial regression failed twice after offline restoration and an explicit
new grant: fresh relay TCP streams connected, but no HTTP bytes were written
and guest wget timed out. The pinned engine's NE2K `set_state` only restores
the saved MAC and device RAM when the preservation/translation option is set.
The profile omitted both, leaving a fresh NIC behind a guest retaining old
network state. Enabling `preserve_mac_from_state_image` made the original
regression pass without changing timeouts or relay permissions.

The compatibility regression then failed because the old resource-only image
identity still matched. The profile now binds the applied NIC restoration
option together with its six artifact pins, producing
`alpine-virt-3.24.1-x86@d3a68a9fbc2026d94849a36a7e1af9e04803c2659f7c0902ee2f7f8e297841c7`.
The previous resource-only identity is rejected before engine restoration.
This remains a development compatibility guard, not an authenticated release
manifest or encrypted storage format.

Fresh final verification:

- **100 fast tests passed**, zero failures/skips; typecheck passed.
- **5 real Linux tests passed**, zero failures/skips, in **70,651 ms**. This
  includes the four preceding offline/interactive regressions and the new
  **27,024 ms** network-recovery regression. The complete ISO probe booted in
  18,100 ms and produced a 136,828,144-byte checkpoint.
- Before saving, the guest completed one POST and received actual bytes on
  a second still-open GET. Destroying the instance closed that upstream stream.
- A new offline engine retained the POST result file, could not fetch an HTTP
  target, opened no additional WebSocket, and left zero active relay sessions.
- After another checkpoint and an explicit fresh grant, a third engine could
  issue a new GET. The test waited until the restored old guest request failed
  with exit code 1. Total: **2 authorized sockets**, **3 upstream requests**
  (POST once, old held GET once, fresh GET once), **1 original POST**, and the
  old stream closed. No command was automatically retried by the harness.

Separately, the public complete-ISO package run failed again at its unchanged
90-second deadline while fetching indexes (boot 17,585 ms; relay 2,042,628 bytes
at 90 seconds). Sampled credits were available, pending writes/queued frames
were zero, and the guest had no pending/buffered payload. A host-only IPv4 HTTPS
download of the public main index also exceeded a 30-second deadline. That
comparison establishes a failure outside the VM, not the cause of every guest
timeout and not a successful download. Public TLS/Git/package stability is
still unaccepted; the passing local HTTP recovery test does not replace it.

No browser re-authorization, production member authorization, full-project
check/build, device/resource acceptance, image release or deployment is claimed
for this batch. The full G0 gate remains incomplete.

## Failures found and addressed

1. The initial local CSP blocked v86's blob scheduler Worker. Linux readiness did not arrive, and an unbounded engine destroy could leave the UI waiting. Local-only `worker-src 'self' blob:` plus bounded cleanup and an outer dedicated Worker deadline address the tested paths; production CSP is unchanged.
2. `emulator-ready` is not a Linux boot signal. The probe waits for the real serial prompt and frames command responses with random operation IDs; echoed commands and stale replies cannot complete a different operation.
3. Node fetch did not transmit a requested spoofed Host header in the server test. The test now uses an actual raw HTTP request for that assertion; host/origin restrictions were not relaxed.
4. The Buildroot BusyBox tar lacks `-z` support. After confirming the actual guest error, the verified gzip archive is decompressed in the host Worker and its tar contents extracted in the guest. No executable/archive paths are materialized in the host workspace.
5. Missing guest commands originally produced ambiguous concatenated inventory rows. Each command now has a separate key/value line, including explicit empty values for missing tools.
6. A pending DNS response could outlive a closing WebSocket; the relay now checks the socket's OPEN state before opening TCP. A regression test verifies no late connection.
7. Subclassing the Node WebSocket misclassified peer-initiated closure as intentional because its implementation calls its own `close`. The wrapper now uses composition; unexpected-disconnect and no-auto-reconnect tests pass.
8. Ticket-capacity rejection initially occurred after HTTP response headers were sent. Ticket issuance now precedes response headers; the capacity test verifies a bounded error response without crashing the server.
9. Complete-ISO checkpoint restoration previously left a new NE2K MAC/device RAM behind the restored guest, making newly authorized requests time out. The profile now preserves both and binds the option into checkpoint compatibility. Real guest offline/fresh-grant recovery and old-contract rejection are tested above.

## Gate status

| Requirement | Evidence so far | Still required |
| --- | --- | --- |
| VM-001 | Pinned real engine and measured artifact hashes | Reviewed image/BIOS licensing, sources, release manifest and maintenance |
| VM-002 | i686 Linux; Alpine userspace/apk/CA path; actual Node-guest package installation | Complete browser package/TLS acceptance, supported runtime and resource bounds |
| VM-003 | Browser-owned dedicated Worker; complete ISO, raw UTF-8 interactive input, actual process interruption, bidirectional probe files, cancellation and fresh restart | Professional terminal/file UI, production lifecycle and fault coverage |
| VM-004 | Maintained complete ISO restored in fresh Node/browser engines; six verified boot resources bound to image identity; development corruption/compatibility rejection | Final disk model, authenticated release identity including engine JS and encrypted product persistence |
| VM-005 | Local first-frame single-use authorization, unauthenticated zero-egress and destination-policy tests; reconnect suppression | Production member/generation authorization, lease revocation, durable quotas and complete network lifecycle proof |
| VM-006 | Local browser offline Linux; one complete Node package/Git/API run; real guest local HTTP offline/fresh-grant recovery without old-request replay; subsequent public-network failures retained | Reliable browser controlled HTTPS/Git/package execution and browser network-off/re-auth restoration |

Pinned native WISP emits numeric destination IPs and reconnects automatically. The local wrapper addresses first-frame authorization and reconnect suppression, and the local relay resolves/pins its fixed allowlist. It does not implement production account ownership, member/environment generations, renewable leases or durable usage limits. Real guest local HTTP restoration/re-authorization now passes; browser and stable public HTTPS equivalents remain outstanding. No public WISP relay has been enabled.

## Next ordered work

### 2026-09-10 explicit browser recovery checkpoint (not browser acceptance)

- [x] Add an opt-in loopback HTTP fixture with fixed destinations, request observations and ordinary-mode 404 isolation.
- [x] Share real-engine recovery verification between Node and a dedicated browser Worker: POST once, hold GET, save, destroy, restore offline, park, explicit fresh grant, restore, fresh GET.
- [x] Real Linux core regression passed (1 test, 26.3 seconds): exactly three requests, two grants, failed old held request, zero final relay sessions. The first implementation failed the existing 16-character command-ID contract; fixed without relaxing that contract.
- [x] Page lifecycle unit regressions passed (5 tests): explicit grant, duplicate clicks, cancellation, stale replies, deadline/errors, page departure, result evidence and Worker-constructor failure. Constructor-failure regression was observed failing before its fix.
- [x] Execute the new recovery page in an actual browser. The earlier approval-service startup failure was resolved by a later authorized local start; results and remaining failures are recorded below.
- [x] Pass a bounded repeated browser recovery acceptance, including manual fresh-grant, cancellation and restart. After the terminal-ready sequencing fix below: three consecutive full runs, one full run after boot cancellation, and one after offline-wait cancellation passed. Earlier failures and a later overall-deadline expiry remain recorded; this is not cross-browser or public-network acceptance.
- [ ] Continue controlled public HTTPS/Git/package acceptance and the remaining G0 requirements below.

New diagnostics live under `tools/browser-vm/recovery*` and are served only with the explicit `--recovery-fixture` option. This fixture cannot validate public TLS, production member authorization or encrypted persistence. G0 remains incomplete; no formal product runtime has been enabled.

1. Isolate the variable package-download throughput with equivalent guest/relay/host workloads; keep the one successful Node run separate from failed repetitions. Obtain reliable browser certificate-verified Git/API/package evidence without weakening TLS or destination restrictions or treating a longer timeout as a fix.
2. Complete browser network execution and network-disabled checkpoint restoration/re-authorization tests without replaying guest commands; extend relay lifecycle/budget coverage before product authorization work.
3. Finalize reviewed/reproducible image inputs and complete VM-001–006 before runtime-dependent integration and formal product UI. Sequencing note (2026-09-10): independent local G1a metadata create/list/detail, versioned edits/deletion tombstones and paginated metadata history have proceeded without changing G0 status, enabling default VM grants or adding a product page. See `docs/superpowers/plans/2026-09-10-browser-linux-vm-metadata.md` (199 focused tests including 59 environment cases); its D1/API evidence is not Linux, networking, lifecycle event reporting or encrypted-persistence evidence.

No production deployment, remote migration, secret-file access, paid resource creation or Git push has been performed for this harness.

## 2026-09-10 local main integration verification

- Baseline `main` test repairs committed as `4c3d9e6`: current-clock login fixtures (business dates unchanged), current permission-filtered navigation expectations, fixed historical migration boundaries, and the actual member-scoped task index query plans. Full `npm test` passed, including 486 Worker tests. Production session expiry and authorization behavior were not changed.
- Integrating VM branch commit `840ed53` preserves all existing main features and migrations 0001–0046. The unpublished VM migrations are renumbered from 0038/0039/0040 to **0047/0048/0049**, without changing their SQL bytes. Migration upgrade tests now select exact filenames. No deployed migration is renamed or rewritten.
- Reviewed hash manifests and delivery contracts now include 49 continuously numbered migrations; regression coverage preserves accepted main ledger prefixes 44–46 and validates VM prefixes 47–49.
- Fresh merged-tree verification: `npm test` passed (39 Worker files / 575 tests); `npm run typecheck` and `npm run typecheck:landing` passed. The full test command includes smoke, i18n, delivery contracts, unit tests and a fresh UI build before Worker tests.
- VM checks: `test:browser-vm` 101/101, `test:browser-vm:recovery-page` 5/5, and `test:browser-vm:linux` 6/6 using the existing verified local artifacts. No skipped Linux cases. Real-engine recovery again observed two grants, three upstream requests, one original POST, old stream closed and old guest request exit code 1.
- This is local integration evidence, not a release or G0 completion. Actual browser recovery acceptance remains the next step; public HTTPS/Git/package reliability, reviewed image release, production authorization and encrypted persistence remain open.

## 2026-09-10 browser execution after local merge f426d01

Actual in-app browser, loopback-only recovery server, dedicated browser Worker, same verified Alpine ISO. This is a diagnostic harness, not the formal workbench page.

1. First full run passed. Before the explicit fresh-grant click, the DOM reported `holdClosed: true`, `activeSessions: 0`, `grants: 1`, and exactly `POST /once` plus `GET /hold`. Grant remained a separate enabled user action.
2. After clicking fresh grant, the DOM reported `completed: true`, `executionHost: browser-worker`, `grants: 2`, `oldRequestExitCode: 1`, `activeSessions: 0`, and exactly three requests: `POST /once`, `GET /hold`, `GET /after`. No duplicate POST was observed.
3. A subsequent start followed by cancel returned the UI to a stopped state with Start enabled and Grant/Cancel disabled. This proves the observed UI behavior, not exhaustive resource-cleanup acceptance.
4. Restart after cancel failed with a guest-command timeout. Another manually started run also failed; after adding phase-only diagnostics and reloading the page, the failure was localized to **`offline-request`**. Thus cancellation is not established as the cause. No timeout was increased and no guest command was automatically retried.
5. Diagnostic regression: observed failing before implementation, then 6/6 recovery-page/core unit cases passed. The timeout test checks stage-only error reporting, serial listener removal and exactly one send. Fresh real Linux recovery regression also passed 1/1 in 27.2 seconds with the diagnostic change. These Node results do not override the browser failure.

Investigation planned at that checkpoint (superseded by the follow-up below):

- [ ] Measure guest-clock progress versus host deadline and bounded serial-result state during `offline-request`; distinguish an uncompleted guest request from missing command framing or browser scheduling effects. These are hypotheses, not established causes.
- [ ] Fix the demonstrated cause without automatic mutation replay, broadening destinations or silently increasing timeout limits.
- [ ] Re-run multiple complete browser cycles, cancellation during boot/offline wait, and restart; preserve both success and failure observations.

G0 remains **not passed**. The local merge exists, but no push, deployment, remote migration, default VM permission or formal product runtime was enabled.

## 2026-09-10 follow-up: terminal-ready sequencing and repeated browser recovery

Scope: the local recovery harness on top of `3469ae4`, not the product runtime. Same pinned Alpine ISO, dedicated browser Worker and loopback-only fixed HTTP fixture.

### Investigation and fix

- Reproduced a first success followed by a timeout, including a new `restored-file` timeout before the offline network command. This ruled out treating the failure as exclusively an offline request timeout.
- Bounded diagnostics showed the machine still running (one failure advanced 9,434,979 instructions) while the serial command's BEGIN and END markers were absent. Another observation reached BEGIN without END. These are different observed states, not proof of a guest-clock defect.
- Found a concrete sequencing defect: `runRecoveryCommand` resolved on END before ash emitted its next ready prompt. The next command or checkpoint could therefore race the shell's return to its input loop. A regression failed against that implementation: the caller advanced before the full subsequent prompt.
- The command waiter now requires the matching result frame **and the subsequent complete `localhost:~# ` prompt** for this fixed Alpine harness. The real exit status and output are retained. Earlier prompts, partial prompts and echo alone cannot complete the operation. No timeouts were raised, commands retried or destinations broadened.
- Timeout diagnostics retain phase, byte/frame counts and execution state, not raw commands or serial content. Temporary fixed-fixture serial inspection was removed before verification. The page preserves bounded diagnostics while terminating the Worker.

### Actual browser acceptance

- [x] Three consecutive complete cycles without reloading the page.
- [x] Cancel during boot, start a new cycle, explicitly grant and complete.
- [x] Cancel while parked at the offline authorization boundary, start a new cycle, explicitly grant and complete.
- All five completed cycles reported two grants, exactly `POST /once`, `GET /hold`, `GET /after`, `holdClosed: true`, `oldRequestExitCode: 1` and zero final active sessions. No original POST was replayed.
- Preserve the non-success observation: an additional run reached the offline boundary but expired under the existing 120-second page-wide deadline while waiting for the manual grant. Its controls reset and the grant was disabled. This run is **not** counted among the five successes; the overall deadline includes human decision time and remains unchanged.

### Fresh automated verification and remaining boundary

- Recovery page/core: **10/10**; diagnostics and readiness regressions were observed failing before their implementation. Missing/partial prompts, cleanup, stale replies, explicit grants and no command replay are covered.
- VM focused suite: **101/101**. The first sandbox attempt could not bind loopback (`EPERM`); the authorized local rerun passed, with no skips.
- Real Linux suite: **6/6**, no skipped cases, 103.9 seconds. Shared browser recovery core, network checkpoint recovery, full ISO boot/file restoration, Buildroot file exchange, Alpine userspace and interactive UTF-8/Ctrl+C passed. A separate real recovery run also passed in 28.4 seconds.
- Typecheck passed. The full application test/build suite was not rerun for this diagnostic-harness-only patch; previous merged-tree results remain historical, not evidence for this patch.

This closes the bounded local browser recovery/cancel/restart item. **G0 remains not passed**: stable certificate-verified public HTTPS/Git/package downloads, reviewed image release, production member authorization and encrypted persistence remain open. No production source, default permission, deployment, remote migration or paid resource was changed by this follow-up.

## 2026-09-10 follow-up: public HTTPS path comparison remains blocked

Scope: continue the public-network gate using the existing complete Alpine ISO and local authenticated WISP relay. The previous terminal-ready changes remain in the working tree. This follow-up changes documentation only; no timeouts, TLS verification, destination policy, image source or runtime code were changed.

### Controlled sequence and observations

The real Node guest, host-direct Alpine downloads, host-over-WISP Alpine downloads and host-direct GitHub checks ran **sequentially**, not as competing downloads. Host HTTPS controls retained certificate/hostname verification, a 30-second deadline and bounded response consumption; only byte counts/status/timing were recorded, not response bodies or capabilities. The direct Alpine requests used the policy-validated numeric address `146.75.114.132`. The relay independently resolved the same allowlisted hostname for each connection; identical resolved IPs across transports were **not** established, so these are path observations, not an exact endpoint-controlled throughput benchmark.

| Layer / fixed target | Fresh observation | Acceptance meaning |
| --- | --- | --- |
| Real Alpine ISO guest, `apk add --no-cache git curl` | Boot 18,452 ms; package phase timed out at 90,001 ms while fetching indexes. Relay had received 1,170,440 upstream bytes, with zero pending writes/queued frames; guest TCP established, no pending/buffered payload. Test failed 1/1, zero skipped. | Package installation did not complete; guest Git/API and subsequent network-run restoration were not reached. |
| Host direct, main `APKINDEX.tar.gz` | 440,790 bytes at 30,009 ms; deadline failure | Partial transfer, not a successful index download. |
| Host direct, community `APKINDEX.tar.gz` | 342,467 bytes at 30,004 ms; deadline failure | Failure is reproducible without either VM or relay. |
| Host direct, `brotli-libs-1.2.0-r1.apk` | HTTP 200, 409,406 bytes, 10,969 ms | One complete public package download, not a guest installation. |
| Host TLS over local WISP, main index | 424,407 bytes at 30,005 ms; deadline failure | Slow/incomplete transfer also occurs without the VM. |
| Host TLS over local WISP, community index | 589,824 bytes at 30,004 ms; deadline failure | No complete index result. |
| Host TLS over local WISP, same brotli package | HTTP 200, 409,406 bytes, 10,576 ms | One successful relay-path download, not aggregate networking acceptance. |
| Host direct, GitHub public Git `info/refs?service=git-upload-pack` | HTTP 200, Git advertisement content type, 233,419 bytes, 9,232 ms | HTTPS Git discovery endpoint accessible from host; not a clone or guest Git proof. |
| Host direct, public repository API | HTTP 200, JSON content type, 5,107 bytes, 625 ms | Host API endpoint accessible; body identity and guest API behavior not asserted in this control. |

Alpine paths were `/alpine/v3.24/{main,community}/x86/APKINDEX.tar.gz` and `/alpine/v3.24/main/x86/brotli-libs-1.2.0-r1.apk`. GitHub targets remained the existing `octocat/Hello-World` public repository on `github.com` and `api.github.com`; no new destination was allowed.

Diagnostic setup failures are separate from product/network failures: sandbox DNS returned `ECONNREFUSED`, then the authorized run resolved all three approved domains to public IPv4. The first host-direct diagnostic used an incompatible Node lookup callback shape and returned `ERR_INVALID_IP_ADDRESS` before traffic; after handling the callback's `all` option, the actual download observations above were obtained. These setup failures are not VM defects. The existing temporary `relay-https-experiment.mjs` prints per-request errors but exits zero; its two deadline failures were explicitly read and are not counted as passes.

### Decision and bounded continuation

- [x] Reproduce the existing public guest failure without increasing the 90-second command deadline.
- [x] Compare the same Alpine targets without VM/relay and without VM only; keep partial transfers separate from successes.
- [x] Check GitHub HTTPS independently of package installation, without treating host evidence as guest acceptance.
- [x] Re-run local VM focused tests **101/101**, recovery tests **10/10**, and delivery-status checks **28/28**, zero skipped; `git diff --check` passed. They do not override the failed live public test.
- [ ] Obtain a stable, authorized outbound path for the existing Alpine allowlist. No proxy, alternate mirror, public relay or production resource may be configured implicitly; any change needs explicit scope/authorization.
- [ ] Once the path changes or connectivity is confirmed stable, repeat host-direct and host-over-WISP controls before the real Node package/Git/API probe. If transport attribution is still needed, record resolved endpoints in a bounded local comparison rather than assuming DNS equality.
- [ ] Then run the dedicated-browser-Worker public workload and repeat public offline/restore/new-grant acceptance. This turn did not run a browser public workload; existing local HTTP browser acceptance remains separately scoped.

The fresh controls demonstrate an incomplete **host-to-Alpine public path** independently of the VM and relay; they do not prove the cause of every prior guest stall or exonerate all relay/runtime code. No demonstrated implementation defect was found in this round, so no speculative fix or hidden retry was added. **VM-006 and G0 remain open**. Resume after a meaningful network-condition change or authorized path choice, not by repeating identical failing runs indefinitely. No deployment, push, remote migration, secret-file access or paid resource creation occurred. Full application tests/build and the offline real-Linux suite were not rerun in this documentation-only follow-up.

## 2026-09-10 browser-computer direct-download diagnostic

### New user constraint and implementation boundary

The user clarified that downloads must use the computer running the workbench browser, then requested the next step. The new diagnostic uses ordinary browser `fetch` to five fixed public resources, without server download endpoints or WISP fallback. Existing host/relay observations above remain historical controls; they are not proof that the browser can read these resources. No auxiliary program is installed for the visitor. This local development HTTP server serves the diagnostic files, not the downloaded public response bodies.

Implementation: `tools/browser-vm/direct-download{,-page,-browser}.mjs`, `direct-download.html`, explicit `--direct-download` option on the loopback-only probe server. Only this document receives three fixed HTTPS `connect-src` origins; same-origin relay fetch/WebSocket connections are not allowed by its policy. Other documents retain their existing policy. Every request is user initiated, GET, CORS-readable, credentialless, no-referrer, no redirect, no retry, 30-second absolute deadline, bounded streaming (at most 8 MiB across the fixed target profiles). Bodies are read into bounded memory, hashed, then released; no VM import, disk download, persistence, account data or product-page integration is implemented.

The pinned Alpine rootfs uses the existing trusted artifact digest. Other SHA-256 values only record actual received bytes; they are not trusted upstream checksums. API success additionally checks `full_name`. A generic fetch error remains `network-or-cors`; its raw exception/body is not recorded and the error alone does not establish a CORS cause. Archive Content-Length checks are not applied to JSON/Git bodies, whose transfer encoding may differ from Fetch's decoded bytes.

### Actual browser observations

Actual in-app browser opened the diagnostic from `127.0.0.1`, then clicked each target sequentially. No browser evaluation issued hidden network requests. Measurements are from the visible diagnostic results, not Node download substitutes or mocked providers. The browser uses its own network configuration; no physical public-IP/route comparison or external Chrome/Edge acceptance was performed.

| Fixed target | Actual browser result | Interpretation |
| --- | --- | --- |
| Alpine main index | `network-or-cors`, 0 readable bytes, 2,500 ms | No complete browser-readable response. |
| Alpine community index | `network-or-cors`, 0 readable bytes, 309 ms | No complete browser-readable response. |
| Pinned Alpine rootfs | `network-or-cors`, 0 readable bytes, 1,331 ms | Real trusted-digest acceptance not reached. |
| GitHub public repository API | HTTP 200, response type `cors`, 5,566 bytes, 1,403 ms; `full_name=octocat/Hello-World` | Complete public API body read by this browser, not guest `curl` evidence. |
| GitHub Git protocol discovery | `network-or-cors`, 0 readable bytes, 1,339 ms | No readable Git advertisement and no clone proof. |
| Explicit cancel, then a new API run | UI changed to canceled with controls restored; next user click completed HTTP 200 / 5,566 bytes / 1,406 ms | Observed cancel/restart UI behavior; producer cancellation and stale-result suppression separately covered by tests. |

Both completed API responses recorded SHA-256 `38494d9ddafe6d35f4e3e95e39b6ccb14e729800566606407059037c1df13cb1`. This mutable API digest is evidence of those responses only. All success objects explicitly retain `vmNetworkVerified: false`. A browser-readable-byte count of zero does not prove zero network traffic: the browser may reject visibility after network activity.

### Verification and next gates

- TDD: new core/page tests first failed on absent implementations; the added server test failed 404 vs 200 before the opt-in route existed. After implementation, **15/15** download/page tests and **8/8** server tests passed.
- Fresh full focused suite: **102/102** VM tests (including those 8 server tests), **10/10** recovery tests, **28/28** delivery-status checks; typecheck passed. No skipped cases. Full application build/Worker suite and real-Linux suite were not rerun in this isolated browser-diagnostic batch; guest runtime code is unchanged by this batch.
- Next: obtain response/network diagnostics for unreadable resources; define and test successful-browser-download → VM-file import separately; resolve native guest package/Git networking under the new browser-computer egress constraint. No remote fallback, new mirror or visitor-side helper is authorized by these observations.

**VM-006/G0 remain open.** The local diagnostic is complete, not the product's networking capability. No formal VM UI enabled, no migration/deployment/push/secret-file access/paid resource creation. Changes are local and uncommitted in this batch.
