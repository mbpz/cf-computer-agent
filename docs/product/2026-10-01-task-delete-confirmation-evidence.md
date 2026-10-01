# A05 / R2-008：任务删除确认

日期：2026-10-01。基线 `13279d9`，分支 `codex/functional-checklist-completion`。

## 本轮交付

- [x] TasksPage 的删除入口接入共享 ConfirmAction。显示准确标题及 ID（空白标题回退 ID）、永久删除且无法撤销的影响；从当前 repository/service 与任务迁移核对：删除任务及其关联/标签，不删除关联知识内容。未改服务端 DELETE 协议。
- [x] 默认焦点在取消，取消/Escape/遮罩零写入、恢复触发器焦点；Tab 困在弹层，底层任务区 inert。中英文文案均验证。
- [x] 确认前仅捕获当前列表目标；确认时同步消费一次，同批次双击只调一次。多行不能替换已捕获目标，同批次底层 Complete 不会穿透为第二个写入。
- [x] 新列表、移除目标、分页/页大小、尚未提交的过滤输入、读取 pending、其他操作/编辑器锁、读取失败、错误/加载页、失去 handler、卸载均使旧确认失效，不在恢复后复活旧确认。无关重渲染不会关闭仍有效确认。
- [x] 真实 TasksRoute 仍执行目标 DELETE；pending 锁住所有任务写入；成功后回读及空页回退不变。401/403 清空受保护任务，恢复只 GET；成功删除后回读失败禁止再次对陈旧列表发起删除，直到显式 GET 恢复。
- [x] 网络失败不自动重放删除，再次操作必须重新确认。本轮没有新增结果对账或持久化重放，不能将失败视为已删除或未删除。

## TDD 与验证

新增组件测试22项、真实路由测试6项，共28项。旧实现首次执行组件用例 **21失败/1通过**：直接删除、无确认、无过期失效及读取 pending 时仍可删除；改动后全部通过。首次受限执行遇到本地 listener/log EPERM，授权后重跑才获得 RED。路由测试首轮有一个不符合既有 ID 格式的 fixture（含 `/`）触发讨论链接校验，改用合法 `second-id`，未放宽生产校验。

既有空页回退测试增加显式确认与确认前零 DELETE 断言，保留原来的页码、过滤及回读次数断言。真实路由新增测试覆盖：同名目标、取消、单次网络请求、pending、401/403、浏览器历史读取期间失效、成功后读取失败与网络异常不自动重放。

```sh
rtk proxy npx vitest run test/unit/frontend-task-delete-confirmation.test.tsx test/unit/frontend-tasks-route.test.tsx test/unit/frontend-tasks-page.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/frontend-task-editor-route.test.tsx test/unit/frontend-focus-scope.test.tsx test/unit/frontend-auth-boundary.test.ts test/unit/tasks-service.test.ts test/worker/tasks.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy git diff --check
```

联合 **9文件133/133**；项目类型检查、UI构建及VM模块隔离通过；双语测试 **13/13**、静态扫描通过；清单审计测试 **9/9**。保留既有 Vite 大 chunk 和 Workerd AI binding 告警；无真实 AI 请求。这些是 React/happy-dom、模拟 Response、本地 Worker/D1 证据，不是原生浏览器或生产验收。项目 typecheck 的配置不覆盖全部 frontend TSX，不宣称全前端独立静态类型验收。

## 边界与下一步

- **29范围内 / 5完成 / 24未完成**，A05 / R2-008 父项保持未完成，C01 原生旅程不提升。
- 只确认当前客户端列表快照，服务端既有删除按成员/ID校验，并非跨标签版本 CAS；本轮未扩展其协议。网络未知结果仍采用既有错误提示，无自动重试，不宣称完成未知写对账。
- 其他页面危险操作、全站离开/刷新 dirty 保护、原生键盘/触控/双身份旅程仍开放。下一步允许继续 A05 目标/项目状态变更等尚未确认的业务操作。
- 仅本地实现、测试、文档与提交。没有 push、部署、远程迁移、真实 AI 调用、GitHub 网络重试、SECRETS_FILE 读取、备份或加密，独立预览未变；未访问/绕过先前锁定的原生浏览器。
