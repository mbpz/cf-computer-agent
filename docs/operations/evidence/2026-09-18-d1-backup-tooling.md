# D1 正式逻辑备份工具：本地交付证据

日期：2026-09-18。工作树：`.worktrees/admin-audit-recovery`，分支：`codex/admin-audit-recovery`。本轮范围仅为正式工具、合成恢复回归和维护设计；不是生产备份窗口。此前日历修复、0051 及其测试/证据保持未提交状态，没有覆盖或丢弃。

## 交付

- `tools/d1-backup/core.mjs`：有界发现、SQLite 侧类型编码、游标分页、迁移前缀核对、两轮漂移检测、空库恢复。覆盖 32/51 结构、独立 FTS corpus 和 AUTOINCREMENT 高水位。
- `archive.mjs`：版本化 schema/NDJSON/manifest、计数和摘要、独立摘要锚、来源身份、独占私有文件、仓库外目标、校验失败关闭。
- `transport.mjs`：固定 Cloudflare HTTPS origin 和 account/database，限制为采集器只读 SQL，禁止重定向/重试，响应/请求数/时间上限，固定错误码脱敏。只完成离线测试。
- `cli.mjs`：`migration-manifest`、`capture`、`verify`、`restore-check`；显式 capture 确认和唯一读 token 环境变量。恢复只有新建临时本地 Miniflare D1，没有远程或既有目标选项。没有执行真实 capture。
- [操作手册](../../../tools/d1-backup/README.md)及[维护停写设计](../d1-backup-maintenance-design.md)：完整写者入口、隐式写、在途/后台排空、外部写者、失败关闭和恢复准入设计。维护实现及生产写者盘点仍未完成。
- `package.json` 增加 `test:ops:d1-backup` 和 `ops:d1-backup`，没有新增依赖。专用运维回归需单独运行，不隐含在原有 `npm test` 中。

## 本轮执行证据

| 检查 | 结果与证明边界 |
| --- | --- |
| `rtk proxy npm run test:ops:d1-backup` | **21/21 passed，0 skipped，0 failed**；本地合成来源和恢复目标，约 33 秒 |
| `rtk proxy npm test` | **exit 0**；smoke、i18n、delivery contract、unit、Worker 全流程成功；smoke 51 项，Worker 41 文件 / 636 项。包含 pretest Worker 的前端构建，不等同生产部署或完整 `npm run build` 验证 |
| `rtk proxy npm run typecheck` | **exit 0** |

最终文档变更后另行复跑交付契约和 diff 检查；结果见下方收口记录。测试使用本地 Workerd listener，按权限流程获准在沙箱外运行；不是 Cloudflare 账户访问授权。完整测试的 Wrangler AI binding 提示为配置警告，`vitest.config.ts` 明确 `remoteBindings: false`；本轮没有调用生产 API 或部署。

TDD：collector、archive、transport、CLI 均先运行占位实现的失败测试，再实现至通过。最后追加“目的目录预检”和“传输身份不匹配”两项测试，先观察两项失败，再修复并运行全部 21 项通过。最初沙箱内 Workerd 运行未结束而中断，之后本地 listener 测试经权限流程执行；未将中断记为成功。

### 关键恢复与拒绝用例

- 32 和 51 两套真实项目迁移结构，SQLite int64 极值及超 JS 安全整数、有限 REAL 极值/次正规数、NUL/中文/引号文本、空和非空 BLOB、FTS rowid/corpus、sequence 高水位和下一次分配。
- 51 结构通过本地真实 Workerd SQL 实现的 HTTP-shaped adapter → 归档 → 校验 → 空库恢复；通知意图 trigger、讨论目标权限 projection、任务删除后日历引用解除且保留标题、不同 owner 的数据不受影响。
- 非空恢复目标拒绝；外键错误使整个数据 batch 回滚，DDL 可能留下，临时目标不得复用。
- 不支持的表结构/FTS、非有限数、账本漂移、行数/字节约束、跨页同计数变化；两轮不一致拒绝。
- 身份不匹配和缺少停写确认在读取来源前拒绝；目录已存在或处于 Git 仓库内，在发出远程请求前拒绝。
- 截断、缺失或额外文件、暴露权限、符号链接、摘要/身份/版本/计数错误、乱序或畸形行、非法 sequence 不能通过校验。
- mutation、多语句、非允许 PRAGMA 在 transport 发请求前拒绝；HTTP/envelope/SQL 错误、超限和超时脱敏且不重试。
- CLI 拒绝未知命令/参数、remote restore/target 参数和未确认 capture；独立子进程验证及临时恢复只输出 hash/计数。

## 仍然开放的门禁

1. 真实 D1 API 的只读权限、PRAGMA、编码和 response metadata 尚未实测。官方 API 文档只是设计依据；离线 HTTP-shaped fixture 不是远程服务证据。合成远程检查/创建 fixture 另行授权。
2. 当前没有实际停写屏障。两轮摘要相同不保证快照，不能排除 ABA；operator acknowledgement 只是声明。维护方案只完成设计，后续须评审、本地实现、覆盖全部写者/排空并在批准后部署。
3. 没有读取、导出或恢复真实内容，没有独立生产归档；不能将本地合成归档称为生产备份。实际源大小、资源消耗、历史已应用迁移字节、Worker/Git 对应关系仍须新鲜证据。
4. 工具限额是保守边界，不是生产规模或免费平台配额承诺。单次本地 restore batch 在合成样本成功不证明最大边界下的性能。权限文件不是加密或备份保留方案。
5. D1 归档不包括 R2、DO、Vectorize、配置、secret 和外部副作用；不是全产品灾备。应用专属恢复行为目前为合成测试，并非 CLI 自动运行的真实内容验收。
6. 生产只读验证、维护启用、真实备份、迁移和整库恢复分开授权。没有 commit、push 或部署，也没有更新发布/真实用户验收为完成。

下一步建议先评审维护方案并批准本地实现；生产事项维持上述独立门禁。[本轮计划](../../superpowers/plans/2026-09-18-d1-backup-tooling.md)只关闭本地工具/验证/设计范围。

## 收口记录

- `rtk proxy npm run verify:delivery-status`：最终 roadmap/ledger 变更后 **28/28 passed**，0 skipped/failed。
- `rtk proxy git diff --check`：**exit 0**；未发现已跟踪 diff 的空白错误。新增文件仍为未跟踪交付，不为检查而执行 git add。
- 分支/工作树再次核对为 `codex/admin-audit-recovery` / `.worktrees/admin-audit-recovery`，保留原有改动。本轮没有合并、提交或推送。
