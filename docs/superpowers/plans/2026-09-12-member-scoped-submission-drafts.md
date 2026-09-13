# Member-scoped Submission Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current task. Do not dispatch agents without user authorization. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复同一浏览器切换成员后读取他人离线知识草稿的问题，并阻止旧成员的异步提交结果修改新成员草稿。

**Architecture:** 保留现有 localStorage 最佳努力恢复能力，所有操作必须传入已认证 session.member.id，使用成员命名空间。提交路由以成员 ID 为 React 生命周期边界，离开或切换成员时取消请求，并在处理响应前检查当前请求身份。

**Tech Stack:** 现有 React、TypeScript、Vitest、happy-dom；不新增依赖、Cloudflare 服务、数据库或迁移。

**Spec:** `docs/product/2026-09-12-personal-workbench-completion-audit.md` 的 B02 及统一完成标准；当前缺口见 `docs/product/2026-09-12-personal-workbench-route-inventory.md`。

## Global Constraints

- 每个用户数据独立；成员 ID 仅来自认证 session，不从 URL、表单或草稿反推。
- 后端主要严格遵守使用 Cloudflare 的免费服务；本批无后端资源变化。
- 不读取、不自动归属、不删除旧的无成员 `memory-garden:offline-submission-draft:v1` 记录；升级后不再通过产品 UI 展示该未知归属内容。
- 新键：`personal-workbench:offline-submission-draft:v2:${encodeURIComponent(memberId)}`；不使用邮箱作为身份。
- 草稿标题最多 512 UTF-8 bytes，正文最多 131072 UTF-8 bytes；仅持久化 mode/title/content；不写 token、cookie、session 或请求认证头。
- 空白、缺失或超长成员 ID 不读写存储；存储不可用仍允许在线编辑与提交。
- localStorage 成员命名空间不是加密，也不抵御同源恶意脚本或可检查本机存储的人；不宣称设备级机密性。
- 本批不更改发布 visibility、附件开关、服务端草稿 API 或知识问答会话设计。
- B01 的跨重试/刷新稳定幂等身份仍是独立待办；本批请求中断不代表服务器回滚，也不自动重发。
- 不提交、推送或部署；保留当前 main 的未提交修改。执行前确认隔离工作区安排。

## 文件职责

| 文件 | 修改范围 |
| --- | --- |
| `frontend/lib/offline-submission-draft.ts` | 必填 memberId 与私有存储键；保留现有字段边界与最佳努力行为 |
| `frontend/app.tsx` | 将 session.member.id 传给 SubmitRoute；成员键控内部表单与异步取消 |
| `test/unit/offline-submission-draft.test.ts` | 双成员隔离、旧键不归属、坏数据、不可用存储 |
| `test/unit/frontend-submit-owner-route.test.tsx`（新增） | 真正渲染路由，验证成员切换/卸载/迟到请求 |
| `docs/product/2026-09-12-personal-workbench-completion-audit.md` | 只记录本批实际证据，不扩大完成声明 |

## Task 1 — 成员作用域草稿存储

**Interfaces:** 三个函数均增加第一个必填参数 `memberId: string`。完整签名：

```ts
loadOfflineSubmissionDraft(memberId: string, storage?: DraftStorage): SubmissionDraft | null
saveOfflineSubmissionDraft(memberId: string, draft: SubmissionDraft, storage?: DraftStorage): void
clearOfflineSubmissionDraft(memberId: string, storage?: DraftStorage): void
```

- [ ] 1. 在现有测试的 `storage()` helper 上添加双成员红灯测试，原有三个测试全部改为显式成员，不保留无成员兼容签名。

```ts
it("isolates draft reads and deletion between members", () => {
  const store = storage();
  const a = { mode: "markdown", title: "A", content: "private A" } as const;
  const b = { mode: "text", title: "B", content: "private B" } as const;
  saveOfflineSubmissionDraft("member-a", a, store);
  expect(loadOfflineSubmissionDraft("member-b", store)).toBeNull();
  saveOfflineSubmissionDraft("member-b", b, store);
  clearOfflineSubmissionDraft("member-b", store);
  expect(loadOfflineSubmissionDraft("member-a", store)).toEqual(a);
  expect(loadOfflineSubmissionDraft("member-b", store)).toBeNull();
});

it("never claims an unowned legacy draft", () => {
  const store = storage();
  const raw = JSON.stringify({ mode: "text", title: "Old", content: "unknown owner" });
  store.setItem("memory-garden:offline-submission-draft:v1", raw);
  expect(loadOfflineSubmissionDraft("member-a", store)).toBeNull();
  clearOfflineSubmissionDraft("member-a", store);
  expect(store.getItem("memory-garden:offline-submission-draft:v1")).toBe(raw);
});
```

