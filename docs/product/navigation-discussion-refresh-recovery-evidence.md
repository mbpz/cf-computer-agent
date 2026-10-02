# Discussion operation refresh recovery — local evidence

基线 `70b5510`，既有分支 `codex/functional-checklist-completion`。承接已完成的唯一编号、同编号重试和精确 GET 查询；本轮补同标签页刷新/组件重建后的未决操作恢复，不新增父功能、不执行发布。

## 行为与边界

- [x] 当前会话成员与讨论 ID 共同划分 sessionStorage 记录，记录内再次绑定成员/讨论身份及版本。
- [x] 首次发送前冻结编号、目标、正文、回复 ID、提及集合；保存并回读验证成功后才允许 POST。
- [x] 挂载仅恢复本地记录，等待对应讨论重新授权读取；不自动 POST 或精确 GET，不从消息分页猜测结果。
- [x] 恢复原编号和冻结内容，继续禁止编辑、导航及未确认离页；仅显式精确查询或同编号重试可确认原操作。
- [x] 精确回执成功后按原完整意图比较并清理记录；清理失败仍保留内存编号，不误释放未知操作。
- [x] 配额、存储异常、静默丢写、损坏/未知版本/错成员记录及冲突记录均拒绝覆盖；保存失败不发网络写。
- [x] 会话成员/讨论变更重建 route owner，隐藏原草稿；旧 owner 的迟到回执不能清除原记录。新 owner 不显示旧成员的正文或编号。
- [x] 恢复目标与授权讨论不一致时阻止 composer；授权拒绝时不展示恢复的私人内容，重新授权后原编号仍可恢复。
- [ ] 原生浏览器刷新、关闭标签页、浏览器重启、强制离页、真实身份切换端到端验收。本轮是本地模型与 DOM/Worker 测试，不是这些原生验收。

存储范围仅当前标签页会话；不承诺关闭标签页、浏览器重启、清除站点数据后恢复。保存前失败且未发出网络请求时，仍需要保留原页面直到存储恢复。损坏记录不会自动清除，也不会通过新编号绕过。没有新增加密或备份需求，也未把它称为安全密钥存储。

普通未提交文字仍仅受原有离页确认保护；本轮持久化的是准备发送/结果未知的操作，不声称新增普通草稿自动保存。只读确认仍仅证明消息落库，不证明通知副作用完成。

## 代码

- `frontend/lib/discussion-intent.ts`：严格记录校验、成员/讨论隔离、回读校验、相同意图保存/清理。
- `frontend/pages/messages/discussion-model.ts`：恢复控制器、输入快照、发送前持久化与回执后清理。
- `frontend/pages/messages/thread-page.tsx`：恢复冻结正文/回复、损坏恢复提示、授权目标校验。
- `frontend/app.tsx`：真实会话身份注入；member/thread keyed owner 与旧响应失效。
- `frontend/lib/i18n.ts`：中英文恢复阻塞说明。

## 验证过程

首次 Vitest 被本地监听权限拒绝（EPERM），升级授权后运行；缺失模块阶段不当作行为 RED。提供协议壳后 11/11 行为失败，再实现存储/控制器后 11/11 通过。真实路由新增 5 项恢复要求先失败（原 47 项通过），接入后补权限、配额、回复提及与冲突测试。记录 kind 被数组字符串转换误接受的边界先 RED，再改为严格联合字面值校验。

最终验证（当前实现）：

- 定向 6 文件 **101/101**：`npx vitest run test/unit/frontend-discussion-intent.test.ts test/unit/frontend-discussion-route.test.tsx test/unit/frontend-messages-page.test.tsx test/unit/frontend-discussions-data.test.ts test/unit/discussions-service.test.ts test/worker/discussions.test.ts`，日志 `/tmp/discussion-refresh-targeted-final.log`。
- 扩大 **180 文件 3221/3221**：`npx vitest run test/unit/frontend-*.test.ts test/unit/frontend-*.test.tsx test/unit/discussions-service.test.ts test/worker/discussions.test.ts`，退出 0，日志 `/tmp/discussion-refresh-wide-final.log`。
- `npm run typecheck`、新增存储/控制器/页面的独立 strict DOM 类型检查、`npm run build:ui`（含静态 VM 隔离）、`npm run verify:i18n`、`npm run verify:workbench-maturity`（15/15）、`npm run audit:workbench-domain`、`node --test scripts/functional-checklist-audit.test.mjs`（9/9）及 `npm run audit:functional-checklist` 通过，日志 `/tmp/discussion-refresh-gates-final.log`。
- 独立 strict DOM 命令：`npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable frontend/lib/discussion-intent.ts frontend/pages/messages/discussion-model.ts frontend/pages/messages/thread-page.tsx`。
- 额外全 App 独立 strict DOM 检查 **未通过**：同一命令仅以 `frontend/app.tsx` 为入口产生 28 项诊断；在真实 `70b5510` 归档基线上复跑也是 28 项，去除行号偏移后诊断完全一致。日志 `/tmp/discussion-refresh-app-types.log`、`/tmp/discussion-refresh-app-baseline-types.log`。不把项目类型检查或本轮目标文件通过扩大成全 App strict DOM 通过；这些既有门禁差异仍需后续处理。

以上命令实际均经 `rtk proxy` 执行。

## 清单

原30，D08排除；范围内29、已关闭5、仍开放24。A05/R2-008、导航Task 4和D07均不因本轮子项通过而整体关闭。剩余原生/全页验收须单独举证；全目标仍进行中。

未 push、部署、远程迁移或访问/上传生产密钥；用户打开的独立预览尚未更新。无本地外部阻塞，允许继续现有导航计划的剩余边界及门禁。
