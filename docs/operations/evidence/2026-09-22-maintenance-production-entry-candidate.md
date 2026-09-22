# 生产维护入口候选（本地未部署）

日期：2026-09-22（Asia/Shanghai）。本记录只描述当前工作树中的候选改动；未 push、未触发 Cloudflare CI、未应用远程 Durable Object migration、未读取或上传 `SECRETS_FILE`。

## 候选改动

- `src/index.ts` 导出 `MaintenanceCoordinator`，并同时构造 legacy/guarded 入口；只有生产 `MAINTENANCE_CONTROL_TOKEN` 长度至少 16 且存在时才选择 guarded，否则自动回退 legacy。
- `wrangler.jsonc` 增加 `MAINTENANCE` → `MaintenanceCoordinator` Durable Object binding，并增加 `v3` SQLite class migration。
- `src/env.d.ts` 和生成的 `worker-configuration.d.ts` 声明 `MAINTENANCE` 与可选 `MAINTENANCE_CONTROL_TOKEN`。
- `scripts/maintenance-production-entry-contract.test.mjs` 固化生产入口和 Wrangler 配置合同，并纳入 `test:smoke`。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| 生产入口合同 | 2/2 通过 |
| TypeScript 类型检查 | `npm run typecheck` 通过 |
| 维护专项测试 | 6 个文件、63/63 通过 |
| 失败环境说明 | 沙箱首次运行因无法监听 `127.0.0.1` 失败；提升本地权限后同一套测试通过 |

## 发布前置

该候选仍不能称为生产维护已启用。发布前必须单独批准并记录：

1. 在维护控制接口完成并审核后，才为生产 Worker 配置 `MAINTENANCE_CONTROL_TOKEN` secret（只记录名称，不读取值）；未配置时入口保持 legacy。
2. 将 `v3` Durable Object migration 应用到生产，并核对迁移结果。
3. Push 当前候选并确认 Cloudflare 构建 commit 与生产版本一致。
4. 运行受控的 guarded fetch/Cron 只读与拒绝路径验证。
5. 只有上述证据齐全后，才能关闭 R14 并进入 R15 的停写窗口预检。
