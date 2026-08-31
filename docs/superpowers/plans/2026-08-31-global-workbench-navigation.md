# Global Workbench Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver globally available collaboration navigation, a compact account footer, consistent dismissible overlays, and usable Notifications/Messages journeys.

**Architecture:** Replace the details-based dropdown with a controlled/uncontrolled menu primitive, coordinate shell menus through one active-menu state, and derive top-bar collaboration links from the shared route registry plus the existing permission guard. Preserve route-owned fetching and mutation logic; diagnose Notifications/Messages through journey failures before making narrowly scoped fixes.

**Tech Stack:** React 19, TypeScript, shadcn-style local components, Phosphor icons, Vitest, Happy DOM, Cloudflare Workers static assets and D1-backed APIs.

**Spec:** `docs/superpowers/specs/2026-08-31-global-workbench-navigation-design.md`

## Global Constraints

- Tasks, Boards, Notifications, and Messages appear in the authenticated top bar and are removed from the primary sidebar.
- Route visibility always uses shared capability metadata and the existing permission guard.
- Only one shell menu may be open; outside pointer, Escape, item selection, another menu, and route changes close it.
- Notifications remain recipient-owned; Messages remain task/knowledge contextual with no general DMs.
- No D1 migration, paid Cloudflare dependency, production deployment, remote migration, or secrets operation is authorized.
- Every production behavior starts with a failing test and follows red-green-refactor.

---

### Task 1: Build the Shared Dismissible Menu Contract

**Files:**
- Modify: `frontend/components/ui/dropdown-menu.tsx`
- Modify: `frontend/lib/menu-keyboard.ts`
- Test: `test/unit/frontend-menu-keyboard.test.tsx`
- Test: `test/unit/frontend-a11y.test.tsx`

**Interfaces:**
- Produces: `DropdownMenu({ open?, defaultOpen?, onOpenChange?, menuId?, children })`
- Produces: trigger/content context that supplies `aria-expanded`, trigger focus restoration, item selection dismissal, and menu keyboard navigation
- Consumes: existing `menuKeyAction(key)` semantics

- [ ] **Step 1: Add a failing controlled-state and outside-dismissal test**

Render one controlled menu into Happy DOM and assert the trigger opens it, `pointerdown` outside invokes `onOpenChange(false)`, and a pointer event inside does not close it:

```tsx
function Harness() {
  const [open, setOpen] = useState(false);
  return <><DropdownMenu open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger>Language</DropdownMenuTrigger>
    <DropdownMenuContent><DropdownMenuItem>English</DropdownMenuItem></DropdownMenuContent>
  </DropdownMenu><button data-outside>Outside</button></>;
}
```

- [ ] **Step 2: Add failing keyboard/focus and item-selection tests**

Assert Escape closes and returns focus to the trigger; ArrowDown/Home/End move among enabled items; clicking an enabled item invokes its handler then closes; a disabled item neither invokes nor closes.

- [ ] **Step 3: Verify RED**

Run:

```bash
rtk npm run test:unit -- test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-a11y.test.tsx
```

Expected: failures because the existing details element has no controlled state or outside-pointer dismissal.

- [ ] **Step 4: Implement controlled/uncontrolled menu state**

Use a React context containing:

```ts
interface DropdownMenuContextValue {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  setOpen(next: boolean, reason: "trigger" | "outside" | "escape" | "selection"): void;
}
```

Register a document `pointerdown` listener only while open. Close only when the target belongs to neither trigger nor content. Preserve an uncontrolled `defaultOpen` path for standalone consumers.

- [ ] **Step 5: Implement semantic trigger/content/items**

