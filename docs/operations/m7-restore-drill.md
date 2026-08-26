# M7 本地恢复演练

当前部署保持 Cloudflare 免费层，未绑定 R2/Vectorize。因此本演练只验证导出包的完整性、身份映射、引用一致性和派生索引重建计划，不连接生产 D1/DO，也不执行写入。

## 执行

```bash
rtk npx vitest run test/unit/export-package.test.ts test/unit/export-cursor.test.ts test/unit/import-dry-run.test.ts test/unit/restore-plan.test.ts test/unit/index-rebuild-plan.test.ts test/unit/restore-drill.test.ts
rtk npm run typecheck
```

记录 `startedAt`、`completedAt`、提交 SHA、导出包 `exportId`/`integritySha256` 和测试输出。演练结果必须来自 `runRestoreDrill`，其中 `writes` 固定为 `none`，三阶段顺序固定为：

1. `import-dry-run`：schema、完整性、容量、冲突、管理员权限。
2. `restore-plan`：身份映射、权威记录依赖、Revision 与引用覆盖。
3. `derived-index-plan`：由权威 Revision/Chunk 重建 FTS 文档；无 Vectorize binding 时记录 `skipped_unbound`。

## 失败处理

- 任一阶段失败即停止，不执行任何恢复写入。
- 保留原导出包及其 hash，不覆盖或删除原证据。
- 修复 schema、身份映射或数据冲突后，使用新的 `drillId` 重新演练。
- 生产恢复仍需单独批准、D1 备份和审阅后的写入命令；本演练结果不能替代生产证据。

记录模板：

```json
{
  "drillId": "drill-YYYYMMDD-HHmm",
  "commit": "<git-sha>",
  "exportId": "<export-id>",
  "integritySha256": "<sha256>",
  "startedAt": "<ISO-8601>",
  "completedAt": "<ISO-8601>",
  "status": "passed|failed",
  "writes": "none",
  "differences": [],
  "failureHandling": ["stop-before-write", "retain-export", "repair-and-rerun"]
}
```
