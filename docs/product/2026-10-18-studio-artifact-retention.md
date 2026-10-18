# Studio 产物保留（思维导图/闪卡/测验）

更新时间：2026-10-18 UTC

范围：把 NotebookLM Studio 的"生成后保留、可再次打开、可删除"行为落到当前 AI 知识库的免费层实现。仅覆盖思维导图、闪卡与测验；音频、视频、演示文稿与信息图仍按既有边界延期。

## 1. 行为

- 生成成功后，服务端把该次结果按生成者（owner）保存到 D1，绑定它所属的知识条目与当时可读的修订版本。
- 阅读器的 AI 衍生面板新增"已保存内容"列表；点开即用与新生成相同的规范化规则重放结果，删除只移除该 owner 的产物。
- 列表、读取与删除都会先重新授权知识条目；读取/删除还会重新授权产物所属的修订版本。跨成员列表为空，读取/删除返回 404。
- 生成成功但保留失败时，生成结果仍返回（保留是次要写），列表不会出现该条。

## 2. 数据与接口

| 项 | 内容 |
| --- | --- |
| 表 | `studio_artifacts`：`id`、`knowledge_item_id`、`revision_id`、`owner_id`、`kind`、`payload_json`、`citation_ids_json`、`created_at` |
| 约束 | kind ∈ mindmap/flashcards/quiz；payload ≤256 KiB 且 JSON 有效；引用 ≤8 条且 ≤8 KiB；owner + item + created_at 索引 |
| 列表 | `GET /api/knowledge/:id/artifacts`，最多 50 条，按 `created_at DESC, id DESC` |
| 读取 | `GET /api/knowledge/:id/artifacts/:artifactId`，返回摘要、引用列表与载荷 |
| 删除 | `DELETE /api/knowledge/:id/artifacts/:artifactId`，仅 owner |
| 审计 | `knowledge.artifact_created` / `knowledge.artifact_deleted`，metadata 为 `{artifactId, revisionId, kind}` |

## 3. 验证

```bash
rtk npx vitest run test/worker/m1-api.test.ts -t "retains generated Studio artifacts"
rtk npx vitest run test/unit/frontend-studio-artifacts.test.tsx
rtk npx vitest run test/worker/m1-api.test.ts test/worker/migrations.test.ts \
  test/unit/frontend-knowledge-reader-derivatives-surface.test.tsx \
  test/unit/frontend-knowledge-reader-derivatives-data.test.tsx
rtk npm run typecheck
rtk node scripts/verify-m1-migrations.mjs --files
rtk npm run test:frontend-operations
```

结果：

- 保留用 worker 用例：生成闪卡 → `artifact` 元数据返回 → 列表包含 → 其他成员列表为空/读取 404 → owner 读回载荷与 citationIds → 删除后列表为空 → `artifact_created` 与 `artifact_deleted` 各一条审计。
- 前端用例：加载已保存列表、点开重放闪卡内容、删除后列表与空态更新，并断言 GET/DELETE 路径。
- 受影响套件 125/125 通过；`typecheck` 通过；迁移清单 `count=76` 与哈希校验通过；操作清单 1812 候选无漂移。

## 4. 边界

- 未部署，未做生产验收；`KB-013` 发布/验收保持 pending。
- 列表固定 50 条，无分页；超出后需后续设计。
- 产物是个人保留物，不进入公共知识或 FTS；其他成员看不到同一产物。
- 旧修订的产物仍可打开，只要该修订对调用者仍可读；当前修订切换不会删除旧产物。
