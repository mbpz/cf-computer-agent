# P4-A 项目时间线本地验收记录

日期：2026-09-09
范围：当前隔离 worktree `codex/memory-garden-2.0-workbench-core`

## 验收范围

- 为项目增加私有时间线事项：`meeting`、`decision`、`action_item`、`milestone`。
- 每条记录通过 `member_id + project_id` 做双重归属校验；跨成员读取返回 `404`。
- 创建使用 `clientKey` 幂等；重复请求复用原记录，不覆盖原类型和标题。
- 时间线列表使用有界 opaque cursor 分页，默认 20、最大 50。
- 状态流转为 `open → done/archived`，归档可重新打开。
- 前端提供项目入口、事项创建表单、状态操作和中英文文案。
- 不接入外部日历、会议、邮件或付费 AI 服务，符合 Cloudflare 免费层边界。

## 本地证据

```text
rtk npm run typecheck
tsc --noEmit

rtk npx vitest run test/unit/project-timeline-service.test.ts test/worker/project-timeline.test.ts --pool=workers
Test Files 2 passed; Tests 3 passed

rtk npx vitest run test/unit/frontend-project-timeline-page.test.tsx --pool=workers
Test Files 1 passed; Tests 1 passed
```

## 变更边界

- 追加迁移：`migrations/0046_workbench_project_timeline.sql`。
- 仅更新当前 worktree 的源码、测试、Roadmap、交付总账和本地证据。
- 未执行远程 D1 migration、生产部署、生产 smoke、push 或读取/上传 `SECRETS_FILE`。

## 后续发布前置

生产发布仍需单独完成迁移哈希审计、D1 备份/迁移批准、部署版本确认、生产 smoke 和 signed browser acceptance；本文件不替代这些证据。
