# 设计：邀请码注册与绑定式密码重置

- 日期：2026-10-18
- 状态：实施中（本地实现，不含生产迁移/部署/真实浏览器验收）
- 相关：`IDN-007`（邮箱密码注册/登录/重置）、`ADM-007`（管理菜单）
- 取代：`2026-10-18-password-self-registration-design.md` 中“开放自注册”“无证明直接重置”的决策

## 问题

2026-10-18 的邮箱密码自注册采用开放注册 + 仅凭邮箱和新密码重置，违反 README 的“invitation-only”、ROADMAP 的“不做公开注册”和 IDN-004 的 allowlist 边界，并带来账户接管与邮箱抢占风险（见评审报告 `docs/review/area-c-identity-admin.md` C-01/C-02/C-03）。

## 决策

1. **注册必须使用邀请码。** 密码注册不再开放；`POST /auth/register` 必须携带一个未使用、未绑定的邀请码。
2. **邀请码一次性、绑定新成员。** 一个邀请码只能创建一个新成员；注册成功即标记 `used` 并写入 `bound_member_id`。并发使用同一码只有一个成功。
3. **每位成员只能分享一个邀请码（终身一个）。** 成员首次访问“我的邀请码”时按需生成一个 `kind='member'` 的码；该码使用后不能再次生成（`owner_member_id` 唯一）。成员可把自己的码分享给新用户。
4. **管理员可无限生成邀请码。** `POST /api/admin/invitations` 生成 `kind='admin'` 的码，数量无终身配额（单次请求 1–20 个）；管理员可在菜单管理页看到所有成员/邀请码的绑定关系与状态。
5. **重置密码必须校验该成员被绑定的邀请码。** `POST /auth/password/reset` 除邮箱和新密码外必须提供注册时使用的邀请码（即 `bound_member_id = 成员` 的那一条）；不正确、缺失或该成员没有绑定邀请码时统一失败。GitHub/微信专属成员仍不能重置密码。
6. **注册/重置/登录的其它边界不变**：PBKDF2 参数、登录锁定、注册按 IP 限流、同源校验、创建会话、重置撤销全部会话。
7. **管理员生成码与成员分享码在数据结构上同表**，只以 `kind`、`owner_member_id` 区分；两种码都单次使用、都绑定使用者。

## 数据（`migrations/0079_invitations.sql`）

```sql
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,                -- canonical：16 位大写字母数字（去分隔符后）
  kind TEXT NOT NULL CHECK (kind IN ('admin','member')),
  owner_member_id TEXT REFERENCES members(id),   -- member 码的分享者；admin 码为 NULL
  bound_member_id TEXT REFERENCES members(id),   -- 使用后绑定新成员；未使用为 NULL
  status TEXT NOT NULL CHECK (status IN ('unused','used')),
  created_by_member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  used_at TEXT,
  CHECK ((kind='admin' AND owner_member_id IS NULL) OR (kind='member' AND owner_member_id IS NOT NULL)),
  CHECK ((status='unused' AND bound_member_id IS NULL AND used_at IS NULL)
      OR (status='used' AND bound_member_id IS NOT NULL AND used_at IS NOT NULL))
);
CREATE UNIQUE INDEX invitations_code_unique ON invitations(code);
CREATE UNIQUE INDEX invitations_bound_member_unique ON invitations(bound_member_id) WHERE bound_member_id IS NOT NULL;
CREATE UNIQUE INDEX invitations_member_owner_unique ON invitations(owner_member_id) WHERE owner_member_id IS NOT NULL;
CREATE INDEX invitations_created_at ON invitations(created_at DESC);
```

- 码格式：16 位 `[A-HJ-NP-Z2-9]`（去除易混淆字符）；展示为 `XXXX-XXXX-XXXX-XXXX`，输入时大小写/分隔符归一化。
- 码以明文存储：管理员需要在菜单管理页看到码，成员需要复制分享；因此不哈希。接口仅向管理员和码拥有者返回码，其它角色不返回。
- 迁移只追加；不修改 0077/0078。

## 接口

### 注册（匿名，同源）

`POST /auth/register`，`{ email, password, invitationCode }` → `201 { member }` + session cookie

- `400 PASSWORD_AUTH_REQUEST_INVALID` / `400 PASSWORD_POLICY_INVALID` / `400 REGISTRATION_INVITATION_REQUIRED` / `400 REGISTRATION_INVITATION_INVALID`（未知/已用/格式错误统一）
- `409 REGISTRATION_EMAIL_TAKEN`
- `429 REGISTRATION_RATE_LIMITED`
- 事务要求：成员插入与邀请码占用同一 D1 batch；并发的同一码只能插入一个成员。成员插入使用 `SELECT ... FROM invitations WHERE code=? AND status='unused'` 守卫，随后 `UPDATE ... WHERE code=? AND status='unused'`，断言两边 changes 均为 1。

