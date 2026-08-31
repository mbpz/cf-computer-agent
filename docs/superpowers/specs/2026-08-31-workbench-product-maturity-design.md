# Workbench Product Maturity Design

Date: 2026-08-31

## Purpose

This design turns the current personal workbench from a set of locally executable pages into a coherent, mature product. Phase one owns every capability currently visible in the UI or navigation. Optional WeChat OAuth, Vectorize hybrid retrieval, and other non-core enhancements remain outside phase one unless they are required to keep a visible journey functional.

The visual and interaction reference is the Ecommerce dashboard at `https://shadcnuidashboard.com/ecommerce`. The project has no license to that paid template, so implementation may reproduce its information density and interaction patterns but must not copy its source code or protected assets. The component foundation is official MIT-licensed shadcn/ui, supplemented by open-source dashboard primitives where justified.

## Completion standard

A capability is product-complete only when all nine dimensions are satisfied:

1. A discoverable entry exists and is permission-correct.
2. The primary user goal completes end to end.
3. The page uses a real API and durable data rather than display-only fixtures.
4. Private data is isolated to the authenticated member.
5. Lists support server pagination, filtering, sorting, and URL restoration where applicable.
6. Mutations protect against retries, duplicate submissions, and conflicting updates.
7. Loading, empty, error, retry, ready, and pending states are deliberate.
8. Keyboard, focus, touch, localization, and responsive behavior are usable from 320px upward.
9. Local verification, production release, and signed-browser acceptance are recorded independently.

`ready` means a locally executable vertical slice, not production acceptance. A menu item, route, table, or test alone cannot establish product completion.

## Design read

Reading this as a production redesign of a personal productivity workbench for frequent daily use, with a mature ecommerce-admin visual language and a shadcn/ui component foundation.

- `DESIGN_VARIANCE: 4`
- `MOTION_INTENSITY: 3`
- `VISUAL_DENSITY: 7`

The design-taste rules govern hierarchy, consistency, state completeness, accessibility, and avoidance of generic template output. That skill explicitly does not define dashboard data-table behavior, so data-heavy interactions follow shadcn/ui, TanStack Table, and the reference dashboard's established admin patterns.

## Component architecture

The frontend has three component layers:

### UI primitives

`frontend/components/ui/` owns official shadcn/ui-derived primitives. Components are installed with the official CLI, reviewed, and then owned by this repository. Existing simplified components are replaced only after compatibility and regression coverage exists.

Required primitives are:

- Button, Input, Textarea, Label, Checkbox, RadioGroup, and Switch.
- Dialog, AlertDialog, Sheet, and Drawer.
- DropdownMenu, ContextMenu, Popover, Tooltip, and HoverCard.
- Command, Combobox, and Select.
- Calendar, DatePicker, and DateRangePicker.
- Table, Tabs, Accordion, and Collapsible.
- Toast/Sonner, Alert, Badge, Progress, and Skeleton.
- Breadcrumb, Separator, and ScrollArea.
- Avatar, Form, Field, and Pagination.

The project keeps `@phosphor-icons/react` as its single icon family.

### Workbench patterns

`frontend/components/patterns/` owns reusable product patterns:

- `PageHeader`: breadcrumb, title, description, primary and secondary actions.
- `DataTable`: server sorting, filters, column visibility, selection, and numbered pagination.
- `FilterBar`: search, select, combobox, date range, and reset.
- `StatCard`: metric, trend, supporting copy, loading, and error state.
- `ChartCard`: title, range, legend, empty data, and error state.
- `EntitySheet`: view, edit, save, dirty-state confirmation.
- `EntityForm`: validation, field errors, pending state, and dirty state.
- `ConfirmAction`: destructive-action explanation and confirmation.
- `AsyncBoundary`: skeleton, empty, error, retry, forbidden, and not-found states.
- `StatusBadge`: shared semantic presentation for task, parse, review, and notification states.
- `ActivityTimeline`: audit events, task activity, and knowledge changes.
- `CommandPalette`: permission-scoped page, entity, and action search.
- `NotificationCenter`: unread summary and recent notifications.
- `ResponsiveToolbar`: complete desktop actions and mobile Sheet/Dropdown projection.

### Feature components

`frontend/features/` owns knowledge, tasks, boards, notifications, messages, administration, and settings components. Feature components compose primitives and patterns. They must not create another local implementation of menus, dialogs, tables, forms, pagination, or async states.

## Shared interaction contract

Every interactive primitive and pattern must define controlled versus uncontrolled ownership, outside-pointer dismissal, Escape behavior, route-change dismissal where applicable, focus restoration, keyboard traversal, ARIA state, pending behavior, localized copy, reduced-motion behavior, and listener/request cleanup.

