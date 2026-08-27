# 工作台 RBAC / 统计发布候选证据 — 2026-08-28

## 候选版本

| 字段 | 值 |
| --- | --- |
| 分支 | `main` |
| 最新本地提交 | `14bc765` |
| Worker | `memory-garden-agent` |
| 自定义域 | `https://memory.crgmhrc.asia` |
| D1 | `memory-garden-control-plane` (`653c9e43-c7ad-45b8-a109-bc144843bee7`) |

本地 `main` 当前包含角色成员分配、有效权限投影、站点统计维度、四层菜单树、个人菜单、双语 shadcn 工作台，以及工作台任务权限位与 D1 任务表迁移。工作树干净；当前分支尚未 push。

## 0030–0032 迁移内容

- `0030_site_analytics_dimensions.sql`：为 `site_visit_events` 增加脱敏 IP、国家/地区/城市、colo、User-Agent 字段及两个查询索引。
- `0031_workspace_menu_hierarchy.sql`：将搜索/Agent 归入知识库，新增治理节点，并将成员/角色/菜单/空间/审计/统计归入治理。
- `0032_workspace_tasks.sql`：新增成员私有任务、标签、知识条目关联表及索引，并注册 `tasks` 工作台菜单和 bit 20 权限。

SHA-256：

- `0030`: `280a151b5f8c21358ea2dcb7a417eb0f2ac6ee408717322f296864b9a301c3db`
- `0031`: `4426af2ccdf9f27350f8420f3775d66ffbaa255043a907b026bb9bcb4c4ef493`
- `0032`: `9502a1f97d140bd237f2c5f216c79589d165f6e50cc1714f1267458aede7b884`

## 本地验证

- 空 D1 从 0001 到 0032 全部应用成功。
- 同一隔离数据库重复执行返回 `No migrations to apply`。
- 迁移 schema/数据保留测试：15/15 通过。
- Worker 测试：24 文件、377 项通过；迁移定向测试 15/15 通过。
- 单元测试：155 文件、1177 项通过。
- Smoke/契约测试：45 项通过；i18n 13 项通过。
- TypeScript、i18n、WCAG、Vite UI/Worker dry-run 构建均通过。

## 生产状态

`rtk npm run db:migrate:remote` 已按顺序应用 0030、0031、0032，三项均成功；随后只读查询 `rtk npx wrangler d1 migrations list memory-garden-control-plane --remote` 返回 `No migrations to apply`。

```text
0030_site_analytics_dimensions.sql ✅
0031_workspace_menu_hierarchy.sql ✅
0032_workspace_tasks.sql ✅
```

按用户明确选择，本次未导出本地生产 D1 备份；依赖 D1 migration 的有序、幂等执行和 Cloudflare 侧原子失败语义。生产 Worker 版本 `deb6042b-11b8-46d7-9c55-6e2669348227` 已上传并以 100% 流量发布。

匿名生产 smoke（2026-08-28）结果：

| 检查 | HTTP | request ID |
| --- | ---: | --- |
| `/` | 200 | — |
| `/api/auth/providers` | 200 | — |
| `/api/session` | 401 | `a31f02570b941ec0` |
| `/api/admin/analytics/overview?days=7` | 401 | `a31f025aafe109a1` |
| `/api/navigation` | 401 | `a31f025eaad7848e` |

`/api/auth/providers` 返回 `{"github":true,"wechat":false}`，符合当前暂不启用微信登录的约束。匿名请求均未泄露受保护数据。

## 尚未覆盖的生产证据

- 本次只完成匿名 smoke；管理员正向统计、菜单树、普通用户权限和退出后会话失效仍需浏览器登录态复验。
- 本次未运行 signed automation smoke，因为本地未读取或上传 `SECRETS_FILE`，并遵循用户约束沿用 Cloudflare 已配置 secrets。
