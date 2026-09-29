# 本机连接器首个切片：本地证据

实现日期：2026-09-11。实现基线：本地 main / c340540，继承 387ee77。用户指令：「按照 checklist 顺序实现」。原实现轮次未提交、推送或部署；后续已提交为 `7f2efeb`。2026-09-12（Asia/Shanghai）独立预览发布进展见文末。

## 状态边界

- LC-001：已确认方向，保持完成。
- LC-002：已完成。2026-09-29 官方版本说明及桌面 Chrome/Edge 完整版本、相关默认 flags/策略均已核对，详见文末分版本记录；不承诺未测版本或平台。
- LC-003：已完成准入探针握手。有效证书 HTTPS 页面在 Chrome 154.0.8037.58、Edge 152.0.4191.53 与默认相关安全检查下成功连接；不代表正式账户授权或 VM 联网。
- LC-004：已完成探针级权限/生命周期分类验收。浏览器实测允许、阻止、撤回后重载阻止新连接、主动断开、组件退出/缺席；端口占用由真实回环自动化验证。普通 WebSocket error 不细分原因；撤回权限不会立即切断既有连接，详见限制。
- LC-005：部分完成。双浏览器有效码过期和重放拒绝完成；missing/null/foreign Origin 在协议层自动化通过，真实 HTTPS 非允许来源的浏览器拒绝路径仍待补齐，不提前关闭。
- LC-006～015：未启动。本轮没有新建正式 VM 导航、联网切换或原生 apk / Git / API 的成功声明。VM-006 / G0 保持开放。

## 实现与限制

`tools/browser-vm/connector-probe/` 是独立开发工具：只监听 127.0.0.1；必须明确设置唯一 HTTPS 来源；本机同源 POST 生成一次性码。服务端只保留 SHA-256 摘要，30 秒有效、一个待用码、五次失败上限，消费在事件循环内同步完成。四连接、1 KiB 帧、3 秒首帧、60 秒会话，退出有强制回收上限。没有 DNS / 出站 TCP 转发器。

网页只连接填写的一个端口，不扫描、不重试、不把码放入 URL 或持久存储；发送后清空输入和客户端码变量。客户端有 15 秒建立期限及 65 秒会话期限。真实权限细分需要浏览器诊断，不能由统一 WebSocket error 反推。

## 先失败后实现

1. 服务端测试首次失败于模块不存在；实现后按真实本机 HTTP / WebSocket 校验。
2. 来源测试中发现 Node 内建 fetch 没有发送指定的伪造 Host。最小本机服务确认：fetch 实际发送回环 Host，node:http request 发送测试指定 Host。改为后者测试重绑定，没有放宽产品校验。
3. 客户端首次失败于模块不存在；页面 click-to-connect 测试随后暴露未连接的骨架，补齐绑定后通过。
4. 新增对端永不主动关闭的测试，先观察客户端停留 ready 的失败，再增加本机会话期限，回归通过。
5. 额外测试并发消费只接受一个、五次失败失效、超大帧拒绝，以及不回应关闭帧的升级连接可被回收。

## 2026-09-11 实现轮次自动化结果

| 检查 | 结果 | 证据范围 |
| --- | --- | --- |
| `rtk proxy npm run test:browser-vm:connector` | 18 / 18 通过 | 新增真实回环协议 + 受控页面状态 |
| `rtk proxy npm run test:browser-vm` | 120 / 120 通过 | 包含新增 18 项及原有 102 项；不是 Linux 公网实测 |
| `rtk proxy npm run test:browser-vm:direct-download` | 15 / 15 通过 | 既有下载边界与页面状态 |
| `rtk proxy npm run test:browser-vm:recovery-page` | 10 / 10 通过 | 既有恢复、取消与不重放契约 |
| `rtk proxy npm run verify:delivery-status` | 28 / 28 通过 | 既有交付状态文档契约；不等于生产验收 |

服务监听在沙箱内报 EPERM 后经授权重跑。所有测试失败数为 0、跳过数为 0。未运行全应用构建、桌面 Chrome/Edge HTTPS 矩阵或真实 VM 公网测试。

## 本机浏览器检查

