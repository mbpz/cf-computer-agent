# D02 空间与集合管理表单 — 本地证据

时间：2026-09-28 UTC（2026-09-29 Asia/Shanghai）。基线 `a673992`；分支 `codex/functional-checklist-completion`。范围是既有 D02 的缺失管理入口，不新建系统，不关闭 D02 父项。

## 完成的局部功能

- 空间编辑：名称、slug、描述、状态、位置；集合创建/编辑：名称、描述、状态、位置及父集合。内联表单打开后聚焦名称，字段边界与双语错误提示齐全。
- legacy/readOnly 空间不可编辑或创建集合。当前加载的父集合排除自身、已知后代和停用项；尚未加载的原父级保留，更多父级需取消后加载更多，最终归属/循环检查由服务端执行。
- 编辑绑定打开表单时的 `expectedUpdatedAt`，回读后不悄悄改用新版本；服务比较客户快照，SQL 继续使用条件更新与递增版本。陈旧编辑返回 409；旧 API 客户端仍可省略版本，未声称全 API 强制版本。
- 共同写锁与同步提交锁阻止重叠操作；严格检查写回执字段、记录身份和版本。未知写入先 GET，不自动重发。401/403 清除受保护数据和草稿，旧 scope 的迟到响应不污染新会话。
- 集合创建在同一个挂载编辑器中保持稳定请求键；管理员身份与请求键共同索引不可变回执。规范化载荷不一致返回 409；资源、审计、请求回执同 D1 事务，竞争败者回滚后读取胜者回执。回执在集合后续被修改后仍保持原创建结果。
- 已验证成功的写入，即使后续 GET 失败也关闭已确认表单，页面仍保持只读恢复锁，避免把已完成创建误显示为待重试草稿。

## RED → GREEN 与覆盖

- 新管理入口的 8 项用例先因按钮不存在失败；实现后通过。
- 并发同键创建先返回不同集合 ID；原子回执实现后只新增一个集合和一次创建审计。
- 陈旧浏览器版本先得到 200；版本门禁后返回 409，并保留胜者数据及审计。
- 源码审计先拒绝动态 method，再拒绝缺失的三个 mutation 声明；改为静态可扫描 API 调用并补齐声明、缺口唯一归属和阶段映射，没有放宽断言。
- 本批新增 18 路由 DOM、5 HTTP/D1、1 迁移用例。当前空间路由文件 49 项、空间恢复 Worker 文件 16 项；另有迁移文件 1 项。

联合回归命令：

```sh
rtk proxy npx vitest run test/worker/admin-spaces-recovery.test.ts test/worker/admin-collection-requests-migration.test.ts test/worker/spaces.test.ts test/unit/spaces-service.test.ts test/worker/phase1.test.ts test/unit/frontend-admin-space-recovery.test.tsx test/unit/frontend-admin-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-admin-role-recovery.test.tsx test/unit/frontend-admin-menu-recovery.test.tsx test/worker/admin-audit.test.ts
```

结果：**11 文件 / 363 项通过**。D1 覆盖并发重放、载荷冲突、审计失败全部回滚、无效键/父级不消耗回执、撤权、管理员交接后的键作用域、过期版本拒绝和真实前端 helper → HTTP → D1。

`0056_admin_collection_creation_requests.sql` 的测试从 0055 的已有空间/集合数据迁移，逐行验证原数据不变、回执表为空、外键无错误、重复应用 migration runner 无副作用。

## 最终门禁

- 六组 Node 合同 **93/93**：`workbench-domain-audit`、`functional-checklist-audit`、`workbench-maturity-contract`、`delivery-status-contract`、`i18n-contract`、`calendar-query`。
- `npm run typecheck`、`npm run build:ui`、`npm run verify:i18n` 通过；i18n 434 keys / 55 placeholders / 6 files。构建仍有既有大 chunk 提示，不宣称性能门禁完成。
- 新增矩阵汇总计数合同，修正旧汇总 87 与既有行数 97 的不一致；新增三个接口后实算 100（53 P0 / 46 P1 / 1 P2）。功能父项计数与此源缺口计数分别维护。
- `npm run audit:functional-checklist` 实算 29 / 4 / 25；`git diff --check` 通过。未运行会同步密钥的通用 build/check。

## 边界与下一步

- 仅本地实现/测试/提交；没有 push、部署、远程迁移、配置生产密钥、调用真实 AI 或开通资源。
- 新前端的 keyed POST 依赖 0056。后续发布必须先在单独授权的迁移环节应用该迁移；本轮没有执行。新表按管理员级配置回执存储，不把共享空间误改为私有成员数据。
- 请求键/草稿仅在挂载编辑器内稳定，刷新、导航卸载或关闭编辑器后不持久化；空间创建仍无请求幂等键。数据库回执持久化不等于浏览器意图跨刷新恢复，不宣称 exactly-once 全流程完成。
- 领域审计保守保留上述三个操作的持久恢复/兼容缺口，归属已有 R6-008；矩阵实际由 97 增至 100 source gaps（同步修正原有汇总表停留在 87 的旧计数），不是功能父项增加。
- 原生浏览器、真实身份、键盘/触控和完整内容影响验收未由 DOM/D1 测试替代。当前未复查浏览器状态，不能沿用历史设备锁屏作为当前阻塞。
- 原始 30 父项，D08 发布范围排除；**29 范围内 / 4 已关闭 / 25 未关闭**。下一允许继续 D02 菜单创建/层级编辑入口，再按清单进入 D03 对账。无本地实现阻塞，全部任务尚未完结。
