# A05 / R2-008 收件箱操作确认本地证据

日期：2026-10-02（Asia/Shanghai）。基线：`dba46b7`；分支：`codex/functional-checklist-completion`。

## 实际完成

- 收件箱归档、恢复、转任务接入共享 ConfirmAction，显示内容摘要（最多160字符加省略号）、ID、前后状态及真实影响。归档保留内容可恢复；转任务创建私人任务并保留原项，不发布知识，已转化项不能在此归档/恢复。
- 默认取消焦点、Escape/遮罩取消与焦点返回。确认期间底层 inert，行操作、筛选、分页、新建按钮禁用；同批次其他动作不能替换首个决定或打开任务编辑器。取消、仅打开和离开均不创建写恢复记录。
- 确认同步消费一次，原始 item/updatedAt 交回既有路由。列表/页码/页大小/过滤/成员/pending/创建写锁/loading/error/处理器消失及卸载使旧确认失效；不会自动复活。
- 新建草稿保留。新增同步 isSubmitBlocked 门禁，修复打开确认后同批次新建仍可能持久化意图并 POST 的竞态；保留 capturePending 的既有恢复例外，不死锁未知创建的显式重试。
- 未改 App 路由 CAS、幂等请求、未知回执持久化或服务端 API。既有冲突/503只读恢复、失权清空、配额失败禁止写入、迟到响应隔离均保留。

## 测试与实际结果

新增23项页面 DOM测试、4项实际 App取消/路由离开/过滤变化零写入测试。

- 初始 RED：19/19失败；18项暴露直接写入/缺少确认及同批次创建竞态，另1项包含 happy-dom select 事件夹具问题。修正为真实 change 事件，并额外验证无弹层时该事件确实调用过滤回调，避免假阳性。
- 扩展回归中，原收件箱夹具把 Shell `/api/notifications/summary` 当收件箱读取。增加独立摘要响应并限定其余路径为 `/api/inbox`，保留原读取次数断言。新过滤测试改用合法 page=2 最后一页夹具，不使用错误的一页一行/总数21响应。
- 最终联合 **18文件243/243**；项目 typecheck、UI构建/VM隔离通过；i18n合同 **13/13**、静态扫描通过；清单审计测试 **9/9**。项目tsconfig不覆盖全部frontend TSX，不宣称全前端静态类型验收。

```sh
rtk proxy npx vitest run test/unit/frontend-inbox-action-confirmation.test.tsx test/unit/frontend-inbox-status-recovery.test.tsx test/unit/frontend-inbox-promotion-recovery.test.tsx test/unit/frontend-inbox-numbered-pages.test.tsx test/unit/frontend-inbox-page.test.tsx test/unit/frontend-inbox-create.test.tsx test/unit/frontend-inbox-create-data.test.ts test/unit/frontend-inbox-create-intent.test.ts test/unit/frontend-inbox-numbered-data.test.ts test/unit/frontend-inbox-promotion-data.test.ts test/unit/frontend-inbox-status-data.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/inbox-route.test.ts test/unit/inbox-service.test.ts test/worker/inbox-conditional-writes.test.ts test/worker/inbox-numbered-pages.test.ts test/worker/inbox-task-promotion.test.ts test/worker/inbox.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy git diff --check
```

本机日志：`/tmp/a05-inbox-confirm-{red,green,routes,final,typecheck,build,i18n,i18n-static,audit-test,audit}.log`。保留既有Vite大chunk与Workerd AI binding告警；未调用真实AI。

## 清单与下一项

**29范围内 / 5完成 / 24未完成**；A05与R2-008父项继续开放。27项新增测试不是27个功能父项关闭。

下一允许推进 A05 日程取消确认：当前仍是页面内非模态确认，应核对精确ID/真实影响、默认取消焦点、旧确认失效、同批次创建/取消互斥。全站dirty离开/刷新与原生键盘/触控/双身份验收仍开放。

本轮仅本地实现、React/happy-dom模拟网络与本地Worker/D1验证，不代表原生/生产验收。没有push、部署、远程迁移、付费开通、GitHub网络重试、备份/加密、SECRETS_FILE读取或锁定浏览器绕过；独立预览不变。本地下一步无阻塞，目标不标记全部完成。
