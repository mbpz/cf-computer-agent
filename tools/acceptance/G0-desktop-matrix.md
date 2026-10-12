# G0 desktop-browser admission matrix (LOCAL ONLY — preparation, not acceptance)

Status: a user-executable runbook for the **G0 first-connection admission gate** — the part
of G0 that requires *"有效 HTTPS 页面在桌面 Chrome/Edge 默认安全配置下完成握手及允许/拒绝/撤回、停止等矩阵"*
([`docs/superpowers/plans/2026-09-11-browser-vm-local-connector-probe.md`](../../docs/superpowers/plans/2026-09-11-browser-vm-local-connector-probe.md),
quoted in [`docs/product/2026-09-28-vm-resumption-evidence.md:7`](../../docs/product/2026-09-28-vm-resumption-evidence.md)).
It is developer tooling, is **not** product code, is **not** wired into the app or
`npm run check`, and is **not** an acceptance result by itself.

> **Non-claims, read first**
>
> - This kit **cannot be executed from the agent/CI environment**. It needs an **unlocked
>   target desktop** running Chrome/Edge with *default* security settings, and it relies on a
>   **published HTTPS page**. Neither exists in this environment, so the file is preparation
>   only — do not read it as evidence that the G0 matrix passed.
> - A green run of the **automated** connector regression (`npm run test:browser-vm:connector`)
>   is loopback protocol + page-state evidence in Node. It is **not** desktop-browser
>   acceptance and does not substitute for the steps below.
> - **A self-run local/browser pass is not the user's target-desktop acceptance** and it does
>   **not** close D04. Only the user's own target desktop, with the recorded browser versions
>   and the observed matrix, constitutes the admission evidence for that environment.
> - **Nothing here authorizes D08.** No deploy, no remote migration, no production login, no
>   real identity journey is implied or permitted by this document.
> - Historical **in-app browser** handshakes (Chrome `151.0.0.0` reduced UA) do **not**
>   substitute for target-desktop Chrome/Edge. The full-version desktop matrix was last
>   recorded on 2026-09-29 ([`design/browser-vm/local-connector-probe-evidence.md`](../../design/browser-vm/local-connector-probe-evidence.md));
>   this kit is how you *reproduce* it, not a claim that it was reproduced for you.
> - The probe is handshake-only: the server returns `{type:'probe-ready', forwarding:false}`
>   (`tools/browser-vm/connector-probe/server.mjs:84`). A successful handshake is **not** VM
>   networking, **not** `apk`/Git/API availability, and **not** member authorization.

## What G0 requires (and what this specific matrix covers)

G0's own gate rule (`docs/superpowers/plans/2026-09-09-browser-linux-vm.md:81`):

> G0 未通过，不开始后续正式页面接入；中继资源授权缺失不得改报整体完成。

