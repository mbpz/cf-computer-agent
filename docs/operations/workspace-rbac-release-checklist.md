# 工作台、RBAC 与站点统计发布清单

本清单只覆盖 shadcn 工作台、权限位图、角色/菜单治理和管理员站点统计。GitHub OAuth、D1 Session、5–20 人私有知识库和 Cloudflare 免费层边界保持不变。

## 本地/Workerd 发布前门禁

```bash
rtk npm run typecheck
rtk npm run verify:i18n
rtk npm run verify:wcag
rtk npm run verify:m1:migrations -- --files
rtk npx vitest run \
  test/unit/permission-bitmap.test.ts \
  test/unit/session-permission-projection.test.ts \
  test/unit/workspace-shell.test.tsx \
  test/unit/workspace-dashboard.test.tsx \
  test/unit/admin-roles-page.test.tsx \
  test/unit/admin-menus-page.test.tsx \
  test/worker/analytics.test.ts \
  test/worker/admin-roles.test.ts \
  test/worker/admin-menus.test.ts
rtk npm run build
```

验收重点：

- `NAV_KNOWLEDGE_BASE` 是工作区一级菜单；`NAV_SITE_ANALYTICS` 是独立管理员菜单。
- contributor 不能读取角色、菜单和站点统计 API；管理员才能访问。
- 权限 mask 使用 BigInt，D1/JSON 只传 `0x...` 字符串。
- 统计返回访问量、独立访客、登录用户、趋势/页面/地区排行和最近访客；IP 仅为脱敏值，不返回 Cookie、visitor hash 或 OAuth 数据。
- 系统角色/菜单不可修改；自定义角色/菜单的变更写入审计；非法 i18n key、重复路径、循环和超过 4 层树必须拒绝。

## 生产发布顺序

生产操作必须由操作者在当前变更窗口明确授权后执行：

```bash
# 1. 先备份普通 D1 表（避免导出 FTS5 virtual table）
rtk npx wrangler d1 export memory-garden-control-plane --remote --table members --output ./backup/members.sql

# 2. 应用 append-only migrations（当前工作树包含 0030_site_analytics_dimensions.sql、0031_workspace_menu_hierarchy.sql）
rtk npm run db:migrate:remote

# 3. 构建并上传版本；密钥文件必须位于 .gitignore 且发布后删除
rtk npm run build:ui
rtk npx wrangler versions upload --secrets-file ./SECRETS_FILE --message "workspace RBAC analytics release"

# 4. 在 Dashboard 将版本提升为 production，并确认自定义域仍指向该版本
```

不得重新开启 workers.dev、preview URL 或 Zero Trust 付费能力。若 migration、版本提升或自定义域 smoke 失败，停止后续步骤，保留 request ID 和版本 ID，按 `docs/operations/rollback.md` 回滚。

## 生产 smoke 证据

```bash
BASE_URL="https://memory.crgmhrc.asia"
rtk curl -fsS "$BASE_URL/" -o /tmp/memory-garden.html
rtk curl -fsS "$BASE_URL/api/auth/providers"
rtk curl -i "$BASE_URL/api/admin/analytics/overview?days=7"  # 未登录应 401
```

管理员登录后另行记录：

1. `/admin/analytics` 显示访问总量、独立访客、登录用户和趋势。
2. contributor 访问 `/api/admin/analytics/overview`、`/api/admin/roles`、`/api/admin/menus` 均为 403。
3. 管理员访问 `/api/admin/roles`、`/api/admin/menus` 为 200；自定义角色/菜单变更后审计日志出现对应事件。
4. 退出后 `/api/session` 返回 401，浏览器不会因旧 Cookie 自动恢复登录。

记录字段：生产版本 ID、部署时间、每个请求的 `x-request-id`/Cloudflare Ray ID、migration 列表、回滚决定。不得把本地或 Workerd 结果冒充生产证据。
