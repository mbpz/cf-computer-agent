# 前端 Markdown 安全基线

知识阅读页只能通过 `public/markdown-renderer.js` 的 `renderSafeMarkdown` 入口渲染 Markdown。页面不得直接把用户内容写入 `innerHTML`，也不得绕过该入口调用 Markdown parser 或 DOMPurify。

## 固化规则

- Markdown parser 使用 `html: false`，原始 HTML 只作为文本显示。
- 允许标签与属性必须继续由 renderer 的 allowlist 控制；ARIA、data、`style`、`src`、`srcset`、`id`、`name` 不得开放。
- URL 只允许 `http:`、`https:`、`mailto:`；链接统一加 `target="_blank"` 与 `rel="noopener noreferrer"`。
- `script`、`style`、`iframe`、`form`、`svg`、`math` 等危险标签必须被移除。
- renderer 不可用或 payload 非字符串时必须安全失败/降级，不得把异常或原始 body 展示给用户。

## 验证

```bash
npx vitest run test/unit/markdown-renderer.test.ts test/unit/html.test.ts test/unit/frontend-user-read-pages.test.tsx
```

当前 focused 回归为 3 files / 11 tests；完整 `npm run check` 也必须通过。

