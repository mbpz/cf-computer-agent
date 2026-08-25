# 前端国际化基线

本基线冻结 React 前端的中英文 locale 结构，不冻结文案语气。新增或删除 key、placeholder 时，必须先更新两份 locale，再运行验证命令。

## 当前基线

- locale：`en`、`zh-CN`
- key 数：`434`
- placeholder 数：`55`
- 扫描文件数：`6`
- placeholder 规则：两份 locale 的同名 key 必须拥有完全相同的占位符集合
- 安全规则：运行时只替换受控文本、`aria-label`、`title` 等允许属性；不把翻译值当作 HTML

## 验证

```bash
npm run test:i18n
npm run verify:i18n
```

`test:i18n` 必须通过 13 个契约测试；`verify:i18n` 必须输出 `i18n keys=434 placeholders=55 files=6` 和 `i18n-hardcoded-copy ast=typescript html=dom`。