### 登录（匿名，同源）

`POST /auth/password`，`{ email, password }` → `200 { member }` + session（不变）

### 重置（匿名，同源）

`POST /auth/password/reset`，`{ email, password, invitationCode }` → `204`

- `400 PASSWORD_RESET_REQUEST_INVALID` / `400 PASSWORD_POLICY_INVALID`
- `401 PASSWORD_RESET_INVALID`：邮箱未知、成员非 active、没有绑定邀请码、邀请码不匹配、并发条件更新失败统一
- 成功后覆盖密码、清失败计数/锁定、删除该成员全部会话、写 `member.password_reset` 审计。

### 成员“我的邀请码”（已认证成员）

`GET /api/invitations/mine` → `200 { boundInvitation: { code, formattedCode, kind, createdAt, usedAt } | null, invitation: { code, formattedCode, status, createdAt, usedAt, bound, boundEmail } | null }`

`POST /api/invitations/mine` → `200/201` 同结构（创建本人分享码后返回两条）

- 幂等：首次创建 `kind='member'` 码；之后返回同一条。已使用仍返回原码与 `status:'used'`（不能再次生成）。
- `invitation.boundEmail` 是消费该分享码的新成员邮箱（未使用时为 null），按用户要求向分享者展示；`boundInvitation` 是创建本账号的码，也是无会话重置所需凭据。
- 不要求额外 capability；active member 即可。需要同源写校验（POST）。

### 管理员邀请码（仅 admin）

`GET /api/admin/invitations?page=&pageSize=&status=&kind=` → 数字分页：

```json
{ "items": [ { "id","code","formattedCode","kind","status","ownerMemberId","ownerEmail","boundMemberId","boundEmail","createdAt","usedAt" } ],
  "pagination": { "page","pageSize","total","totalPages" } }
```

`POST /api/admin/invitations`，`{ "count"?: 1..20 }` → `201 { invitations: [...] }`

- 两个端点都要求 `requireCapability("member:manage")` + `requireAdminMember`（管理员表面）。
- 管理员可看到所有码（admin + 所有成员码）及其 owner/bound 邮箱；成员邮箱属于管理数据，仅管理员可见。

## 前端

- `/login`：注册模式新增必填“邀请码”输入（格式提示、可粘贴带分隔符）；重置模式同样新增“注册时使用的邀请码”。错误映射：required/invalid 使用双语文案，不区分“未知码/已用码”。
- `/settings`：新增“我的邀请码”卡片。首次进入自动创建并显示；可复制；状态为可用/已使用；已使用后只读并提示不可再生成。
- `/admin/menus`：新增“邀请码”区块（PageHeader 下、菜单树之后）：生成按钮（每次 1 个，可重复点击 = 无限生成）、状态/类型筛选、分页表格（code、类型、分享者、绑定成员、状态、创建/使用时间）。使用共享 `DataTable`/`FilterSelect`/`AppliedFilters`/`PageState`/`Button`，不得用原生控件。

## 历史账户兼容

- 0079 之前已有的密码账户没有绑定邀请码。为避免其永久无法重置：
  1. 已登录成员可通过 `POST /api/account/password` 设置/修改密码（已有密码需当前密码，无密码账户可设首个），成功后撤销其它会话。
  2. `migrations/0080_backfill_password_invitations.sql` 为这类账户回填一条已绑定、used 状态的邀请码；管理员在菜单管理邀请码面板可见并转交账户所有者。
- 回填只针对 `password_hash IS NOT NULL` 的成员；仅 GitHub/微信身份的成员不回填，仍按“无密码则不能无会话重置”处理。

## 不变量

1. 注册必须由邀请码创建；不存在无邀请码的密码账户。
2. 一个码最多创建一个成员；一个成员最多绑定一个码；一个成员最多拥有一个分享码。
3. 注册失败不消耗邀请码；成功与消耗同事务。
4. 重置必须同时知道邮箱与绑定邀请码；不可用旧密码/会话/恢复码替代。
5. 邀请码明文只在管理员列表与拥有者“我的邀请码”出现；日志/审计不写码。
6. 删除/禁用成员不回收其分享码与绑定码（保留审计与管理员可见性）。

## 明确不做

- 不做邀请码过期时间、撤销、批量导出、邮件发送。
- 不做 GitHub/微信登录的邀请码改造（继续使用 allowlist）。
- 不改登录锁定、PBKDF2 参数、注册 IP 限流。
- 不做生产迁移/部署/真实浏览器验收。
