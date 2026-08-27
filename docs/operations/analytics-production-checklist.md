# 访问统计生产验收清单

本清单只覆盖 Cloudflare 免费层下的 D1 访问统计，不启用 R2、Queue 或 Vectorize。统计页面仅管理员可见。

## 1. 当前能力

- `POST /api/telemetry/pageview`：同源采集页面访问。
- 每日按 IP + User-Agent 做 SHA-256 哈希，不保存原始 IP。
- 同一访客、同一路径、同一 5 分钟桶只计一次。
- `GET /api/admin/analytics/overview?days=1..31`：管理员读取访问量、独立访客和登录用户聚合。
- 页面入口：`/admin/analytics`。

登录用户量表示统计窗口内产生页面访问的不同 active member 数量，不是 OAuth 按钮点击次数；匿名访问不会计入该项。

## 2. 生产发布前

```bash
rtk git status --short
rtk git rev-parse HEAD
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
```

如果远程仍显示 `0026_site_analytics.sql` 待应用，先导出备份：

```bash
set +x
BACKUP_DIR="$(mktemp -d -t memory-garden-d1.XXXXXX)"
chmod 700 "$BACKUP_DIR"
rtk npx wrangler d1 export memory-garden-control-plane --remote --output "$BACKUP_DIR/pre-analytics.sql"
chmod 600 "$BACKUP_DIR/pre-analytics.sql"
```

再在获得生产授权后执行：

```bash
rtk npm run db:migrate:remote
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
```

Wrangler 会按顺序应用所有未执行的 append-only migration，可能包含 `0005–0028`，不是只执行 `0026`；禁止跳过前置 migration 或执行逆向删除。

## 3. 验收顺序

1. 部署包含访问统计页面和 migration 兼容代码的 Worker 版本。
2. 使用匿名浏览器打开首页和知识库页面。
3. 使用管理员浏览器打开 `/admin/analytics`，切换 7/14/30 天并点击刷新。
4. 确认页面展示“访问量、独立访客、登录用户量”和每日明细。
5. 用 contributor 会话请求管理员统计接口，必须返回 `403`。
6. 确认响应和日志不包含原始 IP、`visitorHash`、OAuth code、Cookie 或知识正文。
7. 使用第二个成员登录并访问页面，确认登录用户量按不同 member 去重。

## 4. 失败处理

- `404` 或 D1 表不存在：Worker 已部署但 `0026` 未应用，停止验收并先完成 migration。
- `403`：检查当前会话是否为 active admin；不要通过修改前端隐藏或伪造角色绕过。
- 数字为 0：先确认页面请求确实返回 `202`，再检查统计窗口 UTC 日期范围。
- 不回滚 D1 migration；修复应通过新的前向 migration 或兼容 Worker 版本完成。
