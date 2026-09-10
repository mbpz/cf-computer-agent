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
- [ ] Run the new recovery page in an actual browser, including manual fresh-grant, cancellation and restart. Starting the local test service was denied because the approval service hit its retry/rate limit; no workaround was attempted. Node/page-unit evidence is not browser execution evidence.
- [ ] Continue controlled public HTTPS/Git/package acceptance and the remaining G0 requirements below.

New diagnostics live under `tools/browser-vm/recovery*` and are served only with the explicit `--recovery-fixture` option. This fixture cannot validate public TLS, production member authorization or encrypted persistence. G0 remains incomplete; no formal product runtime has been enabled.

1. Isolate the variable package-download throughput with equivalent guest/relay/host workloads; keep the one successful Node run separate from failed repetitions. Obtain reliable browser certificate-verified Git/API/package evidence without weakening TLS or destination restrictions or treating a longer timeout as a fix.
2. Complete browser network execution and network-disabled checkpoint restoration/re-authorization tests without replaying guest commands; extend relay lifecycle/budget coverage before product authorization work.
3. Finalize reviewed/reproducible image inputs and complete VM-001–006 before runtime-dependent integration and formal product UI. Sequencing note (2026-09-10): independent local G1a metadata create/list/detail, versioned edits/deletion tombstones and paginated metadata history have proceeded without changing G0 status, enabling default VM grants or adding a product page. See `docs/superpowers/plans/2026-09-10-browser-linux-vm-metadata.md` (199 focused tests including 59 environment cases); its D1/API evidence is not Linux, networking, lifecycle event reporting or encrypted-persistence evidence.

No production deployment, remote migration, secret-file access, paid resource creation or Git push has been performed for this harness.
