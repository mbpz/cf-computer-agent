# 证据：管理员授权邮箱 + 一次性登录码（生产部署与真实双身份读取侧验收）

- 日期：2026-10-11
- 范围：`IDN-007`（管理员授权的邮箱 + 一次性登录码开通成员）
- 性质：本轮为**生产读取**与**授权探测**；未执行部署（发布由用户流水线完成），未对生产库做任何正向写入。被拒写探测不产生数据。

## 部署与模式（发布侧）
- 生产构建身份：线上首屏 `assets/index-BX_5poOm.js` sha256 前 12 位 `b7477d6313fd`、`assets/index-DMM4WYyg.css` 前 12 位 `084ec9448256`，与本分支本地构建逐字节一致（含本功能前端）。
- 迁移：`wrangler d1 migrations list memory-garden-control-plane --remote` → **无待应用**，即 `0063_member_login_invitations.sql` 已由用户流水线的 `npm run release`（先迁移后部署）应用。
- 端点存在性（未认证）：`POST /api/admin/member-invitations` → `401 AUTH_REQUIRED`；`POST /auth/code`（错误码）→ `401 CODE_LOGIN_INVALID`。

## 真实双身份读取侧验收（生产，两个真实账号）
| 端点 | 管理员 `apples398@gmail.com` | contributor `apples398@163.com` |
| --- | --- | --- |
| `/api/session` | `role=admin` | `role=contributor`；capabilities `legacy:read, submission:create, submission:read-own, knowledge:read, tasks:use`；`permissionMask=0x1600c3` |
| `/api/navigation` | 29 条 path（含 `/admin*`） | **18 条，无 `/admin*`**；工作台含 `/tasks /boards /inbox /goals /projects /graph /calendar /today /focus /review` |
| `GET /api/admin/menus` | `200`（32 行） | **`403 FORBIDDEN`** |
| `GET /api/admin/members` | `200`（2 名：admin 与 contributor） | **`403 FORBIDDEN`** |
| `GET /api/admin/member-invitations` | `200`（1 条 `redeemed`，响应**无 `code` 字段**） | **`403 FORBIDDEN`** |
| `POST /api/admin/spaces` | — | **`403 FORBIDDEN`** |
| `/api/tasks`、`/api/goals`、`/api/projects`、`/api/inbox`、`/api/notifications` | `200` | `200`（成员域） |
| `GET /api/admin/audit` | — | `404 NOT_FOUND`（该路径未匹配，未见数据泄露） |

## 越权写探测（contributor → 管理面，均被拒且不留数据）
- `POST /api/admin/member-invitations`（探针邮箱 `d05-probe-1791725942@example.invalid`）→ **`403 FORBIDDEN`**
- `POST /api/admin/members/15772ed5-03f6-4b38-9b83-f2326b44a3b8/status` → **`403 FORBIDDEN`**
- `POST /api/admin/spaces` → **`403 FORBIDDEN`**
- 事后以管理员会话复查 `/api/admin/member-invitations`：**无探针邮箱任何行**，即被拒的写没有产生副作用。

## 真实身份的签发 → 兑换闭环
- 管理员在成员管理页签发授权码（43 字符 base64url，24 小时有效，仅显示一次）。
- `POST /auth/code` 以 `apples398@163.com` + 该码兑换 → `200 {"member":{"id":"15772ed5-03f6-4b38-9b83-f2326b44a3b8","email":"apples398@163.com","role":"contributor"}}`，并下发 `__Host-memory-session`。
- 该成员在生产 `/api/admin/members` 中为 `contributor` / `active`，其邀请行为 `redeemed`。

## 尚未覆盖（不提升状态）
- **正向写旅程**：contributor 在生产创建/整理自己的工作数据未执行（属生产写入，需另行授权）。
- **跨成员数据隔离**：双方各自持有的对象（回执/私有笔记/收藏）交叉读取对比未执行。
- 未对生产库做任何正向写入；本轮仅含被拒写探测与读取。

## 明确非声明
- 未执行部署；未记录回滚点（`0063` 由用户流水线于 2026-10-11 应用，其回滚点应取自该次发布之前，本轮未采集）。
- 不构成 D05 父项关闭：正向写旅程与跨成员数据隔离未覆盖。
