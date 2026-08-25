# shadcn/ui 前端迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 Cloudflare Worker API、GitHub OAuth、Session Cookie、D1、Durable Object 和 Markdown 安全边界的前提下，用 React + Vite + shadcn/ui 源码组件渐进式替换当前 vanilla JavaScript 工作台。

**Architecture:** 新前端位于 `frontend/`，由 Vite 构建成 Wrangler Assets 静态文件。迁移期间旧 `public/` 保留，React Shell 通过同一 API adapter、locale catalog 和安全 Markdown renderer 访问现有 Worker API；所有页面完成路由/权限/可访问性回归后才切换 Assets 入口并删除旧 UI。

**Tech Stack:** React、ReactDOM、Vite、TypeScript、Tailwind CSS v4、shadcn/ui 源码组件、Radix primitives（按组件需要）、Phosphor Icons、Vitest、happy-dom、Cloudflare Workers Assets。

**Spec:** `docs/superpowers/specs/2026-08-25-shadcn-ui-frontend-migration.md`

## Global Constraints

- Cloudflare 免费层和 5–20 人私有知识库边界不变。
- 不添加 Node 服务端、Next.js、R2、Vectorize、Queues 或付费 API。
- API 路径、JSON 字段、权限 capability、OAuth callback、Session Cookie 不改名。
- 不在 localStorage 保存 Token、Session、Secret 或 OAuth code。
- Markdown 必须继续经过 `public/markdown-renderer.js` 等价的安全渲染入口。
- 新增可见文案必须同时写入 `public/locales/en.js` 和 `public/locales/zh-CN.js`。
- 每个任务按 RED → GREEN → `rtk git diff --check` → 独立 commit 完成。
- 迁移完成前保留旧 `public/app.js`、`public/workspace-ui.js` 和 `public/styles.css` 可回滚。

## 文件边界总览

- Create: `frontend/` React/Vite 源码、组件、页面、测试。
- Modify: `package.json`、`package-lock.json`、`wrangler.jsonc`、`tsconfig.json`、locale 文件、Worker 静态资产测试。
- Preserve: `src/app.ts`、`src/routes/**`、`src/identity/**`、`src/knowledge/**`、D1 migrations、DO migration tag。
- Delete only at final cutover: `public/app.js`、`public/workspace-ui.js`、`public/navigation.js`、旧 UI 专属样式和对应声明文件。

### Task 1: Freeze the current frontend contract

**Files:**
- Create: `test/unit/frontend-contract.test.ts`
- Create: `frontend/contracts/routes.ts`
- Create: `frontend/contracts/api.ts`
- Modify: `docs/product/shadcn-ui-frontend-checklist.md`

**Interfaces:**
- `ROUTES`: readonly route table for `/`, `/submit`, `/knowledge`, `/search`, `/agent`, `/my-submissions`, and admin routes.
- `ApiError`: `{ code: string; message: string; status: number; retryable: boolean; requestId?: string }`.
- `SessionSnapshot`: `{ authenticated: boolean; memberId?: string; role?: "admin" | "contributor"; capabilities: readonly string[] }`.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import { ROUTES, requiredCapability } from "../../frontend/contracts/routes";

