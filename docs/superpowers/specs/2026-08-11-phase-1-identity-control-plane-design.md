# Memory Garden Phase 1 身份与控制面设计

状态：待用户最终文档审阅

日期：2026-08-11

## 1. 目标

Phase 1 将当前单用户 APP_TOKEN MVP 演进为一个由 Cloudflare Access 保护、具有唯一管理员和少量受邀 contributor 的私有知识库入口，并建立 D1 成员、空间、集合、文本投稿和审计控制面。

本阶段必须保持现有 `KnowledgeBase` Durable Object、migration `v1`、`personal` 工作区和旧版已发布笔记可读。新投稿进入 D1 待审核队列，不在 Phase 1 引入临时发布协议。

### 1.1 已确认决策

- 生产和预览 `workers.dev` URL 均关闭，唯一生产入口为 `memory.crgmhrc.asia`。
- Cloudflare Access 使用 GitHub Identity Provider。
- Access policy 使用明确的邮箱允许名单。
- `BOOTSTRAP_ADMIN_EMAIL` 对应用户首次登录时成为唯一管理员。
- 其他允许名单用户首次登录时自动创建为 active contributor。
- 浏览器使用 Access JWT；自动化使用 Access Service Token 与 APP_TOKEN 双层鉴权。
- 采用统一侧栏：管理员在普通导航基础上增加治理菜单。
- 自动创建“默认知识库”共享 Space 和只读“旧版个人空间”。
- 唯一管理员不能通过 Web 降级、禁用或删除自己；转移必须使用受控 Wrangler/D1 运维流程。
- 新文本投稿写入 D1 `submissions` 并进入 `review_pending`。
- Phase 1 只展示待审核队列，不实现批准、驳回、发布、Revision 或回滚。

## 2. 范围

### 2.1 包含

- GitHub Access 配置与应用 JWT 验证。
- Service Token + APP_TOKEN automation principal。
- D1 migrations、binding、repository 和本地测试环境。
- 成员首次登录、管理员 bootstrap、成员启用与禁用。
- Space 与 Collection 管理。
- 纯文本、Markdown 和代码投稿。
- 我的投稿与管理员只读待审核队列。
- 角色化页面外壳、统一侧栏和服务端 capability 导航。
- 登录、成员、空间、集合和投稿审计。
- 旧版个人空间的只读兼容入口。

### 2.2 不包含

- 文件上传、R2、富文本 HTML 持久化或文档解析。
- 审核决策、发布、Revision、回收站或 SpaceCoordinator。
- D1 FTS5、Vectorize 或新混合检索。
- 持久化 Agent 会话或 Agents SDK。
- 多管理员、公开注册、私人 Space 或多租户组织。

## 3. 身份与信任边界

### 3.1 浏览器成员

Cloudflare Access 是唯一交互式登录入口。Worker 从 `Cf-Access-Jwt-Assertion` 读取应用 Token，通过 Access JWK 验证：

- 签名；
- `iss` 等于配置的 Access team domain；
- `aud` 包含固定 Application Audience tag；
- `exp`、`nbf` 和标准时间约束；
- 必需的稳定 subject 与 email claim。

浏览器提交的 member ID、email、role、status 或 capability 均不可信。

```ts
type MemberPrincipal = {
  kind: "member";
  memberId: string;
  accessSub: string;
  email: string;
  role: "admin" | "contributor";
};
```

### 3.2 自动化主体

自动化请求必须先通过 Access Service Auth policy，再由 Worker 恒定时间验证 APP_TOKEN。automation 不是管理员成员，不能调用成员、空间、集合、审计或管理员投稿 API。

```ts
type AutomationPrincipal = {
  kind: "automation";
  role: "automation";
};
```

automation 仅允许执行 health 与 Phase 0 兼容 smoke 路径：兼容笔记创建、列表、搜索和 chat。

### 3.3 失败关闭

