# M7 发布顺序清单

本清单只描述顺序；执行远程 D1、Worker 版本或生产 smoke 前，必须取得单独生产授权。当前免费层没有 R2/Vectorize binding，原件和向量步骤只能走 metadata-only/FTS-only 降级。

## 顺序

1. **backup** — 导出 D1，并以 600 权限保存到临时目录；记录文件 hash。

   ```bash
   rtk npx wrangler d1 export memory-garden-control-plane --remote --output "$BACKUP_DIR/pre-release.sql"
   shasum -a 256 "$BACKUP_DIR/pre-release.sql"
   ```

2. **migration** — 先列出现状，再应用 append-only migration，复核 ledger；禁止逆向 migration。

   ```bash
   rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
   rtk npm run db:migrate:remote
   rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
   ```

3. **upload** — 使用受保护的 secret bundle 上传 reviewed version；不得把 secret 放命令行或仓库。

   ```bash
   rtk npx wrangler versions upload --secrets-file "$SECRETS_FILE" --strict --message "reviewed M7 release"
   ```

4. **inspect** — 记录返回的版本 ID，检查版本内容/绑定后再部署。

   ```bash
   rtk npx wrangler versions view "$VERSION_ID"
   ```

5. **deploy** — 只部署已检查的版本 ID。

   ```bash
   rtk npx wrangler versions deploy "$VERSION_ID@100%" --yes
   ```

6. **smoke** — 使用既有签名 smoke 和 GitHub 浏览器回调证据；不要把 workers.dev/preview URL 当生产入口。

   ```bash
   rtk npm run smoke
   ```

7. **evidence** — 归档 commit、version ID、migration ledger、D1 backup hash、脱敏响应/request ID、耗时和失败处理。未实际执行的步骤必须标记 `unchecked`，不能用本地测试替代生产证据。

任何一步失败都停止后续步骤，保留 backup 和 version，不删除 D1/DO/R2 对象；修复后从 backup→migration 状态复核开始重新执行。
