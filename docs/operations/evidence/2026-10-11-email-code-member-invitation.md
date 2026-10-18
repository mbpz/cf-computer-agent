> **已被取代（2026-10-18）：** 管理员转发 43 字符一次性码、以及后续邮箱验证码路径均已移除；当前为邮箱密码自注册。该历史记录仅描述当时的实现与生产证据，当前行为见[密码自注册设计](../../superpowers/specs/2026-10-18-password-self-registration-design.md)和[本地证据](./2026-10-18-password-auth-local.md)。

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

## 真实双身份写旅程与双向隔离（2026-10-11 追加）

方法：contributor 会话由管理员在生产成员管理页签发新授权码后经 `POST /auth/code` 兑换获得（同一邮箱**复用既有成员** `15772ed5-03f6-4b38-9b83-f2326b44a3b8`，未新建）；管理员侧经其真实浏览器会话（omp relay）执行。所有正向对象以 `d05-` 前缀标记并在本轮末删除。

| 检查 | 实测 |
| --- | --- |
| contributor `GET /api/tasks`（起始） | `200`，自有 0 条 |
| contributor `POST /api/tasks`（**无** `Origin` 头） | `403 FORBIDDEN` —— **同源写保护**，非授权拒绝 |
| contributor `POST /api/tasks`（带 `Origin: https://memory.crgmhrc.asia`） | **`201`**：`created=true`，`task.memberId` = 该 contributor |
| contributor `GET /api/tasks`（创建后） | `200`，**仅**自己那 1 条 |
| contributor 读管理员任务 `GET /api/tasks/<admin-task>` | **`404 TASK_NOT_FOUND`** |
| 管理员读 contributor 任务（真实会话） | **`404 TASK_NOT_FOUND`** |
| contributor `DELETE /api/tasks/<own-task>` | **`204`**，其后自有列表回 `0` |
| 越权写（**带** 正确 `Origin`）`POST /api/admin/member-invitations`、`POST /api/admin/spaces` | 均 **`403 FORBIDDEN`**（确为授权拒绝） |
| 清理 | 管理员与 contributor 的任务均删除，双方列表均为 `0` |

**方法学要点**：不安全方法在缺少匹配 `Origin` 时会被同源写保护**先行**拒绝，且错误码与授权拒绝同为 `FORBIDDEN`。因此单凭 403 **无法**区分"来源守卫"与"能力不足"；判定越权必须带正确 `Origin` 复测（本轮已复测）。

本轮结束后生产只读核对：成员恰 2 名（`apples398@gmail.com`=admin、`apples398@163.com`=contributor，均 active）；管理员与 contributor 的任务均为 0；邀请行 2 条，均属 `apples398@163.com` 且均 `redeemed`（无 pending）；本轮验收写入产生的审计行按设计保留。

## 尚未覆盖（不提升状态）
- **撤销与尝试上限**：`POST /api/admin/member-invitations/:id/revoke` 与失败尝试上限（5 次静默锁定）仅本地验证，未在生产演练。
- 未观察到生产 5xx；未执行部署；未记录 `0063` 的回滚点。
- 不构成 D05 父项关闭：其自述关闭条件另含原生键盘/触控等范围。

## 明确非声明
- 未执行部署；未记录回滚点（`0063` 由用户流水线于 2026-10-11 应用，其回滚点应取自该次发布之前，本轮未采集）。
- 不构成 D05 父项关闭：其自述关闭条件另含原生键盘/触控等范围；本轮已覆盖真实双身份读取侧矩阵、双向任务隔离与 contributor 正向写旅程（含删除）。

## 真实 UI 层 contributor 旅程（生产，独立浏览器）

方法：独立 Chrome（CDP + 全新 profile）+ 由授权码兑换得到的 contributor 会话注入该浏览器；**未干扰**用户浏览器中的管理员会话（两者 cookie 同名，故不复用同一浏览器）。

| 步骤 | 实测 |
| --- | --- |
| 打开 `/tasks` | 渲染 contributor 视图（非登录页）；侧栏 17 条、**无 `/admin`**，含新注册的 `/calendar /today /focus /review` |
| 聚焦 `新建任务` 后回车 | 弹层打开 |
| 输入标题并回车提交 | 行出现，`总计 1` |
| 行内 `删除` | 确认弹层：`删除此任务？ <标题> (<id>) — 将永久删除此任务及其任务标签和关联。不会删除关联的知识内容。此操作无法撤销。`（`取消` / `永久删除`） |
| 确认删除 | `暂无任务 总计 0` |

清理后只读核对：contributor 自有任务 `0`、管理员任务 `0`、成员仍为 2（admin + contributor）、邀请行 2 条均 `redeemed`（无 pending）。

## 生产上的签发/撤销/尝试上限/单次使用（2026-10-11 追加）

方法：管理员侧经其真实浏览器会话（omp relay）在**成员管理页**操作（另含 API 调用）；受邀侧经 `POST /auth/code`。探测用的一次性邮箱以 `d05-` 前缀标记；本轮**未新增任何成员**。

| 检查 | 实测 |
| --- | --- |
| UI 签发（输入邮箱 → `生成授权码` → 确认弹层 `确认生成一次性登录授权码？ …该码只显示一次，之后无法再次获取。`） | 页面显示 43 字符码与「此码只显示一次」提示 |
| UI 撤销（行内 `撤销` → 确认弹层 `确认撤销该授权？ <邮箱> 的登录授权码将立即失效，且无法恢复。`（`取消`/`撤销授权`）） | 确认后该码兑换 → `401 CODE_LOGIN_INVALID`（撤销生效） |
| API 撤销 | `200`，状态 `revoked` |
| API 签发 | `201`，`code` 长 43 |
| 尝试上限 | 连续 5 次错误码兑换均 `401 CODE_LOGIN_INVALID`；随后用**正确码**兑换仍 `401`（达上限静默锁定） |
| 单次使用 | 同一码首次兑换 `200`（**复用既有成员** `15772ed5-03f6-4b38-9b83-f2326b44a3b8`，未新建）；再次兑换 `401` |
| 管理员邮箱拒绝 | `POST` 管理员自身邮箱 → `409 INVITATION_ADMIN_EMAIL` |
| 列表 | 响应**不含** `code` 字段 |

结束后只读残留：成员仍为 2（`apples398@gmail.com`=admin、`apples398@163.com`=contributor）；管理员任务 `0`；邀请行 6 条 —— `apples398@163.com` 3 条（均 `redeemed`），`d05-revoke-*` `revoked`，`d05-single-*` `revoked`，`d05-ceiling-*` `pending`（`attempt_count` 达上限、按设计锁定，仅占用该一次性地址）。
