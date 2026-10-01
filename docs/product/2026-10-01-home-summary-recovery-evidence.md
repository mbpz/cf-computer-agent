# A06：首页摘要失败与请求清理的本地证据

日期：2026-10-01。基线 `b887972`，分支 `codex/functional-checklist-completion`。

## 交付范围

- [x] 首页三份摘要出现部分故障时，已成功的区块保留，失败区块显示不可用及显式重试；不将失败的任务摘要显示为0，不将失败的知识/活动读取显示成空列表。
- [x] 真实0和真实空列表继续显示正常空态。三个接口都失败则显示整页错误与重试。
- [x] 重试只发起 GET 读取，重复点击合并；重试期间不呈现上一份摘要为最新。没有自动重放写操作。
- [x] 三接口共享 AbortSignal，路由退出/卸载取消，忽略迟到响应。首页以成员/角色/权限作用域作为 React key，避免身份切换复用旧摘要。
- [x] 任一401/403立即丢弃整份受保护摘要并取消其余读取；即使兄弟请求未完成也显示错误、不提供同次读取重试按钮。晚到成功回执不能恢复受保护区块。
- [x] 任务摘要要求非负安全整数且总数不溢出；近期知识和活动要求合法列表与合法行，拒绝缺失列表和损坏行，不悄悄归空。沿用既有知识/活动字段规范化行为，不声称完整语义校验。

## TDD与验证

初始10个测试在未修复基线上失败，包含故障被显示为空/零、非法负数显示、401/403未立即清理和导航未取消；随后修复并扩展到15项。

实际组件测试挂载 App、真实 React/happy-dom 和 Response，并模拟网络；不冒充原生浏览器或线上真实身份。覆盖三种区块故障、真实空、整体故障、显式双击重试、401/403加未决兄弟请求、路由离开/返回及晚到结果、卸载后新会话与旧回执隔离、异常列表/行/任务计数。

验证命令（工作目录为仓库根目录，均通过）：

```sh
rtk proxy npx vitest run test/unit/frontend-home-route.test.tsx test/unit/frontend-workbench-home.test.tsx test/unit/workbench-data.test.ts test/unit/frontend-tasks-data.test.ts test/unit/frontend-knowledge-data.test.ts test/unit/frontend-shell-notifications.test.tsx test/unit/frontend-shell.test.tsx test/unit/frontend-responsive.test.tsx test/unit/frontend-auth-boundary.test.ts test/unit/frontend-app-routes.test.ts test/unit/frontend-tasks-route.test.tsx test/worker/activity.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
```

结果：12文件117/117，其中新增首页15/15；本地活动Worker/D1契约通过。类型与UI构建通过，保留既有大chunk警告，VM构建隔离通过；i18n13/13及静态检查通过。测试没有调用远程AI。

## 边界与剩余

- A06仍需真实原生浏览器双身份、退出、前后台、键盘与移动验证；没有收到新的解锁确认，不改用其他控制通道。
- 当前首页读取仍等待普通并行读取结算后汇总，未新增后台实时更新或自定义超时；401/403属于立即终止例外。没有将此边界描述成实时摘要。
- Checklist父项保持29范围内、5完成、24未完成（D08排除），不因为子项测试通过而关闭父项。
- 下一允许步骤：继续A05既定逐页异步/危险操作核查；原生验收需先解除锁屏阻塞。
- 本批仅本地提交；未推送、部署、远程迁移、访问GitHub、读取SECRETS_FILE或改动预览；不添加加密或备份。
