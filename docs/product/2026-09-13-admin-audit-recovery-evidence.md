# D02 审计页：本地修复与验收边界

日期：2026-09-13。基线 main `6bb04ac`；工作分支 `codex/admin-audit-recovery`。

## 修复范围

- 请求控制器返回 `{ generation, promise }`，promise 直接返回分页数据。路由改用 `request.generation` 校验并直接显示数据，列表及总数为零的空态不再卡在骨架屏。
- 首次失败提供 shadcn 风格重试按钮；翻页失败保留上次成功列表并显示局部错误，重试读取失败的目标页，不改 URL、筛选或每页条数。请求中禁用控件，重复重试点击只发一次读取。
- URL 导航时立即记录新查询，配合 generation/dispose 拒绝导航前后迟到的成功/失败；卸载中止旧请求。筛选/每页条数变化归第一页，前进后退同步页面数据。
- 成熟度矩阵中的审计 empty/error/ready 由 gap 改为 supported；其他路由的 gap 保留，不将“测试通过”解释为整个产品完成。

## 复现证据

1. 原有 2 文件 / 17 测试基线通过，但审计测试只检查 URL，并未验证列表存在。
2. 新增真实 DOM/Response 列表与空态断言后 2 项失败。测试等待由有限微任务改为有上限的状态等待，避免 Response 解析时序误判。
3. 修复后临时回注“从 page 中读取 generation”的原错误，最终版列表与空态回归均按预期失败；随后移除故障回注。
4. 初次失败/换页失败的重试测试在实现前 2 项失败；导航至 effect 清理之间的旧错误测试独立失败。实施后定向 3 文件 / 126 测试通过。

## 完整门禁

- 定向：`frontend-admin-pagination-routes`、`frontend-admin-pages`、`frontend-workbench-maturity-routes`，3 文件 / 126 测试通过。
- `npm run typecheck`、`npm run typecheck:landing` 通过。根 tsconfig 不包含大多数 frontend TSX，这不是全前端 strict typecheck 声明。
- 完整 `npm test` exit 0：smoke 49、i18n 13、delivery-status 28；unit 214 文件 / 1866 测试；Worker 39 文件 / 576 测试。包括 `worker/admin-audit` 的排序/过滤/窗口和 `worker/phase1` 的审计接口角色拒绝、GET-only 回归。
- `build:ui`（完整测试前置）通过；保留既有大于 500 kB 的 chunk 警告，不将其描述为本批已优化。完整日志：`/private/tmp/d02-admin-audit-full-tests.log`（本机临时证据，不入库）。
- 文档更新后 `verify:delivery-status` 28 项通过，`git diff --check` 通过。
- 额外执行 `verify:workbench-maturity`：12 项通过、1 项失败。能力清单缺少已开放的 calendar、focus、goals、inbox、projects、review、today 共 7 个路由记录。在未修改的 main `6bb04ac` 复跑得到相同失败，属于既有合同缺口，并非本批引入；因此不能声称所有独立门禁均通过，暂不进入合并收尾。

测试使用本地 DOM/HTTP fixture 和 workerd/D1；Vitest 配置 `remoteBindings: false`。无生产请求、迁移、新 Cloudflare 产品或部署。后端既有 `audit:read` 与 GET-only、分页窗口/过滤合同不变；管理员治理审计不是普通用户可见业务列表，不扩大权限。

## 未完成与下一步

- 先处理既有成熟度清单与 ready 路由不一致的合同缺口，依据实际实现和证据补齐记录，不通过降低断言或虚报能力消除失败。
- 尚未执行真实登录浏览器、移动端/键盘/深浅主题验收或生产验收；不能提升总账 release / acceptance。
- 本批仅关闭 D02 审计加载/恢复的本地子项，不关闭 D02 父任务；其他管理页的初次失败重试和主操作仍开放。
- 下一小批 D01：核对管理仪表盘统计定义、接真实授权数据并移除虚假零值。不要复用审计列表条数冒充业务总数。
