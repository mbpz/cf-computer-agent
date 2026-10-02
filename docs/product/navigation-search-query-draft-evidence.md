# A05 搜索词草稿与提交准入保护（本地）

日期：2026-10-02；基线 `b371c23`；分支 `codex/functional-checklist-completion`。

## 本轮修复

- SearchPage 输入优先展示当前受控草稿，不再被上次结果 query 覆盖；未传受控值的展示用法仍可回退到结果 query。
- 搜索词使用共享 useCreateDraft，初始 URL 为基线。普通离页、分页、应用已保存视图均尊重未提交输入；取消、后置守卫拒绝都保留，实际导航提交才重置。beforeunload 同样保护。
- 搜索提交读取同步最新字段并 trim；通过 applyNavigation 预约精确草稿，只为本次提交通过自身 dirty 守卫，仍尊重其他所有守卫。只有实际获准导航才更新基线；取消/拒绝后释放预约，可继续编辑或重新提交。
- 再次提交相同目标 URL 使用 replace 而非新增 history entry，避免同事件重复点击增加无用后退步骤；不是禁止用户显式重复只读搜索。
- 已保存视图与搜索词决策互斥：查询丢弃确认/应用预约期间拒绝名称编辑、创建/删除/应用；保存视图写入 pending/unknown 或删除决策期间同步拒绝查询编辑与提交。不会将未决写入降级为普通丢弃。
- 使用既有 member-keyed SearchRoute 生命周期；旧成员搜索编辑和提交回调不能更改新成员 URL/输入。搜索 GET 的迟到结果、错误状态不覆盖较新的草稿，纯读取 pending 不给干净路由增加写入锁。

## TDD 与验证

1. 新增最初 8 项真实 SearchRoute 合成 DOM 测试：全部行为 RED，分别暴露输入覆盖、缺失 dirty 确认、同事件旧值、提交基线错误、跨表单决策互斥及旧成员提交等问题。日志 `/tmp/a05-search-query-red.log`。
2. 实现后与已保存视图及 reader 回归合并，3 文件 29/29 通过。
3. 增加 6 项边界验证：重复提交历史条目出现 1 项行为 RED、其余 13 项通过；修复后 14 项全部通过。日志 `/tmp/a05-search-query-boundary.log`。
4. 最终定向 4 文件 37/37；扩大 63 文件 1450/1450。扩大包括导航协调器/历史适配器/草稿/恢复记录/成员隔离/搜索相关回归，不是全仓测试。

| 检查 | 结果 |
| --- | --- |
| npm run typecheck | 通过 |
| use-saved-views / SearchPage 独立严格 DOM TypeScript | 通过 |
| 全 App 附加严格 DOM TypeScript | 仍有既有 34 条诊断；去掉行号后诊断身份与前轮基线一致，不能标记全绿 |
| npm run build:ui | 通过，包含 VM 构建/隔离验证 |
| npm run test:i18n | 13/13 通过 |
| npm run verify:i18n | 434 keys / 55 placeholders / 6 files，硬编码检查通过 |

定向复现：

```sh
rtk proxy npx vitest run test/unit/frontend-search-query-draft.test.tsx test/unit/frontend-saved-views-route.test.tsx test/unit/frontend-reader-pagination-routes.test.tsx test/unit/frontend-search-data.test.ts
```

本机临时日志：`/tmp/a05-query-focused.log`、`/tmp/a05-query-regression.log`、`/tmp/a05-query-app-types.log`；临时文件不作为仓库内持久交付物。

## 父项边界与下一项

原始 30 项，D08 经批准排除；范围内 29 项、已关闭 5 项、未关闭 24 项。A05/R2-008 与导航计划 Task 4 仍开放，只完成本文件所述搜索词子项。未执行 push、发布、远程迁移，未调用真实 AI 服务；合成 DOM 不是原生后退/刷新/键盘或真实双身份验收。

下一允许：知识阅读页私人笔记的草稿、异步加载与保存/共享生命周期。当前代码核查发现 KnowledgeReaderPage 的 noteTitle/noteBody 仍为局部 state，远程初始加载可直接覆盖输入，保存没有同步意图锁；其实际缺口须先用行为测试复现，不能提前声称已修复。无本地外部阻塞。
