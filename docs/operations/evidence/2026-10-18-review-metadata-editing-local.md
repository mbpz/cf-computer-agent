# 证据：审核元数据编辑 UI（本地实现）

- 日期：2026-10-18
- 范围：`ADM-002` / `GOV-004`~`GOV-007`（审核中修改标题、Space/Collection、Tag、可见性）
- 性质：本地实现与 React 测试；不含部署或真实浏览器验收

## 实现范围

- `frontend/components/review/review-publish-metadata-form.tsx`（新增）：审核详情“发布信息”表单
  - 标题 `Input`；Space/Collection `Select`（复用 `frontend/lib/submission-targets-data.ts` 的成员目标加载器）；Tag 多选 `Checkbox`（按所选 Space 用 `frontend/lib/admin-tags-data.ts` 加载，保留提交者 `preview.tagIds`）；Visibility `Select`。
  - 扩权门禁：`requestedVisibility=admin_only` 且管理员选择 `shared` 时渲染 `data-review-visibility-expansion` 确认；未确认时 Publish 禁用且确认弹窗不可打开；确认后 payload 带 `visibilityReasonCode:"admin_visibility_expansion"`；非扩权不带该字段。
  - loading/error 就地呈现（`role=status` / `role=alert` + 重试），页头常驻；只用共享 UI 原语。
- `frontend/components/review/review-detail-data.ts`：保留 `requestedVisibility` 等原始请求值，新增 `reviewVisibilityExpansion` / `reviewPublishPayload` 作为是否附带 reason code 的唯一判定点。
- `frontend/components/review/review-decision-controls.tsx`：publish 决策支持第三参数 `publishOverrides` 与 `publishBlocked` 门禁。
- `frontend/pages/admin/review-detail-route.tsx`（当前 HEAD 的 ReviewDetailRoute）：publish 优先使用编辑值，交给 `prepareReviewDecision` 并纳入 intent 持久化；未知结果重试原样重放编辑后的 body。
- `frontend/lib/review-decision-intent.ts`：body 校验支持 5/6 字段两种合法形状。
- `frontend/lib/i18n.ts`：en/zh 新增表单、扩权、选项加载、上限等文案。

## 行为矩阵

| 检查 | 实测 |
| --- | --- |
| 编辑后发布 | title/space/collection/tagIds/visibility 进入 publish payload |
| 非扩权 | payload 不含 `visibilityReasonCode` |
| 扩权未确认 | Publish 禁用；确认弹窗不可打开 |
| 扩权已确认 | payload 带 `admin_visibility_expansion` |
| 终态提交 | 不渲染编辑表单 |
| 选项加载失败 | 就地错误 + 重试，页头仍在 |
| 未知结果重试 | 原样重放编辑后的 intent body |
| 数据边界 | 标题长度、Tag 数量、Space/Collection 合法性由前端校验，服务端仍做最终授权与目标校验 |

## 验证命令

| 命令 | 结果 |
| --- | --- |
| 审核相关定向 vitest（12 文件） | 210 通过 |
| `npm run typecheck:frontend` | 通过 |
| `node scripts/frontend-legacy-audit.mjs` | 通过 |
| `npm run check`（HEAD 工作树） | 退出码 0（unit 411 文件/5610、worker 80 文件/1325、smoke 88+14+30、landing 100） |

## 未覆盖 / 非声明

- 未做真实浏览器、键盘/触屏与视觉验收。
- 未改后端 publish 契约；服务端继续执行目标校验、权限与扩权 reason code 强制。
- 编辑中的元数据未单独接入离页守卫（当前按需求未要求）；刷新后从最新 preview 重新加载。
