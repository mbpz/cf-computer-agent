# 讨论页冻结操作与离页保护：本地验收证据

基线：`d408419`；当前归属 A05 / R2-008 / 导航 Task 4。只关闭此本地子步骤，不关闭功能父项。

## 问题与修复

旧控制器在正文、回复、提及对象变化时丢弃失败尝试的 clientKey；权限读取失败还会 remount 草稿所有者。响应丢失后再操作因此可能换号重复发送。旧客户端对 `created:false` 回执只核对目标和编号，即使正文不同也可能当作确认。

- [x] 第一次提交冻结 UUID、上下文、规范化正文、回复及提及对象。调用者和传输修改各自参数不能修改保留的原操作。未决时拒绝不同语义；成功确认后，相同正文的新消息才生成新编号。
- [x] 同步提交去重；发送中及结果未知期间锁定正文和回复；显式“同编号安全重试”使用原始请求，不自动重发。
- [x] 使用既定 `useCreateDraft`：普通脏草稿离页需确认，取消不丢失；未决写入阻止站内离页并触发 beforeunload 警告；陈旧处理器与同事件导航不能绕过锁。
- [x] 读取错误或401/403/404隐藏私人内容而不遗忘未决编号；恢复授权后保留原草稿与回复。权限 epoch 失效后迟到的成功/拒绝回执不能清除原操作或恢复私人读取。
- [x] 新建与重放回执均精确核对 context、clientKey、正文、回复及提及对象；服务端仍采用已有 first-write-wins，客户端拒绝将不同正文的旧回执当作当前操作成功。实际本地 Worker/D1 验证精确重试返回原行、不额外插入。
- [x] 回执确认先释放操作和离页锁，再刷新/回到第一页，避免新增保护拦住本次成功后的分页跳转。

## RED → GREEN

首次针对新约束的路由测试为11失败/28通过：复现换号、权限失败遗忘操作、未知结果可编辑、无离页保护。修复后，重放回执精确内容测试先出现1个失败（错误正文被接受），再修复。原先要求“编辑后换号”和“拒绝读取后清除未知操作”的旧断言已改为用户确认的冻结编号契约，没有放宽权限隔离。分页测试使用已准入的导航事件，不以伪造未知历史项代表真实浏览器回退验收。

定向5文件65/65：讨论路由39、页面4、客户端7、服务与实际本地Worker/D1合计15。包括同步重复提交、未知重试、冻结参数隔离、回复锁定、离页确认、权限清屏/重新授权、跨epoch迟到回执、成功后的分页和失败读取，以及真实HTTP重放/成员隔离。

项目 typecheck、讨论组件独立 strict DOM 类型检查、UI构建/VM静态入口隔离、双语校验、成熟度15/15及领域快照check通过。静态VM隔离不代表真实VM运行/网络验收。功能清单审计为原30、范围内29、关闭5、开放24，D08排除。完整App的附加strict DOM本次未复验，不宣称全绿。

## 扩大回归与基线对照

首次扩大179文件3180用例，13项失败。其中1项为 Worker 客户端集成测试仍期待改正文的同编号重放被接受，已更新为“拒绝错误语义 + 精确重试返回原回执”，并通过上述实际本地Worker复验。

另外12项在独立导出的原始 `d408419` 基线中复现（四文件50项：38通过/12失败），不是本轮引入，也没有隐藏或改成跳过：

| 文件 | 基线失败 | 现象 / 后续需核对 |
| --- | ---: | --- |
| `test/unit/frontend-knowledge-citation-route.test.tsx` | 2 | 直接篡改hash后未得到预期准入/取消旧读取；须对齐导航门禁再判断产品行为 |
| `test/unit/frontend-project-summary-recovery.test.tsx` | 2 | 请求数量及状态写后恢复期望不符 |
| `test/unit/frontend-recent-visits.test.ts` | 1 | 旧用例期待丢弃畸形行，客户端当前拒绝整个畸形响应 |
| `test/unit/frontend-workbench-extended-routes.test.tsx` | 7 | 撤销权限用例预期零请求，但观察到额外请求；须区分共享壳层与领域数据 |

最终扩大回归为179文件、3180用例：175文件通过，3168用例通过，剩余12项失败与上述基线一致；不能记作全绿。审核评论既有唯一编号/同编号安全重试/独立精确GET协议另行复验5文件119/119通过，日志 `/tmp/discussion-comment-protocol-recheck.log`。

基线副本仅导出 HEAD 的 frontend/src/shared/tools/test 与类型/包配置，依赖复用已安装 node_modules；没有回滚当前工作区、没有读取或复制生产密钥。初次基线导出缺少shared/tools而未能加载的结果不计作有效对照；补齐后才得到以上真实断言失败。

## 可重复命令

```sh
rtk proxy npx vitest run test/unit/frontend-discussion-route.test.tsx test/unit/frontend-messages-page.test.tsx test/unit/frontend-discussions-data.test.ts test/unit/discussions-service.test.ts test/worker/discussions.test.ts
rtk proxy npx vitest run test/unit/frontend-*.test.ts test/unit/frontend-*.test.tsx test/unit/discussions-service.test.ts test/worker/discussions.test.ts
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable frontend/pages/messages/thread-page.tsx frontend/pages/messages/discussion-model.ts frontend/lib/discussions-data.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run verify:workbench-maturity
rtk proxy npm run audit:workbench-domain
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

临时日志：`/tmp/discussion-leave-red.log`、`/tmp/discussion-receipt-red.log`、`/tmp/discussion-local-worker-final.log`、`/tmp/discussion-head-baseline-tests.log`、`/tmp/discussion-leave-wide-final.log`、`/tmp/discussion-dom-types.log`、`/tmp/discussion-ui-build.log`、`/tmp/discussion-i18n.log`、`/tmp/discussion-maturity.log`、`/tmp/discussion-domain-check.log`、`/tmp/discussion-checklist-tests.log`。临时日志不是持久发布证据。

## 未关闭边界与下一步

讨论页本次是同编号重试与精确**回执校验**，并未新增按编号只读查询接口；不能把它冒充审核评论已有的精确GET查询协议。两者操作意图仍只在内存保存，跨刷新/关页后的持久恢复未完成。原生浏览器完整版本、真实身份、强制离页和VM运行验收仍开放。

下一允许先核对/修复扩大回归暴露的四个既有失败文件，再继续讨论操作的独立精确查询及其余导航Task 4子项。无阻止本地工作的外部条件；父清单仍29范围内/5关闭/24开放。未push、部署、远程迁移，未增加备份或加密范围。
