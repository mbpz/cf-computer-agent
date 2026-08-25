# 前端构建与门禁基线

基线采集日期：2026-08-26。该记录只描述本地可重复的构建结果，不代表已经执行生产部署。

## 门禁结果

在当前 `main` 工作树运行 `npm run check`：

- vendor lock：2 个浏览器依赖 hash 校验通过
- smoke/operations：42/42
- i18n contract：13/13
- unit：76 files / 891 tests
- Worker：13 files / 298 tests
- TypeScript 与 Wrangler types：通过
- Wrangler dry-run：通过，读取 React Assets 与 Worker bindings

允许出现但不计为失败的本地诊断：Workers AI remote-binding 提示、故障恢复测试主动制造的 `Invalid pending note journal` 诊断，以及 Durable Object 测试中的预期缺失文件日志。

## React Assets 基线

`npm run build:ui` 输出 `frontend/dist` 4 个文件，随后 `npm run build:secrets` 扫描通过：

```text
frontend/dist/index.html
frontend/dist/manifest.json
frontend/dist/assets/index-BoH-uOnZ.js
frontend/dist/assets/index-DFuClFwz.css
```

当前构建摘要：JS 278.80 kB、CSS 25.34 kB、gzip 总上传由 Wrangler dry-run 报告为 802.45 KiB（gzip 160.73 KiB）。

## 重跑命令

```bash
npm run check
npm run build:ui
npm run build:secrets
```
