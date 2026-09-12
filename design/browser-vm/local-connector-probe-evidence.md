# 本机连接器首个切片：本地证据

实现日期：2026-09-11。实现基线：本地 main / c340540，继承 387ee77。用户指令：「按照 checklist 顺序实现」。原实现轮次未提交、推送或部署；后续已提交为 `7f2efeb`。2026-09-12（Asia/Shanghai）独立预览发布进展见文末。

## 状态边界

- LC-001：已确认方向，保持完成。
- LC-002：部分资料已核对，保持开放。2026-09-12 已读取 Edge 147 官方发布说明中的 WebSocket 本地网络限制；Chrome 检索摘要与再次打开的发布说明正文不一致，尚未据此确定完整支持版本和当前权限范围。详见文末，历史访问失败不再代表所有官方资料均不可用。
- LC-003：部分真实证据完成。2026-09-12 独立 HTTPS 验收页面在内置浏览器使用有效一次性码握手成功，并主动断开。桌面 Chrome/Edge 默认配置、完整版本与权限矩阵仍开放。未修改生产站点，没有证书豁免、安全开关或本机信任根安装。
- LC-004：部分工具行为完成。自动化已覆盖端口占用、会话超时、组件关闭与客户端取消；实际浏览器权限允许/拒绝/撤回及完整诊断仍待 HTTPS 场景验证。普通 error 不能推断具体原因。
- LC-005：探针级自动化完成，内置浏览器 HTTPS 无效码拒绝已验证；真实浏览器过期、重放、非法来源等完整矩阵仍开放，不是正式账户授权。
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