- [ ] 2. 执行 `rtk proxy npx vitest run test/unit/offline-submission-draft.test.ts`，记录行为失败，而不是以导入或环境错误作为红灯。
- [ ] 3. 用下列键函数替代全局常量。在 load/save/clear 入口先求 key，null 立即返回；只对该 key 执行 get/set/remove。save 空内容转 `clearOfflineSubmissionDraft(memberId, storage)`。保留 `isDraft` 和 `browserStorage`；解析出非法草稿或 JSON 损坏时只清除当前成员坏记录，不清全站存储。

```ts
function storageKey(memberId: string): string | null {
  if (typeof memberId !== "string" || !memberId.trim()
      || new TextEncoder().encode(memberId).byteLength > 512) return null;
  try {
    return `personal-workbench:offline-submission-draft:v2:${encodeURIComponent(memberId)}`;
  } catch { return null; }
}
```

- [ ] 4. 增补以下真实行为断言并跑绿：空 memberId 不读写；A 的超限/坏 JSON 不删除 B；字段裁剪不存额外属性；512/131072 UTF-8 边界与中文越界；setItem/getItem/removeItem 抛错不影响编辑；A 刷新可恢复；旧键保留但不可读。不要仅断言函数被调用。
- [ ] 5. 执行测试后检查 `rtk proxy rg -n 'loadOfflineSubmissionDraft|saveOfflineSubmissionDraft|clearOfflineSubmissionDraft' frontend test`，所有调用点在 Task 2 完成前都纳入修改范围。

## Task 2 — 认证成员接线与旧请求清理

**Files:** `frontend/app.tsx`、新增 `test/unit/frontend-submit-owner-route.test.tsx`。

**Interfaces:** `SubmitRoute({locale, memberId}: {locale: LocaleRuntime; memberId: string})`；沿用现有 `createSubmission(draft, requester, signal)`，不在本批修改其幂等契约。

- [ ] 1. 用现有 `test/helpers/authenticated-app-harness.tsx` 的 `mountApp`、`waitForApp`，真实渲染 `/submit`。通过 `configureBrowser` 预置 A/B 两个草稿，再由 `/api/session` 返回 member B，断言 B 表单内容和 A 内容不可见。请求 fixture 必须返回当前 `/api/navigation` 与遥测需要的合法响应；错误必须含 boolean `retryable`。

复用 `createMaturityRouteFetch` 处理正常导航/遥测，完整的初始成员测试主体如下。文件同时导入 React/act、Vitest、三个草稿函数、`mountApp`/`waitForApp`、`createMaturityRouteFetch`、`SubmitRoute` 和 `createLocaleRuntime`。afterEach 中执行 `await journey?.unmount()`。

```ts
const a = { mode: "markdown", title: "A", content: "private A" } as const;
const b = { mode: "text", title: "B", content: "private B" } as const;
const locale = createLocaleRuntime();
const fallback = createMaturityRouteFetch({
  routeId: "submit", state: "ready", role: "contributor", permissionMask: "0x0",
});
journey = await mountApp({
  url: "https://app.test/submit",
  configureBrowser(browser) {
    saveOfflineSubmissionDraft("member-a", a, browser.localStorage);
    saveOfflineSubmissionDraft("member-b", b, browser.localStorage);
  },
  fetch: (input, init) => String(input) === "/api/session"
    ? Promise.resolve(Response.json({
        member: { id: "member-b", email: "b@app.test", role: "contributor" },
        capabilities: ["knowledge:read", "submission:create", "submission:read-own"],
        permissionMask: "0x0", logoutUrl: "/auth/logout",
      }))
    : fallback(input, init),
});
await waitForApp(() => journey.container.querySelector("textarea") !== null);
expect((journey.container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("private B");
expect(journey.container.textContent).not.toContain("private A");
expect(loadOfflineSubmissionDraft("member-a", journey.browser.localStorage)).toEqual(a);
```

- [ ] 2. 执行 `rtk proxy npx vitest run test/unit/frontend-submit-owner-route.test.tsx`，确认旧实现无法恢复 B 的作用域草稿。
- [ ] 3. 修改 `renderPage` 的 submit case，并将原 SubmitRoute 改为下述成员生命周期外壳；原表单逻辑移到同文件 `MemberSubmitForm`，不做全 App 重构。

