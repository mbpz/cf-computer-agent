# Memory Garden 2.0 P2-C Calendar / Today / Focus / Review Implementation Plan

> 本计划只覆盖当前 Cloudflare 免费层、5–20 人私有工作台的本地纵向实现；不包含生产 D1 migration、Worker 部署或 secrets 操作。

## Goal

把现有任务、目标、项目和 Inbox 连接成可执行的个人工作节奏：先补齐任务子项与依赖，再提供成员私有的内部日程和时间块，最后聚合 Today、Focus 和每日/每周 Review。

## Fixed constraints

- 所有查询和写入都从认证 principal 推导 `member_id`，禁止信任客户端 member id。
- 所有列表继续使用 opaque cursor，默认 20、最大 50；聚合接口必须有界。
- 所有写入使用 client key 或业务幂等约束；重复请求不能产生重复子项、依赖或时间块。
- 只使用现有 Worker、D1、Durable Objects、Workers AI 和静态 Assets，不引入 R2、Vectorize、Queues 或第三方 SaaS。
- 任务、日程、复盘文案全部进入 en/zh-CN i18n；禁止出现 `undefined`、内部 label key 或跨成员数据。
- 每个原子任务遵循：先写失败测试 → 最小实现 → 定向回归 → 全量回归 → 证据更新。

## Atomic delivery order

### C1. Task sub-items and dependency contract

- [x] 定义 `task_subtasks`：`id`, `member_id`, `task_id`, `title`, `status`, `position`, timestamps。
- [x] 定义 `task_dependencies`：`member_id`, `task_id`, `depends_on_task_id`；唯一键防重放。
- [x] 所有 relation 查询同时约束 owner 和 parent task owner。
- [x] 禁止自依赖和跨成员依赖；删除父任务时由数据库级 cascade 收敛。
- [x] 增加 repository/service/route 契约和成员隔离测试。

### C2. Internal schedule and time blocks

- [x] 定义 `calendar_events`：标题、描述、开始/结束、时区、全天标识、状态、关联 task/project、client key。
- [x] 用 `calendar_events.kind` 区分普通事件和 focus block，避免第二套时间模型。
- [x] 校验结束时间晚于开始时间、时长上限、跨成员关联和重复 client key。
- [x] 提供 owner-scoped 列表、创建、编辑、取消和日期范围查询。
- [x] 对日期范围设置最大 31 天跨度，避免无界扫描。

### C3. Task calendar views

- [x] 增加 `/calendar` 数据适配器和页面路由。
- [x] 支持月/周/日三种视图，但后端只提供统一 bounded range API。
- [x] 任务 due date 与内部日程使用统一时间格式和 locale 展示。
- [x] 无数据、加载、失败、冲突和跨日事件均有明确状态。

### C4. Today aggregation

- [x] 增加 `/today` 或工作台 Today route capability。
- [x] 聚合今日任务、逾期任务、今日时间块、Inbox 待处理、活动项目和目标进度。
- [x] 后端按成员一次性聚合，设置固定数量上限；前端不自行拼接跨模块权限数据。
- [ ] 每个卡片提供原模块跳转和空态操作（保留为 C5/C6 UI 深化项）。

### C5. Focus mode

- [ ] 提供“开始专注 / 暂停 / 完成 / 放弃”状态流。
- [ ] 专注状态必须与 task/member 绑定，重复点击幂等。
- [ ] 当前专注项只返回本人数据；不引入实时广播或付费队列。
- [ ] 页面刷新后可恢复当前状态，结束时写入完成时间和活动事件。

### C6. Daily and weekly review

- [ ] Daily Review：完成项、延期项、阻塞项、时间投入和未处理 Inbox 摘要。
- [ ] Weekly Review：按项目/目标聚合完成情况、逾期趋势和下一周候选项。
- [ ] 复盘结果以成员私有快照保存，重复生成使用确定性 key 收敛。
- [ ] 不在本阶段引入自动 AI 写回；AI 仅可作为后续建议入口。

### C7. Evidence and release boundary

- [ ] 为每个 migration 更新 migration manifest/hash 和 schema tests。
- [ ] 增加 service、route、worker、frontend 和 i18n tests。
- [ ] 运行 focused tests、full unit、typecheck、i18n、build、smoke contracts。
- [ ] 更新 checklist、delivery ledger、ROADMAP 和本地 acceptance evidence。
- [ ] 保持 release/acceptance 为 pending，直到用户另行批准 main 合并、远程 migration、部署和生产 smoke。

## First implementation slice

本阶段已完成 C1 任务结构、C2 内部日程、C3 Calendar 视图和 C4 Today 聚合；下一批进入 C5 Focus 模式，继续保持每个关系独立的 owner、幂等和回归证据。

## Stop gate

C1–C4 本地证据已完成，下一阶段进入 C5。若后续测试暴露当前任务、日程或聚合接口的 owner、时间范围或数量边界不足，先修复数据边界，不通过增加前端隐藏逻辑绕过。
