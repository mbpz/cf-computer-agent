# Memory Garden AI 知识库原子 Checklist

更新时间：2026-08-22

权威规格：[AI 知识操作系统设计](../superpowers/specs/2026-08-21-ai-knowledge-system-design.md)

标杆证据：[国外 AI 知识库标杆矩阵](./ai-knowledge-base-benchmark.md)

## 使用规则

- `[x]` 只表示该原子项指定的当前证据已经满足；不能从父功能推断子项完成。
- 每项必须记录状态：`planned / implemented / local_verified / workerd_verified / remote_verified / degraded_verified / deferred / rejected`。
- P0 是对应 Milestone 发布阻断项；P1 是成熟产品核心；P2 是效率增强；P3 是实验。
- 每项实现计划必须补齐：输入、输出、状态、权限、权威位置、Cloudflare 组件、错误码、依赖和测试 fixture。
- 所有读路径默认重新校验 active member 和 visibility；所有写路径默认记录安全审计。
- 所有 AI/Vectorize/Queue 项默认要求无 AI、FTS5-only 或 D1 重投降级。
- 远程证据必须包含日期、版本 ID 和脱敏 request ID，不能包含正文、Cookie、OAuth code 或 Secret。

状态缩写：`P=planned`、`I=implemented`、`L=local_verified`、`W=workerd_verified`、`R=remote_verified`、`D=degraded_verified`。

## SRC — 来源采集

- [x] `SRC-001` P0/M1 `[NotebookLM]` 创建纯文本来源；状态：L/W；验收：非空 UTF-8 输入生成 SourceVersion 和 Submission。
- [x] `SRC-002` P0/M1 `[NotebookLM]` 创建 Markdown 来源；状态：L/W；验收：保留标题层级和代码块。
- [x] `SRC-003` P0/M1 `[AnythingLLM]` 创建代码来源；状态：L/W；验收：记录 allowlisted language、无路径/控制符的 fileLabel 和 1..1,000,000 行号基准，并将原始行号写入 Chunk location。证据：`test/fixtures/m1-parser-cases.ts`、`test/unit/source-parser.test.ts`、`test/unit/source-chunker.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npm run test:m1`。
- [x] `SRC-004` P0/M1 输入大小边界；状态：L/W；验收：规范化 Markdown 的 UTF-8 精确上限接受，任何规范化扩张超限都在 Source/Version/Submission/发布 intent 持久化前稳定拒绝。
- [x] `SRC-005` P0/M1 标题规范化；状态：L/W；验收：trim、UTF-8 上限和控制字符拒绝。
- [x] `SRC-006` P0/M1 Space/Collection 目标选择；状态：L/W；验收：只接受 active 且同 Space 集合。
- [x] `SRC-007` P0/M1 Submission 幂等键；状态：L/W；验收：重放不创建第二条提交。
- [x] `SRC-008` P1/M1 草稿保存；状态：L/W；验收：仅创建者可读取和继续编辑。证据：`src/submissions/service.ts`、`src/submissions/repository.ts`、`src/routes/member.ts`、`test/unit/submissions-service.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/submissions-service.test.ts test/worker/submissions.test.ts test/worker/m1-api.test.ts`。
- [x] `SRC-009` P1/M1 粘贴富文本；状态：L/W；验收：`contentFormat=rich_text` 经过有界 HTML allowlist 清洗并转规范 Markdown，脚本/事件属性和危险 HTML 不进入 Submission/SourceVersion。证据：`src/assets/html.ts`、`src/submissions/service.ts`、`src/routes/member.ts`、`test/unit/submissions-service.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/submissions-service.test.ts test/worker/m1-api.test.ts`。
- [x] `SRC-010` P1/M2 文件选择器；状态：L；验收：文件选择器声明 PDF/DOCX/PPTX/XLSX/CSV/TXT/Markdown/HTML/XML/ODT/ODS/图片矩阵，前置校验扩展名、单文件 10 MiB 上限和单次 1 文件数量上限；对象存储未启用时保持禁用。证据：`frontend/components/assets/asset-upload-model.ts`、`frontend/components/assets/asset-dropzone.tsx`、`test/unit/frontend-submit-pages.test.tsx`；命令：`rtk npx vitest run test/unit/frontend-submit-pages.test.tsx`。
- [x] `SRC-011` P1/M2 拖放上传；状态：L；验收：拖放目标与隐藏 file input 共用 accepted matrix/大小/数量前置校验，按钮保持键盘可用；服务端仍是唯一最终校验边界。证据：`frontend/components/assets/asset-dropzone.tsx`、`frontend/components/assets/asset-upload-model.ts`、`test/unit/frontend-submit-pages.test.tsx`；命令：`rtk npx vitest run test/unit/frontend-submit-pages.test.tsx`。
- [x] `SRC-012` P1/M2 批量文件队列；状态：L；验收：文件选择/拖放统一进入逐文件 queued/processing/succeeded/failed 状态，失败只影响当前文件，默认并发上限 2、硬上限 3。证据：`frontend/components/assets/asset-upload-queue.ts`、`frontend/components/assets/asset-dropzone.tsx`、`test/unit/frontend-submit-pages.test.tsx`；命令：`rtk npx vitest run test/unit/frontend-submit-pages.test.tsx`。
- [x] `SRC-013` P1/M2 剪贴板图片；状态：L；验收：仅提取 PNG/JPEG/GIF/WebP 图片，自动补齐安全文件名并进入普通 Asset 队列；文本、SVG 和其它媒体忽略。证据：`frontend/components/assets/asset-upload-model.ts`、`frontend/components/assets/asset-dropzone.tsx`、`test/unit/frontend-submit-pages.test.tsx`；命令：`rtk npx vitest run test/unit/frontend-submit-pages.test.tsx`。
- [x] `SRC-014` P2/M2 文件夹导入；状态：L；验收：文件夹选择保留经过清洗且有界的相对路径用于显示，`..`/控制符被移除，路径不参与对象键生成。证据：`frontend/components/assets/asset-upload-model.ts`、`frontend/components/assets/asset-dropzone.tsx`、`test/unit/frontend-submit-pages.test.tsx`；命令：`rtk npx vitest run test/unit/frontend-submit-pages.test.tsx`。
- [x] `SRC-015` P2/M2 受限 URL 快照；状态：L/W；验收：`POST /api/assets/from-url` 仅接受 HTTPS、拒绝凭据/非标准端口/本地与私网地址，手动重定向逐跳重新校验且最多 3 次，响应类型 allowlist、流式大小上限和超时均有界；通过普通 Asset 持久化路径。证据：`src/assets/url-snapshot.ts`、`src/assets/service.ts`、`src/routes/member.ts`、`test/unit/url-snapshot.test.ts`、`test/unit/assets-service.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/url-snapshot.test.ts test/unit/assets-service.test.ts test/worker/m1-api.test.ts`。
- [x] `SRC-016` P2/M2 替代文本；状态：L/W；验收：仅原件 owner 且 parse job 为 `failed_retryable|failed_terminal` 时，`POST /api/assets/:id/alternative` 接受有界 Markdown，复用 Submission/SourceVersion 规范化与 `review_pending` 审核链路；队列中、已成功解析和跨 owner 请求稳定拒绝。证据：`src/assets/service.ts`、`src/routes/member.ts`、`test/unit/assets-service.test.ts`、`test/worker/m2-assets.test.ts`；命令：`rtk npx vitest run test/unit/assets-service.test.ts test/worker/m2-assets.test.ts -t "alternative"`。
- [x] `SRC-017` P2/M2 上传取消；状态：L/W；验收：owner 通过 `POST /api/assets/:id/cancel` 取消 `queued|failed_retryable` 资产；D1 在同一 batch 删除 parse job/asset 元数据，随后删除 staging 对象；处理中、已完成、跨 owner 请求稳定拒绝，删除异常只留下无引用对象供 orphan 回收，不再对用户可见。证据：`src/assets/service.ts`、`src/assets/repository.ts`、`src/routes/member.ts`、`test/unit/assets-service.test.ts`、`test/worker/m2-assets.test.ts`；命令：`rtk npx vitest run test/unit/assets-service.test.ts test/worker/m2-assets.test.ts -t "cancel"`。
- [x] `SRC-018` P2/M2 上传恢复；状态：L/W；验收：上传使用的 `idempotency-key` 可通过 owner-scoped `GET /api/assets/resume` 恢复现有资产与 parse job 状态；重复 POST 重放既有记录，不创建第二条 D1/R2 记录；跨 owner、空 key 和畸形返回均 fail-closed。前端 `loadAssetResume` 只接受有界状态模型，刷新后可恢复队列状态而非重复提交。证据：`src/assets/service.ts`、`src/routes/member.ts`、`frontend/lib/asset-resume.ts`、`test/unit/assets-service.test.ts`、`test/unit/frontend-assets-resume.test.ts`、`test/worker/m2-assets.test.ts`；命令：`rtk npx vitest run test/unit/assets-service.test.ts test/unit/frontend-assets-resume.test.ts test/worker/m2-assets.test.ts -t "idempotency key|resum"`。

## ING — 摄取与原件

