# 唯一操作编号、同编号重试、精确查询：复验与领域审计对账

基线：`a068950`。对应 A05 / R2-008 / 导航 Task 4 的本地子项；不关闭父项或发布验收。

## 契约与本次范围

审核评论协议已由 `b4592a0` 实现，本次没有再次创建协议或将其扩大到所有业务写入。首次提交冻结 UUID 与正文；未知结果只允许显式重试同编号、同目标、同正文；同编号不同正文返回409；GET按会话成员、投稿目标与编号精确读取原始回执，不按列表或相同正文猜测。空查询结果不证明原写入失败，不解除未知锁。编号与正文仍仅内存保存，刷新/关页后持久恢复尚未完成。

本次修复与这一协议配套的审计阻塞：

1. 前端请求方法分析支持有界字面量条件分支和可静态证明的对象展开，按实际属性覆盖顺序合并候选方法。没有 method 的展开不把已知 PUT 重置成 GET；未知方法、未知展开、计算属性、别名与原型设置仍拒绝。GET不冒充mutation。
2. 环境管理器把通用 path/init 请求包装改为接收发送回调，四个真实请求点明确声明 GET/POST/PATCH/DELETE。截止时间、账户撤销、取消、缓存与重定向策略不变；操作正文和目标来自冻结意图，不重生成编号。
3. 当前领域快照纳入第34个能力 environments，评论写操作从旧POST更正为真实PUT requests接口。仍保守标记环境与评论跨刷新/运行时/发布验收缺口，没有把本地重试能力升级成完整验收。
4. 缺口矩阵由102更新为105：34个manifest聚合、71个domain mutation缺口，54 P0 / 50 P1 / 1 P2。增加的是环境3条既有操作的漏项，不是新增功能父任务；评论源替换不新增计数。新增领域缺口归属现有R8-005，R8主责6→9，历史快照不回填。

## RED 与实际验证

- 新的环境操作/评论分支测试先在不透明环境请求包装处失败；显式环境请求后，评论条件方法和展开仍失败。只实现有限解析，不忽略无法解释的调用。
- 首轮领域测试29/30，唯一剩余失败为旧生成快照。重生成并同步契约后最终30/30，`--check`确认当前快照与实际源码完全一致。
- 成熟度复验曾因Focused test单文件字段误填多个路径失败；恢复单个真实测试入口后15/15，未放宽契约。
- 审核评论定向5文件119/119：客户端、所有者、服务、实际本地Worker/D1。覆盖同编号并发单行、正文冲突、精确查询、原始回执、目标/成员隔离及未知锁。
- 环境页与本地Worker/D1专用18/18；新增重命名/删除响应丢失后原URL、方法、正文、编号和版本冻结测试，修改调用者对象不能改写重试目标。
- 项目typecheck、UI构建和VM静态入口隔离通过。只验证静态图，不代表VM运行或生产网络通过。
- 功能清单审计：原30、范围内29、关闭5、开放24，D08排除。A05、D07、R2-008及导航Task 4不整体关闭。

## 可重复命令

```sh
rtk proxy node --test scripts/workbench-domain-audit.test.mjs
rtk proxy npm run audit:workbench-domain
rtk proxy npm run verify:workbench-maturity
rtk proxy npx vitest run test/unit/frontend-review-comment-owner.test.tsx test/unit/frontend-review-comment-operation.test.ts test/unit/frontend-review-comments.test.ts test/unit/review-comments-service.test.ts test/worker/m1-api.test.ts
rtk proxy node --test --test-timeout=60000 scripts/browser-vm-environments-page.test.mjs
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run audit:functional-checklist
```

本机日志：`/tmp/domain-operation-red.log`、`/tmp/domain-conditional-red.log`、`/tmp/domain-operation-final.log`、`/tmp/domain-operation-check.log`、`/tmp/domain-operation-maturity.log`、`/tmp/comment-operation-reverification.log`、`/tmp/environment-operation-transport.log`、`/tmp/domain-operation-typecheck.log`、`/tmp/domain-operation-ui-build.log`、`/tmp/domain-operation-checklist.log`。临时日志不是持久发布证据，以上命令可复验。

## 边界与下一允许步骤

当前只完成本地协议复验和审计识别修复，未push、部署或远程迁移；不扩大备份、加密或生产配置范围。没有阻止后续本地工作的外部条件。下一允许继续既定导航保护中讨论页未知写/离页子项；评论跨刷新恢复、原生完整旅程与真实身份发布验收仍明确开放。完整App严格DOM的既有诊断本次未复验，不宣称全绿。
