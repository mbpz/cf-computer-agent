# Browser Linux development verification

This directory is a **G0 verification harness**, not the workbench environment feature. It runs actual i686 Linux using pinned `v86@0.5.458`; it does not simulate a terminal. Networking is off by default, with an explicit local-relay diagnostic option. No production member-authorized API, persistent encrypted store, production UI or published VM image is provided here yet.

## Run the checks

```sh
rtk npm ci
rtk npm run test:browser-vm
BROWSER_VM_PROBE_ASSETS=/absolute/path/to/development-assets rtk npm run test:browser-vm:linux
BROWSER_VM_PROBE_ASSETS=/absolute/path/to/development-assets BROWSER_VM_PROBE_NETWORK=1 rtk npm run test:browser-vm:network
rtk npm run dev:browser-vm -- /absolute/path/to/development-assets
```

The fast suite includes a server bound to `127.0.0.1` on a random port. Environments restricting local listening must explicitly allow it. Without `BROWSER_VM_PROBE_ASSETS`, the real Linux tests report **skipped**, not successful Linux acceptance.

Required development files:

- `seabios.bin`
- `vgabios.bin`
- `buildroot-bzimage68.bin`
- `alpine-minirootfs-3.24.1-x86.tar.gz` for the Alpine test

To opt into **complete Alpine Linux** (its own kernel/initramfs/read-only ISO,
not a Buildroot chroot), additionally prepare an explicit ISO directory with:

- `alpine-virt-3.24.1-x86.iso`
- `boot/vmlinuz-virt` extracted from that verified ISO
- `boot/initramfs-virt` extracted from that verified ISO

```sh
rtk proxy env BROWSER_VM_PROBE_ASSETS=/absolute/path/to/development-assets BROWSER_VM_PROBE_ISO_ASSETS=/absolute/path/to/iso-assets npm run test:browser-vm:linux
rtk npm run dev:browser-vm -- /absolute/path/to/development-assets /absolute/path/to/iso-assets
```

Choose **完整 Alpine 3.24.1（独立内核和系统）** in the diagnostic page. The
chroot checkbox is then disabled because it is a different boot profile. ISO
resources remain opt-in and allowlisted; an absent ISO is a failure, not a silent
fallback to Buildroot. The ISO loader owns and verifies the exact size/SHA-256 of
WASM, both BIOS files, kernel, initramfs and ISO before constructing an engine.
Verified WASM is compiled directly and verified image buffers are supplied to
each new instance; the engine does not refetch those boot URLs. Browser response
reading is bounded by pinned lengths, including cancellation of invalid bodies.
Boot logs in to the disposable guest's root account over serial and mounts its
in-memory 9p workspace at `/mnt/work`. This is **not** host root access.

See `design/browser-vm/g0-evidence.md` for exact sources, hashes and incomplete release requirements. These files are not checked into the repository. This harness does not fetch them automatically. A downloaded demonstration image is not a reviewed release artifact.

The local page prints its address on startup. Press **运行 Linux 验证** for real boot, bidirectional 9p file exchange, RAM-root/checkpoint restoration into a new engine instance and shell exit-code checks. Select **包含 Alpine 包管理器验证** to also verify the hash-pinned Alpine userspace, its `apk` executable and recovery. Archives are extracted **inside the disposable guest**, never into the host workspace.

The fixed browser probe runs the engine in a dedicated module Worker. Cancel, page exit, Worker error and a 120-second host deadline terminate that Worker. Normal probe completion also terminates it. This does not yet implement the product's SPA lifecycle, account logout or cross-tab ownership.

## Interactive offline diagnostic

With complete ISO assets available, press **启动交互 Linux** in the separate
interactive section. It verifies the same six boot resources and starts a real
Alpine instance in its own Worker, without networking. Enter shell commands,
press **发送输入**, and read their output in the plain-text serial display.
`/mnt/work` is a guest-only temporary filesystem. **中断命令 Ctrl+C** sends the
interrupt byte; **停止交互 Linux** terminates the Worker and discards this
instance. Starting again creates a fresh filesystem, not a saved environment.

Input is encoded as UTF-8, limited to 4096 bytes per submission, and never
automatically replayed. An acknowledgement means bytes were accepted, not that
a command succeeded. Only one input and one output poll can be outstanding;
output uses a 64 KiB byte ring with explicit loss reporting. The display has a
separate bounded text history. Boot has a 60-second client deadline, requests
have a 3-second deadline, and failures close the Worker. There is no session
lifetime deadline after successful boot; stop or page exit releases it.

This is **not** an ANSI terminal emulator or the formal shadcn product UI.
Editor support, resizing, product file controls, account lifecycle, cross-tab
ownership and encrypted persistence remain unimplemented. The fixed probe and
interactive session are mutually exclusive only within this diagnostic page.
`test:browser-vm:linux` also runs the actual ISO interactive UTF-8/file/interrupt
and local network-recovery regressions when both asset directories are supplied.
The recovery test needs permission to bind temporary loopback HTTP/WebSocket
ports but makes no public Internet requests.

