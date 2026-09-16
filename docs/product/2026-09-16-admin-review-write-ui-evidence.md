# D02-R2-B 审核写入 UI：本地证据

日期：2026-09-16。分支：`codex/admin-audit-recovery`。基线：`9961858`（D02-R2-A 已提交）。

本记录只证明 B 的本地实现与自动化，不证明部署、真实管理员登录或整个审核闭环完成。对应[实施计划](../superpowers/plans/2026-09-16-admin-review-write-ui.md)及[设计](../superpowers/specs/2026-09-16-admin-review-write-recovery-design.md)。

## 已实现

- 数据边界校验发布回执的 revision ID、knowledgeItemId 和四种 searchStatus；驳回/退回校验 submissionId 和实际决定。畸形 2xx 不被当成成功。
- 详情与队列共用现有风格表单和状态反馈；真实原因/说明进入原 API，UTF-8 上限 4000 字节、控制字符/孤立代理项及原因白名单与服务端约束一致；说明不进入日志或审计元数据。
- indexed/pending/search_degraded/failed 分别显示，不把搜索尚未就绪误报为发布失败。成功结果保留稳定版本/知识项标识。
- 网络失败、5xx 或畸形回执仅提供显式原决定重试，使用不可变序列化 body；同步锁防止连续点击。未知结果期间不允许修改说明或切换决定。
- 400/422 首次校验拒绝保留可编辑输入；如果它发生于未知结果的重试，则只允许权威重读。409/404 同样重读，不强制覆盖。
- 401/403 清受限内容；对象切换、卸载、查询改变后的旧响应无效。现有 locale runtime 切换语言不清除操作快照。
- 队列成功后才刷新当前查询，保留 pageSize 和其他参数；尾页空后夹紧。刷新失败保留成功回执，重试只发 GET、不再发 POST。
- 本批无后端、迁移、依赖或 Cloudflare 服务变更。

## TDD 与独立复核

1. B1 数据测试先出现 19 项契约失败，再实现回执校验/操作快照，25 项通过。
2. B2 路由新增行为先失败，再接共享表单与恢复状态。输入测试最初在 DOM 创建前静态加载 React client，令输入支持探测缓存为 false；改为创建 happy-dom 后动态加载 createRoot，保留原生 setter/input 事件，不以组件私有 props 绕过交互。
3. B3 队列新增用例先出现 10 项失败，再实现行内表单、结果与恢复。
4. 独立只读复核指出：发布已提交但响应丢失后，当前目标失效可令重放返回 400；该错误不能证明首次未提交。核对 service 的目标验证顺序后，为详情/队列分别增加红灯回归，再以 previouslyUncertain 分类修复。
5. 同时修复范围内既有的 Button 不支持 asChild 导致无效嵌套，以及队列联合类型缩窄问题。
6. 独立定向复核确认 P2 已关闭，B 范围代码审查通过；复核未重复运行测试，不替代 C/D 验收。

## 验证

以下命令均在本 worktree 执行：

```sh
rtk proxy npx --no-install vitest run test/unit/frontend-review-detail-data.test.ts test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-review-detail.test.tsx test/unit/frontend-moderation-pagination-routes.test.tsx test/unit/frontend-admin-review-data.test.ts test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/publication-service.test.ts test/worker/m1-publication.test.ts test/worker/m1-api.test.ts
rtk proxy npm run typecheck
rtk proxy npx --no-install tsc --noEmit --ignoreConfig --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable --types vite/client --strict --skipLibCheck frontend/pages/admin/review-detail-route.tsx frontend/pages/admin/review-queue-page.tsx
rtk proxy npm run build
rtk proxy npm run test:smoke
rtk proxy npm run verify:workbench-maturity
rtk proxy git diff --check
```

- 联合回归：9 文件、390 项通过，包含 4 个主前端测试文件的 91 项用例；服务/Worker/API 为 162 项。
- 项目默认 typecheck 不覆盖大部分前端；另外执行的审核模块 DOM 严格检查通过。全前端 app.tsx 严格检查尚不通过：对基线 `9961858` 独立导出的 frontend/shared/src 运行同一命令，33 项诊断；当前 28 项，无新增诊断。减少的 5 项属于本批审核页面，其他类型债务未在本轮扩张修复。
- build 包含 96 项 landing 资源/隔离测试、secret scan、legacy audit 和 Wrangler **dry-run**；不是生产部署。
- smoke 49 项、i18n 13 项、delivery-status 28 项、workbench-maturity 13 项均通过，i18n 静态检查与 git diff --check 通过。首次 smoke 因沙箱禁止监听 127.0.0.1 出现 11 项 EPERM；授权本机端口后原命令完整通过，未改测试规避。
- 已知环境输出：初次沙箱构建无法写 Wrangler 日志，授权重跑后退出 0；Vite 大 chunk 提示仍存在。Worker purge 缺失文件用例仍输出 WorkspaceFsError，但联合回归退出 0、无失败用例。AI binding 配置提示不是远程 AI 调用证据，本批测试未新增此类调用。

## 后续缺口及边界

- [ ] C：为三种审核终态添加提交者通知；决定与通知同一事务，去重、当前归属/权限检查、旧数据迁移保持与迁移契约同步。
- [ ] D：跨批故障矩阵及真实登录、中英文键盘、深浅主题、移动尺寸和发布后验收。
- [ ] 类型检查覆盖：单独处理全前端剩余 28 项基线诊断，并建立覆盖所有 React 页面的持续检查；不能将默认 typecheck 当作全前端通过。
- 未推送、未合并 main、未部署、未执行远程迁移；D02/R6-003、ADM-002 release/acceptance 不提升。
