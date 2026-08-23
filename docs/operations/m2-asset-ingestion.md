# M2-1/M2-2/M2-3 原件、解析任务与上传入口最小切片

本切片建立私有 R2 原件、D1 解析任务状态、提交页上传入口和文本类原件解析，不生成公开对象 URL，也不引入 Queue。适用范围仍是 Cloudflare 免费层、5–20 名受邀成员。

## 数据流

```text
成员会话
  → 提交页选择原件
  → POST /api/assets（原始二进制）
  → R2 memory-garden-originals/staging/<assetId>
  → D1 assets(status=ready) + parse_jobs(status=queued)
  → GET /api/assets/<assetId>（仅原提交成员）
```

写入顺序是 R2 后 D1。D1 批写失败时 Worker 删除刚写入的对象，避免孤儿原件。请求使用 `Idempotency-Key`，同一成员重放会返回已有记录。

提交页上传成功后只展示 D1 返回的真实任务状态（首个状态为 `queued`），不会把上传成功误报为解析完成。当前支持常见 PDF、Office、文本、结构化文本和图片 MIME；选择文件后浏览器直接把原始文件 body 发送到 Worker，Worker 再写入 R2。

## 本地验证

```bash
rtk npm run typecheck
rtk npx vitest run test/unit/assets-service.test.ts
rtk npx vitest run test/worker/m2-assets.test.ts
```

上传请求要求：

- 登录成员会话；需要 `submission:create` 能力；
- `Content-Type` 为受支持类型；
- `X-Asset-Name` 为不含路径、控制字符的文件名；
- `Idempotency-Key` 必须存在；
- 原始 body 非空且不超过 10 MiB；
- 响应只包含 asset/job metadata，不包含下载 URL。

浏览器入口位于登录后的“提交”页面“上传原件”卡片；失败时保留在当前页面并显示可重试错误，不会创建一条假提交。

上传后点击“开始解析”会触发同一资产的 owner-scoped `POST /api/assets/<assetId>`。Worker 还配置了每 5 分钟一次的 Cron 扫描，自动领取最多 3 个 `queued/failed_retryable` 任务；手动触发和 Cron 使用同一协调器。当前解析器直接处理纯文本、Markdown、CSV、JSON 和 allowlist 代码扩展名；PDF、Office、HTML/XML 和图片在 `env.AI.toMarkdown` 可用时走 Markdown Conversion，再经过本地安全 parser；AI 不可用时任务保留为 `failed_retryable`，不会伪造解析结果。成功结果写入私有 R2 `parsed/<assetId>.md`，D1 任务进入 `succeeded`；非法内容进入 `failed_terminal`，临时 R2/D1/AI 故障最多允许 3 次领取。

## 生产资源准备

首次生产部署前，管理员需确认 R2 bucket 已存在：

```bash
rtk npx wrangler r2 bucket create memory-garden-originals
```

然后按既有备份→迁移→版本上传→精确部署流程执行：

```bash
rtk npm run db:migrate:remote
rtk npx wrangler deploy --dry-run
```

本切片没有执行远程 bucket 创建、D1 migration 或 Worker 部署；生产执行必须单独记录日期、版本 ID、D1 ledger 和脱敏 request ID。

## 明确不在本切片

- PDF/DOCX/PPTX/Excel/OCR 解析；
- Queue 唤醒、定时孤儿回收和 PDF/Office/图片解析适配仍未包含在本切片；当前仅使用免费 Cron 扫描重试。
- 管理员解析预览；
- 原件下载、公开 URL、批量上传；
- R2 容量预警与断路器。