- [x] `ING-001` P0/M1 SHA-256 内容哈希；状态：L/W；验收：服务端重新验证，不信任客户端声明。
- [x] `ING-002` P0/M1 完全重复检测；状态：L/W；验收：同 hash 返回既有候选，不静默发布。
- [ ] `ING-003` P0/M2 R2 Standard 私有 Bucket；状态：deferred（免费层边界）；验收：启用付费 R2 档位时必须是 Standard/private、无公开对象 URL。当前生产明确不声明 `ORIGINALS`/`r2_buckets`，因此不宣称 R2 能力；历史对象接口仍 fail-closed，文本录入不受影响。证据：`wrangler.jsonc`、`src/env.d.ts`、`src/assets/service.ts`、`docs/operations/m2-asset-ingestion.md`。
- [x] `ING-004` P0/M2 暂存对象键；状态：L/W；验收：staging key 只使用服务端生成 asset ID，不含邮箱/原文件名，响应不返回公开 URL。证据：`src/assets/service.ts`、`test/unit/assets-service.test.ts`、`test/worker/m2-assets.test.ts`。
- [ ] `ING-005` P0/M2 原件对象键；验收：SourceVersion 不可变映射。
- [x] `ING-006` P0/M2 文件扩展名、MIME、魔数联合校验；状态：L/W；验收：扩展名/MIME 在写入前校验，领取解析前再校验 PDF/图片/Office/OLE/ZIP magic，冲突进入 415 或 `ASSET_CONTENT_INVALID` terminal。证据：`src/assets/service.ts`、`test/unit/assets-service.test.ts`、`test/worker/m2-assets.test.ts`、`test/unit/m2-format-matrix.test.ts`；命令：`rtk npx vitest run test/unit/assets-service.test.ts test/unit/m2-format-matrix.test.ts test/worker/m2-assets.test.ts`。
- [ ] `ING-007` P0/M2 上传授权绑定 member/source/bytes/type/expiry；验收：越权和过期拒绝。
- [ ] `ING-008` P0/M2 完成接口 HEAD 校验；验收：对象大小、类型和存在性一致后才建 Asset。
- [x] `ING-009` P0/M2 9 GB R2 写入断路器；状态：L/W；验收：D1 累计达到 `maxAssetTotalBytes` 时返回 507，写入前拒绝且文本 `/api/submissions` 路径不受影响。证据：`src/assets/service.ts`、`test/unit/assets-service.test.ts`。
- [x] `ING-010` P0/M2 8 GB 预警；状态：L/W；验收：管理员通过 `GET /api/admin/assets/capacity` 查看有界容量快照；达到 8 GiB 时 `warning=true`，贡献者 fail-closed 403，免费文本模式返回 `storageEnabled=false` 且不暴露 D1/R2 使用量。证据：`src/assets/service.ts`、`src/routes/admin.ts`、`test/unit/assets-service.test.ts`、`test/worker/m2-assets.test.ts`；命令：`rtk npx vitest run test/unit/assets-service.test.ts test/worker/m2-assets.test.ts -t capacity`。
- [x] `ING-011` P0/M2 单文件大小限制；状态：L/W；验收：前端 10 MiB preflight 与 Worker body bound/服务校验一致，超限不建资产。证据：`frontend/components/assets/asset-upload-model.ts`、`src/http.ts`、`src/assets/service.ts`、`test/unit/frontend-submit-pages.test.tsx`、`test/worker/m2-assets.test.ts`。
- [x] `ING-012` P0/M2 上传中断回收；状态：L/W；验收：R2 写成功但 D1 双写失败时补偿删除 staging；补偿失败对象无 D1 引用，可由 orphan grace 扫描/显式回收。证据：`src/assets/service.ts`、`test/unit/assets-service.test.ts`、`docs/operations/m2-asset-ingestion.md`。
- [ ] `ING-013` P0/M2 Asset/Submission 配对写入；验收：任一失败不留下可见孤儿记录。
- [ ] `ING-014` P1/M2 完全重复关联建议；验收：admin 决定关联、保留或拒绝。
- [ ] `ING-015` P2/M3 相似重复候选；验收：只作建议，不自动合并。
- [x] `ING-016` P1/M2 原件下载授权；状态：L/W；验收：每次 owner/admin 下载重新查询资产 owner 与 parse 状态，跨 owner 不泄露存在性，parsed 未完成稳定拒绝。证据：`src/assets/service.ts`、`src/routes/member.ts`、`src/routes/admin.ts`、`test/worker/m2-assets.test.ts`。
- [x] `ING-017` P1/M2 Content-Disposition 安全文件名；状态：L/W；验收：下载响应使用 ASCII fallback + RFC5987 编码，去除 CRLF、路径和引号注入。证据：`src/routes/member.ts`、`src/routes/admin.ts`、`test/worker/m2-assets.test.ts`。
- [ ] `ING-018` P1/M7 原件校验任务；验收：定期抽检 hash 并报告损坏，不自动删除。

## PAR — 文档解析

- [x] `PAR-001` P0/M1 确定性纯文本解析；状态：L/W；验收：canonical base64 字节先经 UTF-8 fatal decode，再确定性规范化为 LF；无效字节拒绝且不持久化。证据：`test/fixtures/m1-parser-cases.ts`、`test/unit/source-decoder.test.ts`、`test/unit/submissions-service.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npm run test:m1`。
- [x] `PAR-002` P0/M1 Markdown 解析；状态：L；验收：标题、段落、列表、表格和 fenced code 结构化。
- [x] `PAR-003` P0/M1 代码解析；状态：L；验收：语言、行号和代码块不被自然语言清洗破坏。
- [x] `PAR-004` P0/M2 Parser 接口和版本；状态：L/W；验收：显式 `SOURCE_PARSER_CONTRACT` 固定 `m1-v1`/`m1-v2` 与八字段输出 schema，`sourceParser.parse` 作为稳定入口，同输入可确定性重放。证据：`src/sources/parser.ts`、`src/sources/types.ts`、`test/unit/source-parser.test.ts`；命令：`rtk npx vitest run test/unit/source-parser.test.ts -t "frozen versioned contract"`。
- [x] `PAR-005` P0/M2 Workers AI toMarkdown 适配器；状态：L/W；验收：仅对 `text/html`、XML、RTF 等文本型富格式调用 Workers AI；输入 256 KiB、输出 128 KiB、1,200 tokens、5 秒超时均有界；二进制 PDF/Office/图片在专用解析器完成前稳定返回 `ASSET_AI_PARSE_UNSUPPORTED`；供应商异常、超时和超限映射为不泄露正文的稳定错误。未配置 R2 时仍保持文本录入路径可用。证据：`src/assets/ai-markdown.ts`、`src/assets/service.ts`、`test/unit/ai-markdown.test.ts`；命令：`rtk npx vitest run test/unit/ai-markdown.test.ts`。
- [x] `PAR-006` P0/M2 PDF 页码恢复；状态：L/W；验收：在无第三方/付费解析器的边界内恢复未压缩 PDF 文本流，按页生成稳定 `Page N` Markdown 路径；无可恢复文本的页显式标记 `Page unknown` 并写入 `PDF_TEXT_UNAVAILABLE` warning；损坏、页结构不支持和 2 MiB 以上输入稳定终止，不持久化原始二进制。证据：`src/assets/pdf-pages.ts`、`src/assets/service.ts`、`test/unit/pdf-pages.test.ts`、`test/unit/assets-service.test.ts`；命令：`rtk npx vitest run test/unit/pdf-pages.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-007` P0/M2 图片 OCR/描述；状态：L/W；验收：PNG/JPEG/GIF/WebP 通过 Workers AI LLaVA 有界提取文字/结构描述；输入 4 MiB、输出 32 KiB、5 秒超时；模型输出按 0..1 置信度归一化，低于 0.75 在解析 Markdown 中写入可见 warning；不支持媒体、供应商失败和超限稳定映射，原始图片仍只保留在受控对象存储，不进入日志。证据：`src/assets/ai-image.ts`、`src/assets/service.ts`、`test/unit/ai-image.test.ts`、`test/unit/assets-service.test.ts`；命令：`rtk npx vitest run test/unit/ai-image.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-008` P0/M2 DOCX 标题/段落/表格；状态：L/W；验收：本地有界读取 `word/document.xml`，按 OOXML 顺序恢复 Heading1..6、段落和 Markdown 表格；支持 stored/deflate ZIP，禁外部实体、路径外读取和压缩炸弹；4 MiB 容器、2 MiB XML 上限，缺失/损坏/空正文稳定终止。证据：`src/assets/docx.ts`、`src/assets/ai-markdown.ts`、`src/assets/service.ts`、`test/unit/docx.test.ts`；命令：`rtk npx vitest run test/unit/docx.test.ts test/unit/ai-markdown.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-009` P0/M2 Excel sheet/cell range；状态：L/W；验收：本地有界读取 XLSX workbook relationships、shared strings 和 worksheet cells；每个表块输出 `Sheet` 名称与 A1 范围；支持 stored/deflate ZIP，禁外部实体、路径外读取和压缩炸弹；4 MiB 容器、2 MiB XML、50,000 cells/50 sheets 上限，损坏/空表稳定终止。证据：`src/assets/xlsx.ts`、`src/assets/ai-markdown.ts`、`src/assets/service.ts`、`test/unit/xlsx.test.ts`、`test/unit/ai-markdown.test.ts`；命令：`rtk npx vitest run test/unit/xlsx.test.ts test/unit/ai-markdown.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-010` P0/M2 CSV 表头/行范围；状态：L/W；验收：UTF-8（含 BOM）fatal decode、自动识别逗号/分号/Tab/竖线分隔符、RFC4180 引号与转义；输出表头、A1 行范围和安全 Markdown 表格；2 MiB、50,000 行、256 列、32,768 字符/字段上限，损坏引号/空文件/非法编码稳定终止。证据：`src/assets/csv.ts`、`src/assets/ai-markdown.ts`、`src/assets/service.ts`、`test/unit/csv.test.ts`；命令：`rtk npx vitest run test/unit/csv.test.ts test/unit/ai-markdown.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-011` P1/M2 HTML 严格清洗；状态：L/W；验收：本地有界 tokenizer 转安全 Markdown；脚本、样式、模板、iframe、对象、SVG、事件属性和危险 URL 删除；安全 HTTPS/mailto 链接、标题/段落/列表/代码/表格保留；UTF-8 256 KiB 输入、128 KiB 输出上限，空文档和非法编码稳定终止。证据：`src/assets/html.ts`、`src/assets/ai-markdown.ts`、`src/assets/service.ts`、`test/unit/html.test.ts`、`test/unit/ai-markdown.test.ts`；命令：`rtk npx vitest run test/unit/html.test.ts test/unit/ai-markdown.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-012` P1/M2 XML 有界解析；状态：L/W；验收：本地 UTF-8 fatal decode、元素层级和叶值确定性转 Markdown；明确拒绝 DOCTYPE/ENTITY、外部实体、实体扩张、错配标签和多根文档；256 KiB 输入、128 KiB 输出、10,000 元素/64 层深度上限，空/损坏 XML 稳定终止。证据：`src/assets/xml.ts`、`src/assets/ai-markdown.ts`、`src/assets/service.ts`、`test/unit/xml.test.ts`、`test/unit/ai-markdown.test.ts`；命令：`rtk npx vitest run test/unit/xml.test.ts test/unit/ai-markdown.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-013` P1/M2 ODT/ODS/Numbers；状态：L/W/D；ODT/ODS 已本地有界读取 `content.xml`，恢复标题/段落/列表、Sheet/表格/A1 范围；Numbers 的 IWA 二进制格式在免费层无安全解析器，稳定返回 `ASSET_NUMBERS_PARSE_UNSUPPORTED`，不送入 AI。ODT/ODS 正常、空/损坏/超限与 Numbers 降级均纳入格式聚焦矩阵。证据：`src/assets/odf.ts`、`src/assets/ai-markdown.ts`、`src/assets/service.ts`、`test/unit/odf.test.ts`、`test/unit/assets-service.test.ts`；命令：`rtk npx vitest run test/unit/{odf,docx,xlsx,csv,html,xml,pptx,pdf-pages,assets-service}.test.ts test/worker/m2-assets.test.ts`（10 files / 110 tests）。
- [x] `PAR-014` P1/M2 PPTX OOXML 文本结构；状态：L/W；验收：按 presentation relationship 顺序恢复 slide number 与 `<a:p>/<a:t>` 元素顺序；stored/deflate ZIP 有界读取，拒绝 DOCTYPE/ENTITY、越界路径和压缩炸弹；4 MiB 容器、2 MiB XML、200 slides/512 entries 上限，缺失/空/损坏稳定终止。证据：`src/assets/pptx.ts`、`src/assets/ai-markdown.ts`、`src/assets/service.ts`、`test/unit/pptx.test.ts`；命令：`rtk npx vitest run test/unit/pptx.test.ts test/unit/ai-markdown.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-015` P1/M2 空文档检测；状态：L/W；验收：所有 parser 输出在写入 `parsed/` 前经过统一 `SOURCE_EMPTY` 断言；空/仅空白/非字符串输出进入 `failed_terminal`，不生成 parsed 对象，后续可由既有替代文本流程承接；普通文本与所有专用格式继续保留各自损坏错误码。证据：`src/assets/empty.ts`、`src/assets/service.ts`、`test/unit/empty-document.test.ts`、`test/unit/assets-service.test.ts`；命令：`rtk npx vitest run test/unit/empty-document.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-016` P0/M2 损坏文件错误；状态：L/W；验收：已知解析器损坏/不支持/超限错误使用固定 allowlist code 并进入 `failed_terminal`；未知异常、未知 AppError code 和 provider body 统一脱敏为 `ASSET_PARSE_RETRYABLE`，不写入正文或原始异常消息。证据：`src/assets/errors.ts`、`src/assets/service.ts`、`test/unit/asset-errors.test.ts`、`test/unit/assets-service.test.ts`；命令：`rtk npx vitest run test/unit/asset-errors.test.ts test/unit/assets-service.test.ts`。
- [x] `PAR-017` P0/M2 解析超时；状态：L/W；验收：解析阶段使用统一 10 秒超时（测试可注入更短预算），超时映射为不泄露正文的 `ASSET_PARSE_TIMEOUT`/`failed_retryable`；失败路径先删除同一 `parsed/{assetId}.md` 临时产物，再由现有有限 attempts（最多 3 次）和显式 retry 复用同一对象键，成功重试不产生重复对象。证据：`src/config.ts`、`src/assets/service.ts`、`src/assets/errors.ts`、`test/unit/assets-service.test.ts`；命令：`rtk npx vitest run test/unit/assets-service.test.ts -t "times out a slow conversion"`。
- [x] `PAR-018` P0/M2 解析输出大小限制；状态：L/W；验收：所有解析适配器在写入 `parsed/` 前执行统一 UTF-8 字节上限（128 KiB），超限使用固定 `SOURCE_TOO_LARGE` 终止，不生成 parsed 对象且保留 staging 原件；源解析器与资产服务双层防线共享同一配置。证据：`src/config.ts`、`src/assets/empty.ts`、`src/assets/service.ts`、`src/sources/parser.ts`、`test/unit/empty-document.test.ts`、`test/unit/assets-service.test.ts`；命令：`rtk npx vitest run test/unit/empty-document.test.ts test/unit/assets-service.test.ts -t "byte limit|oversized rich conversion"`。
- [x] `PAR-019` P1/M2 解析预览；状态：L/W；验收：owner 通过 `/api/assets/:id/preview`、admin 通过 `/api/admin/assets/:id/preview` 查看规范 Markdown；响应仅返回 parsed 对象内容与受限 parser 元数据（parser schema、行数、代码语言/文件名/行基线、warnings），未完成解析、跨 owner 或缺失对象分别稳定拒绝/脱敏。元数据从同一 parsed R2 对象的受限 custom metadata 读取并安全降级。证据：`src/assets/service.ts`、`src/routes/member.ts`、`src/routes/admin.ts`、`test/worker/m2-assets.test.ts`；命令：`rtk npx vitest run test/worker/m2-assets.test.ts -t "previews normalized Markdown"`。
- [x] `PAR-020` P1/M2 重新解析；状态：L/W；验收：新 parser version，不覆盖已发布 Revision。候选构建器、D1 queued/processing/indexed 状态机、幂等持久化、管理员重解析/确认物化/发布已完成：`src/sources/reparse.ts`、`src/sources/reparse-service.ts`、`src/sources/reparse-repository.ts`、`migrations/0006_m2_source_reparse.sql`，路由为 `POST /api/admin/source-versions/:id/reparse`、`GET /api/admin/reparse-jobs/:id`、`POST /api/admin/reparse-jobs/:id/promote` 与 `POST /api/admin/reparse-jobs/:id/publish`；确认会创建新的 review_pending Submission/Source/SourceVersion，发布复用现有审核/索引流水线并生成同一 KnowledgeItem 的新 Revision，旧 SourceVersion/Revision 不变。证据：`test/unit/source-reparse.test.ts`、`test/unit/source-reparse-service.test.ts`、`test/worker/m2-reparse.test.ts`；命令：`rtk npx vitest run test/unit/source-reparse.test.ts test/unit/source-reparse-service.test.ts test/worker/m2-reparse.test.ts`（11 tests）。