- Access 配置缺失时，成员请求返回 `ACCESS_CONFIG_INVALID`，不回退到未验证身份。
- JWT 缺失或无效时返回稳定 401/403。
- APP_TOKEN 缺失时 automation 路径失败关闭。
- disabled 成员即使仍在 Access allowlist 中，也不能调用应用 API。

## 4. 成员生命周期

### 4.1 首次登录

```text
验证 Access JWT
  → 按 access_sub 查询 member
  → 不存在：执行幂等首次登录创建
  → 检查 status=active
  → 按限频策略更新 last_seen_at
  → 返回 session 与 capabilities
```

首次登录规则：

1. D1 尚无 active admin，且规范化 email 等于 `BOOTSTRAP_ADMIN_EMAIL`：创建 admin。
2. 其他 Access allowlist 用户：创建 active contributor。
3. 数据库已有 admin 后，bootstrap email 不再改变任何现有成员角色。
4. D1 部分唯一索引保证最多一个 active admin；并发 bootstrap 中的唯一冲突必须重新读取成员，而不是生成 500。

### 4.2 管理员保护

- 管理员 API 只能启用或禁用 contributor。
- 唯一管理员不能修改自己的 role/status，也不能删除自己。
- Phase 1 不提供角色转移 Web API。
- 管理员转移必须有独立运维命令、事务性 SQL 和审计步骤；不作为首个实现切片的一部分。

### 4.3 last_seen 限频

为避免每次请求写 D1，仅当 `last_seen_at` 为空或距当前时间超过配置窗口时更新。请求授权不依赖该更新成功；失败记录安全日志但不改变已验证成员的本次权限。

## 5. D1 数据模型

Phase 1 使用顺序 SQL migrations，不引入 ORM。外键开启，所有列表有稳定排序和有界分页。

### 5.1 members

```sql
members(
  id TEXT PRIMARY KEY,
  access_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','contributor')),
  status TEXT NOT NULL CHECK(status IN ('active','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
)
```

使用部分唯一索引约束最多一个 active admin。email 作为展示和 bootstrap 属性，不代替稳定 `access_sub`。

### 5.2 spaces

