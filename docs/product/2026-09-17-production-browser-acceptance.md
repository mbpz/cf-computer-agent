# 2026-09-17 生产浏览器验收：未通过

范围：`https://memory.crgmhrc.asia/`，用户手动完成 GitHub 登录后的管理员会话。使用真实浏览器 UI 及只读 Cloudflare 查询；没有创建测试内容、审核提交、发送消息、修改权限、执行迁移或重新部署。

本记录补充 D02-R2-D3/D4，不替代 `delivery-status-ledger.md`，不提升任何能力的完整验收状态。

## 部署与数据库证据

- 本地 main/origin/main 为 `cef7625`；这仅是本地 Git 引用证据。
- `wrangler deployments list --json` 最新记录：部署 `cee1cc08-b61c-4257-bff3-8f1952a365d7`，版本 `162a3831-fbe6-4b65-aa11-4ab977f92236`，流量 100%，创建时间 `2026-09-17T11:09:51.978422Z`（北京时间 19:09:51）。
- `wrangler versions view` 确认此版本的 DB 绑定为 `653c9e43-c7ad-45b8-a109-bc144843bee7`，与仓库配置一致。元数据未携带 Git SHA，因此尚不能证明该版本的代码树等于 `cef7625`。
- `wrangler d1 migrations list memory-garden-control-plane --remote` 返回 0033–0050 共 18 个未应用迁移，包括 0036 notifications、0037 discussions 和 0050 review notifications。
- 对 `sqlite_master` 的只读查询检查 notifications、discussion_threads、discussion_thread_access、discussion_participants、discussion_messages、tasks、d1_migrations；结果仅存在 tasks 和 d1_migrations。D1 返回 `changed_db=false`、`rows_written=0`。

## 阻塞发现

### P1：生产 schema 落后，通知和消息不可用

| 浏览器操作 | 请求 | 结果 | requestId |
| --- | --- | --- | --- |
| 打开通知后重试 | `/api/notifications?page=1&pageSize=20` | 500 INTERNAL_ERROR，retryable=true | a3c80a307f4c8591 |
| 通知未读汇总 | `/api/notifications/summary` | 500 INTERNAL_ERROR，retryable=true | a3c80a307f4d8591 |
| 打开消息 | `/api/discussions?limit=20` | 500 INTERNAL_ERROR，retryable=true | a3c80aea5c858591 |
| 对照：审核队列 | `/api/admin/submissions?page=1&pageSize=20&status=review_pending` | 200，空队列 | 未记录 |

通知重试最终仍显示“无法加载通知”；消息显示“无法加载讨论”。生产 DB 缺少对应表与未应用迁移相互印证，说明代码部署与数据库迁移没有同步完成；不是正常空状态，不能通过隐藏错误或返回空数组判为修复。

首次等待网络事件未取得响应证据，后续读取已捕获事件确认上述 HTTP 状态和 JSON 错误。未采集 Worker 异常堆栈，不能声称获得精确服务端 SQL 报错。

### 其他观察

- 中文任务筛选仍显示 `todo/doing/blocked/done/canceled`、`low/medium/high`、`today/overdue/none` 英文枚举值，需要补本地化复核。
- 前一轮真实登录页可见 OAuth 应用展示名称仍为 Memory Garden。尚未调整第三方应用配置。

## 已验证的有限 UI 范围

- [x] 管理员会话能加载首页；桌面侧栏账户入口和顶部任务/看板/通知/消息入口可见。
- [x] 1440×900 下审核队列加载成功，空列表显示中文“总计 0 · 当前显示 0–0 / 每页行数”；切英文后为对应英文文案。
- [x] 语言菜单点击外部关闭。
- [x] 语言菜单 Enter 打开、Escape 关闭，焦点回到语言按钮。
- [x] 账户菜单的设置项能导航到设置页。
- [x] 深色与浅色选择均改变根主题及页面背景；深色截图可见审核页布局。恢复原有 System 主题及简体中文。
- [x] 任务和看板空状态能加载。仅验证列表展示，不代表创建、编辑、流转成功。
- [x] 390×844 下移动导航能展开，Escape 关闭并将焦点恢复至“打开导航”。DOM 测得 document clientWidth=scrollWidth=375，未见根文档横向溢出；原生滚动条占用视口宽度。
- [x] 结束时恢复默认视口并保留登录标签。

