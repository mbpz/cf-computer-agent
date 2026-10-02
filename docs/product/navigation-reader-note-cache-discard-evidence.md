# A05 私人笔记缓存丢弃失败保护（本地）

日期：2026-10-02；基线 `e506441`；分支 `codex/functional-checklist-completion`。

## 问题与修复

此前缓存清理监听导航已提交事件，删除失败只吞掉异常；即使用户确认丢弃，页面仍离开，下一次进入可能恢复旧草稿。本轮先复现，再将清理移动到最终准入与实际导航之间：

- 导航门禁新增可选同步 `beforeCommit`。所有普通守卫、精确版本批准和目标可用性检查通过后才调用；返回 false 阻止路由动作，异常释放预约，不造成永久锁。
- 历史遍历准备 permit 不清缓存；到达重放目标且重验守卫后才执行。清理失败不发布目标，历史状态机恢复原获准条目。
- `useCreateDraft` 的可选 `beforeDiscard` 只在真正准入时执行，应用保留草稿的导航不执行丢弃回调；原使用者无需改动。
- 私人笔记先删除成员隔离缓存，再 GET 读回确认不存在；抛错、静默保留值或读回失败都不宣称丢弃成功。保留当前页、内存草稿和 dirty 保护，并显示双语错误说明。存储恢复后，用户可重新发起离页并确认。
- 用户取消、其他守卫阻止、目标不可用、历史 permit 取消或身份注销都不会提前清理缓存。成功保存也使用删除读回验证，不能因缓存清理失败而提前解锁。

## TDD 与验证

初次 RED 为 4 项真实行为失败：两个缓存删除失败场景仍跳转，以及普通导航/历史 permit 忽略清理失败。修复后追加取消、存储读回、其他守卫拒绝、清理异常和重入、过期 permit 以及历史重放恢复边界，共新增 12 项。

- 定向 5 文件 **126/126** 通过。
- 扩大 **68 文件 1535/1535** 通过。
- `npm run typecheck` 通过；受影响 hook、数据层与导航门禁独立严格 DOM 类型检查通过。
- `npm run build:ui`（含 VM 隔离）、`npm run test:i18n` **13/13**、`npm run verify:i18n` **434 keys / 55 placeholders / 6 files** 及硬编码检查通过。
- 附加全 App 严格 DOM 检查仍有 **34 条既有诊断**，去行列号后身份与前轮一致；不算全绿。独立检查使用编译器提示的 `--ignoreConfig`，初次缺该参数的 TS5112 不记通过。

复现：

```sh
rtk proxy npx vitest run test/unit/frontend-reader-note-draft.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-reader-note-sharing.test.tsx test/unit/frontend-knowledge-note.test.ts test/unit/frontend-workspace-history-traversal.test.ts
```

本地日志：`/tmp/a05-cache-red.log`、`/tmp/a05-cache-focused.log`、`/tmp/a05-cache-regression.log`、`/tmp/a05-cache-app-types.log`；临时文件不是持久交付物。

## 明确边界

- 这是受控导航的本地修复，不是浏览器强制关闭/刷新、真实键盘/身份或生产验收。
- 内存草稿在拒绝导航后保留；如果删除已成功而读回失败，无法承诺缓存仍存在。强制卸载后的恢复须由后续持久未决意图机制解决，不用本轮内存保护代替。
- 最终清理不是多所有者存储事务，也不承诺后续底层 history 动作抛错时可以回滚已完成的删除。当前此接口仅由阅读页笔记缓存使用；没有把这两个边界宣称为通过。
- **下一允许**：私人笔记保存/共享未决意图的成员隔离持久恢复，先核对现有持久意图契约，再 RED→实现→验证。无本地外部阻塞。

范围内 **29 项 / 已关闭 5 / 剩余 24**（原始30、D08批准排除）；本地缓存子项完成不提升 A05/R2-008 或 Task 4。未 push、发布或远端迁移，未调用真实 AI。