describe("frontend route contract", () => {
  it("keeps the existing public and admin routes", () => {
    expect(ROUTES.map((route) => route.path)).toEqual(expect.arrayContaining([
      "/", "/submit", "/knowledge", "/search", "/agent", "/my-submissions",
      "/admin", "/admin/submissions", "/admin/assets", "/admin/members", "/admin/spaces", "/admin/audit",
    ]));
    expect(requiredCapability("/admin/assets")).toBe("submission:read-all");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `rtk npx vitest run test/unit/frontend-contract.test.ts`

Expected: FAIL because `frontend/contracts/routes.ts` does not exist.

- [ ] **Step 3: Implement the route and API contracts**

Create a frozen route table and capability map. Keep route matching explicit; parameterized `/knowledge/:id` and `/admin/submissions/:id` are handled by a separate matcher and unknown paths remain 404.

- [ ] **Step 4: Run GREEN and the existing UI contract tests**

Run: `rtk npx vitest run test/unit/frontend-contract.test.ts test/unit/navigation.test.ts test/unit/workspace-ui.test.ts`

Expected: PASS with the existing suite unchanged.

- [ ] **Step 5: Commit**

```bash
rtk git add frontend/contracts test/unit/frontend-contract.test.ts docs/product/shadcn-ui-frontend-checklist.md
rtk git commit -m "test: freeze frontend route contracts"
```

### Task 2: Add the React/Vite build without changing the Worker entry

**Files:**
- Modify: `package.json`, `package-lock.json`, `tsconfig.json`
- Create: `vite.config.ts`, `frontend/index.html`, `frontend/main.tsx`
- Create: `frontend/vite-env.d.ts`
- Test: `test/unit/frontend-build.test.ts`

**Interfaces:**
- `npm run dev:ui`: Vite development server.
- `npm run build:ui`: deterministic production build into `frontend/dist`.
- `frontend/main.tsx`: `createRoot(document.getElementById("root")!).render(<App />)`.

- [ ] **Step 1: Add the build contract test**

Assert that `frontend/index.html` contains only the root mount and that the output directory is `frontend/dist`, not the Worker source directory.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/frontend-build.test.ts`

Expected: FAIL because React/Vite files and scripts do not exist.

- [ ] **Step 3: Install the build dependencies**

```bash
rtk npm install react react-dom clsx tailwind-merge class-variance-authority @phosphor-icons/react
rtk npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite shadcn @types/react @types/react-dom
```

- [ ] **Step 4: Add Vite configuration and a minimal App**

Use `@vitejs/plugin-react`, `root: "frontend"`, `build.outDir: "dist"`, and `emptyOutDir: true`. The initial App renders a localized “new shell” marker only; it must not call the Worker API yet.

- [ ] **Step 5: Run GREEN and build**

Run: `rtk npx vitest run test/unit/frontend-build.test.ts && rtk npm run build:ui`

Expected: PASS and `frontend/dist/index.html` exists.

- [ ] **Step 6: Commit**

```bash
rtk git add package.json package-lock.json tsconfig.json vite.config.ts frontend test/unit/frontend-build.test.ts
rtk git commit -m "build: add React Vite frontend shell"
```

### Task 3: Establish Tailwind tokens and shadcn configuration

**Files:**
- Create: `frontend/components.json`, `frontend/styles/globals.css`, `frontend/lib/utils.ts`
- Modify: `vite.config.ts`, `frontend/main.tsx`
- Test: `test/unit/frontend-tokens.test.ts`

**Interfaces:**
- `cn(...inputs: ClassValue[]): string` merges Tailwind classes.
- CSS variables: `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--muted`, `--border`, `--destructive`, and dark-mode equivalents.

- [ ] **Step 1: Write RED token tests**

Load `globals.css` as text and assert that neutral tokens, a single accent, `:root`, `.dark`, and `prefers-reduced-motion` exist.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/frontend-tokens.test.ts`

Expected: FAIL because the token file does not exist.

- [ ] **Step 3: Add the shadcn config and tokens**

Use CSS variables rather than hard-coded per-component colors. Keep one radius scale and avoid purple gradients, glassmorphism, or a second design system.

- [ ] **Step 4: Run GREEN and build**

Run: `rtk npx vitest run test/unit/frontend-tokens.test.ts && rtk npm run build:ui`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add frontend vite.config.ts test/unit/frontend-tokens.test.ts
rtk git commit -m "feat: define shadcn frontend tokens"
```

### Task 4: Add owned shadcn primitives

**Files:**
- Create: `frontend/components/ui/button.tsx`
- Create: `frontend/components/ui/input.tsx`
- Create: `frontend/components/ui/textarea.tsx`
- Create: `frontend/components/ui/label.tsx`
- Create: `frontend/components/ui/card.tsx`
- Create: `frontend/components/ui/badge.tsx`
- Create: `frontend/components/ui/alert.tsx`
- Create: `frontend/components/ui/skeleton.tsx`
- Test: `test/unit/shadcn-primitives.test.tsx`

- [ ] **Step 1: Write RED interaction tests**

Test Button variants, disabled state, Label/Input association, Card composition, Badge status variants, Alert role, and Skeleton accessibility semantics.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/shadcn-primitives.test.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Generate/copy the minimal shadcn source components**

Use `cn` and class variants. Do not import a second component library. Add only components required by the first shell slice.

- [ ] **Step 4: Run GREEN and keyboard tests**

Run: `rtk npx vitest run test/unit/shadcn-primitives.test.tsx`

Expected: PASS with no console errors.

- [ ] **Step 5: Commit**

```bash
rtk git add frontend/components/ui test/unit/shadcn-primitives.test.tsx
rtk git commit -m "feat: add owned shadcn primitives"
```

### Task 5: Build API, locale, and route adapters

**Files:**
- Create: `frontend/lib/api.ts`, `frontend/lib/i18n.ts`, `frontend/lib/router.ts`, `frontend/lib/session.ts`
- Create: `test/unit/frontend-api.test.ts`, `test/unit/frontend-i18n.test.ts`, `test/unit/frontend-router.test.ts`
- Reuse: `public/locales/en.js`, `public/locales/zh-CN.js`, `public/i18n.js`

**Interfaces:**
- `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`.
- `parseApiError(response: Response): Promise<ApiError>`.
- `createLocaleRuntime({ navigatorLanguage, storage }): LocaleRuntime`.
- `matchRoute(pathname: string): RouteMatch | null`.
- `sessionSnapshot(): SessionSnapshot` via `/api/session` or the existing session bootstrap contract.

- [ ] **Step 1: Write RED tests**

Cover JSON success, empty response, malformed error body, request-id propagation, 401/403 mapping, locale browser fallback, manual locale switching, parameterized routes, and unknown-route 404.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/frontend-api.test.ts test/unit/frontend-i18n.test.ts test/unit/frontend-router.test.ts`

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement adapters over existing contracts**

`apiFetch` must never log request bodies or credentials. Locale storage may hold only `en`/`zh-CN`. Router must not broaden Worker SPA fallback.

- [ ] **Step 4: Run GREEN and existing i18n checks**

Run: `rtk npx vitest run test/unit/frontend-api.test.ts test/unit/frontend-i18n.test.ts test/unit/frontend-router.test.ts && rtk npm run test:i18n && rtk npm run verify:i18n`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add frontend/lib test/unit/frontend-api.test.ts test/unit/frontend-i18n.test.ts test/unit/frontend-router.test.ts
rtk git commit -m "feat: add frontend api and locale adapters"
```

### Task 6: Implement the new AppShell

**Files:**
- Create: `frontend/components/shell/app-shell.tsx`
- Create: `frontend/components/shell/sidebar.tsx`
- Create: `frontend/components/shell/topbar.tsx`
- Create: `frontend/components/shell/user-menu.tsx`
- Create: `frontend/components/ui/sheet.tsx`, `frontend/components/ui/dropdown-menu.tsx`, `frontend/components/ui/dialog.tsx`
- Create: `test/unit/frontend-shell.test.tsx`

- [ ] **Step 1: Write RED shell tests**

Assert desktop sidebar links, mobile Sheet open/close, top-right language and logout controls, role-aware navigation, focus restoration, Escape handling, and no `undefined` text.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/frontend-shell.test.tsx`

Expected: FAIL because the shell does not exist.

- [ ] **Step 3: Implement the Shell**

Use shadcn Dialog/Sheet/Dropdown source components. Keep primary navigation left; move language and logout to the top-right user menu. Render every user-facing value through `displayValue` fallback logic.

- [ ] **Step 4: Run GREEN and responsive checks**

Run: `rtk npx vitest run test/unit/frontend-shell.test.tsx && rtk npm run build:ui`

Expected: PASS and responsive CSS is present in the bundle.

- [ ] **Step 5: Commit**

```bash
rtk git add frontend/components/shell frontend/components/ui frontend/styles test/unit/frontend-shell.test.tsx
rtk git commit -m "feat: add shadcn workspace shell"
```

### Task 7: Migrate read-only user pages

**Files:**
- Create: `frontend/pages/home-page.tsx`, `knowledge-page.tsx`, `knowledge-reader-page.tsx`, `search-page.tsx`, `agent-page.tsx`
- Create: `frontend/components/knowledge/*`, `frontend/components/search/*`, `frontend/components/agent/*`
- Test: `test/unit/frontend-user-read-pages.test.tsx`

- [ ] **Step 1: Write RED page tests**

Cover loading skeletons, empty knowledge state, paginated list, reader Markdown sanitizer call, search degraded state, citation links, Agent scopes, confidence, and error fallback.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/frontend-user-read-pages.test.tsx`

Expected: FAIL because the page modules do not exist.

- [ ] **Step 3: Implement pages against `apiFetch`**

Preserve existing endpoint paths and response field names. Pass Markdown only to the safe renderer. Never inject API strings into `innerHTML`.

- [ ] **Step 4: Run GREEN**

Run: `rtk npx vitest run test/unit/frontend-user-read-pages.test.tsx test/unit/markdown-renderer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add frontend/pages frontend/components/knowledge frontend/components/search frontend/components/agent test/unit/frontend-user-read-pages.test.tsx
rtk git commit -m "feat: migrate user read pages to React"
```

### Task 8: Migrate submission and asset pages

**Files:**
- Create: `frontend/pages/submit-page.tsx`, `my-submissions-page.tsx`
- Create: `frontend/components/submissions/*`, `frontend/components/assets/*`
- Test: `test/unit/frontend-submit-pages.test.tsx`
- Reuse API: `/api/submissions`, `/api/submissions/mine`, `/api/assets`, `/api/assets/:id`, `/api/assets/:id/preview`

- [ ] **Step 1: Write RED tests**

Cover content/code/file modes, idempotency key generation, bounded upload state, parser status, preview, retryable failure, resubmit, validation errors, and stale mutation ownership.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/frontend-submit-pages.test.ts`

Expected: FAIL because pages and asset components do not exist.

- [ ] **Step 3: Implement forms and asset state machine**

Use shadcn Input/Textarea/Badge/Alert/Dialog. Disable only the relevant action while pending. Preserve route generation owner through every async callback.

- [ ] **Step 4: Run GREEN and Worker asset regression**

Run: `rtk npx vitest run test/unit/frontend-submit-pages.test.ts && rtk npx vitest run test/worker/m2-assets.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add frontend/pages frontend/components/submissions frontend/components/assets test/unit/frontend-submit-pages.test.ts
rtk git commit -m "feat: migrate submission and asset pages"
```

### Task 9: Migrate administrator pages

**Files:**
- Create: `frontend/pages/admin/*`
- Create: `frontend/components/admin/*`
- Test: `test/unit/frontend-admin-pages.test.tsx`

- [ ] **Step 1: Write RED tests**

Cover admin-only route guards, 403 contributor state, review actions and confirmation, asset retry/preview, member status, Space/Collection mutations, audit pagination, and action pending/error states.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/frontend-admin-pages.test.tsx`

Expected: FAIL because admin page modules do not exist.

- [ ] **Step 3: Implement pages**

Reuse the same API adapter and shadcn primitives. Use Dialog for destructive/review actions. Do not duplicate authorization logic beyond UI gating; the Worker remains authoritative.

- [ ] **Step 4: Run GREEN and existing admin Worker tests**

Run: `rtk npx vitest run test/unit/frontend-admin-pages.test.tsx test/worker/m1-api.test.ts test/worker/m2-assets.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add frontend/pages/admin frontend/components/admin test/unit/frontend-admin-pages.test.tsx
rtk git commit -m "feat: migrate administrator pages"
```

### Task 10: Add accessibility, responsive, and i18n gates

**Files:**
- Modify: `frontend/components/**`, `frontend/pages/**`, `frontend/styles/globals.css`
- Create: `test/unit/frontend-a11y.test.tsx`, `test/unit/frontend-responsive.test.tsx`
- Modify: `public/locales/en.js`, `public/locales/zh-CN.js` only for new keys

- [ ] **Step 1: Write RED gates**

Test keyboard-only flows, focus-visible, accessible names, Dialog/Sheet focus trap/restore, reduced-motion CSS, 320/768/1280 layout classes, exact locale key parity, and no visible `undefined`/`null`.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/frontend-a11y.test.tsx test/unit/frontend-responsive.test.tsx`

Expected: FAIL for any missing label, focus behavior, responsive class, or locale key.

- [ ] **Step 3: Implement fixes and locale entries**

All new copy must use `t(key, values)`. Keep placeholder sets exactly equal in both locale files.

- [ ] **Step 4: Run GREEN**

Run: `rtk npx vitest run test/unit/frontend-a11y.test.tsx test/unit/frontend-responsive.test.tsx && rtk npm run test:i18n && rtk npm run verify:i18n`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add frontend public/locales test/unit/frontend-a11y.test.tsx test/unit/frontend-responsive.test.tsx
rtk git commit -m "test: harden frontend accessibility and i18n"
```

### Task 11: Integrate the React bundle with Wrangler Assets

**Files:**
- Modify: `vite.config.ts`, `wrangler.jsonc`, `package.json`
- Create: `test/unit/frontend-assets-manifest.test.ts`
- Modify: `test/worker/app.test.ts` and static asset contract tests

- [ ] **Step 1: Write RED integration tests**

Assert the built index is served for `/`, known workspace deep links are served through the Worker-first fallback, unknown non-API routes remain 404, API routes still reach `src/app.ts`, and CSP/request-id headers remain present.

- [ ] **Step 2: Run RED**

Run: `rtk npx vitest run test/unit/frontend-assets-manifest.test.ts test/worker/app.test.ts`

Expected: FAIL because Wrangler still serves the old public entry.

- [ ] **Step 3: Switch the asset build output**

Build into an explicit static directory and update only the assets directory. Keep old assets in a rollback directory during the transition. Do not change API, D1, DO, AI, or R2 bindings.

- [ ] **Step 4: Run GREEN and dry-run build**

Run: `rtk npm run build:ui && rtk npx vitest run test/unit/frontend-assets-manifest.test.ts test/worker/app.test.ts && rtk npm run build`

Expected: PASS and the dry-run lists the same Worker bindings.

- [ ] **Step 5: Commit**

```bash
rtk git add vite.config.ts wrangler.jsonc package.json test/unit/frontend-assets-manifest.test.ts test/worker/app.test.ts
rtk git commit -m "build: serve React frontend through Worker assets"
```

### Task 12: Cut over, remove legacy UI, and release

**Files:**
- Delete only after all prior tasks pass: `public/app.js`, `public/workspace-ui.js`, `public/navigation.js`, old UI declarations/styles
- Modify: `README.md`, `ROADMAP.md`, `docs/product/shadcn-ui-frontend-checklist.md`
- Test: `test/unit/frontend-cutover.test.ts`, full existing test suites

- [ ] **Step 1: Write the cutover RED test**

Assert no legacy UI module is referenced by the new entry, all known routes render through the React bundle, and no old runtime script is required.

- [ ] **Step 2: Run RED before deletion**

Run: `rtk npx vitest run test/unit/frontend-cutover.test.ts`

Expected: FAIL while the new entry still depends on legacy modules.

- [ ] **Step 3: Remove only unused legacy files**

Confirm `rg` has no production references before deletion. Keep locale files and safe Markdown renderer if the React adapter still imports them.

- [ ] **Step 4: Run complete release gate**

Run:

```bash
rtk npm run build:ui
rtk npm run check
rtk git diff --check
rtk git status --porcelain=v1
```

Expected: all tests pass, dry-run bindings unchanged, and status is clean after commit.

- [ ] **Step 5: Update checklist and commit**

```bash
rtk git add frontend public package.json package-lock.json vite.config.ts wrangler.jsonc README.md ROADMAP.md docs/product/shadcn-ui-frontend-checklist.md test
rtk git commit -m "feat: complete shadcn frontend migration"
```

## Verification Summary

After each task, run its focused test. Before FE-011, FE-018, FE-038, FE-074 and FE-078, run `rtk npm run check`. Do not run remote D1 migrations, production deploys, R2 scans, or production smoke as part of this plan; those require a separate explicit approval after the local gate is green.
