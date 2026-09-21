# R03 第 5 项：真实入口完成边界

日期：2026-09-21（Asia/Shanghai）。既有隔离工作区 `codex/admin-audit-recovery`，起始 HEAD `eb685c3384234005eacf22cd1be24d531034c320`，开始时工作树干净。前三项提交 `b408633`，第四项提交 `eb685c3`，本次仅完成已批准计划的 R03 最后一项，不启动 R04。

## 实现和集成范围

- `src/app.ts` 在未知异常、非 Error 拒绝值和已知 5xx 转换成响应之前，通过请求 scope 标记 `APP_UNEXPECTED_ERROR`。不改变状态码、错误体、缓存头或 legacy 行为；已知 4xx 不因此标记。原始 D1 失败仍由 facade 独立观察，业务转换不能抹掉。
- 新增 `tools/maintenance/entry-completion.test.ts`，使用真实共用入口、应用、成员/session、D1 facade 和本地协调器。现有依赖/绑定 getter 仅用于观测请求局部 scope 与 facade；不替换 app 或 repository。
- 10 项 guarded/legacy 对照：静态资源端口、服务构建、路由未知错误、typed 5xx、非 Error 异常。没有同时注入 D1 错误，确保真正验证 app catch 边界。
- 3 项真实成员路由的 400/403/404：响应消费和后台任务完成后允许排空，保留 session。
- 3 项嵌套后台链：响应结束后 parent 使用同一请求 D1 facade 写入；parent 结束前登记 child；child 未完成时不能释放。正常 child 写入后排空；app 异常或 child 原始 D1 失败被 catch 后仍保留许可。通过可控 Promise 门闩，不使用睡眠猜测时序。
- 1 项迟到调用：真实请求完成后 scope factory 不运行；保存的 D1 statement、prepare/bind/run/batch 均拒绝，零迟到 SQL 写入，许可不复活。此项是违规拒绝证明，不是允许未登记 detached 工作。

## RED → GREEN

1. 基线：08:39:11 开始，maintenance 7 files / 118 passed，6.07s，exit 0。
2. RED：08:43:10 开始，初始 10 项中 5 failed / 5 passed，1.37s，exit 1。五个 guarded 用例的响应和数据库断言通过后，许可错误变为 active=0/DRAINED；legacy 对照通过。不是启动失败。
3. 最小 app catch 修复后：08:45:43 开始，10/10 passed，1.28s，exit 0。
4. 扩展至 17 项首次为 16 passed / 1 failed：测试将既有 D1 封闭保护的同步 throw 错写为 Promise rejection；检查 facade 后仅修正断言，未改变生产逻辑。
5. 最终专项：08:52:05 开始，17/17 passed，1.59s，exit 0。

## 已完成验证

命令均通过 `rtk proxy` 执行，本地 workerd 使用获准的测试执行权限。

| 命令 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance` | 08:52:59 开始，8 files / 135 passed，7.43s，exit 0 |
| `npm run typecheck` | exit 0 |
| `npx --no-install tsc --noEmit --project tools/maintenance/tsconfig.json` | exit 0 |
| `npm test` | smoke（56 项）、i18n、翻译校验、交付合同（30 项）、unit、Worker 全部完成，exit 0；含 UI build。Worker 08:54:56 开始，47 files / 656 passed，18.77s |
| `npm run verify:delivery-status` | checklist、总账、Roadmap、计划及规格更新后重新执行，30/30 passed，exit 0 |
| `git diff --check` | exit 0 |

完整 `npm test` 按脚本串行执行并整体退出 0；unit 输出中重复的既有 AI binding 警告导致展示截断，因此不从上轮记录推算本轮 unit 数量。

收尾只读 Node 断言通过：R01–R25 连续，只有 R01/R02/R03 勾选；R03 五子项全部完成、R04 五子项全部未勾选；6 份本轮文档的 85 个相对链接存在；总账表体与 HEAD 完全一致；生产入口、Wrangler 配置、生成 Env 及迁移无差异。主工作树仍为 main、干净且本地 ahead 1；本轮未对其提交或推送。

## Checklist 收口

- [x] R03 第 5 子项完成：真实入口错误分类、正常业务拒绝、嵌套后台 D1 与迟到调用均有本地集成证据。
- [x] R03 父项关闭；结合前三项的[接线证据](2026-09-21-maintenance-d1-wiring.md)和第四项的[后台及并行任务证据](2026-09-21-maintenance-continuations.md)，恢复主线为 25 项、3 关闭、22 剩余。
- [ ] 下一检查点 R04 尚未开始，不能用本轮普通响应/后台链结果替代真实流与跨存储验证。

代码和本证据一并提交，精确提交编号以包含本文件的 Git 提交记录为准。

## 边界与后续

maintenance harness 禁用 remote bindings，使用合成 D1/R2/DO、AI/静态端口并拒绝意外出站请求。Coordinator 故障注入的预期 stderr 不等于生产故障。既有测试的 AI binding 警告或 UI chunk-size 提示不构成远程验收证据。

R04 的真实流生产者、取消、超时分类及跨存储尾部仍未执行；目前已知 5xx 保守保留许可，不宣称已完成纯 provider timeout 的分类。R05–R25 仍独立。`DRAINED` 只表示已登记工作清零，不能声称生产 `FROZEN`。

本轮未 push、未 merge main、未 deploy；生产入口仍 legacy。未改生产配置、生成 Env 或迁移，未读取 secrets、未操作生产数据，也未重跑备份工具专项。按照计划不委派，自行核对变更，不声称独立审查。产品四维交付状态不提升。
