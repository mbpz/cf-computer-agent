# 证据：带发布前回滚点的发布记录与发布后核验（HSTS）

- 日期：2026-10-11
- 范围：D08（授权后执行迁移/部署与真实登录验收）——本文件登记**本次发布的记录与回滚点**；发布由用户流水线执行。
- 性质：发布前采集回滚点 + 发布后**只读**核验。本助手未运行任何 `wrangler` 命令，未对生产库做正向写入，**未演练回滚**。

## 本次发布

- 触发：用户推送分支后，Workers Builds 以 `npm run release` 发布。
- 发布命令：`npm run release` = `npm run db:migrate:remote && npm run deploy`，即**先迁移后部署**（`package.json` 中 `release` 的定义）。
- 发布内容（可观察）：Shell 响应新增 HSTS 头 `strict-transport-security: max-age=300`，源自 `src/http.ts` 的 `STRICT_TRANSPORT_SECURITY = "max-age=300"` 与 `applyHsts()`；CSP 与 `cache-control: no-store` 维持不变。

## 回滚点（发布前采集）

发布**前**执行 `npx wrangler d1 time-travel info memory-garden-control-plane --json` 取得回滚点：

| 项目 | 值 |
| --- | --- |
| D1 数据库 | `memory-garden-control-plane` |
| 采集时点 | **发布前**（采集后用户才 push 并发布） |
| bookmark | `0000016d-00000000-00005102-3b6c69f5eb9facb94c3d297d46721208` |
| 采集时远程台账 | 63 行，末条 `0063_member_login_invitations.sql` |
| 采集时 `d1 migrations list --remote` | **无待应用** |

回滚命令：

```sh
npx wrangler d1 time-travel restore memory-garden-control-plane --bookmark 0000016d-00000000-00005102-3b6c69f5eb9facb94c3d297d46721208 --remote
```

导出限制：本库含 FTS5 虚表，`wrangler d1 export --remote` **不可用**，因此 D1 Time Travel 是本库唯一的数据恢复路径。上示 restore **本次未演练**。

## 迁移台账（发布前 → 发布后）

| 时点 | 行数 | 末条 | `migrations list --remote` |
| --- | --- | --- | --- |
| 发布前 | 63 | `0063_member_login_invitations.sql` | 无待应用 |
| 发布后 | 63 | `0063_member_login_invitations.sql` | 无待应用 |

本次发布无新增迁移（`0061`–`0063` 由此前发布应用）。

## 发布后核验（生产，只读）

| 检查 | 实测 |
| --- | --- |
| `strict-transport-security` | Shell 返回 `max-age=300`（新发布特征） |
| `cache-control` | `no-store`（未改变） |
| CSP | 未改变 |
| `/login` | `200`，返回 583 字节 Shell |
| 线上产物 | `assets/index-Bl_h-hTB.js` sha256 前 12 位 `dc4e52447f3b`，与本 checkout 本地构建逐字节一致 |
| 远程台账 | 仍 63 行，`migrations list --remote` 无待应用 |

## 真实登录验收

真实登录（管理员 `apples398@gmail.com` 与经授权码开通的 contributor `apples398@163.com`，签发 → 兑换 → contributor 会话及读/被拒写矩阵）见[登录码证据](./2026-10-11-email-code-member-invitation.md)。

## 明确非声明

- **回滚未演练**：仅登记回滚点与命令，未执行 `time-travel restore`；恢复后的数据/结构一致性未经验证。
- 本次未运行任何 `wrangler` 命令；未执行部署（发布由用户流水线完成），未对生产库做正向写入。
- 只读核验不构成对任意页面的完整生产验收；不含原生键盘/触控/移动端矩阵。
- 本记录不影响 D04（VM）与 G0：二者状态保持开放，未被本发布记录触及。