Replace `<details>/<summary>` with a button-compatible trigger and conditionally rendered menu content. Set `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, and `role="menuitem"`. Keep disabled items out of keyboard traversal.

- [ ] **Step 6: Verify GREEN and regressions**

Run:

```bash
rtk npm run test:unit -- test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-a11y.test.tsx test/unit/workspace-shell.test.tsx
rtk npm run typecheck
rtk npm run test:i18n
rtk git diff --check
```

- [ ] **Step 7: Commit**

```bash
rtk git add frontend/components/ui/dropdown-menu.tsx frontend/lib/menu-keyboard.ts test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-a11y.test.tsx
rtk git commit -m "feat: standardize dismissible shell menus"
```

---

### Task 2: Consolidate the Sidebar Account Footer

**Files:**
- Modify: `frontend/components/shell/app-shell.tsx`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/unit/workspace-shell.test.tsx`
- Test: `test/unit/frontend-menu-keyboard.test.tsx`
- Test: `test/unit/frontend-a11y.test.tsx`
- Test: `scripts/frontend-app-contract.test.mjs`

**Interfaces:**
- Produces: one `AccountMenu` used by expanded, collapsed, and mobile shell layouts
- Consumes: Task 1 controlled `DropdownMenu`
- Consumes: existing `applyTheme`, `onNavigate`, `onLogout`, `logoutPending`, and `logoutError`

- [ ] **Step 1: Add failing shell-account structure tests**

Assert expanded desktop, collapsed desktop, and mobile render only a member trigger while closed. Permanently visible Settings, theme buttons, and Logout must be absent outside menu content.

- [ ] **Step 2: Add failing account-action tests**

Open the trigger and assert:

```ts
expect(menu.textContent).toContain("member@example.com");
expect(menu.querySelector('[data-account-settings]')).not.toBeNull();
expect(menu.querySelectorAll('[data-theme-option]')).toHaveLength(3);
expect(menu.querySelector('[data-account-logout]')).not.toBeNull();
```

Verify Settings navigates to `/settings`, each theme applies and persists, logout disables during pending, and failure renders `role="alert"` without removing the member session.

- [ ] **Step 3: Add failing shell-menu coordination tests**

Open Account, then Language, and assert Account closes. Change the workspace pathname and assert either menu closes. Verify outside click closes both menu types.

- [ ] **Step 4: Verify RED**

Run:

```bash
rtk npm run test:unit -- test/unit/workspace-shell.test.tsx test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-a11y.test.tsx
```

Expected: failures because expanded/mobile account actions are permanently visible and the shell has no active-menu coordination.

- [ ] **Step 5: Implement one account menu**

Introduce shell state:

```ts
type ShellMenuId = "account" | "language" | null;
const [activeMenu, setActiveMenu] = useState<ShellMenuId>(null);
```

Create a single `AccountMenu` component whose trigger variant changes by sidebar/mobile layout but whose content and action handlers are shared. On theme selection, apply/persist the theme and close Account. On Settings, close then navigate. On failed logout, retain retryable menu content and the accessible error.

- [ ] **Step 6: Close shell menus on route change**

Add:

```ts
useEffect(() => setActiveMenu(null), [pathname]);
```

Wire Account and Language as controlled menus so opening one sets its ID and closes the other.

- [ ] **Step 7: Verify GREEN and contracts**

Run:

```bash
rtk npm run test:unit -- test/unit/workspace-shell.test.tsx test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-logout.test.ts
rtk node --test scripts/frontend-app-contract.test.mjs scripts/wcag-contract.test.mjs
rtk npm run verify:i18n
rtk npm run typecheck
rtk git diff --check
```

- [ ] **Step 8: Commit**

```bash
rtk git add frontend/components/shell/app-shell.tsx frontend/lib/i18n.ts test/unit scripts/frontend-app-contract.test.mjs
rtk git commit -m "feat: consolidate account controls"
```

---

### Task 3: Add Permission-Aware Global Collaboration Links

