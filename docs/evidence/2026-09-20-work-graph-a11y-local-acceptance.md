# Work Graph A11Y 本地验收证据

日期：2026-09-20

范围：`WB-GR-001` / `GR-A11Y-01` 的键盘与移动端可达性切片。目标是让 Cytoscape 不可见或不可用时仍保留语义节点列表，并支持键盘选择、动作触发和清除选择。

## 已验证

```bash
rtk npx vitest run test/unit/frontend-graph-a11y.test.tsx test/unit/frontend-graph-canvas.test.tsx test/unit/frontend-graph-inspector.test.tsx test/unit/frontend-graph-page.test.tsx --pool=threads --maxWorkers=1
rtk npm run typecheck
rtk git diff --check
```

结果：A11Y、Canvas、Inspector、GraphPage focused tests 22/22；TypeScript 通过；差异检查通过。

已覆盖：

- 节点列表按钮支持 ArrowUp/ArrowDown/ArrowLeft/ArrowRight 循环移动焦点；
- Enter/Space 触发节点选择；Escape 清除当前选择；
- Inspector 暴露稳定的 `tabIndex=-1` 聚焦目标，动作按钮位于其语义内容之后；
- 窄屏或隐藏 viewport 时保留语义节点列表；恢复宽屏后 Cytoscape 可以重新初始化；
- A11Y 交互无 `undefined` 可见文本。

## 边界

- 目前只完成本地键盘/语义 fallback 证据；真实浏览器读屏、移动设备和生产部署仍待验收；
- Graph 的时间过滤、Mindmap adapter、AI 建议和生产 signed browser acceptance 尚未完成。
