# 本地验收工作台（仅工程验证）

使用仓库依赖、Node 24 和工程独立 Wrangler 配置。**这些命令不部署、没有远端目标或租户参数，不改变正式清单。** 仓库根执行：

```sh
rtk npm run acceptance -- plan
rtk npm run acceptance -- preflight
rtk npm run acceptance -- prepare pagination
rtk npm run acceptance -- verify <run-uuid>
rtk npm run acceptance -- clean <run-uuid>
rtk npm run acceptance -- verify-clean <run-uuid>
```

- `pagination`：独立 D1，121 条固定排序的待审投稿，50/100 行第二页分别 50/21 条；另有不在队列内的草稿对照。`recovery` 另起 D1，只含 A、B 两条待审及草稿对照。两套不会混队列。每条待审都带可回读的真实来源版本。
- 四个账号各有随机密码，使用现有产品哈希；仅在该轮 `0600` 凭据文件中领取。`reviewer` 已有委托角色，不等于具备完整审核权限，见下方产品差异。切勿把凭据文件、存储目录、Cookie 或 Authorization 头放入报告。
- `verify` 检查**写入之前**的初始队列和角色；审核动作后要用场景回执和持久化对账，不能把初始队列检查当作通过。`clean` 只处置工具自己创建的、UUID 与绑定指纹一致的私有目录；重复清理安全。运行租约冲突拒绝清理。硬杀进程后若有遗留租约，工具保留现场，需要先确认进程已停止并审查归属；尚无自动回收/TTL。
- 以 `rtk npm run build:ui` 构建后，`rtk npm run acceptance -- serve <run-uuid>` 可在 `127.0.0.1:8787` 启动同源码本地 Worker，停止服务且退出后再清场。需要可靠保留收尾信号时，直接执行 `rtk proxy node tools/acceptance/cli.mjs serve <run-uuid>`，避免通过 npm 交互终端中断整组进程。当前登录和写操作仍严格要求正式 Canonical Origin，本地 HTTP 入口不是可登录的 Ego 验收域；不得放宽浏览器默认安全配置，不得把工程协议验证升格为真实浏览器验收。
- 复跑已有批审回归的无生产绑定入口：

```sh
rtk proxy env MEMORY_GARDEN_LOCAL_ACCEPTANCE=1 WRANGLER_LOAD_DEV_VARS_FROM_DOT_ENV=false WRANGLER_SEND_METRICS=false node_modules/.bin/vitest run test/unit/frontend-review-batch.test.tsx test/unit/admin-batch-review-concurrency.test.ts test/unit/admin-batch-review-data.test.ts test/worker/admin-review-decisions.test.ts test/worker/m1-api.test.ts
```

## 报告校验

`rtk npm run acceptance -- verify-report <report.json>` 验证结构、范围与文件摘要，**不验证作者、发布系统真伪，也不执行签署或关闭**。报告包只放脱敏证据。候选 ID 是 UTF-8 `JSON.stringify([sourceSha, workerSha256, assetsSha256, migrationsSha256])` 的 SHA-256；`schemaVersion=1`。`candidate` 包含上述字段；`run` 包含 `candidateId`, `runId`, `target`, `observedAt`, `fixtureVersion`。Ego 模式还需 `egoVersion`, `egoTask`, `run.deployment={versionId,deploymentId,origin,candidateId,bindingSha256,trafficPercent}` 和 `candidate.buildId`。`results[]` 每条包含 `id`, 同轮 `runId`, `candidateId`, `target`, `method`, `status`, `expected`, `observed`, `artifacts: [{kind,path,sha256}]`，Ego 模式还须放同 `deploymentId`，未通过须给 `nextOwner` 和 `rerun`。场景的等级、方法、必填证据类别见 `plan`。不得将 D08 纳入功能关项。

## 已定位的产品差异，必须先修而不是继续找账号

1. `src/config.ts`、`src/routes/auth.ts` 和 `src/app.ts` 固定生产 Origin；邀请、管理和遥测另有处理。独立真实域名即使部署成功，登录或写操作仍会 403。需要先评审由发布配置提供**单个规范 HTTPS Origin**的方案：缺配置保持生产现状，配置错误失败关闭，比对请求 URL 和 Origin；不能根据请求头动态扩展信任，也不能允许主站 Cookie 跨域。OAuth 回调仍按各环境独立治理，隔离环境默认不启用外部登录。
2. 当前数据模型只有一名 active admin；RBAC 可给 Contributor 审核位，但 `src/routes/admin-review.ts`、`src/routes/admin.ts`、`src/publication/service.ts` 以及 publication SQL 仍额外检查 legacy admin。第二登录身份不等于第二审核身份。先对产品授权范围做决定，再把审批权限落实到队列/回执/批审及最终事务，并验证撤权并发；不要只移除一个路由检查，或放宽所有管理 API。
