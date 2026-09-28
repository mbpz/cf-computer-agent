# D02 空间管理写入恢复、分页与竞争 — 本地证据

日期：2026-09-28 UTC / 2026-09-29 Asia/Shanghai。基线 `6b1e9ae`，分支 `codex/functional-checklist-completion`。

## 范围与结果

本轮完成空间页现有创建操作、空间/集合列表分页和有界并发/撤权矩阵；不关闭 D02 父项。原始 30 父项，D08 排除，本轮 **29 / 关闭 4（A03/A04/B03/C07）/ 未关闭 25**。

- 修复 React 输入事件在异步 state updater 中读取 currentTarget 导致的异常。名称上限与服务一致为 120，slug 上限 80 且拒绝连续/末尾横杠；合法边界也有提交测试。
- 同批重复提交只发一次 POST，创建/取消/输入及翻页在写入期间锁定。成功回读权威列表，不把创建回执直接追加到旧列表。失败保留当前挂载草稿；错误回执/未知结果/写后读取失败只允许 GET 恢复，不自动重发 POST。
- 当前 401/403 清除空间、集合和草稿，并取消/废弃并发旧读取，迟到 GET 不能恢复受限内容。scope 变化隔离旧写结果；在写入完成前启动的读取不能解除写锁。初始失败重试显示加载态并合并重复点击。
- 列表与回执校验完整空间/集合字段、合法状态/范围、重复 ID 和集合 spaceId，坏数据不会被默默过滤为空列表。创建回执必须匹配名称/slug/默认状态/shared 类型/可写标记/位置。真实本地 HTTP 响应经过前端 loader 验证。
- 新增显式空间“加载更多”和每空间集合“加载更多”，保留并编码不透明游标；每页最多 50 条，不自动抓取全部。拒绝重复 ID 或重复游标，失败后只读恢复重置第一页而非自动重放分页/写入。真实 D1→HTTP 验证 57 个空间和同空间 55 个集合无遗漏、无跨空间混入；不同请求不承诺冻结快照。
- 空间/集合属于共享知识管理配置，不改造为成员私有资源。管理员管理权限与集合父级同空间约束均经本地 HTTP 测试；普通成员、停用管理员无读写管理权限。
- 修复空间并发更新返回 500 的问题：服务读取版本传到 repository，过期快照返回 409，不悄悄改用另一份审计前值；空间/集合更新均保证版本时间递增，即使服务时钟相同。SQL 条件更新与审计同 batch，命名约束 guard 使竞争或未写审计整体回滚；不捕获无关数据库错误为成功。
- slug 唯一约束使并发同 slug 创建只有一次业务写与一条审计，另两次 409。空间/集合并发更新仅成功或冲突，成功审计前值链与数据库最终状态一致；审计异常不留下新空间。既有 legacy 只读、父级有效性、环路和审计回滚回归保持通过。

## 实际验证

1. 首轮前端 **22 failed**，先修输入事件异常，再观察 **22 failed** 的恢复/合同缺口；Worker **2 failed / 5 passed**，复现归属字段被丢弃及空间并发 500。
2. 首次修复四文件 **55/55**。增补分页、旧集合读取、合法输入边界、HTTP 分页与冻结时钟测试后 **65/65**。
3. 冻结时钟集合更新测试 **1 failed / 10 passed**，修复集合版本单调性与服务快照条件。联合十文件出现 **2 failed / 336 passed**：一个初始重试加载态缺口，一个成熟度 fixture 缺少真实 API 字段；修复后 **338/338**。
4. 最后补测当前写入撤权与并发 GET，观察 **1 failed / 30 passed**；补齐 epoch 失效和 abort 后，最终联合十文件 **339/339**。本轮新增 **31 路由 + 11 Worker = 42 测试**。真实 D1 测试中只有确定性读取交错测试使用 spy 安排时序，不 mock SQL 执行。
5. `typecheck`、`build:ui`、`verify:i18n` 通过；i18n 434 keys / 55 placeholders / 6 files。保留既有大 chunk 警告。六组 Node 契约 **92/92，0 failed/cancelled/skipped**。

```sh
rtk proxy npx vitest run test/worker/admin-spaces-recovery.test.ts test/worker/spaces.test.ts test/unit/spaces-service.test.ts test/worker/phase1.test.ts test/unit/frontend-admin-space-recovery.test.tsx test/unit/frontend-admin-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-admin-role-recovery.test.tsx test/unit/frontend-admin-menu-recovery.test.tsx test/worker/admin-audit.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/i18n-contract.test.mjs scripts/calendar-query.test.mjs
```

## 剩余边界与下一步

没有新增请求幂等键；同 slug 创建冲突不等于原回执重放，顺序重复更新仍可写入新的审计。服务版本保护本次服务读取到提交之间的竞争，不是客户端持久化版本协议，不保证跨刷新/跨标签未知结果恢复或 exactly-once。GET 恢复本身不证明此前未知请求是否成功。

**D02 下一允许本地步骤**：核对并补齐菜单创建/层级编辑、空间编辑与集合创建/编辑等缺失管理入口及对应弹层状态；随后按 canonical 继续 D03 roadmap 对账。不能因为六页现有操作的局部矩阵已通过，就宣称完整前端 CRUD 或真实身份/原生键盘触控验收已完成。当前无本地实现阻塞；本轮未重新检查浏览器状态，历史锁屏不是本轮实时结论。

未 push、合并、部署、远程迁移、生产写入、真实 AI 调用或人工读取/上传 Secret。本地证据不替代发布/生产验收，全功能 checklist 尚未完结。
