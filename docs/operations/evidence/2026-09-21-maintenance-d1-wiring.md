# R03 第三项：本地 D1 入口接线证据

日期：2026-09-21（Asia/Shanghai）。分支：`codex/admin-audit-recovery`。
基线：`df69af8a18077430857eace5d134ae9aa255e89f` + 未提交的 R03 候选变更。

## 范围与实现

- 仅完成 R03 第三子项；前两项 WorkScope/D1 facade 为既有未提交实现。本记录不关闭整个 R03。
- `src/worker-entry.ts` 在维护准入成功后，为单次 HTTP 或 Cron 建立数据库 facade 缓存。实际 `env.DB` 与 `dependencies.sessionDatabase` 若指向同一原生数据库则复用 facade；不同数据库分别包装，不跨请求共享。
- 使用显式 DB/sessionDatabase getter，不遍历 Env，不提前读取其他绑定，不修改原始参数。生产 `index.ts` 的 legacy 选择和生产配置保持不变。
- `tools/maintenance/entry-d1.test.ts` 使用真实 app/service/repository 与本地 D1；新增合成第二数据库用于异库 session 覆盖，未添加生产 binding。

## RED → GREEN 与反向验证

1. 用户执行的 `/tmp/cf-r03-entry-d1-red-20260920.log` 已读取核验：07:37:31，1.31s，5 failed / 2 passed。五项分别覆盖 HTTP 存储失败、默认/同库覆盖/异库覆盖 session 清理吞错、Cron 补偿。失败原因统一为维护许可过早释放（预期 active=1/DRAINING，实际 active=0/DRAINED），不是启动错误。
2. 最小接线后完整 maintenance：5 files / 92 tests passed，07:40:43，3.82s。
3. 补充真实管理员成员状态更新测试：成员 repository 与审计 repository 的语句在同一原子 batch 成功，检查实际成员状态、审计记录及许可归零。专项运行 1 passed / 7 skipped。
4. 临时禁用 facade 缓存，再运行上述专项：1 failed / 7 skipped，HTTP 预期 200、实际 500。该反向验证证明测试可发现同请求不同 facade 导致的 batch 归属冲突；随后恢复缓存。
5. 恢复后的完整 maintenance：5 files / 93 tests passed，07:44:32，4.81s，exit 0。

## 本轮验证

所有命令在隔离工作区执行，shell 使用 `rtk proxy`。

| 命令 | 实际结果 |
| --- | --- |
| `npm run test:ops:maintenance` | 5 files / 93 tests passed，exit 0 |
| `npm run typecheck` | exit 0 |
| `npx --no-install tsc --noEmit --project tools/maintenance/tsconfig.json` | exit 0，新增第八项测试后再次通过 |
| `npm run test:unit` | 229 files / 2113 tests passed，07:45:22，117.67s，exit 0 |
| `npm run test:worker`（含 `build:ui`） | 47 files / 656 tests passed，07:48:40，19.72s，exit 0 |
| `npm run verify:delivery-status` | 30 tests passed，exit 0 |
| `git diff --check` | exit 0 |

普通测试配置输出既有 AI binding 远程访问警告；本记录不以普通回归证明生产资源隔离。maintenance 专项使用独立合成资源配置和 `remoteBindings: false`。未执行部署、生产迁移或备份命令。
Worker 回归还输出非文本 body 的 `.text()` 警告及文件不存在、无效 journal 等异常日志，最终测试判定仍为全部通过；UI 构建有大于 500 kB 的 chunk 警告。本轮未修改配置以隐藏这些输出。

## 未完成边界

- R03 第四项：成员/session/nonce 自身 catch 前完整 raw Promise 登记，以及并行分支完整 continuation 的跟踪。
- R03 第五项：正常领域 400/403/404、嵌套后台任务、迟到调用等真实入口集成验证与最终全量回归。
- R04 流/取消/超时/跨存储未启动；不把本轮 D1 接线视为完整 drain 安全性或生产验收。
- R03 整体仍开放；恢复总计保持 2 关闭 / 23 剩余。候选变更未提交、未推送、未部署。