```tsx
// renderPage, session is the already authenticated session
case "submit": return <SubmitRoute locale={locale} memberId={session.member.id} />;

export function SubmitRoute({ locale, memberId }: { locale: LocaleRuntime; memberId: string }) {
  return <MemberSubmitForm key={memberId} locale={locale} memberId={memberId} />;
}
```

- [ ] 4. MemberSubmitForm 初始读取 `loadOfflineSubmissionDraft(memberId)`；保存 effect 依赖 `[memberId, draft]`；所有清除显式传 memberId。请求生命周期采用以下形状，并保留现有 validation/error/success 文案与 SimilarSubmissionCandidate 数据：

```tsx
const requestRef = useRef<AbortController | null>(null);
const draftRef = useRef(draft);
useEffect(() => () => {
  requestRef.current?.abort();
  requestRef.current = null;
}, []);

const changeDraft = (next: SubmissionDraft) => {
  draftRef.current = next;
  setDraft(next);
};

// submit(nextDraft), before setting pending:
if (requestRef.current) return;
const controller = new AbortController();
requestRef.current = controller;
// inside try:
const result = await createSubmission(nextDraft, fetch, controller.signal);
if (controller.signal.aborted || requestRef.current !== controller) return;
if (draftRef.current === nextDraft) {
  clearOfflineSubmissionDraft(memberId);
  changeDraft({ mode: nextDraft.mode, title: "", content: "" });
}
// Set the existing success state; do not discard newer edits made while pending.
// At the beginning of catch:
if (controller.signal.aborted || requestRef.current !== controller) return;
// Keep existing validation/error state assignment after this guard.
// finally:
if (requestRef.current === controller) requestRef.current = null;
```

用 `onDraftChange={changeDraft}` 绑定 SubmitPage。请求 guard 放在成功和失败两条路径；仅 abort 不足以防止忽略 signal 的请求迟到。

- [ ] 5. 新增实际 route 测试：root.render 同一 SubmitRoute 从 A 改为 B；A 请求悬挂期间切 B 后再 resolve/reject A；成功只清 A；失败保留 A；卸载 abort 且不写存储；请求期间编辑的新草稿不被旧成功清空。使用受控 promise 的真实 Response，不 mock `createSubmission`/SubmitPage/存储模块。

```ts
await act(async () => {
  journey.root.render(<SubmitRoute locale={locale} memberId="member-b" />);
});
await act(async () => resolveA(Response.json({ submission: { id: "submission-a" } })));
expect((journey.container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("private B");
expect(loadOfflineSubmissionDraft("member-b", journey.browser.localStorage)).toEqual(b);
```

这里 locale 来自 `createLocaleRuntime()`，不自行伪造缺字段对象。延迟请求测试以请求 URL 捕获 `/api/submissions`，其它 fixture 请求正常响应。初始化 `let resolveA!: (response: Response) => void; const pendingA = new Promise<Response>((resolve) => { resolveA = resolve; });`，fetch 在对应 POST 返回 pendingA；先渲染 A 并 dispatch 原生 form submit，再切换 B，最后 resolveA。测试不能靠直接调用组件内部 handler 绕过界面接线。

- [ ] 6. 执行定向测试与 TypeScript 检查；先从 `package.json` 确认现有 frontend typecheck 命令，不用 `@ts-ignore` 适配旧签名。

```bash
rtk proxy npx vitest run test/unit/offline-submission-draft.test.ts test/unit/frontend-submit-owner-route.test.tsx test/unit/frontend-submission-data.test.ts test/unit/frontend-submit-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx
rtk proxy git diff --check
```

- [ ] 7. 在真实浏览器进行同源 A → 退出 → B → 退出 → A 恢复验收；如果缺第二账号，仅报告 fixture 测试通过，真实双账号验收保持未完成。不得使用或输出用户凭证。
- [ ] 8. 在增量审计记录变更文件、测试数量、失败再通过证据和未验收边界。B02 只在实现与定向测试满足时标本地完成；B01、附件、全部功能和生产验收均不随本批勾选。提交等待用户单独授权。

## 自检与执行边界

- 本批只覆盖 B02，不是整个 30 项清单的详细计划。
- 所有存储签名一致；member ID 来自 session，旧键无自动迁移，成功/失败/切换/卸载分支均有明确行为。
- Task 1 的临时调用签名不匹配需要在 Task 2 一并完成后再作为可交付候选，不单独发布。
- 若当前仍是 main 普通检出且有原未提交修改，先确认工作区安排；不擅自 stash、reset、切换或提交这些修改。
