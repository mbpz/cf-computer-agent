# A06：顶部未读摘要接线与本地验证

日期：2026-10-01。基线：`daa38a5`，分支 `codex/functional-checklist-completion`。

## 已实现的既定功能

- [x] 正式 `AppShell` 顶部通知入口消费现有 `/api/notifications/summary`，只显示通过严格响应校验的服务端未读数；加载中、失败、撤权与真实 0 明确区分。
- [x] 单条/批量已读调用结束（包括未知结果和异常回执）发布无载荷失效信号；Shell 重新 GET，不推测减一，不自动重放 POST。原先未决 GET 被取消，晚到结果忽略。
- [x] 导航、窗口重新聚焦、页面重新可见时刷新；并发 focus/重试合并。无定时轮询、无后台实时推送承诺。另一个标签页的变更在此页重新聚焦/可见时重新读取，不宣称跨窗口实时广播。
- [x] 成员/角色/权限作用域变化立即隐藏旧计数；退出开始取消读取并清除数字。401/403 清除数字并在同一身份作用域内锁定，不因导航或 focus 偷偷重试。
- [x] effect 清理取消请求、移除焦点/可见性事件及失效订阅；旧响应不得写回当前作用域。只读重试按钮独立于通知链接，中英文状态与可访问名称齐全。

## TDD 与验证

- 首轮在未接线基线上新增 9 个反例，9/9 失败，原因是 Shell 无摘要读取/状态及联动。
- 最终新增 13/13 测试：真实 React AppShell + happy-dom + Response；其中一个测试同时挂载现有 NotificationsRoute，点击真实已读按钮，验证双击一次 POST、列表变为已读、顶部以 GET 权威结果更新为 0。
- 11 文件 118/118 回归：Shell、通知数据/页面/路由、响应式、首页既有视图、认证边界、App 路由、通知服务及本地 Worker/D1 通知测试。
- `npm run typecheck` 通过。
- `npm run build:ui` 通过，既有大 chunk 提示保留，VM 构建隔离通过。
- `npm run test:i18n` 13/13；`npm run verify:i18n` 通过。
- `npm run audit:functional-checklist` 和计数器测试仍按 canonical 父项统计，不以本批子项替代父项关闭。

这些是本地 DOM/Response 和本地 Worker/D1 证据，不是真实登录、原生浏览器、移动/键盘或生产验收。

## 剩余条件和下一步

- [ ] A06 首页 `HomeRoute` 的部分读取失败仍被回退为空数组/缺省计数；需改为真实不可用状态，并补请求取消、身份边界及恢复测试。顶部摘要接线不解决该独立缺口。
- [ ] 完整原生浏览器双身份/退出、键盘/移动端、前后台切换功能验收。当前浏览器锁屏阻塞未解除，未换用其他控制通道。
- [ ] A06 与 C05 父项保持开放；完整功能清单仍为 **29 范围内 / 5 已关闭 / 24 未关闭**。

下一允许步骤：继续修复上述首页摘要失败/清理缺口；不依赖桌面解锁。原生 VM-029/VM-033 验收保留待办。

未推送、未部署、未执行远程迁移、未访问 GitHub、未读取 SECRETS_FILE、未改现有预览、未添加加密或备份。测试框架沿用既有本地配置；测试未调用远程 AI。

## 后续更新：2026-10-01 首页摘要恢复

上节记录的是本批提交时的剩余项。随后首页部分失败与清理缺口已本地实现并验证，见[独立证据](./2026-10-01-home-summary-recovery-evidence.md)：实际 App 路由15/15、12文件117/117，类型/UI构建与双语检查通过。此更新不替代原生验收，A06 仍开放，父项计数仍为29/5/24。

## 2026-10-11 增量：通知摘要 focus/可见性重读覆盖

日期：2026-10-11。分支 `codex/functional-checklist-completion`。范围：`frontend/lib/use-notification-summary.ts` 的跨标签重读触发（A06 声称的"跨标签在重新聚焦/可见时读取"）。

