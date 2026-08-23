# M2-1 原件与解析任务最小切片

本切片只建立私有 R2 原件和 D1 解析任务状态，不执行解析、不生成公开对象 URL，也不引入 Queue。适用范围仍是 Cloudflare 免费层、5–20 名受邀成员。

## 数据流

```text
成员会话
  → POST /api/assets
  → R2 memory-garden-originals/staging/<assetId>
  → D1 assets(status=ready) + parse_jobs(status=queued)
  → GET /api/assets/<assetId>（仅原提交成员）
```

写入顺序是 R2 后 D1。D1 批写失败时 Worker 删除刚写入的对象，避免孤儿原件。请求使用 `Idempotency-Key`，同一成员重放会返回已有记录。

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
- Queue 唤醒、重试 worker 和定时孤儿回收；
- 管理员解析预览；
- 原件下载、公开 URL、批量上传；
- R2 容量预警与断路器。
