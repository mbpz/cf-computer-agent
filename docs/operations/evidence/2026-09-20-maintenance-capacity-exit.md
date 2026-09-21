# R06 — 容量、孤儿许可与人工退出证据

日期：2026-09-20（Asia/Shanghai）。本记录只关闭本地合成协调器的容量可观测性和人工退出规则，不代表生产容量已测量、压缩已批准或生产停写已执行。

## 已完成切片

- 协调器新增只读 `capacity()` 快照：记录总数、完成墓碑数、活动许可、剩余容量和 `NONE/WARNING/CRITICAL/EXHAUSTED` 告警级别。
- 8,000 条进入 `WARNING`，9,500 条进入 `CRITICAL`，10,000 条后准入失败关闭；重放墓碑不被删除，避免旧请求重新获得许可。
- Durable Object/进程重启后的活动许可会保留；非 OPEN 窗口有活动许可时快照标记 `requiresManualReview`，`resume` 仍因 `ACTIVE_WORK` 拒绝。
- 没有 TTL、强制释放或自动恢复。人工退出必须拿到精确 permit 和完成证据；无法证明时维持阻塞并退出备份窗口，不能把超时当完成。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance -- --reporter=dot` | 6 个文件，63/63 通过 |
| `npm run typecheck` | 通过 |
| `npx tsc --noEmit --project tools/maintenance/tsconfig.json` | 通过 |
| `npm run verify:delivery-status` | 30/30 通过 |
| `git diff --check` | 通过 |

专项测试保留 `CAPACITY_EXCEEDED`、`ACTIVE_WORK` 等预期负向日志，测试进程退出码为 0；没有执行生产数据扫描、压缩、迁移、部署或 secrets 操作。
