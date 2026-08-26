# 前端构建与门禁基线

基线采集日期：2026-08-27。该记录只描述本地可重复的构建结果，不代表已经执行生产部署。

## 门禁结果

在当前 `main` 工作树运行 `npm run check`：

- vendor lock：2 个浏览器依赖 hash 校验通过
- smoke/operations：42/42
- i18n contract：13/13
- unit：145 files / 1153 tests
- Worker：22 files / 364 tests
- TypeScript 与 Wrangler types：通过
- Wrangler dry-run：通过，读取 React Assets 与 Worker bindings

允许出现但不计为失败的本地诊断：Workers AI remote-binding 提示、故障恢复测试主动制造的 `Invalid pending note journal` 诊断，以及 Durable Object 测试中的预期缺失文件日志。

## React Assets 基线

`npm run build:ui` 输出 `frontend/dist` 6 个文件，随后 `npm run build:secrets` 扫描通过：

```text
frontend/dist/index.html
frontend/dist/manifest.json
frontend/dist/assets/index-hfV25rC1.js
frontend/dist/assets/index-C0Z2kMVn.css
frontend/dist/manifest.webmanifest
frontend/dist/sw.js
```

当前构建摘要：JS 547.66 kB（gzip 172.93 kB）、CSS 33.13 kB（gzip 6.85 kB）；构建产物名称由 Vite 内容哈希生成，部署前应以本次 `manifest.json` 为准。

## 2026-08-27 复核备注

- `npm run check` 通过：44/44 smoke、13/13 i18n、145 个 Unit 文件 / 1153 tests、22 个 Worker 文件 / 364 tests、类型检查、构建和 Wrangler dry-run 均通过。
- Worker dry-run 读取 7 个 Assets 文件；生产仍仅声明自定义域名、D1、Durable Objects、Workers AI 和 Assets，不声明 R2、Queue 或 Vectorize。
- Workerd 故障恢复测试可能输出预期的 `WorkspaceFsError` 和 `Invalid pending note journal` 诊断；这些诊断不改变测试退出状态。

## 重跑命令

```bash
npm run check
npm run build:ui
npm run build:secrets
```
