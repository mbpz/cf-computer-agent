# A05 私人笔记未决意图恢复（本地）

日期：2026-10-02；基线 `0f3857e`；分支 `codex/functional-checklist-completion`。

## 本轮交付

- 保存、共享、撤销共用 tab/member/item 隔离的 sessionStorage 意图记录；包含唯一操作标识、精确内容/收件人和操作时草稿。发送前写入并读回校验；抛错、静默丢写、损坏/越界/未知字段或另一个未决操作均不发送新写入，不静默覆盖记录。
- 重新挂载先读取恢复记录，在服务端权限读取成功前不展示其中私人输入；有未决记录时，权限读取期间也阻止普通离页并保留 beforeunload 警告。加载后恢复草稿与 unknown 锁，只允许用户显式只读核对，不自动重发 PUT/POST/DELETE。
- 区分 pending/applied/rejected；只有严格回执、精确的服务端写前拒绝或所有者范围只读核对才能收尾。终态先持久化，再清理；存储删除失败仍保留锁，重入后不丢失已知拒绝/成功证据。删除已成功而读回抛错的内存恢复也不重复写入。
- 已确认成功后，若后来服务端笔记内容变化，只读展示最新内容，不将旧操作内容重新写回。未知时不同内容/不存在不是失败证明。
- 保存收尾始终清理并读回验证成员隔离旧缓存，避免恢复期可选缓存读取失败后，旧草稿再次出现。共享/撤销恢复保留操作时未保存的标题/正文；身份/知识项切换及旧请求迟到回调隔离。
- 新增中英文存储异常说明与显式只读重试；未发送的内存草稿在存储恢复后保留。写入实际成功但准备读回失败时，保守视为 unknown，不自动发送。

## 验证

- 首轮真实行为 RED **7 项**：重新挂载丢失未决保存/共享/撤销，存储写入失败仍发请求，成员恢复遗漏。
- 追加 RED **2 项**：错误接受数组 outcome、拒绝结果删除读回失败后无法恢复。
- 再追加 RED **2 项**：权限读取期间没有离页保护、恢复期缓存读取失败后旧草稿复活。
- 共新增 **41 项**，三个阅读器文件 **94 项**全部包含于最终扩大回归；**69 文件 1576/1576**通过。覆盖记录校验/隔离/精确清理、未决恢复、禁止重复写入、存储故障、已知终态恢复及旧回调。
- `npm run typecheck`、受影响两 hook 与 journal 的独立严格 DOM 类型检查通过。首次项目类型检查暴露直接 window 引用与 Workers 配置不兼容，改用仓库既有 globalThis 可选 window 模式后重跑通过。
- `npm run build:ui`（含 VM 隔离）、`npm run test:i18n` **13/13**、`npm run verify:i18n` **434 keys / 55 placeholders / 6 files**及硬编码扫描通过。
- 附加全 App 严格 DOM 检查仍为 **34 条既有诊断**，去行列号后的诊断身份与前轮一致；不记全绿。
- checklist 审计仍为范围内 **29 / 已关闭 5 / 剩余 24**；原始30、D08批准排除。A05/R2-008和导航 Task 4不因本地子项完成而关闭。

复现：

```sh
rtk proxy npx vitest run test/unit/frontend-reader-note-intent.test.ts test/unit/frontend-reader-note-draft.test.tsx test/unit/frontend-reader-note-sharing.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

日志：`/tmp/a05-intent-red.log`、`/tmp/a05-intent-boundaries-red.log`、`/tmp/a05-intent-recovery-red.log`、`/tmp/a05-intent-regression.log`及同前缀 types/build/i18n 日志。临时日志不是持久交付物。

## 边界与下一步

- 本轮证明的是 DOM 模拟下同标签页存储与 React 所有者重新挂载的恢复契约；不是原生刷新/强制关闭/键盘/触控/双身份/生产验收。
- sessionStorage 不是备份、加密存储、跨标签页互斥或服务端幂等机制；关闭标签页、清除站点数据、同源脚本修改记录、跨标签页并发均不能据此宣称受保护。没有新增加密或备份工作。
- 存储异常的未知状态保守锁定；无法确认的服务端请求没有自动重发/人工假成功通道。记录损坏不擅自删除。已知拒绝但草稿缓存不可写时保留恢复记录，等待存储恢复。
- 未 push、部署或远端迁移，未读取 SECRETS_FILE、未调用真实 AI。测试运行器的既有 AI binding 提示不构成真实 AI 调用证据。
- **下一允许**：继续 A05 管理员角色页的草稿/未决写入与共享路由离页保护核查。现有角色页只覆盖页内角色切换确认，尚未接入共享离页守卫；先 RED 再实现。本地无外部阻塞，原生及身份验收仍开放。
