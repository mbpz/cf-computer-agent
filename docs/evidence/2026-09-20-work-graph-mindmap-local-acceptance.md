# Work Graph Mindmap Adapter 本地验收证据

日期：2026-09-20

范围：`WB-GR-001` / `GR-MIND-01` 的 Mindmap → Graph DTO adapter 本地切片。

## 已验证

```bash
rtk npx vitest run test/unit/graph-mindmap-adapter.test.ts test/worker/graph-mindmap.test.ts --pool=workers --maxWorkers=1
rtk npm run typecheck
rtk git diff --check
```

结果：Mindmap adapter unit/Worker focused tests 4/4；TypeScript 通过；差异检查通过。

已覆盖：

- Mindmap 节点转为稳定的 `kind=knowledge` GraphNode；
- Mindmap 关系转为 `kind=derived` GraphEdge；
- provider 节点 id 被限定在当前 `knowledgeItemId` 命名空间内；
- 未知 endpoint 不生成事实边，转为 `unknown_endpoint` evidence gap；
- 没有 citation 的关系不生成事实边，转为 `missing_citation` evidence gap；
- 不在调用方授权 allow-list 中的 citation 不会被提升为 GraphEdge，转为 `unauthorized_citation` evidence gap；
- adapter 输入不接受或输出 `memberId` / `member_id`。

## 边界

- 当前 adapter 为纯只读 DTO 转换，不自动写入任务、项目或知识库对象；
- 尚未将 Mindmap adapter 接入 Graph 页面或生产 API；
- 未执行远程 migration、生产部署或 signed browser acceptance。
