# 发布后只读核验（生产）

- 日期：2026-10-11
- 目标：`https://memory.crgmhrc.asia/`（Cloudflare 托管；用户已将本轮工作并入 `main`，由其流水线自动发布）
- 性质：**只读**核验。未使用任何登录会话；未对生产数据做任何写入/删除；未执行远程迁移或部署。

## 产物一致性（关键）
线上首屏引用的产物与我在本分支 `HEAD` 本地构建的 `frontend/dist` **逐字节一致**：

| 产物 | 线上 sha256(前 12) | 本地构建 sha256(前 12) |
| --- | --- | --- |
| `assets/index-BpYetGvB.js` | `b75c48e58b8f` | `b75c48e58b8f` |
| `assets/index-BsQmnhdo.css` | `f6b14b39028c` | `f6b14b39028c` |

即：**已发布前端 = 当前源码的构建**，非旧版本或缓存残留。

## 未认证边界

| 端点 | 状态 |
| --- | --- |
| `/api/navigation` | `401` |
| `/api/tasks` | `401` |
| `/api/admin/menus` | `401` |
| `/api/session` | `401` |

`/api/navigation` 的 401 响应体为结构化错误，无数据泄露：
`{"error":{"code":"AUTH_REQUIRED","message":"Authentication required","retryable":false,"requestId":"…"}}`

## 传输与响应头
- `http://memory.crgmhrc.asia/` → `301`，`Location: https://memory.crgmhrc.asia/`。
- 首屏 200 头：`content-security-policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`；`x-frame-options: DENY`；`x-content-type-options: nosniff`；`referrer-policy: no-referrer`；`cache-control: no-store`；`server: cloudflare`。
- API 响应：`cache-control: no-store`，且未见 `cf-cache-status`（未被缓存）。
- SPA 外壳：`<html lang="en">`、`<meta name="color-scheme" content="light dark">`、`<meta name="theme-color" content="#0f172a">`、`<link rel="manifest" href="/manifest.webmanifest">`、`<title>个人工作台 · …`。

## 观察（未改任何配置，待用户决定）
- **响应中无 `strict-transport-security`（HSTS）**。生产是否需要 HSTS 属策略决定：可由 Cloudflare 仪表盘开关，或由应用在响应头中下发。此处仅登记事实。

## 明确非声明
- **不是 D08 验收**：部署由用户流水线执行，我未获授权也未执行迁移/部署；回滚点应为已合并的 `main` 提交与其前一个已发布版本，本轮未记录。
- **未核验远程 D1 迁移状态**：`0060` 的菜单行是否已在生产库应用，需要已登录会话读取 `/api/navigation` 才能判定——本轮无会话，故不声称。
- 未做任何真实身份旅程（D05）与写入类验收。