Transient success feedback uses Toast. Validation and actionable errors remain adjacent to the affected control. Skeletons match the final content shape. Touch targets remain at least approximately 40px. Tests cover 320, 375, 768, and 1280px using real browser journeys for layout-sensitive behavior.

## Visual system

- Use a compact fixed sidebar and global top bar.
- Place breadcrumb, title, description, primary action, and filters consistently.
- Use a maximum content width around 1440px.
- Use the spacing sequence 4, 8, 12, 16, 24, and 32px.
- Cards use a consistent 10–12px radius; controls use approximately 8px.
- Use cool neutral surfaces with one blue accent in light and dark themes.
- Use elevation only where it communicates hierarchy; use grouping and separators elsewhere.
- Motion is limited to hierarchy changes, drag feedback, save results, and error feedback.
- Dashboard pages mix metrics, trends, rankings, and activity rather than repeating equal cards.

## Information architecture and product loops

### Global workbench

The sidebar contains knowledge, submission, search, Agent, personal submissions, and administration. The top bar contains the permission-scoped Command Palette, tasks, boards, notifications, messages, language, and account controls. The home dashboard summarizes today's tasks, knowledge activity, recent visits, unread notifications, trends, and quick actions.

### Knowledge loop

The authoritative journey is:

`submit → parse → review/publish → browse/read → search/Agent citation → revise/recover`

The loop includes drafts, upload progress, retry-safe submission, parse failures, preview, immutable revisions, diff, rollback, trash, recovery, final purge, favorites, private notes, recent visits, related knowledge, backlinks, saved views, Agent conversation history, strict citations, feedback, and failure recovery.

### Task and board loop

The authoritative journey is:

`create → enrich/link → execute → move on board → notify → discuss → complete/archive`

Tasks and boards use one task authority. Task detail includes editing, progress, tags, knowledge links, and activity. Board movement supports optimistic feedback, conditional updates, exact rollback, and keyboard operation. Deletion becomes retention-aware soft deletion with recovery and final purge. State changes generate idempotent notifications and audit events.

### Notification and discussion loop

Notifications are a work-event inbox, not a static feed. They support unread summary, type/read filters, bounded bulk read, numbered pagination, permission-safe target navigation, and revoked-target presentation. Messages remain contextual discussions attached to tasks or knowledge; phase one does not introduce general direct messaging. Threads support list/detail navigation, bounded pagination, reply, mention, retry, client idempotency, and stale-response protection. Top-bar counts and page state converge after mutations.

### Administration loop

Administration includes members, roles, menus, spaces/collections, review, assets, analytics, and audit. Member and role changes affect user-visible access. Menu changes affect server-owned navigation. Space/archive changes explain content impact. Review actions change publication state. Asset retries expose progress and failure. Analytics provides date range, trends, source/page rankings, and visitor detail. Audit supports filtering and entity navigation while redacting sensitive fields.

### Settings

Settings includes profile display, theme, language, active session behavior, and logout. Phase one does not create a preference center for values that have no real persistence boundary.

## Data ownership and authorization

Every private root table carries `member_id` or an explicit recipient/participant owner. Repositories inject the authenticated member into every private query and never trust a client-supplied member identifier. Secondary objects re-authorize their task, knowledge, notification target, or discussion context on every read and write.

Administrative permissions do not implicitly grant access to private member content. Member disablement, permission removal, target deletion, and visibility changes must invalidate entries, deep links, cached projections, notification targets, and discussion access consistently.

## Pagination and query contract

Formal lists use server-side numbered pagination with `page`, `pageSize`, filters, and sorting. Responses expose `items`, `page`, `pageSize`, `total`, and `pageCount`. `total` uses the same member and filter predicates as `items`. URL state stores page, filters, sorting, and selected entity where useful. Filter and mutation changes clamp invalid page numbers.

Cursor pagination is reserved for message content where chronological continuation is the product behavior. Management, knowledge, tasks, notifications, and other formal lists retain numbered pagination.

## Idempotency and concurrency

Create operations use stable client-generated idempotency keys. D1 unique constraints scope keys to the authenticated member and operation domain. Retries reuse the same key. Conditional writes include expected version or previous state. Optimistic UI records an operation-specific snapshot and rolls back only that failed operation.

Deleting an already absent private resource may converge to success only after the request is authenticated and scoped. Authorization failures never become idempotent success. A repeated logical task event produces one notification and one audit outcome.

## Error and recovery model