**Files:**
- Modify: `frontend/components/shell/app-shell.tsx`
- Create: `frontend/components/shell/navigation-policy.ts`
- Modify: `frontend/lib/i18n.ts`
- Modify: `shared/workspace-route-capabilities.ts` only if a derived collaboration marker is required
- Test: `test/unit/frontend-menu-keyboard.test.tsx`
- Test: `test/unit/frontend-navigation-data.test.ts`
- Test: `test/unit/frontend-auth-boundary.test.ts`
- Test: `test/unit/workspace-shell.test.tsx`

**Interfaces:**
- Produces: `collaborationQuickLinks(session): Array<{ path; labelKey; icon; activePrefix }>`
- Consumes: shared route capability registry, `ROUTES`, `routeAccessAllowed`, and `SessionSnapshot`
- Preserves: server navigation merge for Knowledge/Admin while filtering collaboration routes from the sidebar projection

- [ ] **Step 1: Add failing permission and de-duplication tests**

For an authorized member, assert the top bar exposes exactly `/tasks`, `/boards`, `/notifications`, and `/messages` in that order and the sidebar exposes none of them. For a session missing a route permission, assert the corresponding quick link is absent.

- [ ] **Step 2: Add failing active-state and mobile reachability tests**

Assert `/messages/thread-1` marks Messages current, `/boards` marks Boards current, and all four links remain present at the shell level independent of the mobile navigation sheet state. Verify localized accessible names and minimum button/link classes.

- [ ] **Step 3: Add failing canonical re-entry tests**

From `/notifications?page=2&read=unread` and `/messages?page=2&cursor=cursor_2`, activate the corresponding top link and assert navigation uses the canonical base path without preserving stale query state.

- [ ] **Step 4: Verify RED**

Run:

```bash
rtk npm run test:unit -- test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-navigation-data.test.ts test/unit/frontend-auth-boundary.test.ts test/unit/workspace-shell.test.tsx
```

- [ ] **Step 5: Implement a derived collaboration projection**

Define the only allowed quick-link paths as a typed constant, then resolve each through shared route metadata and `routeAccessAllowed`:

```ts
const COLLABORATION_PATHS = ["/tasks", "/boards", "/notifications", "/messages"] as const;
```

Do not copy permission masks or readiness values. Filter these paths from `workspaceRoutes` before rendering the sidebar; do not mutate the server navigation response.

- [ ] **Step 6: Render the global top-bar links**

Place icon-plus-label links before Language. Use the shell's `onNavigate(path)` boundary, `aria-current="page"`, responsive truncation, and explicit active-prefix matching for message threads.

- [ ] **Step 7: Verify GREEN and navigation regressions**

Run:

```bash
rtk npm run test:unit -- test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-navigation-data.test.ts test/unit/frontend-auth-boundary.test.ts test/unit/workspace-shell.test.tsx test/unit/frontend-app-routes.test.ts
rtk npm run verify:i18n
rtk npm run typecheck
rtk git diff --check
```

- [ ] **Step 8: Commit**

```bash
rtk git add frontend/components/shell frontend/lib/i18n.ts shared/workspace-route-capabilities.ts test/unit
rtk git commit -m "feat: add global collaboration navigation"
```

---

### Task 4: Diagnose and Complete Notifications and Messages Journeys

**Files:**
- Modify: `frontend/app.tsx`
- Modify: `frontend/pages/notifications/notifications-page.tsx`
- Modify: `frontend/pages/messages/messages-page.tsx`
- Modify: `frontend/pages/messages/thread-page.tsx`
- Modify: `frontend/lib/notifications-data.ts`
- Modify: `frontend/lib/discussions-data.ts`
- Modify: `src/routes/notifications.ts`
- Modify: `src/routes/discussions.ts`
- Modify: `src/app.ts`
- Test: `test/unit/frontend-notifications-route.test.tsx`
- Test: `test/unit/frontend-notifications-page.test.tsx`
- Test: `test/unit/frontend-discussion-route.test.tsx`
- Test: `test/unit/frontend-messages-page.test.tsx`
- Test: `test/worker/notifications.test.ts`
- Test: `test/worker/discussions.test.ts`
- Test: `test/worker/app.test.ts`

