# A05 / R2-008 目标与项目状态确认本地证据

日期：2026-10-02（Asia/Shanghai；测试跨 10-01 午夜）。基线：`74bbb16`，分支 `codex/functional-checklist-completion`。

## 本轮实际完成

- Goals / Projects 的完成、归档、恢复复用共享 ConfirmAction。显示标题+ID（空标题用ID）、状态前后值以及实际影响；归档保留数据/关联，恢复固定为进行中，完成不会自动修改进度或关联实体的状态。
- 取消默认焦点、Escape/遮罩取消、键盘焦点约束和返回触发按钮。打开确认不写入、不创建恢复记录；底层 section inert，表单/分页/行操作锁定。创建草稿不因确认打开/取消被清空。
- 确认同步消费一次，多行同批次请求不能更换目标。列表、分页/页大小、成员、loading/error、pending、创建锁、关系编辑或回调消失使旧确认失效；卸载后不恢复。项目摘要独立更新不会误清除同一列表确认。
- 仍把原始目标对象和 `updatedAt` 交给既有 App 路由，不改 CAS 请求或未知写持久化协议。409 重读不自动重放；未知结果仍只读恢复；配额失败仍阻止 POST。
- 回归发现确认触发与创建提交同批次执行仍可能创建；新增 `isSubmitBlocked` 在创建意图/写入前同步拒绝，避免产生多余持久化意图。目标进度也不能从确认底层同批次发起。

## 测试过程与证据

新增46项目标/项目 DOM测试、2项真实 App取消/离开零写入测试；更新原有冲突/未知写/创建竞态测试，保留原断言并显式执行确认。

- 初始 RED：45项中41失败/4通过，失败来自缺失确认和直接写入。
- 后续真实 App竞态 RED：创建测试2项失败，证明打开确认后仍会发创建请求；同步提交门禁后通过。
- 测试环境修正：happy-dom/Node不加载 React浏览器输入插件，草稿输入改用现有测试惯例调用真实 onChange，并先断言真实受控值；未改生产事件逻辑。
- 联合回归发现目标关联夹具把 Shell `/api/notifications/summary` 当关联回读，导致5条计数失败；增加独立摘要响应与精确关联路径断言，未放宽原读写次数。

```sh
rtk proxy npx vitest run test/unit/frontend-planning-status-confirmation.test.tsx test/unit/frontend-planning-conflicts.test.tsx test/unit/frontend-planning-write-recovery.test.tsx test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-planning-numbered-pages.test.tsx test/unit/frontend-planning-create-reload.test.tsx test/unit/frontend-project-relations.test.tsx test/unit/frontend-goal-tasks.test.tsx test/unit/frontend-goals-page.test.tsx test/unit/frontend-projects-page.test.tsx test/unit/frontend-planning-write-receipts.test.ts test/worker/planning-conditional-writes.test.ts test/worker/goals.test.ts test/worker/projects.test.ts test/unit/frontend-focus-scope.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy git diff --check
```

最终联合 **15文件293/293**；项目typecheck、UI构建/VM模块隔离通过；双语合同 **13/13**、静态扫描通过；清单审计测试 **9/9**。日志：`/tmp/a05-planning-status-{red,routes,final,typecheck,build,i18n,i18n-static,audit-test,audit}.log`。保留既有 Vite大chunk与Workerd AI binding告警，没有真实AI请求。typecheck配置不覆盖全部frontend TSX，不宣称全前端独立静态类型验收。

## 边界与下一步

- **29范围内 / 5完成 / 24未完成**，A05 / R2-008仍开放。这是48项新增自动化用例，不是48个完成的功能父项。
- 本轮是本地React/happy-dom、模拟网络响应及本地Worker/D1验证，不是原生浏览器/生产验收。未知写对账沿用原实现，未新增业务端点或迁移。
- 全站dirty离开/刷新、其他危险操作、原生键盘/触控/双身份旅程仍开放；下一允许继续 A05 收件箱归档/恢复及转任务的确认缺口。本地实现没有阻塞；先前原生浏览器锁定未被绕过。
- 仅本地实现、测试、文档与提交；没有push、部署、远程迁移、真实AI调用、GitHub网络重试、SECRETS_FILE读取、备份或加密。独立预览未变。
