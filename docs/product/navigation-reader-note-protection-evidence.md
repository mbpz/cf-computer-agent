# A05 知识阅读页私人笔记草稿与保存保护（本地）

日期：2026-10-02；基线 `b5cb58b`；分支 `codex/functional-checklist-completion`。

## 本轮交付

- App 将会话成员传入 KnowledgeReaderRoute；路由及笔记组件按成员/知识项隔离。成员或知识项切换会中止旧请求并使旧编辑/保存回调失效，迟到回执不能写入新页面。
- 初始远端权限读取成功前禁止编辑和保存。明确 `{note:null}` 才表示暂无笔记；缺字段、无效回执和读取失败不推断为可写，提供显式只读重试。共享笔记保持只读。
- 标题/正文使用共享 useCreateDraft：dirty 离页确认、取消/最终准入失败保留、实际准入才丢弃；beforeunload 保护。保存与确认期间拒绝输入更改，保存取同步最新字段并持有一次性意图引用，重复点击不重复 PUT。
- 保存仅接受 HTTP 200 且成员、知识项、owner 权限、标题、正文、引用均匹配的回执。服务端的 PRIVATE_NOTE_INVALID/400 是已核对的写前校验失败，可继续编辑；其他网络/响应/内容异常保留 unknown 锁。
- unknown 仅显式 GET 检查原意图的目标当前状态，不自动重发 PUT。不同内容、缺失、读取失败不能证明之前没有写入；保持保护。内容吻合证明目标状态，不证明某一次请求的因果归属。
- 被明确拒绝的草稿缓存只使用成员+知识项隔离键；不读取或迁移旧的无成员缓存。恢复后仍 dirty，正常获准丢弃会清除缓存；成功保存先清缓存再更新基线，清理失败仍锁住，后续只读核对可重试清理。
- 在笔记保存、unknown、初始权限读取或草稿决策期间，禁止新发起共享/撤销操作；共享操作自身的完整生命周期留在下一子项，不在本轮宣称关闭。

## 契约来源

实际仓库 `src/routes/library.ts`、`src/private-notes/service.ts`、`src/private-notes/types.ts`：GET/PUT 笔记返回 200 与完整 note，GET 可明确返回 null；校验失败发生在 upsert 前。现有 PUT 没有可用于安全自动重放的幂等日志，本轮不新增自动重试。

## TDD 与验证

1. 最初 12 项行为 RED 暴露加载覆盖/可写权限、无成员缓存、缺少 dirty 守卫、同步重复保存、未知写入、回执匹配和成员隔离问题，随后实现通过。
2. 增加缓存和决策边界测试，其中“丢弃后恢复旧缓存”“缓存删除失败却解锁”两项 RED 后修复。
3. 最终新增 22 项行为/真实路由合成 DOM 测试通过；定向 4 文件 47/47。真实路由用例使用有界等待处理父路由读取后再挂载笔记读取，不把未完成异步效果误判为产品故障。
4. 扩大 67 文件 1497/1497 通过；这些是本地模拟请求测试，不是全仓或生产验收。

| 检查 | 结果 |
| --- | --- |
| npm run typecheck | 通过 |
| use-reader-note / knowledge-note 独立严格 DOM TypeScript | 通过 |
| 阅读页附加严格 DOM TypeScript | 仍有 13 条既有 related/backlink/diff idle 联合类型收窄诊断，不记全绿 |
| 全 App 附加严格 DOM TypeScript | 34 条既有诊断；去掉行号后与前轮身份一致，无新增，不记全绿 |
| npm run build:ui | 通过，包含 VM 构建/隔离验证 |
| npm run test:i18n | 13/13 通过 |
| npm run verify:i18n | 434 keys / 55 placeholders / 6 files，硬编码检查通过 |

定向复现：

```sh
rtk proxy npx vitest run test/unit/frontend-reader-note-draft.test.tsx test/unit/frontend-knowledge-note.test.ts test/unit/frontend-knowledge-reader-data.test.ts test/unit/private-notes-service.test.ts
```

临时日志：`/tmp/a05-note-red.log`、`/tmp/a05-note-red-cache.log`、`/tmp/a05-note-focused.log`、`/tmp/a05-note-regression.log`、`/tmp/a05-note-app-types.log`；临时文件不是仓库内持久交付物。

## 未关闭边界和下一项

原始 30 项、D08 经批准排除，范围内 29 项 / 已关闭 5 项 / 未关闭 24 项。A05/R2-008、导航计划 Task 4 整体仍开放。

- **下一允许**：ReaderNotePanel 共享/撤销的精确影响确认、同步去重、过期回调隔离和未知结果只读核对。该流程目前仍是局部 state，并未因本轮笔记保存保护而完成。
- 未新增笔记 unknown 的跨刷新持久意图日志；强制刷新/卸载不能承诺恢复。原生刷新/后退/键盘和真实双身份验收仍待完成，不能用合成 DOM 替代。
- 浏览器拒绝存储删除时，普通“丢弃并离开”无法保证缓存已持久删除；本轮只保证保存清理失败不提前解锁，不将此边界宣称为解决。
- 引用选择采用已有渲染状态；本轮同步最新草稿保证针对标题/正文，不声称同事件改变引用后保存的新语义。
- 无本地外部阻塞。未 push、部署、远端迁移或调用真实 AI 服务。
