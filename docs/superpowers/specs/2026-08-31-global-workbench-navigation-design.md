# Global Workbench Navigation and Overlay Design

**Date:** 2026-08-31
**Status:** Approved in conversation; awaiting written-spec review

## Goal

Make the workbench collaboration surfaces globally reachable and reliable while simplifying account controls and giving every popover consistent dismissal behavior.

## Scope

This change covers four connected behaviors:

1. The sidebar footer displays only the signed-in member summary until activated.
2. Every dismissible shell overlay follows one shared interaction contract.
3. Tasks, Boards, Notifications, and Messages are globally visible in the top bar.
4. Notifications and Messages complete a tested click-to-usable journey instead of merely exposing ready route markers.

It does not change the collaboration domain model, D1 migrations, per-user isolation rules, authentication provider, deployment configuration, or Cloudflare service choices.

## Information Architecture

### Sidebar

Tasks, Boards, Notifications, and Messages are removed from the primary sidebar tree to avoid duplicate first-level navigation. Knowledge and administrative navigation remain in the scrollable sidebar.

The fixed sidebar footer shows one compact member trigger:

- avatar initials;
- member email, truncated safely;
- member role on expanded desktop layouts;
- accessible member label on collapsed layouts.

The footer does not display settings, theme controls, or logout until the member trigger is opened.

### Global top-bar collaboration navigation

The top bar exposes four permission-filtered quick links in this order:

1. Tasks
2. Boards
3. Notifications
4. Messages

Each link uses the existing shared route capability and permission guard. A route that the current member cannot access is omitted rather than rendered as an actionable link. The current route is visually and semantically selected. Message thread routes select Messages; child task/board/notification routes select their corresponding parent where applicable.

On desktop, quick links use icon plus localized text and sit before the language trigger. On narrow layouts they remain reachable in a compact top-bar row with accessible labels; they must not disappear into the account menu or require opening the mobile sidebar.

The top bar stays globally present across all authenticated pages. Horizontal compression must not force the main content wider than the viewport.

## Shared Overlay Contract

The existing details-based dropdown implementation is replaced by one controlled menu primitive used by language and account menus.

Only one shell menu may be open at a time. A menu closes when:

- the user clicks or taps outside the trigger and content;
- the user presses Escape;
- focus moves outside through a completed interaction;
- the user selects an enabled menu item;
- another shell menu opens;
- the workspace location changes.

Closing with Escape restores focus to the trigger. Opening focuses the first enabled menu item when keyboard-initiated. Arrow keys, Home, End, Enter, and Space retain the existing menu keyboard semantics. Disabled items remain non-actionable.

Outside-pointer handling is registered only while a menu is open and is removed on close/unmount. The implementation must not monkey-patch document-wide browser APIs or create one listener per closed menu. Portals are not required because the shell already owns the relevant stacking context.

The primitive exposes controlled `open` and `onOpenChange` behavior while allowing an uncontrolled default for isolated consumers. Shell-level coordination owns the active menu ID so opening Language closes Account and vice versa.

## Account Menu

The account menu contains:

- member email and role as non-actionable context;
- Settings navigation;
- Light, Dark, and System theme choices with current-state indication;
- Logout, including pending and failure states.

Theme selection applies immediately, persists through the existing theme storage boundary, and closes the menu after selection. Settings navigation and successful logout close the menu through the shared location/action contract. A failed logout keeps an accessible error associated with the account menu and permits retry.

Expanded and collapsed desktop sidebars use the same account menu component and behavior. Mobile navigation reuses the same compact member trigger and menu content rather than permanently expanding account actions at the bottom of the navigation sheet.

## Notification and Message Usability

Route readiness alone is not sufficient. Both surfaces require a complete authenticated journey:

### Notifications

- The global quick link opens `/notifications` and direct refresh returns the SPA.
- Loading, empty, error, retry, filtered, paginated, and read-mutation states render usable localized UI.
- Member-only API requests retain recipient isolation and nondisclosing target projection.
- A permission-revoked target remains a readable notification history item without an actionable target link.
- Quick-link re-entry resets the route to its canonical unfiltered first page and synchronizes URL, request, and rendered state.

### Messages

- The global quick link opens `/messages`; an authorized context entry opens or creates its task/knowledge thread.
- Loading, empty, error, retry, list pagination, thread history, send, reply, mention, and uncertain-send retry states remain usable.
- There is no general direct-message recipient picker.
- Thread and target authorization is rechecked on every service operation, with nondisclosing failures.
- Direct refresh for `/messages` and valid `/messages/:threadId` returns the SPA.
- Quick-link re-entry resets list pagination/context query state without allowing stale requests or composers to overwrite the new route.

Diagnosis begins with journey tests that reproduce the current unusable behavior. Production code changes are driven by those failures; no speculative backend redesign is authorized.

## Component Boundaries

### Shared menu primitive

`frontend/components/ui/dropdown-menu.tsx` owns focus, keyboard operation, outside dismissal, and controlled/uncontrolled state. It has no knowledge of locale, accounts, or routing.

### Shell overlays

`frontend/components/shell/app-shell.tsx` owns the active shell menu ID, account trigger/content, language trigger/content, top-bar collaboration links, and sidebar de-duplication. It consumes route access helpers rather than reproducing permission logic.

### Route journeys

`frontend/app.tsx` and existing Notifications/Messages route models continue to own data fetching, mutation convergence, URL synchronization, cancellation, and page state. The shell only navigates to canonical paths.

### Shared route metadata

`shared/workspace-route-capabilities.ts` remains the source of route readiness and labels. If a top-bar metadata projection is needed, it is derived from this registry and existing access checks rather than maintained as a second route list.

## Error Handling

- Overlay event handlers must tolerate detached triggers and unmounted content without throwing.
- Logout failure is presented in the account menu and does not impersonate a signed-out state.
- Notifications and Messages preserve explicit loading/error/empty distinctions.
- Authentication, authorization, malformed DTO, and network errors remain distinguishable at their existing boundaries.
- Unknown routes and API paths must not be converted into SPA success responses.

## Accessibility

- Triggers expose `aria-expanded`, `aria-haspopup="menu"`, and an accessible name.
- Menu content uses `role="menu"`; actionable children use `role="menuitem"`.
- Focus return, Escape dismissal, outside-click dismissal, arrow navigation, Home/End, and disabled behavior receive automated coverage.
- Active quick links use `aria-current="page"`.
- Every icon has hidden decoration or an explicit accessible label.
- The compact mobile layout preserves a minimum practical touch target and keyboard reachability.

## Test Strategy

Implementation follows red-green-refactor cycles in four independently reviewed tasks:

1. Shared overlay behavior: outside pointer, Escape/focus return, one-open-at-a-time coordination, item selection, and route-change dismissal.
2. Account footer: collapsed/expanded/mobile parity, settings/theme/logout states, and removal of permanently visible controls.
3. Global quick links: permission filtering, active states, sidebar de-duplication, desktop/mobile reachability, and canonical re-entry.
4. Notifications/Messages journeys: reproduce current failure, direct SPA routes, API/UI state transitions, mutation/send convergence, and stale-request protection.

Each task runs focused unit tests before the complete unit and Worker suites. Final acceptance requires TypeScript, i18n contracts, WCAG contracts, delivery-status contracts, UI build, Wrangler dry-run, `git diff --check`, and the complete `npm run check` on the exact final tree.

## Delivery Boundaries

Local implementation and verification do not imply deployment. Merge, push, Cloudflare deployment, remote D1 migration, production smoke, and signed browser acceptance require separate evidence. This design introduces no new migration and no new paid Cloudflare dependency.