## CHK — Chunk 与来源定位

- [x] `CHK-001` P0/M1 Markdown heading-aware chunk；状态：L；验收：不跨无关一级章节。
- [x] `CHK-002` P0/M1 代码行 chunk；状态：L；验收：短代码按完整行切分；单行自身超预算时按 Unicode code point 有界切分，所有片段保留同一源码行范围且顺序/ID 确定。
- [x] `CHK-003` P0/M1 token/字符预算；状态：L；验收：每个 chunk 不超过精确 code-point 上限，超长段落/代码行无空片段或 surrogate 截断。
- [x] `CHK-004` P0/M1 chunk ordinal 稳定；状态：L；验收：相同 SourceVersion/parser 得到相同顺序。
- [x] `CHK-005` P0/M1 Markdown heading path；状态：L/W；验收：引用可打开对应标题。
- [x] `CHK-006` P0/M1 Markdown line range；状态：L/W；验收：引用回读包含目标文本。
- [x] `CHK-007` P0/M2 PDF page location；状态：L/W；验收：PDF `## Page N`/`## Page unknown` 标记被解析为受限 `location`，持久化到 `chunks.location_json`，并在 Revision detail 与 citation reader 中透传页码。证据：`src/sources/chunker.ts`、`migrations/0007_m2_chunk_locations.sql`、`src/library/repository.ts`、`test/unit/source-chunker.test.ts`、`test/worker/m1-library.test.ts`。
- [x] `CHK-008` P0/M2 spreadsheet location；状态：L/W；验收：XLSX/ODS 规范 `Sheet: 名称 (A1:B2)` 标记被解析为受限 `location`，复用 `chunks.location_json`，并可从 Revision detail/citation reader 显示 sheet 与 cell range。证据：`src/sources/chunker.ts`、`src/library/repository.ts`、`test/unit/source-chunker.test.ts`、`test/worker/m1-library.test.ts`。
- [x] `CHK-009` P0/M2 slide location；状态：L/W；验收：PPTX `Slide N` 标记按非空元素顺序生成受限 `location`（slide、elementStart、elementEnd），复用 `chunks.location_json` 并从 Revision detail/citation reader 透传。证据：`src/sources/chunker.ts`、`src/library/repository.ts`、`test/unit/source-chunker.test.ts`、`test/worker/m1-library.test.ts`。
- [x] `CHK-010` P1/M2 parent-child chunk；状态：L/W；验收：长段落/代码块切分时，首个 chunk 作为有界 parent anchor，后续 child 通过 `parent_chunk_id` 关联；搜索仍召回 child，citation 读取在同一 revision/权限边界内透传 parent body、heading 与行号。证据：`src/sources/chunker.ts`、`migrations/0008_m2_parent_chunks.sql`、`src/publication/repository.ts`、`src/library/repository.ts`、`test/unit/source-chunker.test.ts`、`test/worker/migrations.test.ts`；命令：`rtk npx vitest run test/unit/source-chunker.test.ts test/worker/migrations.test.ts -t "parent|anchors"`。真实生产重建与跨版本数据仍需远程证据。
- [x] `CHK-011` P1/M2 overlap 策略；状态：L；验收：跨边界窗口保留有界 overlap，不生成空 chunk 或 surrogate 截断；`test/unit/m2-overlap.test.ts` 固定 max/overlap 并逐邻接块校验重复边界。
- [x] `CHK-012` P1/M2 table-aware chunk；状态：L；验收：Markdown 表格按数据行有界分组，所有 split chunk 都保留原始表头与分隔线；超长单行按 code point 切分仍不超过预算。证据：`src/sources/chunker.ts`、`test/unit/source-chunker.test.ts`；命令：`rtk npx vitest run test/unit/source-chunker.test.ts -t "table"`。
- [x] `CHK-013` P1/M2 Chunk 预览；状态：L/W；验收：admin 通过 `/api/admin/knowledge/:knowledgeItemId/revisions/:revisionId/chunks` 分页查看正文、parent/heading/行号/location 与 code-point token 估算；contributor fail-closed 403，cursor 绑定管理员与 Revision。证据：`src/library/service.ts`、`src/library/repository.ts`、`src/routes/admin.ts`、`test/worker/m1-library.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/worker/m1-library.test.ts test/worker/m1-api.test.ts -t "chunk previews|chunk preview"`。真实生产数据与远程 smoke 仍需单独授权。
- [x] `CHK-014` P1/M2 Chunk 人工修正；状态：L/W；验收：admin 通过 `PATCH /api/admin/reparse-jobs/:id/candidate` 提交有界规范 Markdown，危险/空/超限输入 fail-closed；只替换 queued job 的 indexed candidate，原始 SourceVersion/已发布 Revision 保持不变；随后 promote 生成 `m2-v1` 新 SourceVersion 与 `review_pending` Submission，继续复用审核/发布链路。证据：`src/sources/reparse.ts`、`src/sources/reparse-service.ts`、`src/sources/reparse-repository.ts`、`src/routes/admin.ts`、`test/unit/source-reparse-service.test.ts`、`test/worker/m2-reparse.test.ts`；命令：`rtk npx vitest run test/unit/source-reparse-service.test.ts test/worker/m2-reparse.test.ts -t "correction|candidate correction"`。真实生产数据与远程 smoke 仍需单独授权。
- [x] `CHK-015` P1/M2 Chunk 启用/禁用；状态：L/W；验收：admin 通过 `PATCH /api/admin/knowledge/:knowledgeItemId/revisions/:revisionId/chunks/:chunkId/status` 在 `active|disabled` 间切换；只更新 `chunks.status`，SourceVersion、Revision、Chunk 正文/hash 不变；禁用删除 admin/shared FTS 行，启用重建可见索引，公开搜索不返回 disabled chunk。证据：`migrations/0009_m2_chunk_status.sql`、`src/library/repository.ts`、`src/library/service.ts`、`src/routes/admin.ts`、`test/worker/m1-library.test.ts`、`test/worker/migrations.test.ts`；迁移 SHA-256：`072d6ba8a9e0661ce5e1031b841fa8f2766f38f56eb94e41d1da22695840acff`；命令：`rtk npx vitest run test/worker/m1-library.test.ts test/worker/migrations.test.ts`。真实生产迁移与 smoke 仍需单独授权。
- [x] `CHK-016` P1/M2 Chunk 关键词/问题建议；状态：L/W；验收：解析阶段为每个 Chunk 生成最多 8 个确定性关键词与 4 个问题建议，持久化到 `keywords_json`/`question_hints_json`；索引只把 `keyword:`/`question:` metadata 加入既有 FTS `tags` 低权重字段，不改变正文、代码字段、SourceVersion、Revision 或权限过滤；管理员预览可读取 metadata。证据：`src/sources/chunk-metadata.ts`、`src/sources/chunker.ts`、`migrations/0010_m2_chunk_metadata.sql`、`src/publication/repository.ts`、`src/library/repository.ts`、`test/unit/chunk-metadata.test.ts`、`test/worker/m1-library.test.ts`、`test/worker/migrations.test.ts`；迁移 SHA-256：`c4c593c5496adf06f24d3c7671a758331db660dd35e947ec121b5d7b7132d79b`；命令：`rtk npx vitest run test/unit/chunk-metadata.test.ts test/worker/m1-library.test.ts test/worker/migrations.test.ts`。真实生产迁移与 smoke 仍需单独授权。
- [x] `CHK-017` P0/M4 current Revision 去重；状态：L/W；验收：list/search/citation 查询均要求 `knowledge_items.current_revision_id = revisions.id`，历史 Revision 即使 FTS 行残留也不会进入当前检索；同一 KnowledgeItem 只返回一个当前 Revision。证据：`src/library/repository.ts`、`test/worker/m1-library.test.ts`（`deduplicates retrieval at the current Revision boundary`）；命令：`rtk npx vitest run test/worker/m1-library.test.ts -t "deduplicates retrieval"`。生产历史数据清理仍需单独授权。
- [x] `CHK-018` P0/M7 Chunk 重建；状态：L/W；验收：admin 通过 `GET /api/admin/knowledge/:knowledgeItemId/revisions/:revisionId/chunks/rebuild-report` 从 Revision 绑定的 SourceVersion 重新 chunk，返回 source hash、确定性 Chunk ID/parent 映射、现存状态与 `unchanged`；只读报告不改原件或 Revision。证据：`src/publication/repository.ts`、`src/publication/service.ts`、`src/routes/admin.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/worker/m1-api.test.ts test/unit/publication-service.test.ts`。实际重建写入与生产数据仍需单独授权。

