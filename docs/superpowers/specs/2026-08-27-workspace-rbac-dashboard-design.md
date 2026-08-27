# Memory Garden 工作台与 RBAC 位图设计规格

更新时间：2026-08-27

## 1. 目标与边界

Memory Garden 需要从“功能导航页”升级为面向 5–20 人私有团队的个人工作台。工作台采用 shadcn/ui New York 组件语言，AI 知识库是一级业务入口；管理员获得树形角色/权限和菜单治理能力，普通 contributor 仍只能录入、搜索、阅读和使用受限 AI 功能。

必须保持：

- Cloudflare Workers、D1、Durable Objects 和可选 R2 的免费层边界。
- 现有 GitHub OAuth、state、PKCE、allowlist、D1 Session、admin/contributor 角色。
- 现有 `capabilities` 响应字段和 API 路径的向后兼容。
- 服务端是最终授权边界，前端菜单过滤不构成安全控制。
- 不引入公开注册、多租户、计费、企业目录同步或复杂 ABAC。

## 2. 设计方向

Reading this as: 面向技术团队的私有知识工作台，采用 Cloudflare 控制台式高密度布局与 shadcn/ui New York，Zinc/Slate 中性色配单一 Cloudflare Orange 强调色。

设计拨盘：`DESIGN_VARIANCE=5`、`MOTION_INTENSITY=3`、`VISUAL_DENSITY=6`。布局优先信息密度、可扫描性和键盘可达性，不使用渐变、玻璃拟态或装饰性动画。

## 3. 信息架构

### 3.1 工作区一级导航

| 路径 | 文案 | 权限 |
| --- | --- | --- |
| `/` | 工作台 | 登录成员 |
| `/knowledge` | AI 知识库 | `knowledge:read` |
| `/submit` | 录入中心 | `submission:create` |
| `/search` | 搜索 | `knowledge:read` |
| `/agent` | AI 助手 | `knowledge:read` |
| `/my-submissions` | 我的内容 | `submission:read-own` |

### 3.2 管理中心树

```text
管理中心
├── 管理概览
├── 审核队列
├── 文件与解析
├── 重复内容
├── 成员管理
├── 角色与权限
├── 菜单管理
├── 空间与集合
├── 访问统计
└── 审计日志
```

系统菜单保留当前已发布路径；新增路径只追加 migration，不修改历史 migration。

### 3.3 独立站点统计菜单

“站点统计”是管理员可见的独立菜单项，不与知识库内容统计混用。路径保持 `/admin/analytics`，菜单文案使用 `NAV_SITE_ANALYTICS`，权限要求为 `analytics:read`（兼容旧 `audit:read` 投影）。页面展示访问总量、独立访客、登录用户、按日趋势和时间范围筛选；只返回聚合数字，不返回 IP、visitor hash、Cookie、正文或 OAuth 信息。

## 4. 工作台壳层

### 4.1 桌面端

- 左侧 Sidebar 固定宽度 256px，可收起为 64px。
- Sidebar 只渲染当前成员有权访问的菜单树。
- Topbar 固定包含面包屑、全局搜索入口、语言切换和用户菜单。
- 退出登录保持当前 `postLogout` 和服务端确认逻辑。
- 内容区使用 `max-w-7xl` 和统一间距 token。

### 4.2 移动端

- Sidebar 转换为 shadcn Sheet。
- 菜单可通过键盘和触摸打开。
- Topbar 保留当前路径、语言和退出入口。
- 页面状态不因 Sheet 开关丢失。

### 4.3 状态合同

每个页面至少实现 `loading`、`empty`、`error`、`ready` 四种状态；所有可选 API 字段经过 `displayValue` 归一化，禁止向用户输出 `undefined`、`null` 或空白占位。

## 5. 权限位图

### 5.1 固定注册表

权限 bit index 在代码中版本化，不能重排已发布 bit：

```text
0  knowledge:read       1  knowledge:create
2  knowledge:edit       3  knowledge:review
4  knowledge:publish    5  knowledge:delete
6  submission:create    7  submission:read-own
8  submission:read-all  9  member:manage
10 role:manage          11 menu:manage
12 space:manage         13 audit:read
14 analytics:read       15 asset:manage
16 duplicate:review     17 agent:use
18 search:use
```

### 5.2 存储和运算

角色权限使用十六进制字符串存储，例如 `0x7ffff`。服务端使用 `bigint` 运算：

```ts
type PermissionMask = bigint;

function hasPermission(mask: PermissionMask, bit: number): boolean {
  return (mask & (1n << BigInt(bit))) !== 0n;
}
```