使用 Codex 内置浏览器打开 `http://127.0.0.1:62526/` 和 `/probe.html`（仅本轮临时端口，组件已停止）。页面 User-Agent 显示 Macintosh / Chrome 151.0.0.0，属于浏览器标识，不据此声称独立 Chrome/Edge 完整版本或操作系统版本已验收。

- 点击生成一次性码，DOM 检查只返回「格式有效」布尔值；清除后只返回「为空」布尔值，没有输出码值、保存配对截图或复制到第三方页面。
- 空输入点击验证显示「请填写有效端口和一次性配对码」。
- 使用明显虚构的测试值发起本地 HTTP 页面连接，输入立即清空，页面显示连接不可用且原因未确定，按钮可再次操作；该来源不在允许的 HTTPS 来源内。
- 页面明确显示「HTTPS 安全上下文：否，不计准入验收」。

本次浏览器检查未验证真实 HTTPS 成功、浏览器权限提示、真实有效码的跨来源传递或 Chrome/Edge 支持范围。Node 设置 Origin 的成功握手不能替代这些证据。

## 下一步

独立 HTTPS 预览及获准的内置浏览器有效码握手已完成。当前浏览器连接列表仅有内置浏览器；下一步需要用户连接桌面 Chrome/Edge，补齐完整版本与允许/拒绝/撤回、会话中组件退出及凭据拒绝矩阵。若出现本地网络权限提示，单独确认权限操作。完成 LC-002～005 后再实现 LC-006 的成员/环境/连接器/代次授权。部署边界、手动运行方式和权限矩阵见工具 README；不复用生产发布许可。

## 授权后发布检查（2026-09-11）

- 当前本地分支仍为 `main`，领先 `origin/main` 两个提交；本次未提交、推送或部署，保留现有改动。
- 已核对生产 `wrangler.jsonc`，本次预览不使用其自定义域名、运行代码或资源绑定。
- Web 文档工具仍未返回正文；直接抓取在沙箱内 DNS 失败后，经授权成功读取 Cloudflare 官方 Direct Upload 文档（`https://developers.cloudflare.com/pages/get-started/direct-upload/index.md`，页面标记更新日期 2026-04-21），支持后续采用独立 Pages 项目和显式预览分支。此结果不代表 Chrome 官方权限说明已核对。
- 本地 Wrangler 为 4.119.0；经授权执行只读身份检查，返回：`Not logged in. Your auth token has expired and could not be refreshed, and the environment is non-interactive.`
- 因需要用户重新完成交互登录而暂停，未尝试读取 `.dev.vars` / `SECRETS_FILE`、寻找替代凭据或修改生产配置。用户可在本机项目终端运行 `rtk proxy npx wrangler login`，无需向聊天发送令牌。
- 尚未调用项目创建或部署命令，尚未验证真实 HTTPS 握手。本段没有重新运行上文实现轮次的测试，历史测试结果不作为本次新鲜验收结果。

## 登录恢复与独立 HTTPS 预览（2026-09-12，Asia/Shanghai）

### 发布与文件核验

- 用户说明「已登录cloudflare」后，Wrangler 4.119.0 的只读身份检查成功，具备 Pages 写权限。继续使用现有登录，没有读取 `.dev.vars`、`SECRETS_FILE` 或本机 OAuth 文件。
- 创建独立 Pages 项目 `memory-garden-vm-connector-probe`，配置生产分支 `main`，实际仅向 `connector-admission` 预览分支发布。未修改原生产 Worker、域名、数据库或资源绑定。
- 上传目录为临时目录下的独立 `assets` 子目录，仅三个静态文件与 `_headers` 配置。首次打包检查发现 Wrangler 缓存目录后停止上传准备，改用纯静态子目录再部署，缓存没有进入发布内容。
- 部署 ID：`40b8e0aa`。固定来源：`https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev`；页面路径 `/probe`，`/probe.html` 经 308 跳转。别名为 `https://connector-admission.memory-garden-vm-connector-probe.pages.dev`，本轮未用别名配对。
- HTTPS 请求未忽略证书错误。三个文件均返回 200、内容与仓库逐字节一致，HTML / JavaScript MIME 正确。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `probe.html` | 1150 | `f244b87cbbf69bb807fe82def32562597f274369330040078bd8f970fb5fd6d6` |
| `page.mjs` | 2436 | `987c9fef481a934c0cd00c2d27591d76e8a7960c1c3eeba0d364415af87b2cb3` |
| `client.mjs` | 2306 | `fe1828623b5e049ad1687fecad51b7b4ed03d862ef2fc302ca604a112cb7f39d` |