## Local checkpoint/network recovery regression

The real Alpine guest issues one POST and keeps a second HTTP response open,
then saves a checkpoint. Destroying the original instance closes the relay and
its upstream TCP streams. Restoring into a new offline engine preserves files
but opens no socket and cannot make an HTTP request. Only an explicit fresh
single-use relay grant enables a subsequent new request. The test also waits
for the old outstanding guest request to fail and checks that neither prior
request was replayed.

Only the upstream DNS/dial boundary is replaced by an isolated loopback HTTP
fixture; the guest, emulator, WISP authentication/relay and checkpoint code are
real. This is not TLS, public Git/package, browser recovery or member-auth
acceptance. Run just this regression with:

```sh
rtk proxy env BROWSER_VM_PROBE_ASSETS=/absolute/path/to/development-assets BROWSER_VM_PROBE_ISO_ASSETS=/absolute/path/to/iso-assets node --test tools/browser-vm/network-recovery.test.mjs
```

The complete ISO profile now restores the saved NE2K MAC and device RAM. Its
checkpoint identity binds that option as well as the six resource pins; records
using the previous resource-only identity are deliberately rejected. No saved
network authorization or TCP adapter session is restored by this option.

## Optional controlled network diagnostic

After selecting Alpine, select **包含受控联网验证** to install Git/curl inside the disposable guest, clone the public `octocat/Hello-World` repository over HTTPS and request its GitHub API metadata. This makes real external network requests and downloads packages. Without both explicit environment flags, the Node network test skips rather than claiming network acceptance.

The Node network test uses the complete ISO when `BROWSER_VM_PROBE_ISO_ASSETS`
is also set; otherwise it retains the Buildroot/chroot regression path. The ISO
network probe explicitly switches its guest-only repositories from the CD to
fixed Alpine HTTPS repositories. Offline ISO startup does not do this.

The local server uses pinned `ws@8.21.0` and a same-origin, single-use first-frame capability. Only the fixed Alpine/GitHub/API destinations are allowed, with public-IPv4 DNS validation and numeric-address pinning. Credentials never appear in the relay URL. The adapter cannot automatically reconnect after disconnection. Loopback-only session/stream/flow limits are development safeguards, not production per-user authorization or durable daily quotas. Do not expose the server or its capability route publicly.

September 10, 2026 local results are mixed: one Node run completed package installation, certificate-verified HTTPS Git, API HTTP 200 and a fresh-engine offline restore in about 18 seconds. Subsequent Node and browser runs exceeded the 90-second package deadline. The browser network path and browser re-authorization after restoration remain unaccepted. The local HTTP recovery regression above is separate evidence, not public-network acceptance. Historical failures and the successful run are recorded separately; do not treat this opt-in test as consistently green.

The page reports boot/package/Git/API phases, heartbeat gaps and document visibility. The Node network test additionally samples relay traffic counters and guest TCP queue sizes every 15 seconds; these diagnostics never include tickets or packet contents and are not exposed by an HTTP endpoint. Engine instruction deltas wrap at 32 bits and are not CPU-usage measurements. Intermediate progress does not extend either deadline.

## Evidence boundaries

The development checkpoint guard verifies actual SHA-256, size (at most 512 MiB),
schema and the caller-declared engine/image/memory/filesystem identity before
calling engine restoration. It takes a private byte copy before hashing to avoid
caller mutation during verification. This is corruption detection, **not** an
authenticated format, encryption, or verification that the declared versions
match the loaded binaries. The complete ISO profile improves this boundary by
deriving checkpoint image identity from its six verified boot-resource pins
and the applied snapshot NIC-restoration option.
The statically imported JavaScript engine module is still declared/pinned by the
development dependency, **not** authenticated by that loader. Reviewed release
manifest binding and encrypted persistence remain separate requirements. The copies also add transient memory overhead;
the 512 MiB state cap is not a browser-process memory guarantee.

- `networkVerified: false` remains false even when `apk --version` succeeds. No package has thereby been downloaded or installed.
- `caBundlePresent` checks a nonempty known certificate path, not successful TLS verification.
- Both maintained boot profiles now run: Buildroot with optional Alpine chroot, and complete Alpine virt ISO. The latter passed Node and browser offline restoration, including read-only ISO reattachment and `/mnt/work` exchange. Neither is a finalized product image.
- The checkpoint covers this image's RAM-backed root and in-memory 9p filesystem. Separate writable disk images, encryption, IndexedDB atomicity, recovery from a previous checkpoint and backup import are not proven.
- `pageTicks` and `maxPageTickGapMs` are diagnostic observations, not peak memory/CPU, frame-rate or supported-device guarantees.
- Local CSP permits a Worker and the pinned engine's blob scheduler. Production CSP is untouched.
- Server paths are explicitly allowlisted, do not expose the project directory, reject cross-origin requests, and return `no-store`. Do not expose this server publicly.

The authoritative implementation plan is `docs/superpowers/plans/2026-09-09-browser-linux-vm.md`; outstanding requirements remain unchecked there and in the design spec.
