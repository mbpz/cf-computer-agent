# 本机连接器首个切片：本地证据

日期：2026-09-11。基线：本地 main / c340540，继承 387ee77。用户指令：「按照 checklist 顺序实现」。本轮未提交、推送或部署。

## 状态边界

- LC-001：已确认方向，保持完成。
- LC-002：开放。Web 检索与直接打开 Chrome 官方 `local-network-access` 页面未返回正文；本地 curl 首次 DNS 失败，经授权重试连接约 5 秒超时。浏览器直接访问约 35 秒超时。未据旧知识推断最新 WebSocket / 本地网络权限支持。
- LC-003：开放。用户已授权独立 HTTPS 验收预览，但发布凭据过期，尚无已部署的验收页面；未修改生产站点，没有证书豁免、安全开关或本机信任根安装。
- LC-004：部分工具行为完成。自动化已覆盖端口占用、会话超时、组件关闭与客户端取消；实际浏览器权限允许/拒绝/撤回及完整诊断仍待 HTTPS 场景验证。普通 error 不能推断具体原因。
- LC-005：探针级自动化完成，真实 HTTPS 拒绝路径仍开放；不是正式账户授权。
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

## 新鲜自动化结果

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

用户已授权一个独立有效证书 HTTPS 预览页，仅发布 `probe.html`、`page.mjs`、`client.mjs` 并配置固定安全响应头。待本机 Cloudflare 重新登录后发布，再通过 LC-002～005，之后实现 LC-006 的成员/环境/连接器/代次授权。部署边界、手动运行方式和权限矩阵见工具 README；不复用生产发布许可。

## 授权后发布检查（2026-09-11）

- 当前本地分支仍为 `main`，领先 `origin/main` 两个提交；本次未提交、推送或部署，保留现有改动。
- 已核对生产 `wrangler.jsonc`，本次预览不使用其自定义域名、运行代码或资源绑定。
- Web 文档工具仍未返回正文；直接抓取在沙箱内 DNS 失败后，经授权成功读取 Cloudflare 官方 Direct Upload 文档（`https://developers.cloudflare.com/pages/get-started/direct-upload/index.md`，页面标记更新日期 2026-04-21），支持后续采用独立 Pages 项目和显式预览分支。此结果不代表 Chrome 官方权限说明已核对。
- 本地 Wrangler 为 4.119.0；经授权执行只读身份检查，返回：`Not logged in. Your auth token has expired and could not be refreshed, and the environment is non-interactive.`
- 因需要用户重新完成交互登录而暂停，未尝试读取 `.dev.vars` / `SECRETS_FILE`、寻找替代凭据或修改生产配置。用户可在本机项目终端运行 `rtk proxy npx wrangler login`，无需向聊天发送令牌。
- 尚未调用项目创建或部署命令，尚未验证真实 HTTPS 握手。本段没有重新运行上文实现轮次的测试，历史测试结果不作为本次新鲜验收结果。