响应头已核验：`Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`、`X-Robots-Tag: noindex, nofollow`，以及：

```text
default-src 'none'; script-src 'self'; connect-src ws://127.0.0.1:*; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
```

`server.mjs`、`control.mjs`、`index.html`、`_headers` 在线请求均返回 404。没有 Functions、网络中继或其他源码发布。

### 配对授权前的内置浏览器实测（历史轮次，部分准入证据）

- 使用 Codex 内置浏览器打开固定 HTTPS `/probe`，页面显示 HTTPS 安全上下文为「是」。未更改浏览器安全配置、添加证书例外或安装扩展。
- 页面 User-Agent 为 Macintosh / Chrome 151.0.0.0 的缩减标识，不据此声明桌面 Chrome/Edge 的完整版本或平台支持。
- 点击空输入，出现有效端口/配对码提示。格式错误的虚构值也被客户端校验拒绝。
- 临时组件精确允许该固定 HTTPS 来源，实际监听 `127.0.0.1:58767`。没有生成真实配对码，使用 43 个 `A` 组成的虚构值测试；页面清空输入，显示「握手被拒绝：检查配对码是否有效并重新生成」，连接按钮恢复可用。
- 手动停止临时组件后，再以同一虚构值连接同一端口，页面显示连接不可用、原因未确定，未把普通 error 编造为权限或证书诊断。这不是已连接会话被中断的验收。
- 本轮未操作权限提示，未输入或传递真实有效码，未验证成功连接、连接期间取消/退出、重放、过期或权限允许/拒绝/撤回。临时组件已停止，没有常驻服务。
- Chrome 官方权限文档再次直接抓取约 5 秒超时，LC-002 保留开放。内置浏览器结果不替代桌面 Chrome/Edge 默认配置矩阵。

本轮仅更新发布和验收文档；没有新增 VM 联网代码。LC-003、LC-004、LC-005 完整准入与 LC-006～015、VM-006/G0 均不能据此标记完成。

### 本轮新鲜回归

- `rtk proxy npm run test:browser-vm:connector`：18 / 18 通过，0 失败、0 跳过；使用授权的临时本机监听。
- `rtk proxy npm run verify:delivery-status`：28 / 28 通过，0 失败、0 跳过。
- `rtk proxy git diff --check`：通过。未重跑 VM 全套 120 项或完整应用构建；没有把历史结果当成本轮结果。
- 本轮未提交或推送上述文档变更；与已完成的独立静态预览发布分别记录。

## 有效配对授权后的真实握手（2026-09-12，Asia/Shanghai）

- 用户继续授权后，临时组件仅监听 `127.0.0.1:58772`，只允许固定来源 `https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev`；在该来源的 `/probe` 页面点击验证。
- 从本机控制页生成一个 30 秒一次性测试码，仅用于此次回环握手；不输出码值、不保存配对截图、不写入 URL 或持久存储。提交后 HTTPS 输入为空，控制页显示与自动化临时变量也已清空。
- 页面显示「握手成功；仅验证连接，不提供外网转发。」验证按钮禁用，断开按钮可用。
- 点击「断开 / 取消」后显示「已断开 / 取消，不会自动重试。」验证按钮恢复可用，断开按钮禁用，输入仍为空。
- 本轮未操作权限提示，未变更浏览器设置或安装扩展。随后停止临时组件并关闭本机控制页，没有留下常驻服务。
- 浏览器列表仅返回 Codex 内置浏览器。页面缩减 User-Agent 为 Macintosh / Chrome 151.0.0.0，不代表独立桌面 Chrome/Edge 完整版本，也不能由本轮未操作权限提示推断其默认权限行为。
- 本轮没有实测有效码重放、过期、已连接时组件退出、桌面 Chrome/Edge 允许/拒绝/撤回；先前无效码拒绝结果保留，不扩大为完整安全矩阵。没有 VM 出站转发、`apk` 安装或 Git 公网成功证据。

