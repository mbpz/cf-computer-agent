# R14 生产维护能力激活预检

日期：2026-09-22（Asia/Shanghai）。本记录覆盖 `850db38` 本地候选的生产激活预检，不代表已 push、已部署、已应用远程 Durable Object migration 或已配置生产 secret。

## 已满足的本地前置

- 生产入口使用 `guarded` 模式，并通过 `MAINTENANCE` Durable Object namespace 获取 `production` stub。
- Wrangler 配置声明 `MaintenanceCoordinator` 和 `v3` SQLite class migration。
- `MAINTENANCE_CONTROL_TOKEN` 仅作为 Worker secret 名称预留；本地 `config/types.env` 使用假值生成类型，未读取 `SECRETS_FILE`。
- 已完成管理员维护控制 API 的本地纵向切片：状态/容量读取、`begin-drain`、`resume`、同源保护、严格窗口/epoch 校验、DO token 内部注入和成功写操作审计。
- 本地合同、smoke（62/62）、维护专项、类型检查、单元测试和 landing/build 均已通过。

## 生产激活顺序

1. 审核并确认候选 commit 与当前 `main` 一致。
2. 在 Cloudflare Worker 生产环境配置 `MAINTENANCE_CONTROL_TOKEN`，只输入 secret 值，不写入仓库或聊天。
3. Push `main`，等待 Cloudflare 构建成功，并确认构建 commit、生产版本和 `MAINTENANCE` binding 一致。
4. 核对 Durable Object `v3` migration 已随部署应用，且没有失败或未知前缀。
5. 通过受保护的管理员控制入口读取 `status/capacity`，再验证 `beginDrain/resume` 的鉴权、epoch、重放和失败关闭行为。
6. 只有 1–5 均有证据，才允许关闭 R14 并进入 R15 停写/导出预检。

## 当前阻塞

生产 Worker 当前尚未部署 `850db38`，且没有生产 `MAINTENANCE_CONTROL_TOKEN`。因此生产管理员入口仍不可用，不能安全执行生产排空、备份、迁移或恢复。

已完成的本地接口合同：

- `GET /api/admin/maintenance/status`
- `GET /api/admin/maintenance/capacity`
- `POST /api/admin/maintenance/begin-drain`
- `POST /api/admin/maintenance/resume`

接口必须由管理员会话调用，Worker 内部注入 `MAINTENANCE_CONTROL_TOKEN`，绝不把该 token 返回给浏览器或外部客户端；所有写操作要记录审计事件并保持严格参数校验。

下一步只剩受控生产激活：先 push 并确认 Cloudflare 构建/版本/binding/migration，再单独批准配置 secret，最后运行生产管理员拒绝/只读/排空恢复证据。
