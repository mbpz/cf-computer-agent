# 功能 checklist 恢复与本地验证

日期：2026-09-25（Asia/Shanghai）。用户要求：“快速完结所有剩余功能任务 checklist”。

## 范围与当前结果

- 基线：`main` 的 `f1911c0e4e53976e54c441683fcbde708f9815ef`，开始时工作区干净；相对本地 origin/main ahead 2。这不是远程或生产状态断言。
- 实施分支：`codex/functional-checklist-completion`。本轮有运行时代码变更，不只是恢复计划。
- 以[原功能清单](./2026-09-12-personal-workbench-completion-audit.md)继续：30 个父项，D08 生产交付排除，本轮范围 29 个。父项整体关闭 0、仍开放 29；它们包含已完成子项，不能解释为 29 个功能从零缺失。本轮关闭四组有界子项，未用局部测试关闭整个父项。
- 不执行维护 Secret 配置、备份、迁移、生产写入、push 或部署；不访问生产浏览器。免费层/禁用存储边界不变。

## 本轮代码与证据

| 原条目 | 实际变更 | 仍未覆盖 |
| --- | --- | --- |
| A01/A02 | `/graph` 加入成熟度记录，当前 33 个 ready 路由均有记录；增加图谱四态、原读取重试、撤权后菜单隐藏/直达拒绝且不发送私有数据请求的用例 | 全部可见操作清点、领域审计、图谱分页继续/完整动作重放等仍开放；分类保持 partial |
| D02 | 去重、资产、成员、角色、菜单、空间六页提供初始错误重试；即时互斥防连点；复用原查询；GET 恢复与 mutation 重放分离 | 不关闭写操作、表单、弹窗、并发和真实登录矩阵 |
| B04 | 附件组件将数量/大小/格式校验结果显示为本地化 alert；空选择不上传；单文件 picker 与默认限制一致；无上传回调或未启用时保持禁用 | SubmitPage 仍没有可用性契约和真实上传回调，不能宣称普通用户现在可上传 |
| B05 | 队列发布独立进度快照，进行中/已结束重复 run 均不重放；组件拒绝进行中的再次选择，反馈成功/失败且不输出内部错误 | 队列只覆盖当前 callback 完成状态，不代表服务器接收、解析成功；真实上传、取消、稳定意图恢复、解析回读未闭环 |

相关实现：`frontend/app.tsx`、六个 `frontend/pages/admin/*-page.tsx`、`frontend/components/assets/asset-dropzone.tsx`、`asset-upload-queue.ts`、`frontend/lib/i18n.ts`。图谱的原实现并非本轮新建；新增的是成熟度/fixture/状态与权限证据。

## RED → GREEN 与联合验证

1. 六页重试用例在实现前 6 项失败：错误页没有重试按钮。实现后通过。空间页同时会读取子集合，计数收窄为目标集合 URL，而非错误地把所有子路径计成重复主请求；保留同查询与 GET 断言。
2. 附件新测试在实现前 7 项失败：没有校验提示、空选择传出 undefined、重复 run 调用上传两次、没有可观测进度。修复后 18 项组件/队列用例通过；异步 DOM 测试等待终态，不把尚未结算的 Promise 当成功。
3. 图谱缺失导致的成熟度合同由 12/13 修复为 13/13；保留原覆盖断言，没有删路由或跳过测试。

联合回归命令：

```sh
rtk proxy npx vitest run test/unit/frontend-submit-pages.test.tsx test/unit/frontend-asset-dropzone.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-graph-a11y.test.tsx
```

结果：**5 files / 181 tests passed，exit 0**，14.31 秒。附加门禁：

- `npm run typecheck`：通过（仓库现有 tsconfig 范围）。
- `npm run build:ui`：通过；仍有超过 500 kB 的 bundle 警告，不等于性能验收。
- `npm run verify:workbench-maturity`：13/13 通过。
- `npm run verify:delivery-status`：30/30 通过。
- `npm run verify:i18n` 与 `npm run test:i18n`：通过，i18n 合同 13/13。
- `rtk proxy npx vitest run test/unit/frontend-i18n.test.ts test/unit/frontend-locale-pages.test.tsx`：2 文件 7/7 通过。
- `git diff --check`：通过。

测试首次在沙箱内因 Wrangler 日志路径与 localhost listener EPERM 未能启动，未记为通过；经批准原命令重跑。启动器自动报告使用 .dev.vars 和 AI binding 警告，没有人工读取/输出其内容；这些定向测试使用本地 fixture/callback，不是生产上传或 AI 验收。

## 未通过项：领域审计

`rtk proxy node scripts/workbench-domain-audit.mjs --write /tmp/functional-domain.md` 未通过，未生成新的权威快照；末次复核 `rtk proxy npm run audit:workbench-domain`（--check）同样退出 1：

```text
workbench-admin-submissions: unsupported frontend mutation invocation: operation.path
1 !== 0
```

`frontend/components/review/review-detail-data.ts` 已有代码通过审核意图的 `operation.path` 调用 API；审计脚本当前只解析有界字符串/模板。当前阻塞在既有审核调用，不能以手工添加白名单、删除断言或改变业务请求来强行通过。后续需给动态意图建立可验证的有界来源绑定及反例测试。

历史 `2026-09-16-workbench-d02r1-domain-audit.md` 保持不动；其 32 项记录不能当作当前 33 路由全部 mutation 覆盖的证明。成熟度合同通过也不替代领域审计通过。因此 A02/D07 不关闭。

## 下一步与限制

允许继续本地实现与测试，不受旧运维 R09 责任签认或备份约束。优先处理审核动态请求的领域审计绑定，以及 B03 的附件可用性契约 → B04/B05 真实提交链路；B08 来源范围选择/会话恢复等原缺口仍在。全部父项和真实浏览器、设备、发布验收不能仅由本轮 DOM 用例推定完成。