### 官方资料复核与剩余不确定性

- Edge 147 官方发布说明：`https://learn.microsoft.com/en-us/microsoft-edge/web-platform/release-notes/147`。正文记录初始稳定版 `147.0.3912.60`、2026-04-10 发布，并明确本地网络限制扩展至 WebSocket，适用于公共来源访问本地或回环地址；企业策略、站点设置和 flags 的豁免仍适用。本轮只读取说明，没有设置这些豁免。
- Chrome 官方入口：`https://developer.chrome.com/release-notes/147`、`https://developer.chrome.com/release-notes/148`。检索结果曾返回 WebSocket 限制与 local/loopback 权限拆分条目，但再次打开的完整正文未包含相应条目。不能把摘要或旧版正文直接当作当前 Chrome 支持契约，LC-002 保留开放。
- 因此内置浏览器成功仅证明此次实际连接路径；完整浏览器支持范围仍须官方版本证据与默认配置实测共同确认。

### 有效配对轮次的新鲜回归

- `rtk proxy npm run test:browser-vm:connector`：18 / 18 通过，0 失败、0 跳过；临时回环监听经授权执行。
- `rtk proxy npm run verify:delivery-status`：28 / 28 通过，0 失败、0 跳过。
- 本轮仅更新四份探针设计、计划、证据与使用文档，未更改运行代码，未运行完整应用构建或 VM 全套测试；没有新增提交、推送或部署。

## 桌面 Chrome 接入复查与提交交接（2026-09-12）

用户报告 Chrome 已连接后，浏览器接口两次返回 `Browser is not available: chrome`。插件自带只读诊断确认 Chrome 正在运行，本机通信配置存在且校验正常；扩展启用状态的诊断因系统 EPERM 失败，经授权重试仍失败。因此不能判断扩展未安装，也不能声称已完成 Chrome 配对或权限测试。没有修改浏览器设置、安装组件或绕过权限限制。

用户随后要求提交并清理工作空间。本次提交仅归档上述四份文档；Chrome/Edge 准入矩阵和正式联网仍保持开放，提交不等于推送或生产发布。


## 2026-09-29 Asia/Shanghai：解锁后改用自带浏览器

- 用户手动解锁后，原生工具确认桌面应用可见，锁屏不再是当前阻塞。只读版本页观察到 Chrome 153.0.8010.53，启动参数含 `--disable-features=LocalNetworkAccessChecks`，因此不将该实例作为默认安全配置验收证据；没有更改 flag 或重启用户浏览器。随后用户明确要求使用自带浏览器，本轮不继续操作 Chrome/Edge。
- 自带浏览器打开既有固定 HTTPS `/probe` 页面，页面报告 HTTPS 安全上下文；UA 显示 Chrome/154.0.0.0，但 UA 不等于完整浏览器版本或默认安全配置证明。未遇证书警告、未修改权限或安全选项。
- 经本机执行许可临时启动既有握手组件，仅监听 `127.0.0.1:52891`，唯一来源仍为既有 `40b8e0aa` HTTPS 预览。没有 TCP 转发、VM、宿主命令接口或生产绑定。
- 本机控制页生成一次性测试码后，自动填入的输入框 DOM 长度为 10，格式校验失败（协议要求 43 位），页面显示“请填写有效端口和一次性配对码”。使用非秘密合成输入也观察到相同长度问题。没有获得本轮成功握手；不能把此输入问题归因为浏览器网络权限拒绝，也没有证据判定服务端配对校验失败。
- 原码不记录、不截图、不写 URL 或仓库；控制页显示与 HTTPS 输入已清空，内存变量已释放。两页保留供用户手动生成新码并在 30 秒内完成配对，用户不需把码发送到聊天。临时组件本轮交接时保持运行，后续继续前须确认进程句柄仍存活，验收结束应停止。
- LC-002–005 / G0 仍开放；使用自带浏览器不自动替代原计划 Chrome/Edge 权限矩阵，也不证明 Linux / apk / Git / API 联网。本轮没有推送、部署、迁移或生产写入。


## 2026-09-29 Asia/Shanghai：手动配对成功与组件退出

