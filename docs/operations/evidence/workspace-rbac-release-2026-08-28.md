# 工作台 RBAC / 统计发布候选证据 — 2026-08-28

## 候选版本

| 字段 | 值 |
| --- | --- |
| 分支 | `main` |
| 最新本地提交 | `b6742ad` |
| Worker | `memory-garden-agent` |
| 自定义域 | `https://memory.crgmhrc.asia` |
| D1 | `memory-garden-control-plane` (`653c9e43-c7ad-45b8-a109-bc144843bee7`) |

本地 `main` 当前包含角色成员分配、有效权限投影、站点统计维度、四层菜单树、个人菜单和双语 shadcn 工作台。工作树干净；当前分支尚未 push。

## 0030/0031 迁移内容

- `0030_site_analytics_dimensions.sql`：为 `site_visit_events` 增加脱敏 IP、国家/地区/城市、colo、User-Agent 字段及两个查询索引。
- `0031_workspace_menu_hierarchy.sql`：将搜索/Agent 归入知识库，新增治理节点，并将成员/角色/菜单/空间/审计/统计归入治理。

SHA-256：

- `0030`: `280a151b5f8c21358ea2dcb7a417eb0f2ac6ee408717322f296864b9a301c3db`
- `0031`: `4426af2ccdf9f27350f8420f3775d66ffbaa255043a907b026bb9bcb4c4ef493`

## 本地验证

- 空 D1 从 0001 到 0031 全部应用成功。
- 同一隔离数据库重复执行返回 `No migrations to apply`。
- 迁移 schema/数据保留测试：15/15 通过。
- Worker 测试：24 文件、376 项通过；迁移定向测试 15/15 通过。
- 单元测试：155 文件、1177 项通过。
- Smoke/契约测试：45 项通过；i18n 13 项通过。
- TypeScript、i18n、WCAG、Vite UI/Worker dry-run 构建均通过。

## 生产状态

只读查询 `wrangler d1 migrations list memory-garden-control-plane --remote` 显示：

```text
0030_site_analytics_dimensions.sql
0031_workspace_menu_hierarchy.sql
```

两项仍待应用。尚未执行生产备份、远程迁移、版本提升或生产 smoke；本文件不得作为生产成功证据。

## 获得生产授权后的顺序

1. 导出 `site_visit_events`、`menus`、`roles`、`role_members` 到权限受控的临时目录。
2. 执行 `rtk npm run db:migrate:remote`，确认 0030/0031 均为成功状态。
3. 上传并提升当前版本，确认自定义域仍指向该版本。
4. 运行匿名 401、管理员 200、contributor 403、菜单树和退出后 Session 401 smoke，并记录 request ID/Ray ID。
