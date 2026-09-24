# R10 远程只读传输验证进度

日期：2026-09-24（Asia/Shanghai）。本记录只覆盖 R10 的只读探针和本地正式工具回归；未执行 D1 写入、迁移、导出、恢复、停写或应用业务请求，不读取任何 Worker secret，也不保存生产私有正文。

## Dashboard 远程只读探针

通过已登录 Cloudflare Dashboard → D1 `memory-garden-control-plane` → 控制台执行：

| 查询 | 结果 | 边界 |
| --- | --- | --- |
| `SELECT 1 AS ok` | 返回 `ok = 1`；响应时间约 971ms，查询时间 0.12ms | 证明当前 Dashboard 会话可执行远程只读 SQL |
| `PRAGMA table_list` | 返回真实生产表、FTS virtual/shadow 对象及列数；概览页显示当前表数量 75 | 证明生产 schema 可读；未读取业务正文 |

该探针未执行写入语句，未使用 `/restore`、bookmark 恢复或 D1 export。Dashboard 只读会话不能替代正式 API transport 的权限、response envelope 和字节编码验证。

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

## R10 当前判定

R10 **部分完成，尚未关闭**。Dashboard 已证明远程 D1 只读 SQL 可用，本地正式工具 21/21 通过；但正式 `tools/d1-backup/transport.mjs` 使用的 Cloudflare D1 REST API 尚未用真实窄权限只读 token 验证。当前 shell 没有 `CLOUDFLARE_D1_BACKUP_READ_TOKEN` 或 `CLOUDFLARE_API_TOKEN`，Wrangler OAuth 已过期；官方 OAuth 登录请求的权限范围过宽，未启动持久授权。

## 关闭 R10 的唯一剩余门槛

由生产操作人创建或注入**仅限 D1 只读**的临时凭据（不提交、不粘贴到聊天、不读取 Worker secret），然后对同一生产 database/account 执行正式 transport 的 `SELECT 1`、允许的 `PRAGMA table_list/table_xinfo`、编码和 response metadata 验证。验证结束立即撤销或清理该临时凭据；不得借此执行 capture、migration、restore 或业务写入。