```sql
spaces(
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK(kind IN ('shared','legacy')),
  status TEXT NOT NULL CHECK(status IN ('active','disabled')),
  position INTEGER NOT NULL,
  read_only INTEGER NOT NULL CHECK(read_only IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

幂等 seed 创建：

- `default`：shared、active、可管理；
- `legacy-personal`：legacy、active、read_only，不允许修改或停用。

### 5.3 collections

```sql
collections(
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  parent_id TEXT REFERENCES collections(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('active','disabled')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

父 Collection 必须属于同一 Space。legacy Space 不允许新增或修改 Collection。

### 5.4 submissions

```sql
submissions(
  id TEXT PRIMARY KEY,
  submitter_id TEXT NOT NULL REFERENCES members(id),
  requested_space_id TEXT NOT NULL REFERENCES spaces(id),
  requested_collection_id TEXT REFERENCES collections(id),
  kind TEXT NOT NULL CHECK(kind IN ('text','markdown','code','rich_text')),
  status TEXT NOT NULL CHECK(status IN ('draft','review_pending','rejected')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

Phase 1 UI 仅允许 text、markdown 和 code。`rich_text` 是为后续迁移保留的数据库枚举，Phase 1 API 不接受该 kind。投稿创建后直接进入 `review_pending`；Phase 1 不修改审核状态。

### 5.5 audit_events

```sql
audit_events(
  id TEXT PRIMARY KEY,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('member','automation','system')),
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
)
```

metadata 使用 action-specific allowlist，不保存 JWT、Access Service Token、APP_TOKEN、完整投稿正文或未经筛选的请求体。

## 6. 授权策略

授权统一由服务端 policy 层执行，不在路由或 UI 中散落角色判断。

| 能力 | contributor | admin | automation |
| --- | --- | --- | --- |
| session、spaces 读取 | 是 | 是 | 否 |
| 旧版知识读取、搜索、chat | 是 | 是 | 是 |
| 创建自己的投稿 | 是 | 是 | 否 |
| 查看自己的投稿 | 是 | 是 | 否 |
| 查看全部待审核投稿 | 否 | 是 | 否 |
| 成员管理 | 否 | 是 | 否 |
| Space/Collection 管理 | 否 | 是 | 否 |
| 审计读取 | 否 | 是 | 否 |
| 兼容 POST /api/notes | 否 | 是 | 是 |

资源所有权检查必须在 D1 查询条件中包含 submitter ID，不能先读取任意投稿再在内存中隐藏。

## 7. API

### 7.1 Session

- `GET /api/session`
- 返回 member 展示信息、role、capabilities、Access logout URL 和服务端导航能力。
- automation 不使用 session API。

### 7.2 投稿

- `POST /api/submissions`
- `GET /api/submissions/mine?cursor=&limit=`
- `GET /api/admin/submissions?cursor=&limit=&status=review_pending`

Phase 1 不提供投稿审核决策或发布端点。

### 7.3 成员

- `GET /api/admin/members?cursor=&limit=&status=`
- `PATCH /api/admin/members/:id/status`

PATCH 只接受 contributor 的 active/disabled 变化。

### 7.4 Space 与 Collection

- `GET /api/spaces`
- `POST /api/admin/spaces`
- `PATCH /api/admin/spaces/:id`
- `GET /api/spaces/:id/collections`
- `POST /api/admin/collections`
- `PATCH /api/admin/collections/:id`

名称、层级、position、status 和分页均有显式上限。legacy Space 返回 `SPACE_READ_ONLY`。

### 7.5 审计

- `GET /api/admin/audit-events?cursor=&limit=&action=`

仅允许固定 action 过滤；metadata 在写入时完成脱敏。

### 7.6 Phase 0 兼容 API

- `GET /api/health`
- `GET /api/notes`
- `POST /api/notes`
- `GET /api/search`
- `POST /api/chat`

读取路径允许 active member 和 automation。兼容写入只允许 admin 和 automation。公开响应形状保持 Phase 0 兼容。

## 8. 页面与信息架构

统一侧栏由 `/api/session.capabilities` 生成。

### 8.1 成员页面

- `/`：快速投稿、最近投稿、旧版知识入口和 Agent 快捷问题。
- `/submit`：text/markdown/code 投稿。
- `/knowledge`：默认知识库与只读旧版个人空间。
- `/search`：旧版已发布知识搜索。
- `/agent`：旧版已发布知识问答。
- `/my-submissions`：仅当前成员投稿。

### 8.2 管理员页面

- `/admin`：成员、待审核、Space、最近审计和配置状态。
- `/admin/submissions`：只读待审核队列，标明发布能力在 Phase 3。
- `/admin/members`：contributor 启用和禁用。
- `/admin/spaces`：Space 与 Collection 管理。
- `/admin/audit`：有界审计列表。

直接访问管理页面时，前端显示服务端 403；管理 API 独立执行相同授权。浏览器移除 APP_TOKEN 输入和本地 token 存储。

## 9. 模块边界

```text
src/identity/access-jwt.ts       Access JWT 验证与 JWK 缓存
src/identity/principal.ts        member / automation 解析
src/authorization/policy.ts      capability 与资源授权
src/members/repository.ts        D1 成员数据访问
src/members/service.ts           bootstrap、状态和管理员保护
src/spaces/repository.ts         Space/Collection SQL
src/spaces/service.ts            层级与只读规则
src/submissions/repository.ts    投稿所有权与分页
src/submissions/service.ts       投稿验证与状态
src/audit/repository.ts          allowlisted 审计写入/读取
src/app.ts                       路由组合和统一错误边界
```

业务服务不直接解析 JWT，identity 层不执行页面路由，repository 不进行角色授权，前端不决定服务端权限。

## 10. 错误与日志

新增稳定错误码：

- `ACCESS_TOKEN_REQUIRED`
- `ACCESS_TOKEN_INVALID`
- `ACCESS_CONFIG_INVALID`
- `MEMBER_DISABLED`
- `ADMIN_PROTECTED`
- `FORBIDDEN`
- `SPACE_READ_ONLY`
- `SUBMISSION_NOT_FOUND`
- `PAGE_CURSOR_INVALID`

错误响应继续包含 request ID，不包含堆栈、SQL、JWT、邮箱 allowlist 或密钥。JWT 验证失败日志只记录固定原因类别和 request ID。

## 11. 测试策略

### 11.1 单元测试

- 本地测试密钥签发 JWT，覆盖签名、iss、aud、exp、nbf 和 claim 缺失。
- automation APP_TOKEN 恒定时间验证与 capability。
- bootstrap、唯一管理员、disabled、self-protection。
- Space/Collection 层级、legacy read-only 和输入上限。
- 投稿 kind、所有权、状态和分页 cursor。
- 审计 metadata allowlist。

### 11.2 workerd + D1 集成测试

- 从空 D1 应用 migrations 与 seed，再次运行不产生重复数据。
- 并发管理员 bootstrap 只产生一个 active admin。
- contributor 首次登录、禁用后的真实 API 拒绝。
- 完整角色权限矩阵。
- contributor 不能通过 ID、列表或 cursor 读取其他成员投稿。
- automation 可执行 smoke 路径但无法调用 admin API。
- 默认 Space 与 legacy Space 行为。
- 旧版 Durable Object 跨请求与激活后仍可读取。

### 11.3 前端测试

- session capability 生成正确导航。
- contributor 页面不渲染管理操作。
- 服务端 401/403/disabled 状态有明确 UI。
- 不再读取或存储浏览器 APP_TOKEN。

## 12. 部署与运维

部署顺序：

1. 创建 D1 数据库并配置 binding。
2. 应用 migrations 与 seed。
3. 创建 GitHub OAuth App，并在 Cloudflare Zero Trust 配置 GitHub IdP。
4. 创建 `memory.crgmhrc.asia` self-hosted Access application。
5. 配置邮箱 Allow policy 与独立 Service Auth policy。
6. 设置 `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`BOOTSTRAP_ADMIN_EMAIL` 和现有 APP_TOKEN。
7. 创建并安全保存 Access Service Token。
8. 部署 Worker。
9. bootstrap 管理员首次登录。
10. 验证 contributor、disabled、automation、旧版 Space 与自定义域。

先配置 Access 后部署 Worker，避免切换窗口内公开暴露站点。Service Token 的 Access policy action 必须为 Service Auth。

### 12.1 回滚

- D1 migration 只追加，不回退或删除数据。
- Access 始终保持启用。
- Worker 回滚目标必须兼容现有 `KnowledgeBase` class、migration `v1` 与 D1 schema。
- Phase 0 回滚仅提供 APP_TOKEN 管理员恢复路径；普通 GitHub 用户体验需通过重新部署 Phase 1 恢复。

## 13. 完成标准与证据边界

Phase 1 只有在以下证据完成后才标记完成：

- 本地类型、单元、workerd、D1 migration、权限矩阵和 dry build 全部通过。
- 自定义域 GitHub Access 登录成功。
- 唯一管理员 bootstrap 与 contributor 首次登录成功。
- disabled 成员在真实 Access 会话下被应用拒绝。
- Access Service Token + APP_TOKEN smoke 成功。
- 旧版 Durable Object 跨激活仍可读。
- workers.dev 生产与预览 URL 继续关闭。

本地 fixture 不证明 Access、GitHub、远程 D1、真实 Service Token 或部署后 Durable Object 成熟。Phase 1 不得宣称文件上传、审核发布、Revision、混合检索或持久化 Agent 已完成。