- 用户在自带浏览器手动完成配对后，重新读取同一 HTTPS `/probe` 页的可访问性状态，确认显示「握手成功；仅验证连接，不提供外网转发。」；验证按钮禁用，断开按钮可用，一次性配对码输入框为空。不是仅依据用户粘贴文字判定成功。
- 本轮组件监听 `127.0.0.1:52891`；停止前核对监听 PID 12743 的启动命令为 `node tools/browser-vm/connector-probe/server.mjs https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev`，确认精确允许本页来源。
- 向该临时组件发送 SIGTERM 后，页面显示「连接已离线。需要手动生成新配对码后重新连接。」；验证按钮恢复可用，断开按钮禁用，码输入仍为空。进程会话随后退出码为 0，`lsof -nP -iTCP:52891 -sTCP:LISTEN` 无监听结果。未留下本轮常驻服务。
- 这是本轮成功状态与停止后离线状态的实测；未单独计时排除协议会话超时，也未在本轮点击「断开 / 取消」，因此不把观察扩大成所有断线原因或取消路径的验证。
- 本轮未记录配对码、修改权限或浏览器安全配置、读取生产秘密、推送或部署。此前自动输入格式问题已由手动配对绕过，不再是当前握手阻塞。
- LC-003 的自带浏览器连接路径获得新鲜成功证据；LC-004 获得组件停止后的离线观察。桌面 Chrome/Edge 完整版本及默认安全配置、权限允许/拒绝/撤回、有效码过期/重放与来源拒绝的原生矩阵仍未完成。G0/LC-002–005 总门槛不标记通过，D04 父项仍开放；没有 VM 出站转发或真实客体公网证据。


## 2026-09-29 Asia/Shanghai：LC-002 官方正文核对完成

本轮取得下列官方页面的正文，不再仅依赖搜索摘要：

- Chrome 147 发布说明：`https://developer.chrome.com/release-notes/147`。页面记录稳定版发布日期 2026-04-07；“Local network access restrictions for WebSockets” 明确本地地址 WebSocket 受 LNA 权限提示约束，并继续适用 `LocalNetworkAccessAllowedForUrls`、`LocalNetworkAccessBlockedForUrls`、`LocalNetworkAccessRestrictionsTemporaryOptOut` 企业策略。该结论是版本 147 的文档事实，不是本机 Chrome 153 或内置 UA 154 的实测。
- Edge 147 Web 平台说明：`https://learn.microsoft.com/en-us/microsoft-edge/web-platform/release-notes/147`。“Local Network Access restrictions for WebSockets” 同样明确本地地址 WebSocket 权限提示及上述三项企业策略适用。
- 旧 Chrome LNA 博客：`https://developer.chrome.com/blog/local-network-access`。其中“WebSockets 尚未受 LNA 约束”属于 Chrome 138 的已知限制段落，不能覆盖上述版本 147 的明确发布说明。没有启用博客中的实验 flag。

因此仅勾选连接器探针计划步骤 1 的“获得可核对正文、版本和权限行为”；先前正文获取失败的历史记录保留。LC-002 的运行实例完整版本/配置记录，以及 LC-003–005 的完整浏览器准入不因此通过。

当前具体下一步是默认安全配置的目标浏览器权限矩阵，不是再次要求用户完成已经成功的自带浏览器配对。用户当前指定使用自带浏览器；本轮没有擅自切换桌面浏览器、撤销权限、改启动参数或降低原计划验收范围。若继续保持此工具限制，则需用户明确调整目标浏览器验收范围，不能由代理自行跳过 G0 进入正式 VM UI/联网。


## 2026-09-29 Asia/Shanghai：桌面 Chrome / Edge 准入矩阵

### 授权、版本及默认检查

用户另行允许桌面 Chrome/Edge 的允许/拒绝/撤回测试及本机一次性码仅传至固定 HTTPS 探针；之后明确允许将 Chrome 的 Local Network Access Checks 从 Disabled 恢复 Default 并重启。没有重置全部 flags、安装/更新浏览器、添加证书例外、安装信任根或扩展。之前“仅自带浏览器可用”的状态已被本轮实测取代。

