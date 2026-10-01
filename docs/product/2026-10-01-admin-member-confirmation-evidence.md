# A05 / R2-008：成员访问变更确认的本地证据

日期：2026-10-01。基线 `6193673`，分支 `codex/functional-checklist-completion`。

## 执行既有设计的范围

执行既有产品成熟度设计的 ConfirmAction 及管理页危险操作确认要求。本轮只接入成员启用/禁用，不将整个管理端或 R2-008 标为完成。

- [x] 新共享 ConfirmAction 复用既有 Dialog/focus-scope，提供目标/影响说明、关联标题和描述、取消与显式确认。成员页默认聚焦取消，Escape/取消/遮罩均不写入，Tab 在弹窗内循环；背景成员列表设置 inert/aria-hidden。
- [x] 启用与禁用均需确认，显示邮箱或成员 ID，说明启用沿用现有权限、禁用拒绝受保护访问而非删除数据。文案对应当前 members/service、repository 与 identity/session 行为；没有宣称中断已在执行的请求。
- [x] 确认绑定打开时的列表、成员 ID/邮箱/状态、筛选和页码。列表替换、目标状态/角色变化、读取/该行写入 pending、加载或拒绝访问后失效；卸载清除，旧按钮不得提交。
- [x] 确认前同步消费意图，连续点击只调用一次写入。继续使用既有路由的行级锁、未知结果先权威 GET、401/403 清空和迟到回执隔离；不新增自动 PATCH 重放。
- [x] 正式 App 的成员路由以成员/角色/权限快照作为 key，作用域改变时不复用旧确认。路由卸载/重新挂载的丢弃行为有 DOM 测试；不声称真实双账号已验收。
- [x] 新增确认文案提供中英文。未修改 API、数据库或既有分页/回读语义。

## TDD 与本地验证

先新增 12 项组件测试，未实现时 11 项失败、1 项通过，明确复现点击直接写入及缺少弹窗的问题；实现后全部通过。另新增 3 项真实路由/Response 边界测试：取消不 PATCH、明确确认后 PATCH→GET、导航/卸载丢弃未确认操作。原有成员未知结果、并发、分页和权限回归改为显式确认后再验证原断言。

```sh
rtk proxy npx vitest run test/unit/frontend-admin-member-confirmation.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-admin-pages.test.tsx test/unit/frontend-focus-scope.test.tsx test/unit/members-service.test.ts test/worker/members.test.ts test/unit/frontend-auth-boundary.test.ts test/unit/frontend-app-routes.test.ts test/unit/frontend-shell.test.tsx test/unit/frontend-responsive.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy npm run audit:functional-checklist
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
```

结果：联合 **10 文件 146/146**；类型检查、UI 构建和 VM 构建隔离通过；i18n **13/13** 及静态检查通过；checklist **9/9**。UI 构建保留既有大 chunk 警告。Worker 测试为本地 D1/契约，新增交互为 React/happy-dom/网络模拟；没有调用远程 AI，也不是原生浏览器验收。

## 未完成与后续

- A05 的逐页危险操作、表单 dirty/pending 与全部二级操作枚举仍未完成；ConfirmAction 仅成员页已迁移，其他管理页继续逐项核对。
- 原生浏览器键盘、触控/窄屏、暗色及双身份需在设备解锁并能安全控制后执行；本轮未绕过锁屏限制。
- 当前总表 **29 范围内 / 5 完成 / 24 未完成**，D08 已排除。A05 和 R2-008 父项保持开放。
- 下一允许：继续 A05 其他管理页既定确认/dirty/异步缺口核对；本地工作无新增阻塞。原生验收仍有设备访问阻塞。
- 仅本地实现、验证、提交；无 push、部署、远程迁移、GitHub 重试、SECRETS_FILE 读取、备份或加密。现有独立预览未更新。
