# React/shadcn 前端切换手册

## 当前状态

React + Vite + shadcn 源码组件已经接入 Worker Assets，当前目录为 `frontend/dist`。旧 `public/` 仍保留，只作为回滚源；本地 `npm run check` 已通过，尚不代表生产域名已验证。

## 发布前门禁

```bash
rtk npm run check
rtk npm run build:ui
rtk npx wrangler deploy --dry-run
```

dry-run 必须显示 `frontend/dist`，并保留 `KNOWLEDGE`、`DB`、`AI`、`ASSETS` 和 `ALLOW_INSECURE_LOCAL` 绑定；不要在这一步修改 D1 migration、DO migration tag 或 OAuth Secret。

`npm run build` 还会运行 `build:legacy-audit`：旧 `public/` 回滚文件必须仍存在，React 源码和 `frontend/dist` 不得新增旧 vanilla 入口引用。

## 生产发布与验证

使用项目既有的版本上传/部署手册执行生产发布。发布后只访问自定义域，按顺序检查：

1. `/`、`/knowledge`、`/search`、`/submit`、`/admin` 等已知路由返回 React root。
2. 未登录访问重定向到 GitHub；登录后 `/api/session` 返回成员和 capability。
3. Contributor 访问管理员 API/页面得到 403。
4. Markdown、错误响应、request-id 和 CSP 头保持不变。
5. GitHub OAuth callback、disabled contributor、DO 跨激活读取和 Dashboard URL 状态使用生产证据模板记录。

## 回滚

若 React 入口异常，恢复 `wrangler.jsonc` 的 Assets 目录为 `./public`，重新执行完整门禁和版本部署。确认旧 Shell 恢复后再分析问题；不要删除 D1 数据、DO 类、migration 或 OAuth Secret。

React 生产 smoke 与旧 UI 回滚各至少成功一次后，才允许删除 `public/app.js`、`public/workspace-ui.js`、`public/navigation.js` 和旧 UI 样式。当前这些文件仍被历史单元测试与 i18n 门禁引用，不能提前删除。
