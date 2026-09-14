# M02 成熟度增量对账 — 2026-09-14

范围：`codex/admin-audit-recovery`，基于 M01 提交 `e246fca`。本次只修改成熟度元数据、审计工具、测试和文档，不修改前端业务控制器、Worker 服务、数据库 schema 或 Cloudflare 配置。未合并、推送或部署，也未进行 signed-browser / 生产验收。

## 对账结果

- 当前 32 项能力：历史 R0 的 24 项 + inbox / goals / projects / calendar / today / focus / review 七页 + 独立参数化项目时间线。全部保留 `partial`，没有凭读取测试将 mutation、隔离或产品完整性标为 proven。
- 统一矩阵验证 32 × 4 个状态及 5 项既有授权用例，共 133 项；M01 的 32 项读取、权限和 cursor 追加用例继续保留。Focus 无会话展示启动表单，Today/Review 是局部空态，不虚构列表空态。
- 八个入口各自绑定真实控制器及可达请求。Focus 的四个字面量 action 展开为四条实际 API；时间线按独立控制器追踪，不借用整个 projects-data 模块的全部请求。
- 补入 18 项 mutation-safety gap：inbox 3、goals 3、projects 2、calendar 2、focus 5、review 1、project-timeline 2。Review GET 的快照写入单独登记，不能当成无副作用读取；所有新增 create 都保留前端稳定意图键缺口。
- 当前缺口矩阵为 83 项：32 个 manifest 聚合 gap + 51 个 domain mutation gap；43 P0 / 39 P1 / 1 P2。增加 R4-013 至 R4-038 共 26 个待实施原子，R1–R8 当前共 124 个 `[ ]`；R4 主责缺口从 8 增至 34。每项绑定主责、依赖、代码、测试和验收旅程。
- 当前确定性 domain 快照独立写入 `docs/operations/evidence/2026-09-14-workbench-m02-domain-audit.md`。历史 `2026-08-31-workbench-r0-domain-audit.md` 未改写，历史 R0 atom 的 24 项范围未回填。

## 失败到通过的证据

1. 原门禁 12 通过 / 1 失败，七个 ready 菜单路由未登记。补齐后，同一覆盖断言又暴露 project-timeline 未登记；补齐实际路由而非过滤断言。
2. Focus 字面量 action 原被提取为未知 `/api/focus/:id/:action`，定向测试先失败。增加局部有限字面量联合解析后通过；另以新增未知 action 和放宽为 string 的故障回注证明仍拒绝未解析路由。
3. Calendar 的 inline limit/cursor 和时间线局部 limit 变量原被判为不分页，明确 cursor 合同先失败。补充对应源码解析后通过；Today、Review 和 Focus current 保留有界快照/单对象的 not_applicable，不冒充可继续翻页。
4. 旧参数路由断言只允许父路径后一个 `:id`，不支持时间线后缀。改为精确时间线模板并额外验证模板实例确实匹配来源 routePattern；没有允许任意后缀。

## 本轮本地验证

| 验证 | 结果 |
| --- | --- |
| `vitest run test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/worker/project-timeline.test.ts` | 3 文件 / 166 项通过 |
| `node --test scripts/workbench-maturity-contract.test.mjs` | 13 项通过 |
| `node --test scripts/workbench-domain-audit.test.mjs` | 23 项通过；含当前 32 / 历史 24 范围断言 |
| `node --test scripts/delivery-status-contract.test.mjs` | 28 项通过 |
| `npm test` | smoke、i18n、delivery、完整 unit 和 Worker 全部通过；Worker 39 文件 / 576 项通过；前置 Vite 构建通过 |
| `npm run typecheck` 与 `npm run typecheck:landing` | 通过 |
| `npm run verify:landing` | 96 项通过；实际产物的 3D 延迟加载及资源预算未回归 |
| `node scripts/workbench-domain-audit.mjs --check` | 当前快照与源码确定性生成结果一致 |
| `git diff --check` | 通过 |

## 后续顺序与边界

下一环节恢复 D01 管理仪表盘权威统计；七页及时间线的缺失产品行为按 gap matrix 中原子实施，不混入本次登记修复。数字分页、并发条件更新、稳定重试意图、项目切换旧响应保护、聚合范围与双成员证明仍是待完成项。本地门禁通过不替代这些业务实现，也不替代发布和真实用户浏览器验收。
