# A05 / R2-008 日程取消确认本地证据

日期：2026-10-02（Asia/Shanghai）。基线：`74db1af`；分支：`codex/functional-checklist-completion`。

## 实际完成

- 替换原页面内非模态确认，使用共享 ConfirmAction。确认显示标题与 ID、原始时区的开始/结束时间，以及仅标记已取消、不删除、不更改关联任务/项目/专注会话的真实影响。会话管理的日程须通过专注会话更改；本轮没有放开服务端对应限制。
- 默认保留日程焦点，Escape/遮罩/保留均零写入并返回触发按钮；Tab 环绕，底层 inert，范围、分页、行操作和创建互斥。
- 首次决定同步占位，确认先消费再交回原始事件及 updatedAt。列表/版本/分页/范围/成员/写锁/loading/error/处理器消失与卸载使旧确认失效，原列表恢复后也不自动复活；相同范围值的新对象不误撤销确认。
- 保留新建草稿和既有未知创建恢复例外。新增同步 isSubmitBlocked 门禁，阻止打开取消确认后同批次创建持久化意图或 POST；底层按钮禁用不再是唯一保护。
- App、服务层、Repository 与 API 协议未改：原 CAS、写前恢复标记、owned GET 对账与未知回执只读恢复均保留。没有以弹窗测试替代真实写入链验证。

## 实测结果

新增 **21项 DOM测试 + 3项真实 App 路由测试**，另增强既有丢失取消回执测试的重复确认断言。

- 初始 RED：21项中19项失败、2项通过，暴露精确目标/焦点/旧确认复活、同批次范围与创建穿透等缺口。最小修复后21/21通过。
- 页面 + App阶段35/35；取消/外部路由离开/范围变化无 DELETE、无取消恢复标记；同批次创建无额外 POST/创建意图；原始版本、只发一次 DELETE、丢失回执/跨卸载恢复只读均通过。
- 最终联合 **14文件163/163**，包括本地 Worker/D1 的日程取消和专注关联修复回归。
- 项目 typecheck、UI构建及VM静态隔离、i18n合同13/13与静态扫描通过。项目tsconfig不覆盖全部frontend TSX，不宣称完整前端静态类型验收。
- 测试夹具独立处理 Shell 通知摘要请求，未弱化既有断言。保留既有 Vite 大 chunk、Workerd AI binding 告警；未调用真实AI。

```sh
rtk proxy npx vitest run test/unit/frontend-calendar-cancel-confirmation.test.tsx test/unit/frontend-calendar-write-journeys.test.tsx test/unit/calendar-service.test.ts test/unit/frontend-calendar-create-intent.test.ts test/unit/frontend-calendar-numbered-data.test.ts test/unit/frontend-calendar-numbered-pages.test.tsx test/unit/frontend-calendar-page.test.tsx test/unit/frontend-calendar-write-data.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/focus-service.test.ts test/worker/calendar-numbered-pages.test.ts test/worker/calendar-write-journeys.test.ts test/worker/calendar.test.ts test/worker/focus-calendar-repair-migration.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy git diff --check
```

本机日志：`/tmp/a05-calendar-confirm-{red,green,routes,final,typecheck,build,i18n,i18n-static,audit-test,audit}.log`。

## 清单边界与下一项

**29范围内 / 5完成 / 24未完成**；A05、R2-008继续开放。24项新增测试不是24个父任务关闭。

下一允许推进 A05 专注页完成/放弃确认：`frontend/pages/focus-page.tsx` 当前直接调用 onTransition，应补精确会话与真实影响、旧确认失效及暂停/恢复互斥。全站 dirty 离开/刷新、原生键盘/触控/双身份验收仍开放。

仅本地实现、React/happy-dom模拟网络与本地Worker/D1证据；未push、部署、远程迁移、读取/上传SECRETS_FILE、真实AI调用或锁定浏览器绕过。独立预览不变。本地下一步无阻塞，goal保持active，不能宣称目标全部完成。
