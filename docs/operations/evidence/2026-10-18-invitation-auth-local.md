# 证据：邀请码注册与绑定式密码重置（本地实现）

- 日期：2026-10-18
- 范围：`IDN-007`（邀请码注册/登录/绑定式重置）、`ADM-007`（管理员在菜单管理页查看与生成邀请码）
- 性质：本地实现、迁移字节校验、Workerd/React 测试；**不含**生产迁移、部署或真实浏览器验收
- 设计：`docs/superpowers/specs/2026-10-18-invitation-code-registration-design.md`

## 实现范围

- `migrations/0079_invitations.sql`：邀请码表（`kind=admin|member`、`owner_member_id`、`bound_member_id`、`status=unused|used`、`created_by_member_id`、时间戳），唯一 code、唯一 bound member、唯一 member owner 部分索引、created_at 索引；只追加。
- `src/invitations/{types,repository,service}.ts`：16 位 `[A-HJ-NP-Z2-9]` 随机码、归一化/分组、常量时间比较、唯一冲突重试；成员终身一个分享码（懒创建、owner 唯一索引兜底并发、used 后冻结）；管理员 1–20 个/次的无限生成；数字分页列表（JOIN 分享者/绑定成员邮箱）；按成员查绑定码。
- `src/password/{service,repository}.ts`：注册必须携带邀请码；成员插入与邀请码占用在同一 D1 batch（`INSERT ... SELECT WHERE EXISTS(unused)` + `UPDATE ... WHERE status='unused'`，断言两条 changes=1），失败统一 `REGISTRATION_INVITATION_INVALID` 且不消耗码、不插成员；重置要求 active + 存在绑定码 + 常量时间匹配，成功覆盖密码、清锁定、删全部会话、写 `member.password_reset`。
- `src/routes/auth.ts`：`POST /auth/register`、`POST /auth/password/reset` 增加 `invitationCode` 严格解析；登录不变。
- `src/routes/invitations.ts`：`POST /api/invitations/mine`（active member、同源、幂等，返回码/状态/绑定布尔值，不暴露绑定成员）。
- `src/routes/admin-invitations.ts`：`GET/POST /api/admin/invitations`（`member:manage` + `requireAdminMember`、数字分页、status/kind 筛选、1–20 生成）。
- `src/app.ts`：创建 InvitationsService/Repository、注入 PasswordAuthService、分派新路由。
- 前端：`frontend/lib/invitations-data.ts`；`frontend/pages/login-page.tsx` + `frontend/lib/password-auth-data.ts`（注册/重置必填邀请码、归一化、错误映射）；`frontend/components/settings/my-invitation-card.tsx` + 设置页（幂等创建、复制、已用只读）；`frontend/components/admin/invitation-admin-panel.tsx` + 菜单管理页（生成、筛选、共享 DataTable 数字分页、forbidden/error 态）；`frontend/lib/i18n.ts` en/zh 各 2109 键对等。
- `scripts/verify-m1-migrations.mjs`、`scripts/m1-release-contract.test.mjs`：迁移台账 78→79 与 0079 哈希 pin。

## 行为矩阵（Workerd / React）

| 检查 | 实测 |
| --- | --- |
| 成员分享码读取 | `GET /api/invitations/mine` 200：未创建时 `{invitation:null}`，已创建时返回同一条（设置页加载不产生写） |
| 成员分享码首次创建 | 设置页点击“生成我的邀请码”后 `POST /api/invitations/mine` 201；再次调用 200 且同一条 |
| 成员码唯一 | owner 唯一索引兜底；同一成员不能创建第二个 |
| 管理员生成 | `POST /api/admin/invitations` 201；1–20 校验；可重复生成 |
| 管理员列表 | 数字分页；status/kind 筛选；返回 code/owner/bound/时间 |
| 管理员权限 | contributor 或非 admin → 403；同源校验 |
| 注册（成员码/管理员码） | 201 + session；码变为 used 并绑定新成员 |
| 注册（未知/已用/缺失码） | 统一 `REGISTRATION_INVITATION_INVALID` / `REGISTRATION_INVITATION_REQUIRED`；失败不消耗码、不插成员 |
| 并发同一码注册 | 只创建一个成员；另一个失败 |
| 注册邮箱已存在 | 409 `REGISTRATION_EMAIL_TAKEN`；GitHub-only 邮箱不可被抢占 |
| 重置（正确绑定码） | 204；覆盖密码、清锁定、删全部会话、写审计 |
| 重置（错码/无码/无绑定/禁用成员） | 统一 401 `PASSWORD_RESET_INVALID` |
| 登录 | 不变：错误 5 次锁定 15 分钟；禁用成员密码正确后 403 |
| 邀请码存储 | 明文（管理员/成员需要读取与复制）；日志/审计不写码 |
| 前端 | 登录注册/重置邀请码必填与错误文案；设置页复制与已用只读；菜单页生成/筛选/分页/forbidden |

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `npx vitest run test/worker/password-auth.test.ts test/worker/invitation-auth.test.ts` | 22/22 通过 |
| `npx vitest run test/unit/invitations.test.ts` | 11/11 通过 |
| 前端定向：login/password-auth/invitations | 28 通过 |
| `node scripts/verify-m1-migrations.mjs --files` | `[pass] migration-files count=79` |
| `npm run test:smoke` | 88 + 14 + 30 通过 |
| `npm run typecheck` | Worker + 前端通过 |
| `npm run check`（HEAD 工作树） | 退出码 0（unit 410 文件/5606、worker 79 文件/1321、smoke 88+14+30、landing 100） |

## 未覆盖 / 非声明

- 未应用远程迁移、未部署；生产 schema 仍停留在旧版本。
- 未做真实浏览器、移动键盘、密码管理器自动填充与视觉验收。
- 未验证邀请码明文存储的运维泄露面；管理员页面是唯一读取面，仍需生产权限与审计复核。
- 未对重置接口新增独立 IP 限流；当前依赖绑定码熵（16 位）与登录锁定，发布前由 OPS-009 复核。
- GitHub/微信专属成员没有绑定邀请码，不能设置/重置密码；如需，由管理员另行设计。