| 环境 | 完整版本及系统 | 相关安全配置证据 | 本轮边界 |
| --- | --- | --- | --- |
| 中断前 Chrome | 153.0.8010.53 arm64；macOS 27.0 / 26A428 | 主 LNA flag 恢复 Default 后重启；WebRTC/WebSockets/WebTransport 相关项也是 Default；重启按钮禁用；版本页不再含禁用 LNA 参数；策略页未设置政策；有效证书 | 实际权限提示“访问此设备上的其他应用和服务”；拒绝后连接不可用，允许后虚构码进入握手拒绝。与 154 的结果分开记录 |
| 恢复后 Chrome | 154.0.8037.58 arm64；macOS 27.0.1 / 26A434 | 上述四个相关 flags 均 Default；版本页仅 flag-switches 空边界及 restore-last-session；策略页各表未设置任何政策；站点安全面板“证书有效” | 版本和系统已在中断期间变化；代理未执行更新。下表成功/过期/撤回/退出属于这个实例 |
| 恢复后 Edge | 152.0.4191.53 arm64，Chromium 152.0.7977.65；同一 macOS 27.0.1 / 26A434 | 主 LNA flag Default，重启按钮禁用；版本页 flag-switches 空边界；Edge/precedence/extension 策略表未设置策略；“连接安全 / 证书有效” | 不沿用旧 Edge 146 记录，不宣称最新版本；仅此实例通过 |

固定来源仍为 `https://40b8e0aa.memory-garden-vm-connector-probe.pages.dev`，路径 `/probe`；临时组件仅绑定 `127.0.0.1:55157`，精确允许该来源，没有任何出站转发。全版本来自浏览器版本页，不以页面缩减 UA 代替。默认配置指本验收相关检查，不宣称整个用户浏览器配置/扩展/所有设置为出厂状态。

### 实际操作与结果

| 场景 | Chrome 154 | Edge 152 | 判断边界 |
| --- | --- | --- | --- |
| 明确允许 + 新生成一次性码 | 握手成功，输入清空，连接按钮禁用、断开按钮可用 | 同左 | 仅握手，不含 DNS/TCP/VM 出网 |
| 主动断开 | 已断开 / 取消，不会自动重试 | 同左 | 恢复可连接状态；未自动消费新码 |
| 已成功消费的同一码重放 | 握手被拒绝 | 握手被拒绝 | 测试变量随后清除，不保存码值 |
| 未消费码超过 30 秒 | 36 秒后提交被拒绝 | 72 秒后提交被拒绝 | 分别新生成的未消费码，非“已用码”的替代测试 |
| 阻止权限后的新连接 | 撤回后重载，新连接不可用；153 的初始提示拒绝另列上表 | 原生提示出现；提示消失时发生外部 UI 变化，不能声称代理点击“阻止”成功；随后明确站点开关 off + 重载，新连接不可用 | 权限归因来自实际开关操作，不来自普通 error 文案；没有无限重试 |
| 已连接时撤回权限 | 开关 off 后第 20.667 秒仍显示握手成功，浏览器要求重新加载；重载后新连接被阻止 | 开关 off 后第 15.578 秒仍显示握手成功，浏览器要求刷新；刷新后新连接被阻止 | **撤回浏览器权限不即时终止既有 WebSocket**，不能把该路径记录为立即断线通过 |
| 已连接时组件退出 | 核对监听进程后 SIGTERM；连接起算第 49.907 秒观察到离线，小于 60 秒会话期限；进程退出 0 | 新鲜连接后终端 Ctrl+C；第 27.102 秒观察到离线；命令包装层退出 1，不能写成正常退出 0 | 两者按钮均恢复可连接、断开禁用；不把停止后离线与自然超时混淆 |
| 组件未运行时再次连接 | 普通连接不可用，输入清空 | 同左 | 组件缺席来自已停止且端口无监听证据，页面仍诚实保留“原因未确定” |

Chrome 第一次撤回观察耗时约 80 秒，Edge 第一次退出观察为 70.721 秒，超过会话期限；这些尝试不能证明撤回或退出立即断线，已分别用上表有计时的独立尝试替代。操作中输错/未送达输入的尝试不计握手失败证据，未改变协议校验来迁就 UI 输入。