移动截图呈现异常缩放，未据此判定产品视觉缺陷，也不声明完整移动视觉验收通过。真实手机、完整 Tab 循环和各业务弹窗尚未验证。

## 原子级后续步骤

- [x] 审查 0033–0050 每个迁移的依赖、数据转换、兼容性及回滚/恢复方案，核对实际生产迁移账本。见下述迁移审查补充；完成审查不代表获准执行。
- [x] 追加 0051 日历 task/project 引用解绑修复，本地 32→51 / 50→51 演练及 168 项 Worker 回归通过；不代表生产已应用。
- [ ] 建立并验证独立生产数据库备份；指定范围导出已获授权，但 Task 3 因虚拟表兼容性/维护窗口受阻。已获取恢复书签，不能替代独立备份或恢复演练。
- [ ] 取得生产迁移授权后按批准的发布流程执行；不得因本次验收授权直接 apply。
- [ ] 复核迁移账本、必要表与索引，并重复三个失败请求，确认不再 500。
- [ ] 核对部署代码与批准候选的可追溯对应关系。
- [ ] 在单独授权且有明确测试数据的前提下，验证三种审核决定、提交者通知、已读幂等及目标打开。
- [ ] 使用第二个受邀成员账号验证跨用户隔离；不使用管理员账号冒充第二身份。
- [ ] 补多页数据下的数字页码、每页数量切换，以及实际移动视觉、失败恢复和键盘流程。
- [ ] 修复或独立安排中文任务筛选枚举、OAuth 展示名称问题。
- [ ] 所有阻塞解决并有新鲜证据后，再更新正式交付账本的 release/acceptance；当前 D3/D4 保持开放。

## 迁移审查补充（2026-09-17）

见[迁移修复计划](../superpowers/plans/2026-09-17-production-d1-catchup.md)。生产只读刷新确认连续 0001–0032，任务/附件均为 0、成员 1；菜单冲突查询和外键检查为空，所有 SQL `rows_written=0`。Time Travel info 可用，但未导出或恢复。

现有 5 文件 143 项本地回归通过；新增 0032→0050 演练 3 项通过，其中一项是**已知缺陷诊断而非产品成功**：0042 的复合外键 SET NULL 会使关联任务删除报 `NOT NULL constraint failed: calendar_events.member_id`。已验证失败不会删除任务或破坏日历记录。

新增前置项：先追加修复迁移并完成关联 task/project 删除保留测试，再审批完整生产批次；不修改历史 0042，不允许 owner 字段为空。当前仍未执行生产迁移、导出、部署或业务写入，原 500 结论未复验消除。

## Task 2 本地修复补充（2026-09-17）

上述已知缺陷诊断已替换为产品成功断言，追加 0051 后日历关联 task/project 删除成功且 owner/内容保留，跨用户约束与失败批次回滚通过。最终 Worker 8 文件 168 项、smoke 51 项、i18n 13 项、交付合同 28 项通过。新增精确 32-before / 51-after 账本门禁，旧 50 个 SQL hash 不变。见[本地证据](./2026-09-17-calendar-reference-detach-evidence.md)。这些是 Task 2 本地证据，不覆盖前述生产快照；未执行生产迁移或重新验收，线上阻塞仍保持开放。

## Task 3 备份预检补充（2026-09-17）

备份范围已获授权；刷新生产账本仍为 32，pending 为 19，tasks/assets=0、members=1，FK 检查为空，Worker DB binding 匹配目标。确认 `chunks_fts` 和 `chunks_fts_shared` 两个虚拟表，官方文档明确含虚拟表数据库不支持标准导出，且导出会阻塞其他请求。未尝试导出或执行删表绕行；独立备份未产生，写入暂停窗口也未确认。只读恢复书签及部署元数据已记录在[备份预检证据](../operations/evidence/2026-09-17-production-d1-backup-preflight.md)。下一步需非破坏性备份恢复方案，不能直接进入迁移或宣布线上恢复。
