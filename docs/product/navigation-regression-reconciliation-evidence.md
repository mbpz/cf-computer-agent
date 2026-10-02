# 导航保护扩大回归对账（本地）

基线 `6a25d88`。承接讨论操作编号/同编号重试保护后的12项既有回归失败；主清单仍原30、范围内29、关闭5、开放24，D08排除。当前A05/R2-008及导航Task 4，不关闭父项。

## 真实缺陷与测试契约

- 阅读器 loading/error 占位尚无有效笔记所有者时，`discardCache` 在无缓存草稿的情况下仍返回false，导致已准入的离页被拦截。仅将“无缓存可清理”判定提前到所有者检查之前；恢复中、未决写入和其他动作锁仍优先阻挡，实际缓存删除仍需要所有者。
- 引用路由测试补齐已登录成员，改用正式导航入口，而不是直接篡改浏览器历史。新增初始读取503后可离开的回归；未完成的旧引用读取在离页后仍必须取消且忽略迟到结果。
- 项目摘要和7项权限撤销测试显式处理独立授权的壳层通知摘要GET，保持所有领域请求可见、拒权领域请求为0。状态写测试确认对话框目标并点击确认，继续核对旧摘要取消/迟到隔离。
- 最近访问客户端现有契约为畸形响应整体拒绝，不静默过滤。保留有效列表断言，增加4种混合畸形行fail-closed断言。

## 验证

1. 基线四文件50用例38通过/12失败。
2. 补齐夹具后，生产修复前，引用与笔记草稿测试44项42通过/2失败（加载中引用导航和新增初始503导航），构成RED。
3. 生产修复后定向五文件95/95通过。新增导航测试补齐异步flush，最终日志无未包裹act或window未定义的异步异常；早期带异常的运行不算干净通过。
4. 扩大前端及讨论服务/Worker179文件3185/3185通过。相较上轮3180项新增5项，无删除/跳过原失败。不是整个仓库测试集或真实浏览器验收。
5. 项目typecheck、笔记hook独立strict DOM类型检查、UI构建/静态VM入口隔离、双语校验通过；成熟度15/15，领域快照check通过，清单审计9/9通过。完整App附加strict DOM本轮未复验，不宣称其既有诊断已解决。

命令：

```sh
rtk proxy npx vitest run test/unit/frontend-knowledge-citation-route.test.tsx test/unit/frontend-project-summary-recovery.test.tsx test/unit/frontend-recent-visits.test.ts test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-reader-note-draft.test.tsx
rtk proxy npx vitest run test/unit/frontend-*.test.ts test/unit/frontend-*.test.tsx test/unit/discussions-service.test.ts test/worker/discussions.test.ts
rtk proxy npm run typecheck
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable frontend/lib/use-reader-note.tsx
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run verify:workbench-maturity
rtk proxy npm run audit:workbench-domain
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

临时日志 `/tmp/regression-contract-before.log`、`/tmp/reader-empty-owner-red.log`、`/tmp/regression-contract-final.log`、`/tmp/navigation-regression-wide-final.log`、`/tmp/navigation-regression-gates.log`，非持久发布凭证。

## 下一步与边界

允许继续讨论操作的独立精确查询，不以列表扫描或回执校验代替精确GET。跨刷新恢复、原生浏览器和真实身份/VM验收仍开放，D07仍开放。无本地外部阻塞；未push、部署、远程迁移，未扩展备份/加密范围。
