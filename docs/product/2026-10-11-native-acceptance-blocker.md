# 原生浏览器验收环境阻塞（本地）

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `1cd1ec0b09e11c561501f669a535813c6741297b`。

## 范围与现状

本记录如实记录一次**原生浏览器验收尝试失败**的过程与原始观察：目标是核对 [功能清单](./2026-09-12-personal-workbench-completion-audit.md) 中 D06 的 320/375/768/1280 × 中英文 × 浅深主题 + 键盘矩阵（并顺带确认 D05/D04 的原生入口），在本地 `wrangler dev`（本地 D1 迁移至 0061、本地植入会话）上执行。**环境不具备所需原生浏览器能力**，因此 4 个必需宽度与相应矩阵在此无法被执行。

本记录**不改变任何 checkbox**：主清单原 30 父项、D08 排除后范围 29、关闭 5、开放 24 不变（D08 排除）。**未 push、未部署、未 `wrangler ... --remote`、未远程迁移 D1、未写入任何 secrets**；未修改源码、测试或迁移。本记录**不构成 D05/D06/D04 任何验收**，不得被引用为通过证据。

## 已尝试的本地栈

- `npx wrangler d1 migrations apply memory-garden-control-plane --local` 应用 0001–0061（本地 D1）。
- `npx wrangler dev --port 8787` 在本地同时提供 Worker 与 `frontend/dist` 静态资源；本地绑定为 `DB`、`KNOWLEDGE`、`AGENT_SESSIONS`、`MAINTENANCE`。
- 直接在本机 D1 植入一条会话：`members` 行（role admin）＋ `auth_sessions` 行，其 `token_hash` = 一个 43 字符 base64url token 的 SHA-256 十六进制。
- `GET /api/session`（带 `Cookie: __Host-memory-session=<token>`）返回 **200**，`permissionMask` 为 `"0x37ffff"`；`GET /api/navigation` 返回 **200** 与菜单树。

以上均为本地事实；会话为**合成会话**，不是任何真实账户或真实身份旅程。

## 原始观察（本次会话实测）

- 本环境可用的浏览器后端是 cmux / WKWebView 面板：`tab.setCookies()` 抛出 `ToolError: tab.setCookies() is not supported on the cmux backend`。
- 即使指定 `app: { tern: false }`，仍落在 cmux 后端打开（环境内**无可用 Chromium**）。
- 因此改用本地透传代理作为唯一可行 harness：`Bun` 服务器监听 `127.0.0.1:8788`，转发至 `127.0.0.1:8787` 并注入会话 cookie。
- 经该代理，真实浏览器渲染出已认证工作台外壳：
  - `<title>个人工作台 · Personal Workbench`；
  - `nav` 存在，`nav a[href^="/"]` 共 **22** 个链接；
  - `[data-route-id]` 共 **21** 个值，含新注册的 `calendar`、`today`、`focus`、`review`、`environments`、`graph`；
  - `document.documentElement.scrollWidth - innerWidth = -17`（在当前面板实际宽度下无横向溢出）；
  - `localStorage` 中存在 `memory-garden-theme`；
  - 外壳暴露按钮 `收起侧栏`、`AI 知识库 expand`、`治理 expand`、`账户菜单：native-admin@example.com`、`命令面板`。

## 环境阻塞（关键，导致 D06 无法执行）

- **视口仿真无效**：`tab.emulate({ viewport: { width: 320/375/768/1280, height: … } })` 在所有单元格里 `window.innerWidth` 恒为 **596**，未随请求宽度变化。D06 要求的 4 个宽度在本环境**无法被真正驱动**。
- **重载后不重渲染**：一次 `tab.reload()` 之后，SPA 在随后每个单元格里都不再渲染（`body` 文本为空、导航链接数 **0**）。
- 结论：本环境只能提供 cmux/WKWebView 单一视口，无法满足 D06 的宽度 × 语言 × 主题 × 键盘矩阵。

## 达成与未达成

- **达成（有限）**：在本地搭起 Worker + 前端 + 本地 D1 + 本地合成会话，并经透传代理让**真实浏览器**渲染出已认证工作台外壳（上节观察值）。这证明本地栈可被真实浏览器加载，但**不是任何验收**。
- **未达成**：D06 要求的 320/375/768/1280 四个宽度未被执行；语言/主题/键盘矩阵未执行；D05 的真实身份正向与越权旅程、D04 的正式入口/原生验收均未取得证据。

## 必须的解锁（无变通余地）

- 原生验收必须在**用户环境**中完成：用户自己的桌面 Chrome/Edge（以及涉及身份旅程时，用户的**真实且已加入 allowlist 的账户**）。
- D04 的 G0 同样需要用户**手动解锁**目标桌面后，在目标桌面浏览器上完成验收。
- 本记录**证明 D05/D06/D04 均未通过验收**，不得被引用为其中任何一项的验收证据。

## 清理

- 已从本地 D1 删除植入的 `members` / `auth_sessions` / `role_members` 行。
- 已停止透传代理与 dev server。
- 已移除 `/tmp` 下的临时文件。
- 未部署、未 push、未远程迁移；未触碰生产数据。

## 明确非声明

- 本会话使用**合成本地会话**，不是真实身份，不构成 D05 或任何身份旅程验收。
- 本记录**不构成 D06** 的 320/375/768/1280、双语、深浅主题或键盘/触控矩阵验收。
- 本记录**不构成 D04 / G0** 的正式入口或原生验收。
- 未发布、未部署、未远程迁移、未写入 secrets。
- 父项计数不变：原 30 / 范围内 29 / 关闭 5 / 开放 24，D08 排除，**未翻转任何 checkbox**。
