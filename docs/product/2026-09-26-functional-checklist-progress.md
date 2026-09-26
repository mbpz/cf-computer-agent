# 功能 checklist 续作 — 2026-09-26

## 范围与状态

延续 `codex/functional-checklist-completion`，上一批提交 `1ac279a`。原 30 个父项，排除 D08 生产部署后本轮 29 项；本批仍未整体关闭父项，完成的是 A02/D02 的有界子项。仅本地实现、验证、提交；没有 push、部署、迁移、生产写入、备份或 Secret 读取。

## 本批实际修复

- 审核重放请求先校验 ID/action，再由三个明确端点重建目标，必须与已保存的 path 一致才发请求；保留原始 body，合法重试的字节载荷不变。
- 审计解析器仅接受同一函数直接声明的 const 初始化值和有限条件分支；不解析可变变量、对象字段、别名链、循环或被内层作用域遮蔽的变量。一个不受支持的分支就拒绝整项，不增加端点白名单。
- 新的 2026-09-26 领域快照覆盖当前 33 能力。旧 D02-R1 等快照保持原样；图谱三个动作仍是 gap，补齐唯一负责人、缺口矩阵和 R8 计数，不宣称已获得动作重放证据。

## RED → GREEN 和验证

- 审核回归实现前：5 failed / 25 passed；旧代码对不一致目标先发送请求，甚至接受外站目标。
- 审计回归实现前：无法解析 path；实现后精确枚举三个决定端点。详情页另有评论 POST，保留该真实操作，不把它从审计删除。
- `rtk proxy npx vitest run test/unit/frontend-review-detail-data.test.ts test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-review-detail.test.tsx`：3 文件 61/61 通过。
- `rtk proxy node --test scripts/workbench-domain-audit.test.mjs`：26/26 通过，包含可变/不透明/循环/遮蔽及额外未声明端点反例。
- `npm run verify:workbench-maturity`：13/13 通过。
- `npm run audit:workbench-domain`：通过，检查新快照。
- `npm run typecheck`、`npm run build:ui`：通过；构建仍有 chunk 大于 500 kB 警告。
- `npm run verify:delivery-status`：30/30 通过。

以上为定向本地回归，不是全仓测试、真实浏览器或生产验收。原运维 R09 与备份不阻塞继续本地功能。下一环节为 B03 附件可用性契约；B04/B05 的实际上传、恢复、取消和解析回读仍未闭环。
