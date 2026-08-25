# M2 格式支持与解析降级矩阵

状态：本地/Workerd 证据已完成；生产 R2、Queue 和真实文件样本尚未执行。

本矩阵固定当前免费层边界：文本录入不依赖 R2；二进制原件链路只有在启用私有 R2 后才会创建资产记录。任何不支持、损坏、空内容、超限或魔数/MIME 不一致的输入都必须返回固定错误码，不写入可见 parsed 对象，不把原始正文写入日志。

## 支持矩阵

| 格式 | 解析路径 | 正常结果 | 降级/拒绝 | 主要边界 |
| --- | --- | --- | --- | --- |
| TXT | 本地 UTF-8 fatal decode | LF 规范化 Markdown | 非法 UTF-8 → `SOURCE_ENCODING_INVALID` | 128 KiB 输出 |
| Markdown | M1 parser | 标题、段落、列表、表格、代码块 | 空内容 → `SOURCE_EMPTY` | 128 KiB 输出 |
| Code | M1 parser + code metadata | fenced code、语言、原始行基线 | 非法语言/行号 → 稳定校验错误 | 128 KiB 输出 |
| CSV | 本地 RFC4180 解析 | 表头、Markdown 表格、A1 行范围 | 引号/编码/空表错误 → `ASSET_CSV_PARSE_UNSUPPORTED` | 2 MiB、50,000 行、256 列 |
| HTML | 本地安全 tokenizer | 标题、段落、列表、表格、代码 | script/style/iframe/SVG/危险 URL 删除 | 256 KiB 输入、128 KiB 输出 |
| XML | 本地有界元素解析 | 元素层级与叶值 Markdown | DOCTYPE/ENTITY/多根/错配拒绝 | 256 KiB、10,000 元素、64 层 |
| PDF | 本地未压缩文本流恢复 | `Page N` Markdown | 无文本页 → `Page unknown` + `PDF_TEXT_UNAVAILABLE` | 2 MiB、页数上限 |
| DOCX | 有界 OOXML ZIP | Heading1..6、段落、表格 | ZIP/XML 损坏或空正文拒绝 | 4 MiB 容器、2 MiB XML |
| XLSX | 有界 OOXML ZIP | Sheet 名称、单元格、A1 范围 | relationship/worksheet/空表拒绝 | 4 MiB、2 MiB XML、50,000 cells/50 sheets |
| PPTX | 有界 OOXML ZIP | slide 顺序、文本元素顺序 | slide relationship/空/损坏拒绝 | 4 MiB、2 MiB XML、200 slides |
| ODT | 有界 OpenDocument ZIP | 标题、段落、列表 | content.xml 缺失/空/声明拒绝 | 4 MiB、2 MiB XML、128 KiB 输出 |
| ODS | 有界 OpenDocument ZIP | Sheet、Markdown 表格、A1 范围 | content.xml 缺失/空/声明拒绝 | 4 MiB、2 MiB XML、50,000 行 |
| Numbers | 不解析 IWA | 无 | `ASSET_NUMBERS_PARSE_UNSUPPORTED`，不送 Workers AI | 免费层安全降级 |
| 图片 | Workers AI LLaVA（可选） | OCR/结构描述 Markdown | AI 不可用/超时/低置信度 → 可见 warning 或重试 | 4 MiB 输入、32 KiB 输出、5 秒 |

## 统一失败合同

1. 输入先校验扩展名、声明 MIME、魔数和大小；不一致在资产创建前拒绝。
2. 解析器只返回规范 Markdown、warnings、parser schema 和受限位置元数据。
3. 统一空输出断言：空字符串、仅空白和非字符串结果进入 `failed_terminal`，不创建 `parsed/{assetId}.md`。
4. 可恢复的对象缺失、Workers AI/网络暂时故障和未知异常进入 `failed_retryable`，错误码脱敏且最多三次尝试。
5. 解析失败必须保留 staging 原件（若 R2 已启用），重试使用相同资产和对象键，不产生重复可见记录。
6. Numbers 明确是产品降级，不得绕过专用 parser 把 IWA 二进制交给 AI。

## 本地证据

```bash
rtk npx vitest run \
  test/unit/{odf,docx,xlsx,csv,html,xml,pptx,pdf-pages,assets-service}.test.ts \
  test/worker/m2-assets.test.ts
```

当前结果：10 files / 110 tests passed。完整项目门禁仍使用：

```bash
rtk npm run check
```

上述命令只证明本地/Workerd 行为，不证明生产 R2 bucket、Queue、Workers AI 配额或真实文件样本已验证。生产证据需要单独的 D1 备份、migration/deploy 和 smoke 授权。

## 暂缓项

- PAR-020 重新解析：现有 `source_versions.submission_id` 唯一约束不允许同一提交追加 parser version；需要新增 source-version lineage/任务模型，并确保已发布 Revision 不被覆盖。
- PDF 页码、spreadsheet sheet/range 与 slide/element order 已由 `chunks.location_json` 完成同一 Chunk/Revision/Reader 链路；真实文件样本与生产 R2 仍属于远程证据边界。
- R2/Queue/容量断路器：保持当前免费层禁用，不通过隐式远程资源绕过付费要求。