**Interfaces:**
- Consumes: canonical global navigation from Task 3
- Preserves: notification recipient ownership, target-link redaction, discussion target authorization, stable pagination, idempotent mutations/sends, and stale-response guards
- Produces: tested click-to-usable and direct-refresh journeys for Notifications and Messages

- [ ] **Step 1: Reproduce the current unusable Notifications journey**

Mount the real `App` with an authenticated member and activate the global Notifications link. Record the first failing observable among route transition, API request, DTO parsing, error rendering, or direct SPA response. Add the narrowest failing assertion that names that symptom.

- [ ] **Step 2: Reproduce the current unusable Messages journey**

Mount the real `App`, activate Messages, then open an authorized task or knowledge context thread. Add failing assertions for the observed route/API/render failure. Include direct `/messages` and `/messages/thread-1` Worker GET coverage.

- [ ] **Step 3: Verify RED**

Run:

```bash
rtk npm run test:unit -- test/unit/frontend-notifications-route.test.tsx test/unit/frontend-discussion-route.test.tsx test/unit/frontend-notifications-page.test.tsx test/unit/frontend-messages-page.test.tsx
rtk npm run test:worker -- test/worker/notifications.test.ts test/worker/discussions.test.ts test/worker/app.test.ts
```

Expected: at least one test per reported unusable surface fails for the observed reason. If a journey is already green locally, inspect the deployed-response contract and add a failing parity assertion before changing production code.

- [ ] **Step 4: Implement the minimal Notifications fix**

Fix only the boundary proven by Step 1. Preserve strict DTO parsing, explicit loading/error/empty states, bounded pagination, member-only requests, read-mutation convergence, and revoked-target link redaction.

- [ ] **Step 5: Implement the minimal Messages fix**

Fix only the boundary proven by Step 2. Preserve context-only threads, current authorization checks, cursor pagination, composer semantic idempotency keys, reply/mention validation, route-switch isolation, and uncertain-send retry semantics.

- [ ] **Step 6: Add canonical re-entry and stale-request tests**

For both surfaces, begin on a non-default page/filter, activate the global quick link, and assert:

```ts
expect(window.location.pathname).toBe("/notifications");
expect(window.location.search).toBe("");
```

or `/messages`, then verify the next request and rendered state use defaults. Resolve the old request after navigation and assert it cannot overwrite the new state.

- [ ] **Step 7: Verify focused GREEN**

Run:

```bash
rtk npm run test:unit -- test/unit/frontend-notifications-route.test.tsx test/unit/frontend-notifications-page.test.tsx test/unit/frontend-discussion-route.test.tsx test/unit/frontend-messages-page.test.tsx test/unit/frontend-menu-keyboard.test.tsx test/unit/workspace-shell.test.tsx
rtk npm run test:worker -- test/worker/notifications.test.ts test/worker/discussions.test.ts test/worker/app.test.ts
rtk npm run verify:i18n
rtk npm run typecheck
rtk git diff --check
```

- [ ] **Step 8: Run final exact-tree acceptance**

Run:

```bash
rtk npm run check
rtk git diff --check
rtk git status --short --branch
```

Expected: all contracts, i18n checks, unit tests, Worker tests, UI build, secret scan, legacy audit, and Wrangler dry-run pass. Known fault-fixture logs and AI/chunk-size warnings are recorded separately from failures.

- [ ] **Step 9: Commit**

```bash
rtk git add frontend src test
rtk git commit -m "fix: complete collaboration navigation journeys"
```

---

## Final Review Gates

- Review each task for spec compliance and code quality before starting the next task.
- Re-run the original failure reproduction after every fix.
- Review the full branch against the design after Task 4.
- If final review changes tracked files, rerun `rtk npm run check` on the new exact tree.
- Merge, push, Cloudflare deployment, remote migration, production smoke, and signed browser acceptance remain separate user-authorized actions.