### 为什么是确定性覆盖而非原生验收

尝试在原生环境验证时不可行：无头 Chrome 报告 `document.visibilityState === "hidden"`，且 `Page.bringToFront` 既不派发 `focus` 也不派发 `visibilitychange`。因此无法用真实浏览器触发本 hook 的两个重读入口，改为在 Happy DOM 中确定性地锁定行为。**这不是原生验收**：真机前后台切换、跨真实标签页、真实身份仍未证明。

### 新增测试

新增 `test/unit/frontend-notification-summary-refresh.test.tsx`（5 个 `it`，其中 401/403 用例 `it.each` 展开 2 例，共 6 通过）。断言：

1. `window` 的 `focus` 事件恰好触发一次新的 `GET /api/notifications/summary`。
2. `visibilitychange` 仅在 `document.visibilityState === "visible"` 时触发新请求（`"hidden"` 时断言无请求）。
3. 通知摘要失效事件（订阅路径）在请求在途时强制一次失效刷新：在途请求被 abort/取代（`current !== controller` 守卫），晚到的旧响应不被应用。
4. 卸载后 `focus` / `visibilitychange` / 订阅均不再产生请求。
5. 401/403 后摘要保持 `forbidden`，且在同一 scope 内抑制后续刷新（`deniedScope`）。

### 变异检出（每条断言先红后绿）

对 `frontend/lib/use-notification-summary.ts` 施加最小变异，运行新测试，捕获失败行，然后逐字节还原。

| 断言 | 变异 | 观察到的失败 | 还原 |
| --- | --- | --- | --- |
| 1 focus 重读 | 删除 `window.addEventListener("focus", focus);` | `expected [...] to have a length of 2 but got 1` @ 测试第 67 行 | 还原后 6/6 通过 |
| 2 仅可见 | `const visibility = () => { refresh(); };`（去掉 `=== "visible"` 守卫） | `expected [...] to have a length of 1 but got 2` @ 测试第 73 行 | 还原后 6/6 通过 |
| 3 失效刷新 | `const unsubscribe = () => {};`（移除 `subscribeNotificationSummary` 注册） | `expected [...] to have a length of 2 but got 1` @ 测试第 80 行 | 还原后 6/6 通过 |
| 4 卸载清理 | **仅删**去 `unsubscribe(); window.removeEventListener(...); document.removeEventListener(...);` 三处拆除 | 未检出（6/6 通过）：`disposed` 标志在 `refresh` 内独立拦截卸载后事件，故单独删除拆除不可观测 | 已还原 |
| 4 卸载清理（更强） | `return () => {};`（整段清理置空，含 `disposed`) | `expected [...] to have a length of 1 but got 6` @ 测试第 89 行 | 还原后 6/6 通过 |
| 5 401/403 抑制 | 从 `refresh` 守卫移除 `deniedScope.current === scope` | `expected [...] to have a length of 1 but got 3` @ 测试第 96 行（401 与 403 各一例） | 还原后 6/6 通过 |

变异后 `frontend/lib/use-notification-summary.ts` 已逐字节还原（`git diff --stat -- frontend/lib/use-notification-summary.ts` 为空，SHA-256 `18bdc1937b6300957aa3acc9d8ef488bbe7e3018ced491cce47839cfc7d84664`）。

说明：断言 4 的"仅删拆除"变异未被检出，是因为 `disposed` 与监听器拆除共同守卫同一可观察契约；更强的"清理置空"变异证明测试确实锁定"卸载后无请求"。产品代码未改动。

### 非声明

- 这是**本地确定性覆盖**，不是原生/D05/D06 验收，也不代表真机跨标签或真实身份验证。
- 未改现有测试断言；未改产品代码（仅临时变异并还原）。
- 完整功能清单计数不变：**29 范围内 / 5 已关闭 / 24 未关闭**；D08 不计入。
- 未推送、未部署、未执行远程迁移、未使用远程 D1、未读取任何密文。