## GOV — 审核、发布与版本

- [x] `GOV-001` P0/M1 review_pending 状态；状态：L/W；验收：提交完成后仅 owner/admin 可见。
- [x] `GOV-002` P0/M1 管理员审核队列；状态：L/W；验收：有界 keyset pagination 和状态过滤。
- [x] `GOV-003` P0/M1 原文/规范 Markdown 对照；状态：L/W；验收：显示解析 warning 和位置。
- [x] `GOV-004` P0/M1 修改标题；验收：修改作为 Review metadata patch 审计。
- [x] `GOV-005` P0/M1 修改 Space/Collection；验收：active、同 Space 和权限校验。
- [x] `GOV-006` P0/M1 修改 Tag；状态：L/W；验收：规范化、数量/大小上限和存在性校验。
- [x] `GOV-007` P0/M1 选择 shared/admin_only；验收：默认不扩大用户请求的可见性。
- [x] `GOV-008` P0/M1 发布；状态：L/W；验收：产生 immutable Revision 和唯一 current 指针。
- [x] `GOV-009` P0/M1 驳回；状态：L/W；验收：owner 看见安全理由，正文不进正式索引。
- [x] `GOV-010` P0/M1 revision_requested；验收：用户可基于理由创建新提交。
- [x] `GOV-011` P0/M1 并发发布串行化；状态：L/W；验收：同 Item 只产生一个 current Revision。
- [x] `GOV-012` P0/M1 发布 journal/恢复；状态：L/W/D；验收：任一写入边界失败后可幂等恢复。
- [x] `GOV-013` P0/M1 索引失败降级；状态：L/W/D；验收：Revision 仍可读且标 search_degraded。
- [x] `GOV-014` P0/M3 重复关联；状态：L/W；验收：相同成员、同一 Space 的相同规范化内容不创建第二个 Source/SourceVersion/Knowledge Item，记录 `rejected` Submission 与 allowlisted `submission.rejected(reasonCode=duplicate)` 审计；同幂等键可重放，跨成员/Space 不误判。证据：`src/submissions/repository.ts`、`src/submissions/types.ts`、`src/routes/member.ts`、`test/worker/submissions.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/worker/submissions.test.ts test/worker/m1-api.test.ts -t "duplicate|idempotency"`。
- [x] `GOV-015` P1/M3 新 Revision；状态：L/W；验收：管理员发布时可显式绑定现有 active Knowledge Item；新 Revision 写入同一 Item，旧 Revision 行保持不变，current 指针在同一 D1 batch 原子切换；current 与历史 Revision API 读取分离。证据：`src/publication/types.ts`、`src/publication/service.ts`、`src/publication/repository.ts`、`src/routes/admin-review.ts`、`test/worker/m1-api.test.ts`、`test/worker/m1-publication.test.ts`；命令：`rtk npx vitest run test/worker/m1-api.test.ts test/worker/m1-publication.test.ts -t "explicit update|publish|rollback"`。
- [x] `GOV-016` P1/M3 Revision 回滚；状态：L/W；验收：管理员只能原子切换 current，旧 Revision 保持不变；重置目标索引任务并写入 allowlisted `knowledge.rolled_back` 审计。证据：`src/publication/repository.ts`、`src/publication/service.ts`、`test/worker/m1-publication.test.ts`；命令：`rtk npx vitest run test/worker/m1-publication.test.ts`。
- [x] `GOV-017` P0/M3 回收站；状态：L/W；验收：管理员专属软删除、默认读路径隐藏、不可变 Revision 保留；30 天保留期与最终清理由 `GOV-019` 承接。证据：`src/publication/repository.ts`、`src/publication/service.ts`、`src/routes/admin-review.ts`、`test/worker/m1-publication.test.ts`；命令：`rtk npx vitest run test/worker/m1-publication.test.ts test/worker/m1-api.test.ts`。
- [x] `GOV-018` P0/M3 恢复；状态：L/W；验收：仅 active admin 可恢复，current Revision 不变，索引任务幂等重置并恢复可检索性；证据同 `GOV-017`。
- [x] `GOV-019` P0/M3 最终清理顺序；状态：L/W；验收：管理员专属、30 天后才可清理；FTS/任务/Revision/SourceVersion/DO 正文按顺序删除，Submission 正文清空，保留无正文 `knowledge.purged` 墓碑；失败可重试且重复执行幂等。证据：`src/knowledge/published-content.ts`、`src/index.ts`、`src/publication/repository.ts`、`src/publication/service.ts`、`src/routes/admin-review.ts`、`test/worker/m1-publication.test.ts`；命令：`rtk npx vitest run test/worker/m1-publication.test.ts -t "purges|retention|cleanup fails"`。
- [x] `GOV-020` P1/M3 敏感信息提示；状态：L/W；验收：管理员审核预览检测凭据、私钥和内部地址，仅返回类型/等级/行号提示，不记录或回显匹配值，不自动拒绝或改变可见性；贡献者不能读取审核预览。证据：`src/publication/sensitive-advisor.ts`、`src/publication/service.ts`、`src/routes/admin-review.ts`、`public/workspace-ui.js`、`test/unit/sensitive-advisor.test.ts`、`test/unit/publication-service.test.ts`、`test/unit/workspace-ui.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/sensitive-advisor.test.ts test/unit/publication-service.test.ts test/unit/workspace-ui.test.ts test/worker/m1-api.test.ts`。
- [x] `GOV-021` P1/M3 批量审核；状态：L/W；验收：仅 active admin 可提交最多 20 个独立发布/驳回/要求修订动作；所有动作先整体校验，执行阶段逐项权限/状态校验，单项失败不阻断其他项，返回有序成功/失败明细且发布结果脱敏。证据：`src/publication/service.ts`、`src/routes/admin-review.ts`、`src/config.ts`、`test/unit/publication-service.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/publication-service.test.ts test/worker/m1-api.test.ts -t "batch review"`。
- [x] `GOV-022` P0/M3 发布/下载/回滚审计；状态：L/W；验收：发布、下载、回滚均写入 allowlisted audit metadata；审计不包含正文、路径、哈希、凭据或下载文件名；下载前先完成授权和正文校验，审计失败不返回正文。证据：`src/audit/types.ts`、`src/library/service.ts`、`src/publication/repository.ts`、`src/app.ts`、`test/unit/audit.test.ts`、`test/unit/library-service.test.ts`、`test/worker/m1-api.test.ts`、`test/worker/m1-publication.test.ts`；命令：`rtk npx vitest run test/unit/audit.test.ts test/unit/library-service.test.ts test/worker/m1-api.test.ts test/worker/m1-publication.test.ts`。

## IDX — 索引

- [x] `IDX-001` P0/M1 D1 FTS5 schema；验收：title/summary/tags/body/code 可检索。
- [x] `IDX-002` P0/M1 FTS 同步策略；验收：Revision 切换、回收和恢复一致更新。
- [x] `IDX-003` P0/M1 FTS tokenizer 配置；状态：L/W；验收：中英文 fixture 和代码 token 有基线。
- [x] `IDX-004` P0/M1 标题/标签权重；验收：固定 query set 排名符合手工期望。证据：`src/library/search-policy.ts`、`test/fixtures/m1-search-ranking.ts`、`test/worker/m1-library.test.ts`；30 Revision 独立语料的 3 个 query/15 个 top-five 位置与命中字段精确通过。
- [x] `IDX-005` P0/M1 索引 Job 幂等；状态：L/W/D；验收：重复消息不重复写或改变 current。
- [x] `IDX-006` P0/M1 索引状态；验收：pending/indexed/search_degraded/failed 可见。
- [ ] `IDX-007` P0/M4 Vectorize 384 维 index；验收：维度、metric、namespace 固定并生成类型。
- [ ] `IDX-008` P0/M4 Embedding 输入规范化；验收：标题路径+正文，有界且版本化。
- [ ] `IDX-009` P0/M4 摘要向量优先；验收：每 Revision 至多一个摘要向量。
- [ ] `IDX-010` P1/M4 高价值 Chunk 选择；验收：容量策略确定性、可解释。
- [ ] `IDX-011` P0/M4 visibility metadata；验收：Vectorize 前置过滤后仍执行 D1 二次授权。
- [ ] `IDX-012` P0/M4 向量删除传播；验收：回收/current 切换后旧向量不可召回。
- [ ] `IDX-013` P0/M4 Vectorize 80% 断路器；验收：停止普通 Chunk，摘要/FTS 继续。
- [x] `IDX-014` P0/M4 FTS5-only 模式；状态：L/W；验收：搜索直接使用 D1 FTS5 `chunks_fts`/`chunks_fts_shared`，不依赖 AI 或 Vectorize；当前 Revision、可见性、Space/Collection/Tag 权限过滤仍在 FTS 查询内执行。证据：`src/library/repository.ts`、`src/library/service.ts`、`test/worker/m1-library.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/worker/m1-library.test.ts test/worker/m1-api.test.ts -t "search|FTS|visibility"`。
- [ ] `IDX-015` P1/M7 全量索引重建；验收：从权威 Revision 重建且有差异报告。
- [ ] `IDX-016` P1/M7 索引漂移检测；验收：current Revision、FTS 和向量 ID 定期对账。

## SRCH — 搜索

