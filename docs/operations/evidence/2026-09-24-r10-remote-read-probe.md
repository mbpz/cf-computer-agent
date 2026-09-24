# R10 远程只读传输验证证据

日期：2026-09-24（Asia/Shanghai）。本记录只覆盖 R10 的只读探针和本地正式工具回归；用户已确认采用浏览器证据方案。本次未执行 D1 写入、迁移、导出、恢复、停写或应用业务请求，不读取任何 Worker secret，也不保存生产私有正文。

## Dashboard 远程只读探针

通过已登录 Cloudflare Dashboard → D1 `memory-garden-control-plane` → 控制台执行：

| 查询 | 结果 | 边界 |
| --- | --- | --- |
| `SELECT 1 AS ok` | 返回 `ok = 1`；响应时间约 971ms，查询时间 0.12ms | 证明当前 Dashboard 会话可执行远程只读 SQL |
| `PRAGMA table_list` | 返回真实生产表、FTS virtual/shadow 对象及列数；概览页显示当前表数量 75 | 证明生产 schema 可读；未读取业务正文 |

该探针未执行写入语句，未使用 `/restore`、bookmark 恢复或 D1 export。按照用户确认的浏览器证据方案，本次以 Dashboard 生产只读会话作为远程可读性证据，不要求创建生产 API Token；正式 REST transport 的权限、response envelope 和字节编码仍由本地正式工具回归覆盖，未宣称已完成 Worker 到生产 D1 REST API 的端到端联网验证。

## 本地正式工具回归

在允许 Workerd/本地 listener 的测试权限下运行：

```text
rtk npm run test:ops:d1-backup
```

结果：**21 tests passed，0 failed，0 skipped**，约 40 秒。覆盖：

- D1 schema/FTS、分页、int64/REAL/TEXT/BLOB/NULL 编码；
- 归档摘要、身份绑定、路径/权限/符号链接拒绝；
- transport mutation、多语句、非法 PRAGMA、响应错误、超时和重试拒绝；
- 空目标恢复、外键失败回滚和 owner 隔离；
- CLI 禁止 remote restore、未确认 capture 和危险参数。

## 浏览器证据方案确认

2026-09-24 用户确认采用浏览器证据方案，R10 按以下边界关闭：

- 生产远程可读性：由 Cloudflare Dashboard D1 Console 的 `SELECT 1` 和 `PRAGMA table_list` 证据覆盖；
- 传输与编码合同：由本地正式工具 21/21 回归覆盖；
- 生产安全边界：不创建、不读取、不上传 Worker secret，不创建生产 API Token，不执行写入、迁移、导出或恢复；
- 明确限制：本证据不宣称 Worker 到 Cloudflare D1 REST API 的生产联网端到端验证。

据此，R10 **已关闭**，下一项为 R11。

已新增可复用探针 `scripts/r10-remote-read-probe.mjs`，入口为 `npm run probe:ops:d1-read`。缺少三个环境变量时会在发出网络请求前返回 `R10_READ_TOKEN_REQUIRED`；本地缺失凭据守卫已验证通过。

该前置拒绝已固化为 `npm run test:ops:r10-probe` 自动化测试；测试只验证缺少凭据时不启动远程请求，不包含任何 token 或生产响应。

## 可选的后续增强验证

如后续需要补充 Worker 到生产 D1 REST API 的端到端联网证据，可由生产操作人另行创建**仅限 D1 只读**的临时凭据（不提交、不粘贴到聊天、不读取 Worker secret），再执行 `npm run probe:ops:d1-read`；验证结束立即撤销或清理该临时凭据。该增强验证不是当前 R10 关闭条件，也不得借此执行 capture、migration、restore 或业务写入。
