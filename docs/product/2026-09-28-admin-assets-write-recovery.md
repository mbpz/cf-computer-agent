# D02 资产管理页写入与撤权恢复 — 2026-09-28 UTC

本地时区日期为 2026-09-29（Asia/Shanghai）。基线 `c767cc8`，分支 `codex/functional-checklist-completion`。本次是既有 D02 六页矩阵中的**资产队列局部闭环**，不是六页或 D02 父任务全部完成。无 push、部署、远程迁移、生产写入或真实 AI 调用。

## 实施与结果

- `AdminAssetsRoute` 使用同步 mutation token 防止同一事件批次重复 POST；排队/回读中禁止旧行再提交。不会依靠下一次 React render 才更新的 pending 数组做互斥。
- POST 未知结果或确认成功后的 GET 失败，均不自动重发 POST。保留当前挂载内的读前锁，用户只能显式 GET 当前队列；只有 fresh GET 再次包含该行，且该行没有仍在途的 POST，才移除读前锁。缺失于分页/筛选结果不被当作原写入成功。
- 新一轮显式 retry 仍由当前 `failed_retryable` 行提供；只读恢复有双语提示，明确不证明上次写入成功。不能宣称服务端 exactly-once、持久化幂等意图或跨刷新/关页恢复，后端 retry 契约没有在本批修改。
- 初始读取、后续分页 GET、预览 GET、重试 POST 或重试后 GET 的当前 401/403 清空列表及预览，显示 forbidden；取消所有在途读并失效旧 scope。显式恢复为 GET-only，不重放写入。
- 分页/筛选或语言变化使旧 scope 失效，取消旧预览和读取；即使请求忽略 abort 或导航离开后返回相同查询，旧响应也不能显示内容、刷新列表或将新页面置为 forbidden。不同查询失败不保留可操作旧行。
- 预览回执必须匹配请求 asset ID；不展示其他对象的内容。新预览在当前请求完成前同步防重入。
- 已确认写入的后续读取失败后，可只重试 GET；保留分页收缩意图，恢复为空页时仍回退到有效页，并保留 status 筛选、使用 replace 历史记录。

## RED → GREEN

1. 首批新增 12 个路由测试：**12 failed / 40 passed**。真实失败包含同批次两个 POST、401/403 残留列表、预览未取消/晚到恢复、对象不匹配、只读恢复按钮缺失。
2. 最小修复后两文件 55/55。追加 6 项恢复矩阵通过；这些追加测试是覆盖补充，不冒称它们各自均观察过 RED。
3. 八文件联合回归发现初始恢复未显示 loading：**1 failed / 383 passed**。修复 loading 后相同八文件 **384/384**。
4. 另加已确认写入后回读失败、手动恢复为空页的收缩测试：**1 failed / 58 skipped**（实测只发 3 个 GET，缺少回退页 GET）。保留收缩意图后，最终八文件 **385/385，exit 0**。
5. 本批新增路由测试共 **19**，该路由文件现在 **59** 项。使用真实 React 页面和 API loader，在 fetch 网络边界注入延迟/错误；happy-dom 模型不代表原生浏览器历史、真实账号或键盘/触控验收。

最终联合命令：

```sh
rtk proxy npx vitest run test/unit/frontend-moderation-pagination-routes.test.tsx test/unit/frontend-admin-assets-data.test.ts test/unit/frontend-admin-pages.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/assets-service.test.ts test/worker/m2-assets.test.ts
```

## 门禁与剩余

- `typecheck`、`build:ui`、`verify:i18n` 和六组 Node 契约另在最终候选复跑；结果以本文件下方记录为准。typecheck 沿用仓库范围，不能据此宣称全部前端 TSX 经过静态类型检查。
- 本地 Vitest 自动读取现有 `.dev.vars`，没有人工读取/上传 Secrets。AI binding 警告不等于执行真实 AI 请求。
- 尚未完成：去重/成员/角色/菜单/空间其余写入矩阵，六页原生身份、键盘/触控及弹层验收。资产跨刷新未知结果和后端重放保证不在本批声称范围内。
- 当前 canonical：原始 30，D08 单列排除，本轮 **29 / 关闭 4 / 未关闭 25**。下一环节为 D02 成员页状态更新的并发、撤权及只读恢复；不重复已完成初始读取恢复，也不关闭 D02 父项。


### 最终候选门禁结果

- `rtk proxy npm run typecheck`：exit 0。
- `rtk proxy npm run build:ui`：exit 0；保留既有 chunk >500 kB 警告，不称零警告构建。
- `rtk proxy npm run verify:i18n`：exit 0，脚本输出 keys=434 / placeholders=55 / files=6，hardcoded-copy 检查通过。这是该脚本自身扫描范围，不代表所有前端翻译键总数。
- `rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/i18n-contract.test.mjs scripts/calendar-query.test.mjs`：**92/92**，0 failed、0 cancelled、exit 0。
- `rtk proxy npm run audit:functional-checklist`：原始 30，范围 29，完成 4（A03/A04/B03/C07），剩余 25，排除 D08。
- `rtk proxy git diff --check`：通过。