- [x] `SRCH-001` P0/M1 关键词查询；状态：L/W；验收：空/超长/控制字符有稳定响应。
- [x] `SRCH-002` P0/M1 FTS BM25 排名；验收：固定 query set 稳定。证据：policy v2 固定 title=8/summary=4/tags=6/body=1/code=3，真实 D1 重分数 keyset 无漏项/重复测试见 `test/worker/m1-library.test.ts`。
- [x] `SRCH-003` P0/M1 title/tag/body 命中说明；验收：结果显示匹配字段。证据：服务端 allowlist 顺序和 UI 文本标签见 `src/library/repository.ts`、`public/workspace-ui.js`。
- [x] `SRCH-004` P0/M1 安全高亮；验收：不产生 HTML/XSS，保留命中上下文。证据：NFKC、emoji、组合字符、代码点 range 和 XSS-shaped 文本测试见 `test/unit/search-policy.test.ts`、`test/unit/workspace-ui.test.ts`。
- [x] `SRCH-005` P0/M1 Space 过滤；状态：L/W；验收：无权限 Space 不进入候选。
- [x] `SRCH-006` P0/M1 Collection 过滤；状态：L/W；验收：父子范围规则明确。
- [x] `SRCH-007` P0/M1 Tag 过滤；验收：AND/OR 语义固定、有界。证据：1..8 Tag、显式 AND/OR、active same-Space fail-closed、cursor drift 和真实 D1 plan 测试见 `test/unit/library-service.test.ts`、`test/worker/m1-library.test.ts`、`test/worker/m1-api.test.ts`。
- [ ] `SRCH-008` P1/M4 类型、作者和时间过滤；验收：使用索引、无全表扫描。
- [x] `SRCH-009` P0/M1 visibility 过滤；状态：L/W；验收：contributor 永不返回 admin_only。
- [x] `SRCH-010` P0/M1 keyset pagination；状态：L/W；验收：重复排序值无漏项/重复。
- [ ] `SRCH-011` P1/M4 自然语言 query rewrite；验收：失败或无额度回退原始 query。
- [ ] `SRCH-012` P1/M4 语义召回；验收：Vectorize topK 有界并记录降级。
- [ ] `SRCH-013` P0/M4 RRF 融合；验收：确定性常数、current Revision 去重。
- [ ] `SRCH-014` P1/M4 可选 rerank；验收：超时/额度失败保持融合结果。
- [ ] `SRCH-015` P0/M4 D1 Chunk 回读；验收：向量 metadata 不作为正文权威。
- [ ] `SRCH-016` P0/M4 查询时二次授权；验收：成员禁用/权限变化立即生效。
- [x] `SRCH-017` P1/M4 Search/Chat 模式切换；状态：L/W；验收：`GET /api/knowledge/search` 只返回 FTS 命中，`POST /api/knowledge/chat` 才调用回答链路；搜索不会强制生成答案，Chat scope 单独授权且缺失/非法 scope fail-closed。证据：`src/routes/library.ts`、`src/library/service.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/worker/m1-api.test.ts -t "search|ChatScope|scope"`。
- [x] `SRCH-018` P1/M4 Add context；状态：L/W；验收：Chat 返回的 allowlisted source context 显示 Space、Collection、heading 和行范围；正文仍只来自服务端授权 SearchHit，前端不持久化或展示 raw body/path/hash。证据：`frontend/lib/agent-data.ts`、`frontend/components/agent/answer-panel.tsx`、`test/unit/frontend-agent-data.test.ts`、`test/unit/frontend-user-read-pages.test.tsx`；命令：`rtk npx vitest run test/unit/frontend-agent-data.test.ts test/unit/frontend-user-read-pages.test.tsx`。
- [x] `SRCH-019` P2/M4 Saved View；状态：L/W；验收：owner 私有、过滤 schema 版本化。证据：`migrations/0011_m4_saved_views.sql`、`src/saved-views/types.ts`、`src/saved-views/service.ts`、`src/saved-views/repository.ts`、`src/routes/member.ts`、`frontend/lib/saved-views-data.ts`、`frontend/pages/search-page.tsx`、`test/unit/saved-views-service.test.ts`、`test/worker/saved-views.test.ts`、`test/unit/frontend-saved-views.test.ts`；命令：`rtk npx vitest run test/unit/saved-views-service.test.ts test/worker/saved-views.test.ts test/unit/frontend-saved-views.test.ts`。
- [x] `SRCH-020` P1/M4 结果内提问；状态：L/W；验收：每个规范化搜索结果提供 `items` scope Agent 入口，携带唯一 `knowledgeItemId`，不使用 citation/path 作为权限范围；无效 ID 不生成入口。证据：`frontend/lib/search-data.ts`、`frontend/components/search/search-result-list.tsx`、`test/unit/frontend-search-data.test.ts`、`test/unit/frontend-user-read-pages.test.tsx`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/frontend-search-data.test.ts test/unit/frontend-user-read-pages.test.tsx`。

## READ — 知识阅读器

- [x] `READ-001` P0/M1 Knowledge 列表；状态：L/W；验收：current published、权限、有界分页。
- [x] `READ-002` P0/M1 Knowledge detail；状态：L/W；验收：D1 metadata 与规范 Markdown 一致。
- [x] `READ-003` P0/M1 Markdown 安全渲染；验收：脚本、危险 URL、原始 HTML fixture 无执行。证据：本地固定 `markdown-it@15.0.0` + `dompurify@3.4.14` 双边界，`happy-dom` 覆盖 raw HTML、混淆协议、表格、代码围栏、嵌套列表和链接目标；应用仅插入 `DocumentFragment`。
- [x] `READ-004` P0/M1 目录；状态：L/W；验收：heading path 与正文锚点一致。
- [x] `READ-005` P0/M1 heading/line 定位；状态：L/W；验收：citation 打开目标并高亮。
- [x] `READ-006` P0/M2 PDF 页定位；状态：L/W；验收：Reader 来源面板显示 PDF 页码（含 unknown），并提供授权 Revision 的规范化内容下载入口作为无原件预览时的回退；不声称原始 PDF 对象可用。证据：`frontend/lib/knowledge-reader-data.ts`、`frontend/pages/knowledge-reader-page.tsx`、`src/routes/library.ts`、`test/unit/frontend-knowledge-reader-data.test.ts`、`test/unit/frontend-a11y.test.tsx`。
- [x] `READ-007` P0/M2 表格定位；状态：L/W；验收：Reader 来源面板以 `sheet · cell range` 展示表格位置，并保持授权/下载边界。证据：`frontend/lib/knowledge-reader-data.ts`、`frontend/pages/knowledge-reader-page.tsx`、`test/unit/frontend-knowledge-reader-data.test.ts`、`test/unit/frontend-a11y.test.tsx`。
- [x] `READ-008` P0/M2 幻灯片定位；状态：L/W；验收：Reader 来源面板显示 slide number 与 element range，位置字段只来自服务端 allowlist。证据：`frontend/lib/knowledge-reader-data.ts`、`frontend/pages/knowledge-reader-page.tsx`、`test/unit/frontend-knowledge-reader-data.test.ts`。
- [x] `READ-009` P0/M1 Revision 信息；验收：版本、发布时间、审核者和来源版本。证据：可见性授权 CTE 后联结 Review/SourceVersion，Reader 以文本节点显示稳定 ID、ordinal、parser schema、code metadata 和 index status；不导出 email/path/hash/provider 字段。
- [x] `READ-010` P0/M1 历史 Revision；状态：L/W；验收：旧引用可读但明确非 current。
- [x] `READ-011` P1/M3 Revision diff；状态：L/W；验收：授权成员可通过 `GET /api/knowledge/:knowledgeItemId/revisions/:fromRevisionId/diff/:toRevisionId` 查看有界正文行操作与 title/tags/visibility/parser/code metadata 差异；240 行输出上限、超限标记和隐藏 Revision 统一 404。Reader 在存在上一修订时提供中英文对比入口。证据：`src/library/revision-diff.ts`、`src/library/service.ts`、`src/routes/library.ts`、`frontend/pages/knowledge-reader-page.tsx`、`test/unit/revision-diff.test.ts`、`test/unit/library-service.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/revision-diff.test.ts test/unit/library-service.test.ts test/worker/m1-api.test.ts -t "diff|publishes an explicit update"`。
- [x] `READ-012` P1/M4 Sources panel；状态：L/W；验收：Reader 展示授权 Revision 的 source version、ordinal、parser/index 状态，以及 bounded chunk 行号和 PDF/sheet/slide 位置；来源条目使用可访问的选中态，不泄露 path/hash/provider，缺失字段稳定回退。证据：`frontend/lib/knowledge-reader-data.ts`、`frontend/pages/knowledge-reader-page.tsx`、`test/unit/frontend-knowledge-reader-data.test.ts`、`test/unit/frontend-a11y.test.tsx`；命令：`rtk npx vitest run test/unit/frontend-knowledge-reader-data.test.ts test/unit/frontend-a11y.test.tsx`。
- [x] `READ-013` P1/M4 反向链接；状态：L/W；验收：只列当前用户可见 current Revision；支持 `[[knowledge-id]]`、Markdown `/knowledge/:id` 与 `knowledge://:id` 显式链接，隐藏目标/来源统一不泄露。证据：`src/library/backlinks.ts`、`src/library/repository.ts`、`src/library/service.ts`、`src/routes/library.ts`、`frontend/lib/knowledge-reader-data.ts`、`frontend/pages/knowledge-reader-page.tsx`、`test/unit/backlinks.test.ts`、`test/unit/library-service.test.ts`、`test/unit/frontend-knowledge-reader-data.test.ts`、`test/unit/frontend-a11y.test.tsx`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/backlinks.test.ts test/unit/library-service.test.ts test/unit/frontend-knowledge-reader-data.test.ts test/unit/frontend-a11y.test.tsx test/worker/m1-api.test.ts -t "backlink|source metadata|knowledge reader data|explicit knowledge link"`。
- [x] `READ-014` P1/M4 相关知识；状态：L/W；验收：`GET /api/knowledge/:knowledgeItemId/related` 复用 D1 FTS5、当前成员授权和 current Revision，排除种子条目，最多返回 5 条，并仅返回 title/summary/tags/body/code 命中字段作为理由；Reader 提供双语相关知识面板，失败不阻塞正文。证据：`src/library/service.ts`、`src/routes/library.ts`、`frontend/lib/knowledge-reader-data.ts`、`frontend/pages/knowledge-reader-page.tsx`、`test/unit/library-service.test.ts`、`test/unit/frontend-knowledge-reader-data.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/library-service.test.ts test/unit/frontend-knowledge-reader-data.test.ts test/worker/m1-api.test.ts -t "related"`。
- [x] `READ-015` P1/M4 从此处提问；状态：L/W；验收：Reader 入口跳转到 Agent 时显式传递当前 `knowledgeItemId` 的 `items` scope；Agent 请求不会扩大为全库，scope 无效时 fail-closed 回退 `all`。证据：`frontend/pages/knowledge-reader-page.tsx`、`frontend/app.tsx`、`frontend/lib/agent-data.ts`、`test/unit/frontend-a11y.test.tsx`、`test/unit/frontend-agent-data.test.ts`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/frontend-a11y.test.tsx test/unit/frontend-agent-data.test.ts`。
- [x] `READ-016` P1/M5 Note 侧栏；状态：L/W；验收：阅读器右侧提供独立私有 Note，默认按 knowledge item 隔离、仅显式点击保存写入浏览器私有存储，不改变正文或已发布 Revision。证据：`frontend/lib/knowledge-note.ts`、`frontend/pages/knowledge-reader-page.tsx`、`frontend/lib/i18n.ts`、`test/unit/frontend-knowledge-note.test.ts`、`test/unit/frontend-a11y.test.tsx`、`test/unit/frontend-user-read-pages.test.tsx`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/frontend-knowledge-note.test.ts test/unit/frontend-a11y.test.tsx test/unit/frontend-user-read-pages.test.tsx`。
- [x] `READ-017` P1/M4 响应式三栏；状态：L/W；验收：桌面端目录/正文/来源与链接三栏，移动端 Outline/Sources 可访问标签切换，正文与来源状态不互相丢失。证据：`frontend/pages/knowledge-reader-page.tsx`、`frontend/lib/i18n.ts`、`test/unit/frontend-a11y.test.tsx`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/frontend-a11y.test.tsx test/unit/frontend-knowledge-reader-data.test.ts`。
- [x] `READ-018` P0/M4 阅读权限回归；状态：L/W；验收：真实 Worker 回归覆盖 URL 猜测、hidden/missing Knowledge、历史 shared Revision、citation 和 download；admin_only current 对 contributor 统一 404，历史可见 Revision 仍按授权读取，cross-item/伪造路径不泄露正文、path/hash 或 metadata。证据：`src/library/repository.ts`、`src/library/service.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/worker/m1-api.test.ts -t "submits, reviews, publishes|permission|hidden|download"`。

## CHAT — 引用问答

- [x] `CHAT-001` P0/M1 问题边界；状态：L/W；验收：非空、字符/字节上限和稳定错误。
- [x] `CHAT-002` P0/M1 显式来源集合；验收：全库/Space/Collection/选中来源可区分。
- [x] `CHAT-003` P0/M1 检索计划；状态：L/W；验收：先授权再召回，不把权限交给模型。
- [x] `CHAT-004` P0/M1 上下文预算；状态：L/W；验收：per-chunk/total code-point 安全截断。
- [x] `CHAT-005` P0/M1 不可信来源序列化；状态：L/W；验收：JSON/结构分隔，文档指令不执行。
- [x] `CHAT-006` P0/M1 系统提示边界；状态：L/W；验收：来源是 inert data、禁止越权工具。
- [x] `CHAT-007` P0/M1 无来源拒答；状态：L/W；验收：不调用或不采信模型常识回答私有问题。
- [x] `CHAT-008` P0/M1 低相关拒答；状态：L/W/D；验收：低于阈值提示改问或扩大范围。证据：独立中英文强/弱语料校准固定 0.60 证据阈值，弱证据与部分匹配均在 Provider 调用前拒答；命令：`rtk npm run test:m1`。
- [x] `CHAT-009` P0/M1 稳定 citation ID；状态：L/W；验收：绑定 revision/chunk/location。
- [x] `CHAT-010` P0/M1 句级引用格式；状态：L/W；验收：每个来源性断言附 citation ID。
- [x] `CHAT-011` P0/M1 引用只来自上下文；状态：L/W；验收：模型伪造 ID 被删除或失败。
- [x] `CHAT-012` P0/M1 引用回读；状态：L/W；验收：重新授权并读取绑定 Chunk。
- [x] `CHAT-013` P0/M1 引用跳转；状态：L/W；验收：阅读器定位并标历史/current。
- [x] `CHAT-014` P0/M1 答案归一化；状态：L/W；验收：provider string/object/empty 有稳定合同。
- [x] `CHAT-015` P0/M1 AI 上游失败；状态：L/W/D；验收：稳定 retryable 错误、无 provider body。
- [ ] `CHAT-016` P1/M5 多轮追问；验收：历史有界、引用权限每轮重查。
- [ ] `CHAT-017` P1/M5 来源增删；验收：会话中显示变更且下一轮生效。
- [ ] `CHAT-018` P1/M5 冲突来源；验收：并列展示，不强行合并为单一事实。
- [ ] `CHAT-019` P1/M5 引用支持性验证；验收：不支持断言删除、改写或拒答。
- [ ] `CHAT-020` P1/M5 回答停止；验收：客户端停止流、服务端终止本次生成。
- [ ] `CHAT-021` P1/M5 回答反馈；验收：有用/无用/引用错误，禁止保存正文 Secret。
- [ ] `CHAT-022` P0/M5 权限变化；验收：禁用成员或降权后旧会话不能继续回读。

## RES — Deep Research

- [ ] `RES-001` P1/M6 Research Workspace；验收：绑定 Space、来源集合、owner 和状态。
- [x] `RES-002` P1/M6 研究目标；状态：L/W；验收：ResearchRun 创建必须同时提供有界 goal、Space/Collection/KnowledgeItem 范围和 1–8 条完成条件；D1 以 scope_json/completion_json 持久化，owner 重新读取时安全解析，非法/越界输入 400。证据：`migrations/0014_m6_research_run_plan.sql`、`src/ai/research-report-service.ts`、`src/research/repository.ts`、`src/routes/library.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npm run typecheck && rtk npx vitest run test/worker/m1-api.test.ts -t 'research|Research'`。
- [ ] `RES-003` P1/M6 研究计划草稿；验收：用户确认后才执行多步检索。
- [x] `RES-004` P1/M6 有限步骤预算；状态：L/W；验收：ResearchRun 最多 8 个计划 steps，报告生成固定 1 次 AI 调用、最多 700 tokens、5 秒 wall-time 超时；超时映射 retryable `AI_UNAVAILABLE`，不会继续执行隐藏步骤。证据：`src/ai/research-report-service.ts`（`MAX_RESEARCH_STEPS`/`MAX_RESEARCH_AI_CALLS`/`MAX_RESEARCH_WALL_MS`）、`test/unit/research-report-service.test.ts`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/research-report-service.test.ts`。
- [x] `RES-005` P1/M6 子问题拆解；状态：L/W；验收：ResearchRun 创建必须提供 1–8 个唯一子问题 ID；每项含有界问题文本、独立 Space/Collection/KnowledgeItem 来源范围和 `pending|completed|blocked` 状态，持久化后重新读取不丢失；非法/重复/越界输入 400。证据：`migrations/0016_m6_research_subquestions.sql`、`src/ai/research-report-service.ts`、`src/research/repository.ts`、`src/routes/library.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npm run typecheck && rtk npx vitest run test/worker/m1-api.test.ts -t 'research|Research'`。
- [ ] `RES-006` P1/M6 多次检索；验收：查询、结果 ID 和选择理由可追踪。
- [ ] `RES-007` P1/M6 来源比较；验收：共同点、差异和各自引用。
- [ ] `RES-008` P1/M6 冲突识别；验收：时间/版本/事实冲突不被静默覆盖。
- [ ] `RES-009` P1/M6 证据缺口；验收：标明无来源问题而非模型补全。
- [ ] `RES-010` P1/M6 研究暂停；验收：保存已完成步骤和剩余计划。
- [ ] `RES-011` P1/M6 研究恢复；验收：重新加载成员权限和 current Revision。
- [ ] `RES-012` P1/M6 研究取消；验收：终止后续工具，保留可审计草稿。
- [ ] `RES-013` P1/M6 研究报告；验收：章节、断言和引用完整映射。
- [ ] `RES-014` P1/M6 保存为 Draft；验收：不能直接成为正式 KnowledgeItem。
- [ ] `RES-015` P0/M6 文档 Prompt injection；验收：恶意来源不能改计划/工具/权限。
- [ ] `RES-016` P0/M6 额度耗尽恢复；验收：deferred_quota，次日从 checkpoint 继续。