### 清理与限制

- Chrome、Edge 均将本测试来源的“设备上的应用”恢复为 off；不更改其他来源、系统代理或 OS 安全配置。Edge 本机控制标签清除显示后关闭，临时变量不保留码；没有点击保存密码。
- 本轮连接器均停止；最终 `lsof -nP -iTCP:55157 -sTCP:LISTEN` 无监听。没有常驻进程或后台安装。
- 正式授权不能依赖浏览器权限开关即时撤销现有连接。沿用 LC-006 的成员/环境/代次约束及有界租期，并单独验收显式撤销；不得把这次握手工具当作正式撤权实现。
- LC-002/003/004 在**准入探针层**关闭。LC-005 的真实 HTTPS 非允许来源拒绝仍待完成；协议 missing/null/foreign Origin 测试并不冒充浏览器矩阵。第一准入门、VM-006/G0 与 D04 父项仍开放，LC-006～015 尚未启动。

### 本轮新鲜本地回归

- `rtk proxy npm run test:browser-vm:connector`：18/18，通过；0 失败、0 skipped，包括真实回环端口冲突、缺失/null/非法 Origin、一次性码和退出资源回收。
- `rtk proxy node --test scripts/functional-checklist-audit.test.mjs`：9/9，通过；0 失败、0 skipped。
- `rtk proxy npm run audit:functional-checklist`：29 范围内 / 5 父项完成 / 24 父项剩余；不将新关闭的 LC 子项算成 D04 完成。
- 本轮仅更新证据与 checklist 文档；没有全应用构建、真实 Linux/公网验收、push、部署、迁移或生产写入。


## 2026-09-29 LC-005 非允许 HTTPS 来源拒绝补齐

- 页面仍为上文原 HTTPS 来源，没有新部署或访问其他来源。将临时组件的唯一允许来源设为保留值 `https://connector-origin-negative.invalid`，与真实页面 Origin 不匹配；不对该域名做 DNS 或浏览器访问。全部提交使用 43 个 `A` 的虚构码，不生成或传递真实配对码。
- Chrome 154：站点本地应用权限 on、重载后连接回环 `55157`，控制台明确显示 `Unexpected response code: 403`；页面诚实显示通用不可用并清空输入。
- Edge 152：权限 on、重载后连接回环 `55158`，控制台只显示通用 WebSocket failed，不能从 UI 单独推出 403。使用临时进程内只读观察包装器（不修改仓库服务逻辑）：观察 HTTP Server 的 upgrade 事件和原 socket.end 调用，原样委托；仅输出真实 Origin 是否等于授权测试页、路径是否为 `/probe` 两个布尔值以及固定 HTTP 403 结果，不打印请求头、码值或用户数据。同次点击后输出：

  ```text
  {"event":"upgrade-observed","expectedTestPage":true,"probePath":true}
  origin-negative-response: HTTP 403
  ```

- 这证明真实 Edge 请求到达组件并被拒绝，不把浏览器预拦截误作服务端 Origin 校验通过。此前 Edge 55157 的纯通用错误不单独计为 403 证据；输入未送达的一次尝试不计结果。
- missing/null Origin 不通过伪造浏览器请求验收，仍由真实回环协议测试覆盖；未配对/过期/重放结合本节前的浏览器矩阵与协议回归。探针没有出站拨号能力，拒绝发生在 WebSocket 升级前。
- 完成后两浏览器该来源“设备上的应用”恢复 off 并重载，DevTools 关闭；两个临时进程 Ctrl+C 退出（包装层状态 1）；`lsof -nP -iTCP:55157 -iTCP:55158 -sTCP:LISTEN` 无监听。没有持久诊断修改、后台进程、push、部署或生产变更。
- **LC-005 完成，第一连接准入门 LC-002～005 完成；下一步允许 LC-006 本地正式授权契约。** LC-006～015、完整 VM-006/G0 与 D04 仍未完成。上节“来源待补”是此前检查点，不再代表当前阻塞。
- 本节后新鲜回归：连接器首次受沙箱 `listen EPERM` 阻止，不计通过；获准重跑后 18/18、0 skipped。checklist 审计测试 9/9，父项实算 29/5/24，`git diff --check` 通过。