不能在前端用 JavaScript `number` 保存完整 mask，避免超过 53 位后的精度问题。D1 中保存 `allow_bits TEXT NOT NULL`，读取时校验 `^0x[0-9a-f]+$` 和最大 bit 数。

### 5.3 兼容投影

`/api/session` 保持现有字段，同时可追加：

```json
{
  "capabilities": ["knowledge:read", "search:use"],
  "permissionMask": "0x50001"
}
```

`capabilities` 始终由位图投影生成；旧前端和旧 API 继续使用 capabilities。admin/contributor 默认角色由现有 policy 映射到固定 mask，避免上线后权限突变。

## 6. 角色管理

### 6.1 数据模型

新增角色表：

```text
roles(id, key, name, description, allow_bits, status, is_system,
      created_at, updated_at)
role_members(role_id, member_id, created_at)
```

为保持当前角色合同，`members.role` 继续保留；第一阶段仅允许一个兼容角色映射到成员，后续再启用多角色关系。系统 admin 角色不可删除，且必须始终存在一个 active admin。

### 6.2 管理规则

- 只有 `role:manage` 可读写角色。
- 保存前返回权限差异预览。
- 角色删除前必须没有成员绑定。
- 不允许移除最后一个管理员的管理权限。
- 每次创建、修改、删除写入 `audit_events`，metadata 只包含 key、权限名和差异，不写正文或 Secret。

## 7. 菜单管理

### 7.1 数据模型

新增菜单表：

```text
menus(id, parent_id, key, label_key, path, icon, group_name,
      position, required_bits, status, visible, is_system,
      created_at, updated_at)
```

### 7.2 树构建算法

1. 查询 `status='active' AND visible=1` 的菜单。
2. 校验 `required_bits` 并过滤无权节点。
3. 按 `parent_id` 建立邻接表，按 `position, key` 稳定排序。
4. 递归构造最多 4 层的树。
5. 删除无可见子节点的父节点。
6. 根据当前 path 返回 active ancestor keys。

写入时拒绝重复 path、未知 i18n key、未知 permission bit、循环 parent、超过 4 层和系统节点删除。

## 8. API 设计

### 8.1 成员会话

- `GET /api/session`：追加可选 `permissionMask` 和 `menuTree`，旧字段不变。
- `GET /api/auth/providers`：保留现有能力探测，仅返回布尔值；当前 UI 仍只显示 GitHub 登录。

### 8.2 角色

- `GET /api/admin/roles`
- `POST /api/admin/roles`
- `GET /api/admin/roles/:id`
- `PATCH /api/admin/roles/:id`
- `DELETE /api/admin/roles/:id`

所有 endpoint 要求 active admin 和 `role:manage`。

### 8.3 菜单

- `GET /api/admin/menus`
- `POST /api/admin/menus`
- `PATCH /api/admin/menus/:id`
- `POST /api/admin/menus/:id/move`
- `POST /api/admin/menus/:id/toggle`

所有 endpoint 要求 active admin 和 `menu:manage`。读路径返回树和稳定的 validation errors，写路径使用 D1 事务和审计。

统计接口继续使用同源 pageview 采集和 5 分钟 visitor/path 去重。未应用 `0026_site_analytics.sql` 时页面显示可恢复错误状态，不阻断其他工作台功能。

## 9. Cloudflare 免费层约束

- 权限、角色和菜单全部存 D1；不引入 Redis、Workers KV 作为授权权威。
- 菜单查询按 keyset/有限深度读取，禁止无界递归和跨表全扫描。
- Durable Object 继续只承担已有会话/legacy VFS/协调职责。
- R2 未启用时，文件功能保持现有 fail-closed 降级。
- AI/Queue/Vectorize 失效不影响工作台导航、知识阅读和权限校验。

## 10. 验收标准

- GitHub OAuth 登录、退出登录、禁用成员会话回归通过。
- admin 和 contributor 看到不同且真实 i18n 文案的菜单树。
- contributor 直接请求角色/菜单管理 API 返回稳定 403，不泄露数据。
- 位图和 capabilities 投影在 18 个固定权限上完全一致。
- 菜单循环、未知权限、重复路径和最后管理员保护均有测试。
- 桌面/移动端 Sidebar、Topbar、键盘导航和焦点状态通过 WCAG 合同。
- 页面源码和运行时均不出现 `undefined` / `null` 文案。
- `npm run typecheck`、相关 Vitest、i18n/WCAG 合同和 `npm run build` 通过。