## ART — 研究产物

- [x] `ART-001` P1/M5 私人 Note；状态：L/W；验收：D1 持久化、owner-only 默认、成员状态/知识可见性重新授权，保存必须携带可读 Revision/Chunk 引用，Note 不进入 Submission/Publication/FTS。证据：`migrations/0012_m5_private_notes.sql`、`src/private-notes/types.ts`、`src/private-notes/service.ts`、`src/private-notes/repository.ts`、`src/routes/library.ts`、`src/app.ts`、`frontend/lib/knowledge-note.ts`、`frontend/pages/knowledge-reader-page.tsx`、`test/unit/private-notes-service.test.ts`、`test/unit/frontend-knowledge-note.test.ts`、`test/worker/private-notes.test.ts`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/private-notes-service.test.ts test/unit/frontend-knowledge-note.test.ts test/worker/private-notes.test.ts`。
- [x] `ART-002` P1/M5 来源摘要；状态：L/W；验收：只总结选中来源并附引用。证据：`src/ai/source-summary-service.ts`、`src/routes/library.ts`、`src/app.ts`、`test/unit/source-summary-service.test.ts`、`test/worker/m1-api.test.ts`；`POST /api/knowledge/:knowledgeItemId/summary` 逐条通过 `LibraryService.readCitation` 重新授权，仅接收同一 KnowledgeItem 的 1–8 个引用，AI 输出必须引用选中 citation，响应不含来源正文，失败返回可重试 `AI_UNAVAILABLE`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/source-summary-service.test.ts test/worker/m1-api.test.ts -t 'summary|selected citations'`。
- [x] `ART-003` P1/M5 FAQ；状态：L/W；验收：每个回答有来源，无答案问题标缺口。证据：`src/ai/faq-service.ts`、`src/routes/library.ts`、`src/app.ts`、`test/unit/faq-service.test.ts`、`test/worker/m1-api.test.ts`；`POST /api/knowledge/:knowledgeItemId/faq` 逐条重新授权选中引用，有答案项必须带 citation，证据不足项返回 `gap=true`/`answer=null`，响应不含来源正文，AI 失败为可重试 `AI_UNAVAILABLE`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/faq-service.test.ts test/worker/m1-api.test.ts -t 'FAQ|summary'`。
- [x] `ART-004` P1/M5 时间线；状态：L/W；验收：日期事件逐项引用，无法排序时提示。证据：`src/ai/timeline-service.ts`、`src/routes/library.ts`、`src/app.ts`、`test/unit/timeline-service.test.ts`、`test/worker/m1-api.test.ts`；`POST /api/knowledge/:knowledgeItemId/timeline` 重新授权选中引用，每个事件必须带 citation，严格校验 ISO 日期，全部可比较时排序，否则保留来源顺序并返回 `sortStatus=unsorted`/`TIMELINE_DATES_UNSORTED`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/timeline-service.test.ts test/worker/m1-api.test.ts -t 'timeline|Timeline'`。
- [x] `ART-005` P1/M5 Brief；状态：L/W；验收：目标、要点、风险、开放问题和引用。证据：`src/ai/brief-service.ts`、`src/routes/library.ts`、`src/app.ts`、`test/unit/brief-service.test.ts`、`test/worker/m1-api.test.ts`；`POST /api/knowledge/:knowledgeItemId/brief` 重新授权选中引用，目标/要点/风险/开放问题每项均绑定 citation，证据不足返回稳定缺口，响应不含来源正文，AI 失败为可重试 `AI_UNAVAILABLE`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/brief-service.test.ts test/worker/m1-api.test.ts -t 'brief|Brief'`。
- [x] `ART-006` P1/M6 来源比较表；状态：L/W；验收：逐行按来源生成差异单元格，每个单元格、共识和冲突均重新绑定授权 citation；证据不足显式返回缺口，禁止来源正文泄露，AI 失败可重试。证据：`src/ai/comparison-service.ts`、`src/routes/library.ts`、`src/app.ts`、`test/unit/comparison-service.test.ts`、`test/worker/m1-api.test.ts`；`POST /api/knowledge/:knowledgeItemId/comparison` 只接受同一 KnowledgeItem 的 1–8 个 citationIds，并逐条重新授权；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/comparison-service.test.ts test/worker/m1-api.test.ts -t 'comparison|Comparison'`。
- [x] `ART-007` P1/M6 研究报告；状态：L/W；验收：创建 owner-scoped ResearchRun，报告版本递增且绑定 run；每个章节必须引用授权来源，保存不可变 revision/chunk/publishedAt 快照、模型和 prompt 版本；证据不足明确缺口，响应不含来源正文，非 owner run 返回 404。证据：`migrations/0013_m6_research_reports.sql`、`src/research/repository.ts`、`src/ai/research-report-service.ts`、`src/routes/library.ts`、`src/app.ts`、`test/unit/research-report-service.test.ts`、`test/worker/m1-api.test.ts`；接口：`POST /api/knowledge/:knowledgeItemId/research-runs`、`POST /api/knowledge/:knowledgeItemId/report`；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/research-report-service.test.ts test/worker/m1-api.test.ts -t 'research|Research'`。
- [x] `ART-008` P2/M5 思维导图；状态：L/W；验收：节点/关系只从授权来源概念生成，节点和边逐项带 citation，边的两端必须存在，证据不足明确缺口，响应不含来源正文；来源可通过现有 citation 回读接口定位。证据：`src/ai/mindmap-service.ts`、`src/routes/library.ts`、`src/app.ts`、`test/unit/mindmap-service.test.ts`、`test/worker/m1-api.test.ts`；`POST /api/knowledge/:knowledgeItemId/mindmap` 逐条重新授权 1–8 个 citationIds；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/mindmap-service.test.ts test/worker/m1-api.test.ts -t 'mindmap|Mindmap'`。
- [x] `ART-009` P2/M5 学习卡；状态：L/W；验收：每张卡包含问题、答案和授权 citation，模型无法引用未选来源时返回稳定 422，证据不足返回缺口且不生成事实，响应不含来源正文。证据：`src/ai/flashcard-service.ts`、`src/routes/library.ts`、`src/app.ts`、`test/unit/flashcard-service.test.ts`、`test/worker/m1-api.test.ts`；`POST /api/knowledge/:knowledgeItemId/flashcards` 逐条重新授权 1–8 个 citationIds；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/flashcard-service.test.ts test/worker/m1-api.test.ts -t 'flashcard|Flashcard'`。
- [x] `ART-010` P2/M5 测验；状态：L/W；验收：题目选项有界，非跳过题的答案与解释绑定授权 citation，`answerIndex=null` 明确支持跳过，未选来源/无依据事实拒绝，证据不足返回缺口且响应不含来源正文。证据：`src/ai/quiz-service.ts`、`src/routes/library.ts`、`src/app.ts`、`test/unit/quiz-service.test.ts`、`test/worker/m1-api.test.ts`；`POST /api/knowledge/:knowledgeItemId/quiz` 逐条重新授权 1–8 个 citationIds；命令：`rtk npm run typecheck && rtk npx vitest run test/unit/quiz-service.test.ts test/worker/m1-api.test.ts -t 'quiz|Quiz'`。
- [x] `ART-011` P2/M5 产物重新生成；状态：L/W；验收：ResearchReport 以 ResearchRun 内递增版本写入，`UNIQUE(research_run_id, version)` 防止覆盖旧产物，重新生成保留旧版本及其来源快照；服务测试覆盖 version=2 保存路径。证据：`migrations/0013_m6_research_reports.sql`、`src/research/repository.ts`、`src/ai/research-report-service.ts`、`test/unit/research-report-service.test.ts`；命令：`rtk npx vitest run test/unit/research-report-service.test.ts`。
- [ ] `ART-012` P1/M5 产物转 Submission；验收：进入正常审核，不能直接发布。
- [ ] `ART-013` P0/M5 生成 provenance；验收：模型、Prompt、来源 Revision、时间和状态。
- [ ] `ART-014` P3/M8 音频/视频/幻灯片实验；验收：默认关闭、额度隔离、非 1.0 阻断。

## AGT — Agent 工具与会话

- [ ] `AGT-001` P1/M6 AgentSession DO 路由；验收：会话 ID 随机且成员绑定。
- [ ] `AGT-002` P1/M6 消息持久化；验收：有界列表、角色固定、正文权限保护。
- [ ] `AGT-003` P1/M6 流式回答；验收：断线不导致重复工具写入。
- [ ] `AGT-004` P1/M6 断线恢复；验收：从 checkpoint 恢复或明确终止。
- [ ] `AGT-005` P0/M6 每工具调用重载 member；验收：disabled 立即停止。
- [ ] `AGT-006` P0/M6 `searchKnowledge`；验收：只返回授权 current Chunk。
- [ ] `AGT-007` P0/M6 `readSource`；验收：稳定 ID、权限和来源位置。
- [ ] `AGT-008` P0/M6 `compareSources`；验收：输入来源显式、有界。
- [ ] `AGT-009` P1/M6 `listSourceConflicts`；验收：只基于已有证据。
- [ ] `AGT-010` P1/M6 `createNoteDraft`；验收：owner 私有、无发布副作用。
- [ ] `AGT-011` P1/M6 `createArtifactDraft`；验收：产物 provenance 完整。
- [ ] `AGT-012` P1/M6 `saveResearchDraft`；验收：进入 Submission/草稿流程。
- [ ] `AGT-013` P0/M6 禁止直接发布工具；验收：工具注册和路由都不存在。
- [ ] `AGT-014` P0/M6 禁止任意 MCP/Shell/浏览器；验收：Prompt 不能动态添加工具。
- [ ] `AGT-015` P0/M6 工具参数 schema；验收：unknown/超限/跨 Space 输入拒绝。
- [ ] `AGT-016` P0/M6 工具步数限制；验收：达到上限停止并保存草稿。
- [ ] `AGT-017` P0/M6 工具输出内容边界；验收：进入模型前有界且序列化为不可信数据。
- [ ] `AGT-018` P1/M6 Agent 运行审计；验收：记录动作和资源 ID，不记录正文/凭据。

## COL — 协作与个人工作区

- [x] `COL-001` P0/M1 我的 Submission；状态：L/W；验收：只看本人、有界分页和状态过滤。证据：真实 D1 按 owner + 精确 status 在分页前过滤，重复排序键下无缺失/重复，游标绑定 owner/status/sort，跨 owner/status/admin 游标重放关闭失败，`EXPLAIN QUERY PLAN` 使用 `submissions_owner_status_page`；命令：`rtk npm run check`。
- [ ] `COL-002` P1/M1 驳回理由；验收：安全文本、历史可见、无 admin 内部 metadata。
- [ ] `COL-003` P1/M3 审核评论；验收：admin 与 owner 可见，编辑留历史。
- [ ] `COL-004` P1/M4 收藏；验收：成员私有、删除 Knowledge 后安全清理。
- [ ] `COL-005` P1/M4 最近访问；验收：有界、隐私私有、禁用成员不可读取。
- [ ] `COL-006` P1/M4 Saved View；验收：成员私有、过滤 schema 安全。
- [ ] `COL-007` P1/M5 最近 Research；验收：恢复来源集合和未完成状态。
- [ ] `COL-008` P1/M5 Note 列表；验收：私有默认，分享必须显式。
- [ ] `COL-009` P2/M5 共享 Note；验收：只能共享给 active members，随时撤销。
- [ ] `COL-010` P1/M4 活动流；验收：只显示用户可见资源和 allowlisted event。
- [ ] `COL-011` P2/M7 每日/每周回顾；验收：确定性列表始终可用，AI 摘要可延期。
- [ ] `COL-012` P2/M7 待读；验收：成员私有、排序和完成状态。
- [ ] `COL-013` P2/M8 PWA 快速录入；验收：离线草稿不含 Secret，恢复后正常提交。
- [ ] `COL-014` P2/M8 系统分享入口；验收：只接收允许类型并要求已登录确认。

## AUTH — 身份、角色和授权

- [x] `AUTH-001` P0/M0 GitHub OAuth start；状态：R；证据：2026-08-21，生产 `/auth/github` 302，version `3bd2985e-487c-4fc0-bcb8-31c1f00967ca`，request ID `a9d1e5602fd999e4c48a314167a77a5e`。
- [x] `AUTH-002` P0/M0 state + PKCE S256 callback；状态：L/W/R；生产 callback request ID `a2f6d391fdf2ddbf`、302→首页 200、登录后 `/api/session` 200，版本 `ce88dab4-e452-4225-adf5-abfab7adb704`。
- [x] `AUTH-003` P0/M0 GitHub primary+verified 邮箱；状态：L/W；生产管理员已登录，但缺少完整 R 证据记录。
- [x] `AUTH-004` P0/M0 allowlist；状态：L/W；远程非 allowlist 拒绝仍需单独证据。
- [x] `AUTH-005` P0/M0 bootstrap admin；状态：L/W；生产管理员已建立，但缺少完整 R 证据记录。
- [x] `AUTH-006` P0/M0 D1 哈希 Session；状态：L/W；生产存储细节不导出。
- [x] `AUTH-007` P0/M0 `__Host-memory-session` Cookie；状态：L/W；生产登录成功但 Cookie 安全属性未单独归档。
- [x] `AUTH-008` P0/M0 admin/contributor capability matrix；状态：L/W。
- [x] `AUTH-009` P0/M0 disabled member fail-closed；状态：L/W/R；临时 evidence contributor 经真实 admin PATCH 后 session 返回 403 `MEMBER_DISABLED`，request ID `a2f620ffd82284b2`，临时记录已清理。
- [x] `AUTH-010` P0/M0 automation HMAC + APP_TOKEN；状态：L/W；远程 signed smoke 待证据。
- [x] `AUTH-011` P0/M0 浏览器会话与 automation credential 分流；状态：L/W；会话有效、无效或过期时都不回退为 automation。
- [x] `AUTH-012` P0/M0 automation 非管理员；状态：L/W。
- [x] `AUTH-013` P0/M1 新 Source/Submission capability；状态：L/W；验收：admin/contributor 可创建、automation 不可。
- [x] `AUTH-014` P0/M1 Review/Publish capability；状态：L/W；验收：仅 active admin。
- [x] `AUTH-015` P0/M1 shared/admin_only 全读路径；验收：列表/搜索/引用/下载分别测试。证据：真实 D1+DO 覆盖 list/search/current detail/history/citation/download 的 admin/contributor/disabled/伪造角色，hidden/absent/cross-item download 统一 404，客户端 path/hash query 被拒绝。
- [ ] `AUTH-016` P0/M5 Note/Research owner scope；验收：ID 猜测和跨用户读取为 404/403 稳定合同。
- [ ] `AUTH-017` P0/M6 Agent 工具授权；验收：每次工具调用重新校验。
- [ ] `AUTH-018` P0/M8 登录体系兼容门禁；验收：每个 Milestone 固定运行 GitHub/session/automation 回归集。

## I18N — 国际化

- [x] `I18N-001` P0/M1 中英文完整国际化；状态：L/W；验收：浏览器语言自动选择、页面内 `zh-CN`/`en` 切换、`localStorage` 持久化、全部用户可见文案与 ARIA 文本使用等价翻译键、未知键回退英文且 CI 阻止缺键/硬编码文案发布。证据：`zh-CN`/`en` 349 键及 45 个插值占位符完全对齐；切换只原位刷新已绑定文本、安全属性/ARIA 与标题，不重新渲染/抓取当前路由，不重启认证或重放 GET、mutation/AI，且保持已加载分页/游标、表单值/选择、抽屉/对话框状态、语言控件焦点和当前 mutation ownership；常规导航与前进/后退仍按原合同抓取，既有 route guard 继续拒绝陈旧路由完成。静态门禁使用固定 TypeScript AST API 与 DOM HTML 解析，mutation 测试覆盖缺键/占位符、动态键 map、直接/变量间接/setAttribute/createTextNode/DOM helper/HTML 文本和属性、转义中英文、base64、模板/拼接及可显示 Markdown 异常；命令：`rtk npm run test:i18n`、`rtk npm run verify:i18n`、`rtk npm run check`。

## EVAL — 质量评测

M1 Task 9 的 provider-free 门禁包含 24 条固定检索/问答查询、从独立 fixture 导出的 34 条 parser 用例和中英文强/弱证据信心语料，并报告非零精确分母。评测计算 Recall@5、citation precision/recall/location、逐例答案/拒答/拒绝契约、错误引用和权限泄露。`test:m1` 契约直接包含 audit、index document、search policy、Markdown renderer 和 evidence confidence 等生产入口套件，删除任一必需套件会使发布契约失败。这不替代 M4/M5 的语义、同义词、表格、冲突和生产评测验收。

- [x] `EVAL-001` P0/M1 解析 fixture 规范；状态：L/W；验收：输入字节、期望 Markdown、行数、warning、错误码和 metadata 由独立 fixture 定义，不调用生产 helper。证据：`test/fixtures/m1-parser-cases.ts`；命令：`rtk npm run test:m1`。
- [x] `EVAL-002` P0/M1 Markdown/文本/代码解析集；状态：L/W；验收：三类均覆盖正常、空、精确边界、超限、malformed UTF-8、恶意和换行语料，并验证拒绝不持久化。行为级 mutation matrix 另含 28 个具名 witness：每项以独立字面 fixture 通过公共生产函数/服务建立基线，再变异一个输入、策略或状态；每个变异必须只报告其精确 feature ID 和非空原因，零/缺失 witness 失败关闭。证据：`test/fixtures/m1-parser-cases.ts`、`test/fixtures/m1-mutation-matrix.ts`、`test/unit/m1-mutation-matrix.test.ts`、`test/unit/source-decoder.test.ts`、`test/unit/source-parser.test.ts`、`test/unit/submissions-service.test.ts`；命令：`rtk npm run test:m1`。
- [x] `EVAL-003` P0/M2 每种文件格式解析集；状态：L；验收：TXT、Markdown、Code、CSV、HTML、XML、PDF、DOCX、XLSX、ODT、ODS、PPTX 均通过同一公共解析器矩阵覆盖正常、损坏、空内容和超限输入；Numbers 明确验证免费层 `ASSET_NUMBERS_PARSE_UNSUPPORTED` 降级，不调用 AI。证据：`test/unit/m2-format-matrix.test.ts`；命令：`rtk npx vitest run test/unit/m2-format-matrix.test.ts`（13 tests）。真实 R2 对象、伪造 MIME、断点上传和生产配额仍属于远程证据边界。
- [x] `EVAL-004` P0/M2 Chunk golden set；状态：L；验收：固定 heading/table/code/PDF/spreadsheet/slide 五类输入与手工期望，逐例通过 parser + chunker 公共接口验证。证据：`test/fixtures/m2-chunk-golden.ts`、`test/unit/m2-chunk-golden.test.ts`。
- [ ] `EVAL-005` P0/M4 检索 query set；验收：关键词、语义、同义词、跨语言、代码、表格。
- [ ] `EVAL-006` P0/M4 Recall@5 计算；验收：固定 corpus、确定性报告、目标 ≥85%。
- [ ] `EVAL-007` P1/M4 排名回归；验收：NDCG/MRR 或人工 top-k 基线可比较。
- [ ] `EVAL-008` P0/M4 权限泄露集；验收：shared/admin_only/disabled/history/deleted 泄露为 0。
- [ ] `EVAL-009` P0/M5 引用正确性集；验收：支持/部分支持/冲突/无来源。
- [ ] `EVAL-010` P0/M5 错误引用率；验收：错误断言引用为 0，否则拒答。
- [ ] `EVAL-011` P0/M5 引用定位率；验收：所有返回 citation 可回读位置。
- [ ] `EVAL-012` P0/M5 Prompt injection 集；验收：伪系统、工具诱导、泄露、引用伪造。
- [ ] `EVAL-013` P1/M5 用户反馈采样；验收：按 query/citation 聚合且不保存 Secret。
- [ ] `EVAL-014` P1/M6 Research 计划集；验收：步骤有界、证据缺口可见。
- [ ] `EVAL-015` P1/M6 Agent 工具轨迹集；验收：无越权、无未注册工具、步数受控。
- [ ] `EVAL-016` P0/M4 FTS5-only 降级集；验收：核心检索和阅读通过。
- [ ] `EVAL-017` P0/M6 无 AI/额度耗尽集；验收：录入审核阅读不受影响。
- [ ] `EVAL-018` P1/M8 生产合成探针；验收：只用无敏感 fixture、限频、可清理。

## OPS — 运维、额度、备份和恢复

- [x] `OPS-001` P0/M0 本地完整门禁；状态：L/W；证据：types、TS、smoke、unit、workerd、dry build。
- [x] `OPS-002` P0/M0 GitHub OAuth 生产部署手册；状态：I/L；证据：`docs/operations/production-environment-handbook.md`。
- [x] `OPS-003` P0/M0 Secret bundle 单版本发布；状态：L；远程流程已由操作员执行；M1 本地合同要求受保护临时文件/目录均已删除才算 stage 成功，清理失败保留 EXIT trap 并使 stage 失败。
- [x] `OPS-004` P0/M0 append-only D1 migrations；状态：L/R；0001/0002 已由操作员应用。
- [x] `OPS-005` P0/M0 signed automation 远程 smoke 证据；状态：R；证据：`docs/operations/evidence/m1-release-2026-08-23.md`，custom domain health/create/list/search/chat 通过，错误签名 401、admin automation 403。
- [x] `OPS-006` P0/M0 disabled contributor 远程证据；验收：真实 session 在禁用后返回 403 `MEMBER_DISABLED`；request ID `a2f620ffd82284b2`。
- [x] `OPS-007` P0/M0 DO 跨远程激活证据；验收：正常空闲生命周期前后 `/api/notes` 返回同一 4 条记录、1,270 bytes 和 SHA-256；request IDs `a2f6cd84bfbf0713` / `a2f6cfae5e92f325`。
- [ ] `OPS-008` P0/M2 R2 Bucket 配置；验收：Standard/private/CORS/生命周期和 binding。
- [ ] `OPS-009` P0/M2 R2 用量账本；验收：8/9 GB 阈值和 Dashboard 对账。
- [ ] `OPS-010` P0/M2 Queue 配置；验收：consumer、重试、DLQ/替代扫描和 24h 约束。
- [ ] `OPS-011` P0/M2 Job 重投扫描；验收：Queue 丢失/过期后从 D1 恢复。
- [ ] `OPS-012` P0/M4 Vectorize index 配置；验收：384 维、metadata indexes、binding 和 rebuild。
- [ ] `OPS-013` P0/M4 Vectorize 用量断路器；验收：80% 后停止普通向量。
- [ ] `OPS-014` P0/M2 Workers AI 日额度策略；验收：优先级、deferred_quota 和次日恢复。
- [x] `OPS-015` P0/M1 D1 query 成本证据；状态：R；证据：`docs/operations/evidence/m1-release-2026-08-23.md`，13 个有界生产只读路径记录 returned rows、rows_read、rows_written。
- [x] `OPS-016` P0/M1 keyset pagination 全局门禁；状态：L/W；验收：所有列表 default/max 有界；Submit/Search 的 Space/Collection/Tag 第 51 项仅由可访问的显式 Load more 获取，去重、single-flight 且抑制 stale scope 结果。
- [ ] `OPS-017` P0/M7 全量导出；验收：manifest、metadata、Revision、原件和引用映射。
- [ ] `OPS-018` P0/M7 增量导出；验收：基于稳定 cursor/checkpoint，无漏项。
- [ ] `OPS-019` P0/M7 导入 dry-run；验收：schema、容量、冲突和权限报告，不写数据。
- [ ] `OPS-020` P0/M7 新环境恢复；验收：身份映射、内容、Revision、原件和引用一致。
- [ ] `OPS-021` P0/M7 FTS/Vectorize 重建；验收：权威数据不改、结果与导出一致。
- [ ] `OPS-022` P0/M7 定期恢复演练；验收：真实命令、时间、差异和失败处理记录。
- [ ] `OPS-023` P1/M8 结构化日志；验收：request ID、stage/reason、无正文/Secret/OAuth code。
- [ ] `OPS-024` P1/M8 任务仪表盘；验收：backlog、age、failure、retry、quota。
- [ ] `OPS-025` P1/M8 索引漂移仪表盘；验收：current/FTS/vector mismatch 可定位。
- [ ] `OPS-026` P0/M8 配额故障演练；验收：D1/R2/DO/AI/Vectorize/Queue 分别验证降级。
- [ ] `OPS-027` P0/M8 发布 checklist；验收：backup→migration→upload→inspect→deploy→smoke→evidence。
- [ ] `OPS-028` P0/M8 前向兼容回滚；验收：不逆向 migration、不部署旧 Access build。

## Milestone Gate

### M0

- [x] `GATE-M0` 成功 OAuth callback、signed smoke、disabled contributor、workers.dev/preview Dashboard 关闭状态和 DO 正常生命周期读取证据均已归档；见 `docs/operations/evidence/m1-release-2026-08-23.md`。

### M1

- [x] `GATE-M1` 文本/Markdown/代码从录入、审核、Revision、阅读、FTS 到引用问答完整通过；GitHub OAuth 和 automation 无回归。生产 `0004`、version ID、signed automation、D1 成本和四项最终 M0 远程证据均已归档；见 `docs/operations/evidence/m1-release-2026-08-23.md`。

### M2

- [ ] `GATE-M2` 状态：degraded_verified（免费层）；`rtk npm run test:m2` 已覆盖支持矩阵所有格式的正常/损坏/空/超限 fixture、Numbers/R2 fail-closed 与任务恢复。完整接受仍要求启用 R2/Queue 后的生产对象、任务和 AI 降级证据，当前不宣称完成。证据：`package.json`、`docs/operations/m2-asset-ingestion.md`；命令：`rtk npm run test:m2`。

### M3

- [ ] `GATE-M3` 并发发布、重试、回收、恢复、回滚和审计无半成品或越权。

### M4

- [ ] `GATE-M4` Recall@5 ≥85%、权限泄露 0、FTS5-only 完整可用、引用可定位。

### M5

- [ ] `GATE-M5` Sources panel、Add context、Notes 和 P1 研究产物通过错误引用率 0 的固定评测。

### M6

- [ ] `GATE-M6` Research 可暂停恢复，Agent 无越权/直接发布/任意工具，额度耗尽可延期。

### M7

- [ ] `GATE-M7` 导出可在新环境恢复权威数据并重建全部派生索引。

### M8

- [ ] `GATE-M8` 完整端到端、移动/无障碍、托管 CI、故障演练和生产证据满足 1.0。
