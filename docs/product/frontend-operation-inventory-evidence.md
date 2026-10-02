# A01 前端操作源码清点：范围与本地证据

基线：`codex/functional-checklist-completion` / `fc5a30e`。本批只增加源码清点工具、生成物、测试和清单证据，没有修改产品运行行为。

## 交付与计数

- `scripts/frontend-operation-inventory.mjs` 使用仓库已安装 TypeScript AST；不执行被扫描源码、不增加依赖、不访问网络。
- [可读索引](./frontend-operation-inventory.md)及 [完整 JSON](./frontend-operation-inventory.json)覆盖 237 个第一方前端源文件，含 TS/TSX/JS/MJS，排除声明文件和构建产物。零候选文件也列出。
- 1024 个源码候选包含原生/自定义控件、回调、role 语义边界、导航/表单、spread 与命令式监听器；不等于 1024 项用户功能。JSON 保留完整表达式；Markdown 长表达式仅摘要。
- 34 个业务入口按已有成熟度 root symbol 及相对 import/局部符号引用展开，另列 shell、匿名主页、登录共享入口。参数化 pathname 和 routePattern 分开保存。
- 110 个候选未归入以上入口，不删除、不假称不可达。来源坐标 ID 随源码移动变化，只用于审计，不是业务幂等操作编号。

## 未归入候选的人工分类与后续

| 类别 | 本轮源码核对 | 后续要求 |
| --- | --- | --- |
| VM 文件与导入 UI 未正式接线 | 正式 `frontend/features/environments/environments-page.tsx` 只有环境元数据管理；`FilesPanel` 的调用在 `tools/browser-vm/runtime-owner-browser.mjs`，导入面板是它的条件子组件。`createAuthenticatedVmRuntime` 未被正式页面消费 | D04 仍开放；需正式 runtime/生命周期/文件面板接线及真实功能验收，不能把独立工具验收升级为工作台完成 |
| 定义存在但无当前 UI 消费 | ContextRail、CardFooter、Tabs 相关定义保留在索引 | 由功能需求确认是否需接线；不自动计为缺失业务功能 |
| App 全局守卫与 fallback | App 挂载 HistoryNavigationNotice，NotFoundPage 经路由 fallback 调用 | 跨路由状态人工映射，不能因入口 root 未包含 App 就判定未实现 |
| 动态导入及运行时监听 | landing scene 动态 import、account-network/VM 生命周期、Service Worker 监听 | 静态符号图有盲区；需实际入口及启动条件追溯，不能声称全部不可达 |
| 动态 DOM/内容 | scene 的 createElement，以及 markdown renderer 的动态内容 | 当前候选扫描不展开生成的 HTML；链接、第三方控件、门户、CSS 可见性仍需人工核对 |

原先 895 个候选是加入全 role 语义边界前的中间值；最终值为 1024。role 可能只是提示/分组/状态，因此保守纳入而不声称都是交互。

## 验证（本轮实际运行）

1. 增补参数路由与单引号/计算 role 用例，先 6 通过 / 2 失败，再修复为 8/8。
2. `npm run inventory:frontend-operations` 有意生成；`npm run audit:frontend-operations` 对两个文件逐字比较，通过。生成并不证明语义正确；仅让源码变化必须显式对账。
3. `node --test scripts/frontend-operation-inventory.test.mjs scripts/frontend-typecheck-contract.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs`：35/35 通过（8 + 3 + 9 + 15）。
4. `npm run typecheck`：Worker 与完整前端严格类型检查均通过。
5. `npm run audit:workbench-domain`：已有域审计快照无漂移。
6. `npm run audit:functional-checklist`：原30、范围内29、关闭5、未关闭24；已关闭 A03/A04/B03/C07/D03，D08排除。

`test:smoke` 已纳入源码索引测试；本轮只执行以上定向命令，未声称执行整个 smoke、全量业务测试或生产检查。

## 不能据此关闭的项目

A01 的“每页全部可见操作、弹窗二级操作与触发状态枚举”仍需动态菜单、跨组件条件与真实呈现核对；A02 的 handler/API/授权/持久化/测试绑定尚不能由 AST 引用推定；A05、D04 与 D07 不因本批关闭。不存在新增外部阻塞，允许继续上述本地工作；正式 VM 接线需沿既有边界设计并验证。

未 push、部署、远程迁移，未读或上传生产密钥；不改独立预览，不将静态清点或本地测试冒充浏览器/VM/生产验收。
