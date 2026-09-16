# D02-R1 审核队列与详情读取恢复 — 本地证据

日期：2026-09-16。范围：`codex/admin-audit-recovery`，D02-R1 三个任务；前置计划 `33725c4`，队列提交 `cab5693`，详情提交 `0e9f91f`，集成、回归及本文由后续同批提交固定。

本报告只证明本地 implementation / verification。没有 merge、push、部署、远程迁移或真实登录浏览器验收；不改变 ADM-002 的历史 M1 release 范围，不将 D02 / R6-003 父项标记完成。

## 本批交付

- 审核队列初次加载和刷新失败可按当前 page/pageSize 重试；普通刷新失败保留旧列表并禁止审核动作，401/403 清空列表与旧动作。重试只执行 GET，不重放已成功的审核 POST。
- 请求同步锁、controller generation、查询快照和 token-owned cleanup 共同隔离双击、迟到响应、翻页和浏览器前进/后退；旧审核结束不会刷新或解锁新查询。
- 详情按 id 建立独立会话，切换对象/卸载会 abort 读取并使旧 owner 失效。响应 submissionId 必须匹配请求 id；真实 404 显示未找到，401/403 不显示旧详情及评论，畸形 200 仍为可重试读取错误。
- 同 tick 的重复审核事件只发一个 POST，成功后保持终态锁；失败可重试。此处仅是前端在途互斥，不是服务端幂等。
- 队列标题和错误详情的返回链接接入现有应用内 history 通知；保留真实 href、键盘激活及修饰键打开新标签页语义。成功详情可通过既有审核队列菜单返回，无重复菜单。
- 发布前预览 await 后再次核对原 controller/query，离开原查询不再发旧对象 POST；预览或决策返回 401/403 清空队列。
- 新增提示由中英文目录提供，复用现有 shadcn Button / Alert / PageState；后端协议、Cloudflare 服务、依赖与迁移均未改变。

## RED → GREEN 记录

1. Task 1：先复现缺少队列 retry、授权失效仍保留行、重复读等问题；再补旧决策迟到导航回归。定向三个文件最终 33 项通过后提交 `cab5693`。
2. Task 2：loader 的对象不匹配与 signal 传递两项先 RED；真实详情生命周期的错误恢复、404、权限和旧对象隔离七项先 RED。补齐实现、决策互斥及 401/403 动作回归后，队列/详情四文件 40 项通过，提交 `0e9f91f`。
3. Task 3：真实 App 的两项队列点击导航先超时。原链接只触发原生文档导航，未通知应用内路由；happy-dom 不会重新启动应用。接入现有 history 机制后，真实 App 状态/权限/导航文件 135 项通过；不将此结论夸大为原生浏览器无法导航。
4. 集成复核新增三项 RED：预览未完成时翻页仍发一个旧 POST，预览 401/403 未清空行。增加 await 后归属校验和权限清理后，队列文件 23 项全部通过。没有通过修改断言隐藏失败。

## Fresh 本地验证

| 检查 | 结果 |
| --- | --- |
| 队列、详情 loader、详情页面、详情 route、实际 App 路由五文件 | 178 项通过（23 + 6 + 4 + 10 + 135；两次定向运行合计） |
| `npm test` | 通过：smoke 49、i18n 13、delivery contract 28、unit 1985 / 217 文件、Worker 589 / 39 文件；包含 UI 构建与 i18n 静态校验 |
| `npm run typecheck` | 通过 |
| `npm run typecheck:landing` | 通过 |
| `npm run verify:landing` | 96 项通过；3D lazy transitive gzip 143329 bytes，源资产与产物字节匹配 |
| maturity / domain / delivery 三个 contract 文件 | 64 项通过 |
| `npm run audit:workbench-domain` | 当前快照与确定性生成器一致 |
| `git diff --check` | 通过 |

全量测试本机临时日志：`/tmp/workbench-d02r1-final-test.log`（非交付资产）。Worker 的故障注入日志及 AI binding 启动警告不等于测试失败；上述测试不调用真实 AI 或生产业务接口。happy-dom 路由验证不等于真实设备/登录浏览器验收。

## 状态同步与下一环节

更新 README、ROADMAP、completion audit、maturity checklist / registry / gap matrix 和 ADM-002 本地证据。新当前域快照为 `docs/operations/evidence/2026-09-16-workbench-d02r1-domain-audit.md`；R0、M02、D01-A、D01-B1、D01-B2 历史快照保留原样。仍为 32 个 partial capability、83 项缺口、124 个开放的 R1–R8 原子；只收窄本批已验证的读取和导航缺口。

后续独立 D02-R2 先核对审核状态迁移、事务、重复审计/通知和 publish recovery，再设计稳定操作身份、服务端重放语义、故障恢复与发布/索引/通知收敛测试。不得仅凭 disabled 或前端 ref 锁关闭幂等缺口。