G0 is the whole "real Linux + file/snapshot/network verification harness" stage (VM-001–006).
This document covers **only** the desktop-browser admission slice of it — the connector
admission items **LC-002/003/004/005**, whose user-facing behaviours are: HTTPS page → loopback
handshake, browser permission **allow / deny / revoke**, and **stop/exit**, all under default
security settings. The remaining G0 blockers are listed under
[What is still MISSING for G0](#what-is-still-missing-for-g0) — a green matrix here does
**not** mean G0 has passed.

## Prerequisites

**Host**

- **Node ≥ 20** (repo targets Node 24) and `npm`; dependencies installed (`npm install`).
  The probe needs the repo's pinned `ws` dependency.
- An **unlocked desktop** with a real **Chrome or Edge** window you can interact with.
- Only one loopback probe process at a time (it binds `127.0.0.1` on a single port).

**Browser — default security settings only. MUST NOT be enabled / must be at defaults**

- No proxy configured for the probe origin (no PAC, no local proxy).
- No TLS bypass: no ignored certificate errors, no custom CA/trust-root install, no
  `--ignore-certificate-errors`-style flags.
- No custom launch flags, in particular **not** `--disable-features=LocalNetworkAccessChecks`.
  The Launch/Version page must not show a disabled Local Network Access flag; enterprise
  policy tables must not carry `LocalNetworkAccessAllowedForUrls` /
  `LocalNetworkAccessBlockedForUrls` / `LocalNetworkAccessRestrictionsTemporaryOptOut` for the
  probe origin. (Background: LC-002 official notes, e.g. Chrome 147 / Edge 147 release notes.)
- No `--disable-web-security`, no site-permission pre-grant, no extension doing the connect.
- The probe page is a **valid-certificate HTTPS** origin (see below). A plain-HTTP page, the
  local `http://127.0.0.1:<port>/` control page, a self-signed certificate, or a certificate
  exception **do not count** as HTTPS admission evidence.

**The HTTPS page (where it comes from)**

- **Provenance:** the URL, project, branch and deployment id below are **as recorded in
  [`design/browser-vm/local-connector-probe-evidence.md`](../../design/browser-vm/local-connector-probe-evidence.md)**
  (preview published 2026-09-12; desktop admission matrix 2026-09-29). **This runbook did not
  re-verify the preview.** Before treating the matrix below as runnable, re-check that this
  preview still exists and points at the expected deployment; if it is gone, Step 0 must be
  satisfied by whatever valid HTTPS page your environment provides, per the G0 requirement.
  Re-publishing a preview is a **deploy** and is out of scope for this kit.
- A static Pages preview, project `memory-garden-vm-connector-probe`,
  preview branch `connector-admission`, deployment `40b8e0aa`, fixed origin:

  ```text
  https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev/probe
  ```

  It serves only `probe.html`, `page.mjs`, `client.mjs` (+ `_headers`); `server.mjs`,
  `control.mjs`, `index.html` and `_headers` return 404 online. The origin must be used
  **exactly** — no branch alias, no trailing slash, no path/query/userinfo — because the probe
  validates `origin.origin !== allowedOrigin` (`server.mjs:17`) and the WebSocket upgrade
  checks `req.headers.origin !== allowedOrigin` (`server.mjs:59`).
- **Do not deploy or re-publish anything for this run.** If the preview 404s, either use another
  already-published valid HTTPS page (same exact-origin rule) or stop and ask for a redeploy
  authorization — re-publishing is a deploy, is out of scope here, and this kit must not perform
  it.
- The page's own CSP is pinned to `connect-src ws://127.0.0.1:*`; do **not** relax it.

## Commands that already exist (verified)

| Command | What it is | Proof it exists |
| --- | --- | --- |
| `npm run dev:browser-vm:connector -- <https-origin> [port]` | Starts the **handshake-only loopback probe**; prints the local control page URL | `package.json:40` (`node tools/browser-vm/connector-probe/server.mjs`); CLI args at `server.mjs:110-116` |
| `npm run test:browser-vm:connector` | Automated loopback protocol + page-state regression (18/18 historically) | `package.json:39` → `scripts/browser-vm-connector-probe.test.mjs` + `scripts/browser-vm-connector-client.test.mjs` (both exist) |
| `npm run verify:delivery-status` | Delivery-status docs contract (28/28 historically) | `package.json:50` → `scripts/delivery-status-contract.test.mjs` |
| `npm run audit:functional-checklist` | Read-only checklist accounting (expects `29 范围内 / 7 已关闭 / 22 未关闭`, D08 excluded) | `package.json:61` → `scripts/functional-checklist-audit.mjs` |
| `node --test scripts/functional-checklist-audit.test.mjs` | The audit's own tests (9/9) | `scripts/functional-checklist-audit.test.mjs` |
| `npm run test:browser-vm` | Fast VM suite (includes the probe/client tests) | `package.json:36` |

There is **no** `dev:`/`start:` script for the formal `tools/browser-vm/connector/server.mjs`
(the LC-006+ connector). It is assembled programmatically by `startConnectorServer(...)` and has
no product launcher yet — see MISSING below. Do not try to run the formal connector from a
desktop page; it has no published HTTPS client and no production key loader.

> Sandbox note: in the agent sandbox these commands are often prefixed `rtk proxy …`. On your
> own desktop the plain `npm run …` / `node …` forms are correct.

## Ordered steps

Run these in order. Record every line of the results table below. Do **not** extend timeouts,
change flags, retry the same failing path unboundedly, or relax any security setting to make a
step "pass".

### Step 0 — Baseline (optional but recommended)

```sh
npm run test:browser-vm:connector      # expect 18/18, 0 failed, 0 skipped
```

This proves the loopback protocol/page state on *this* machine. It is **not** the browser
matrix.

### Step 1 — Start the loopback probe

In a terminal at the repo root:

```sh
npm run dev:browser-vm:connector -- https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev
```

(Local port is OS-assigned by default; pass a second argument to pin one, e.g. `… … 55157`.)

Expected observable output (one line, `server.mjs:112`):

```text
Handshake-only probe. Local control page: http://127.0.0.1:<port>
```

Failure modes to record rather than work around:

- **Non-HTTPS / non-origin argument** → the process exits non-zero with
  `Cannot start probe. Supply one exact HTTPS origin and an optional loopback port.`
  (`server.mjs:17,115`). The argument must be `https:` and exactly `scheme://host[:port]`.
- **Port already in use** → `Port already occupied; select another explicit port.`
  (`server.mjs:115`). Choose another port; the probe never silently re-binds.

Note the `<port>` printed here — you will type it into the HTTPS page.

### Step 2 — Open the local control page and generate one code

Open the printed `http://127.0.0.1:<port>/` in a browser tab, confirm the allowed origin shown
is the fixed HTTPS page above, then click **生成一次性配对码**.

Expected: a 43-char one-time code appears in the page output, limited to 30 seconds; the status
reads `仅用于 https://40b8e0aa.…，30 秒内有效。` (`control.mjs`). Clicking again invalidates the
previous unused code. **Do not** screenshot the code, paste it anywhere else, or send it to a
third party. (`清除显示` only clears the page; it does not revoke a pending code — generate a
new code or stop the probe instead.)

### Step 3 — Allow + handshake (LC-003)

In your **desktop Chrome/Edge** (default settings per Prerequisites), open:

```text
https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev/probe
```

Enter the port from Step 1 and the code from Step 2, then click **验证连接**.
If the browser shows a local-network permission prompt (e.g. Chrome's
“访问此设备上的其他应用和服务”), choose **Allow**.

Expected observable result:

- Page shows **「握手成功；仅验证连接，不提供外网转发。」**; the code input is cleared;
  **验证连接** is disabled and **断开 / 取消** is enabled.

Failure modes:

- Generic unavailable / “原因未确定” with a normal WebSocket `error` — the page deliberately
  does **not** invent a cause (permission vs. CSP vs. mixed content vs. cert). Use browser
  DevTools diagnostics and record what it actually says; do not retry unboundedly.
- Explicit **「握手被拒绝」** — the code was wrong, expired, already consumed, or the origin did
  not match. Generate a fresh code; do not reuse.

### Step 4 — Active disconnect

Click **断开 / 取消**.

Expected: **「已断开 / 取消，不会自动重试。」**; **验证连接** re-enabled; no automatic
reconnection.

### Step 5 — Credential lifecycle (LC-003/004)

With a fresh code each time:

- **Replay a consumed code** → **「握手被拒绝」**.
- **Let an unused code expire (> 30 s) then submit** → rejected (historical: 36 s Chrome /
  72 s Edge, [evidence](../../design/browser-vm/local-connector-probe-evidence.md)).

Record the elapsed seconds; do not test "expiry" with an already-consumed code.

### Step 6 — Deny / revoke permission (LC-004)

- **Deny (fresh profile or after resetting the site permission):** attempt a connection and
  choose **Block** at the prompt. Expected: connection unavailable; input cleared; page keeps
  the honest “cause undetermined” text unless the browser states the reason.
- **Revoke while connected:** with a successful handshake open, turn the site's
  "apps on your device / local network" permission **off**.

  **Important measured limitation:** revoking the browser permission does **not** immediately
  drop the existing WebSocket — historical observations showed it still reporting success at
  20.667 s (Chrome) / 15.578 s (Edge); the browser then asks you to reload, and only after the
  reload is a **new** connection blocked. Do **not** record this as "instant revocation". Formal
  revocation must not rely on the browser permission switch.

Restore the site permission to **off** when finished (cleanup), unless you are mid-run.

### Step 7 — Stop the component while connected (LC-004)

With a fresh successful handshake open, press **Ctrl+C** in the terminal running the probe.

Expected: within the 60 s session limit the page flips to offline (e.g.
**「连接已离线。需要手动生成新配对码后重新连接。」**); the process exits (historical Stop: 0;
Ctrl+C via a wrapper surfaced 1 — record what you actually see); the connect button is enabled
again and disconnect disabled. Then confirm the port has no listener:

```sh
lsof -nP -iTCP:<port> -sTCP:LISTEN     # expect no output
```

### Step 8 — Component absent (LC-004)

With the probe stopped, attempt a connection from the HTTPS page. Expected: connection
unavailable, input cleared, page still shows “原因未确定” (no fabricated permission/cert
diagnosis).

### Step 9 — Non-allowed HTTPS origin (LC-005)

Start the probe with a deliberately **non-matching** allowed origin (no DNS/visit to it):

```sh
npm run dev:browser-vm:connector -- https://connector-origin-negative.invalid
```

Then from the original HTTPS page, attempt a connection with a made-up 43-char code (all `A`s).

Expected:

- Chrome: console shows `Unexpected response code: 403`; page shows generic unavailable, input
  cleared. (Server-side, the upgrade is rejected with HTTP 403 before any dial:
  `server.mjs:59`.)
- Edge: UI shows a generic WebSocket failure; a same-run server-side upgrade/403 observation is
  required to attribute it to origin rejection (the historical run used a read-only in-process
  wrapper reporting booleans + `HTTP 403`, no headers/token).

Missing/`null` Origin is covered by the protocol-level automated test, **not** by the browser
matrix — do not fake it.

### Step 10 — Shutdown and privacy cleanup

- Ctrl+C the probe; confirm no listener on the port (Step 7 command).
- Clear the control page display and close it; do not save the code anywhere.
- Reset the probe origin's site permission to **off**; leave all other origins, the system
  proxy, and OS security settings untouched.

## Results table (fill in)

Record the **full** browser version and OS (from the browser's Version page — never the reduced
page User-Agent), and whether all relevant LNA flags are `Default` and no policy exemption
applies.

| # | Scenario | Chrome (version / OS) | Edge (version / OS) | Observed result / notes |
| -: | --- | --- | --- | --- |
| 1 | Allow + fresh one-time code → handshake | | | expect 握手成功; input cleared |
| 2 | Active disconnect | | | expect 已断开 / 取消，不会自动重试 |
| 3 | Replay consumed code | | | expect 握手被拒绝 |
| 4 | Unused code expired (>30 s) | | | record elapsed s |
| 5 | Deny permission → connect | | | expect unavailable |
| 6 | Revoke while connected | | | record s until req'd reload; **not** instant |
| 7 | Stop component while connected | | | record s; process exit code; port free |
| 8 | Component absent → connect | | | expect unavailable |
| 9 | Non-allowed HTTPS origin (LC-005) | | | console 403 (Chrome); server-side 403 (Edge) |
| 10 | Local regression `npm run test:browser-vm:connector` | n/a | n/a | expect 18/18 |

Provenance to record per run: date, repo commit (`git rev-parse HEAD`), exact probe origin,
port, and whether `LocalNetworkAccessChecks` was at `Default`.

## What is still MISSING for G0

A green run of the table above reproduces **only** the LC-002–005 first-connection admission on
your desktop. G0 remains open because (`docs/superpowers/specs/2026-09-11-browser-vm-local-connector-design.md:116-127`):

- **LC-010 — real VM HTTPS Git clone / fetch / API body identity:** user-skipped, **not**
  passed (github.com DNS timeout, exit 128; no VPN change authorized). Not evidence of success.
- **LC-011 — lifecycle:** cancel, offline, connector exit and VM snapshot-restore closing old
  connections, with a fresh authorization required and the original side-effecting command
  executed only once. Only Node controlled-target evidence exists; the **actual browser
  lifecycle matrix** is not done.
- **LC-012 — account lifecycle:** logout, account switch, environment deletion and local
  revocation each verified to drop the network and make old authorization non-reusable in a
  real browser.
- **LC-013 — per-platform desktop matrix:** system/version/permission interaction recorded
  separately per Chrome/Edge; untested platforms must not be listed as supported.
- **LC-014 — install/uninstall/update:** install, manual start/exit, update verification and
  failure messaging need their own design and tests; no auto-start, no admin privileges.
- **LC-015 — formal shadcn page + account-runtime integration**, then re-review VM-006/G0.
  **A single local probe success does not mean the product is done.**

Additionally, and independently of the above:

- **Relay / resource authorization is missing and MUST NOT be reported as complete**
  (`2026-09-09-browser-linux-vm.md:81`): the production relay's location, maintenance and
  budget authorization remain a separate release gate. No remote egress, no production relay,
  no per-member durable quota is configured or authorized.
- **No production signing configuration** for the formal connector (LC-006 default is
  "no config ⇒ closed"); **no production image / release manifest** (license/source inventory,
  reproducible build, published-image acceptance) — the harness uses development assets.
- **No formal product page** wires the runtime/network owner (the app currently exposes
  metadata management only); the formal connector has **no launcher script** in `package.json`.

## Non-claims (restated)

- Local, self-run evidence is **not** the user's target-desktop acceptance; only the user's own
  recorded desktop matrix counts.
- Nothing here authorizes **D08** (deploy / migration / real login) or any production change.
- A synthetic/local pass **does not close D04**; the checklist counts stay
  `29 范围内 / 7 已关闭 / 22 未关闭` (D08 excluded).
- The probe performs **no** DNS, TCP egress, VM boot or member authorization; `forwarding:false`
  is reported by the server itself.

## 运行记录（2026-10-11，用户目标桌面）

- **环境**：macOS 27.0.1（26A434）；Chrome **155.0.8059.39**（正式版，arm64；修订 `3ff7ac5a9224be9156d7f8703a06e22890aafd34`；V8 15.5.35.20）；命令行仅 `--restart --restart --flag-switches-begin --flag-switches-end`，**无** `--ignore-certificate-errors` / `--disable-web-security` 等放宽项；个人资料 `…/Chrome/Default`。
- **Step 0 基线** `npm run test:browser-vm:connector`：**18/18 通过，0 失败 0 跳过**（本机回环协议与页面状态，非浏览器矩阵）。
- **Step 1 探针启动**：`npm run dev:browser-vm:connector -- https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev 55157` → `Handshake-only probe. Local control page: http://127.0.0.1:55157`。
- **Step 2 控制页与配对码**：控制页加载正常（文案含「仅验证握手，不转发外网流量，不运行 Linux」及 30 秒有效期提示）；点击 `生成一次性配对码` 成功产出 **43 字符**一次性码。
- **Step 3 桌面浏览器握手：被浏览器拦截，连接未建立**。
  - 页面控制台：`WebSocket connection to 'ws://127.0.0.1:55157/probe' failed: Error in connection establishment: net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`
  - 页面内权限查询：`navigator.permissions.query({name:"local-network-access"})` = **denied**（`local-network` = prompt；`loopback-network` = denied）
  - 页面自述：`连接不可用，浏览器未提供足够原因。请核对组件、端口和浏览器的权限 / 安全诊断，不据此判断具体原因。`
  - 用户把该浏览器的本地网络访问开关打开后**仍为 denied**；以 CDP 真实输入点击 `验证连接` 后权限状态不变 —— 站点级已保存的拒绝优先于全局默认。
- **结论与边界**：桌面浏览器准入**尚未取得通过证据**（Step 3–5 未完成）。未以任何方式放宽安全设置，也未程序化授予权限（那会绕过该权限本身要取得的用户同意）；未改动产品代码；探针仅在 `127.0.0.1:55157` 回环监听。下一步需用户在**该源**（`https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev`）显式允许本地网络访问（或重置该站点权限后以真实手势重试），随后继续 Step 3–5。
- **非声明**：本记录不关闭 D04/G0，不构成生产验收或 VM 联网验收。