APIs return structured errors with `code`, `message`, `retryable`, and `requestId`. A local mutation failure preserves the last successful page. Loading, empty, stale, forbidden, not-found, and retryable failure are distinct states. Background work exposes status, latest bounded error, retry action, and terminal result. Audit records required metadata without private bodies, credentials, or complete request payloads.

## Cloudflare architecture and free-layer boundary

- Workers remain the HTTP/API and static-asset entry.
- D1 stores relational product state, pagination indexes, idempotency records, notifications, discussions, and audit metadata.
- Durable Objects remain limited to Agent sessions and operations that require sequential consistency; ordinary CRUD stays in D1 services.
- R2 or the existing file capability stores original files and attachments; D1 remains the metadata and authorization authority.
- Workers AI and Vectorize are optional enhancements. Core browse/search behavior must degrade to FTS5 and remain functional when paid or remote AI capabilities are disabled.
- The project does not add a standalone server, paid external database, Redis, or paid SaaS queue.
- Before adding a Cloudflare product or binding, implementation rechecks current official free-tier availability and limits. Optional capabilities must fail closed or degrade without breaking the core loop.

## Delivery phases

### R0 — Current-state audit and authoritative ledger

Exercise every visible route, control, form, list, and detail entry. Classify each as usable, partial, unusable, pseudo-entry, or unreachable. Cross-check UI, API, DTO, repository, D1 migration, tests, release evidence, and signed acceptance. Downgrade unsupported `ready` or `done` claims. Produce the authoritative atomic checklist.

### R1 — Design system and global shell

Install and audit official primitives, establish tokens and density, complete sidebar/topbar/breadcrumb/Command Palette/account/language/theme/notification overlays, and establish a real-browser baseline.

### R2 — Shared data and form patterns

Build DataTable, FilterBar, numbered pagination, Form/Field, EntitySheet/Dialog, confirmation, async boundaries, date range, combobox, column visibility, and bulk selection. Migrate every current list to these patterns.

### R3 — Knowledge loop

Close submission, parsing, review, publication, browse, reader, revision diff/rollback, trash/recovery/purge, search, saved views, favorites, notes, recent visits, Agent conversations, citations, feedback, and retry journeys.

### R4 — Tasks and boards

Close task list/create/detail/edit, tags, progress, knowledge links, activity, board movement, concurrency rollback, keyboard operation, retention-aware deletion, recovery, purge, notifications, and discussion context.

### R5 — Notifications and messages

Close unread counts, filters, bulk read, target navigation, revoked targets, contextual threads, replies, mentions, retries, idempotent send, pagination, and top-bar/page convergence.

### R6 — Administration

Close dashboard analytics, review, assets, members, roles, menus, spaces, audit filtering, entity navigation, contributor rejection, and destructive-action confirmation.

### R7 — Cross-module coherence

Verify knowledge-to-task creation, task-to-knowledge links, one notification per event, contextual discussion, target navigation, permission revocation, cache invalidation, and permission-scoped Command Palette results.

### R8 — Delivery and acceptance

Run 320/375/768/1280 browser journeys, admin/contributor matrices, pagination/concurrency/idempotency/revocation/retry journeys, and Cloudflare free-layer configuration checks. D1 migration, Worker deployment, smoke, and signed-browser acceptance require their own authorization and evidence.

## Atomic checklist contract

Every implementation atom is an independently reviewable vertical slice. It records:

- User goal and observable outcome.
- Entry point and permission.
- API, DTO, repository, and migration boundaries.
- Member isolation and target authorization.
- Pagination/filter/sort or idempotency/concurrency behavior.
- Loading, empty, error, retry, ready, and pending states.
- Keyboard, touch, responsive, theme, and localization behavior.
- A failing test, minimal implementation, passing focused tests, and full gate.
- Separate implementation, verification, release, and acceptance status.

Checklist notation is:

- `[ ]`: not implemented.
- `[-]`: implementation exists but verification, release, or acceptance is incomplete.
- `[x]`: local implementation and verification are complete.

Release and acceptance remain separate columns. A checked frontend atom cannot promote backend, migration, production, or signed-browser status.

## Acceptance criteria

- Every visible navigation entry maps to a complete or explicitly unavailable product journey.
- No visible control is decorative when it implies an action.
- Every formal list uses the shared server pagination contract and mature DataTable pattern.
- Every private API proves authenticated-member isolation and secondary target authorization.
- Every create or retryable mutation has an explicit idempotency strategy.
- Every page has complete async and error states.
- Cross-module events converge without duplicate notification, message, or audit records.
- The UI follows the approved reference density and interaction language without copying paid template source or assets.
- Local checks, deployment, and signed-browser acceptance are never conflated.
