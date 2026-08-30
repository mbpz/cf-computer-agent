# Workbench Collaboration Design

## Objective

Turn the personal workbench into a coherent collaboration surface by fixing shared pagination localization and shell navigation, then completing tasks, boards, notifications, and contextual discussions without exceeding Cloudflare free-service constraints.

This design does not introduce general-purpose direct messages. Discussions belong to a task or knowledge item, and every read or mutation is authorized from that context.

## Product model

Tasks are the operational source of truth. Boards are projections of tasks rather than a second task store. Discussions add context to tasks or knowledge items. Notifications are user-owned delivery records generated from meaningful task and discussion events.

The primary journey is:

1. A user creates or updates a task.
2. The task appears in the task list and the appropriate board column.
3. Authorized participants discuss the task or a knowledge item in its contextual thread.
4. Status changes, mentions, replies, assignments, and due-date conditions create notifications for affected users.
5. A notification deep-links back to the task, knowledge item, or discussion.

## Scope

### Shared pagination localization

- `DataPagination` is the only workbench list-pagination summary/control surface.
- It receives locale-derived labels for total rows, visible range, rows per page, previous page, next page, pagination navigation, and numbered-page accessible names.
- English and Simplified Chinese catalogs have exact key and placeholder parity.
- Empty collections render a localized equivalent of `Total 0 · Visible 0–0`; no English pagination copy may leak into the Chinese UI.
- All paginated pages use server-reported `page`, `pageSize`, `total`, and `totalPages`; malformed metadata continues to fail closed through the existing numbered-page parser.
- Page-size changes reset to page 1 and preserve the existing URL/history contract.

### Shell and navigation

- The desktop top-right area contains language selection only.
- The desktop sidebar footer contains member identity, role, settings, theme controls, logout state, and logout error feedback.
- The mobile navigation exposes the same account actions and state; account actions must not exist only in a desktop-only footer.
- The `Cloudflare free tier` footer copy and its locale keys are removed.
- The navigation list scrolls independently above a non-scrolling account footer. The main content remains independently scrollable and compact.
- Tasks, Boards, Notifications, and Messages are first-level workspace entries in deterministic order.
- Settings appears in the account footer and is not duplicated in the primary workspace navigation.
- A stale server navigation tree must not suppress required product entries. Server visibility may hide admin-configurable optional entries, but required collaboration entries are merged from the canonical route registry subject to capability checks.

### Tasks

- Preserve the existing member-scoped task repository, service, D1 API, complete numbered pagination, idempotent creation, filters, details, status, progress, tags, links, and deletion behavior.
- Add only contracts or small corrections needed for navigation, board projection, notifications, and discussions.
- Every task query and mutation remains scoped by authenticated `member_id`; task IDs alone never grant access.

### Boards

- `/boards` becomes a ready route and uses the task service as its sole data source.
- Columns are `pending`, `in_progress`, `blocked`, and `completed`, matching canonical task statuses.
- Board filters share task query semantics. Each column has bounded server-side pagination or cursor-like incremental loading built on the existing numbered-page contract; the UI must not load an unbounded task set.
- Moving a task between columns calls the existing idempotent status mutation. Optimistic UI must roll back on failure and ignore stale responses.
- Board access and task visibility are identical to task-list access and visibility.

### Notifications

- `/notifications` becomes a ready route backed by D1.
- Notifications are recipient-owned records with stable IDs, event type, actor reference where permitted, target kind/ID, localized presentation payload, read timestamp, creation timestamp, and deduplication key.
- Supported initial events are task status change, task assignment or participation change where available, contextual mention, contextual reply, and due/overdue observation.
- Event creation is idempotent using a unique recipient/event deduplication key. Replaying a mutation cannot create duplicate notifications.
- APIs support server-side numbered pagination, type/read filters, unread summary count, mark-one-read, and mark-visible-or-filtered-read with bounded mutation scope.
- Users can read or mutate only their own notification records. Deep links are emitted only when the recipient remains authorized to read the target.
- Due reminders use request-triggered lazy materialization and an optional scheduled compensation path; scheduled execution is not required for correctness.

### Contextual discussions

- `/messages` becomes a ready route showing discussion threads associated with authorized tasks or knowledge items.
- A thread has exactly one context: task or knowledge item. General direct messages and context-free rooms are out of scope.
- Thread membership/visibility derives from target authorization and explicit participants where the target model supports them. The service rechecks target authorization on every list, read, and write.
- Messages have stable IDs, thread-local monotonic sequence, author, body, optional reply target, creation time, and client idempotency key.
- Sending is idempotent per author and client key. D1 uniqueness and transactional writes preserve one message and stable ordering under retries.
- APIs provide thread-list pagination and message pagination. Message history uses stable ordering and must not skip or duplicate rows when concurrent sends occur.
- Mentions resolve only to eligible workspace members. Unauthorized identities are neither disclosed nor notified.
- Editing, deletion, attachments, reactions, general DMs, WebSockets, and presence are deferred.

## Data model

Add one forward-only D1 migration containing narrowly indexed tables:

- `discussion_threads`: context kind/ID, creator, timestamps, uniqueness on context.
- `discussion_participants`: thread/member relationship and last-read sequence where needed.
- `discussion_messages`: thread sequence, author, body, reply target, client key, timestamps; unique `(thread_id, sequence)` and `(author_member_id, client_key)`.
- `notifications`: recipient, event type, target, payload, deduplication key, read/created timestamps; unique `(recipient_member_id, deduplication_key)`.

Do not duplicate tasks for boards. Add task indexes only if query-plan tests prove a missing board access path.

All identifiers are generated or validated server-side. Foreign-key assumptions must match D1 behavior and existing migration conventions. Payload sizes, message body size, page size, and batch read limits are bounded and tested.

## API and idempotency

- Reuse the existing same-origin authenticated API envelope, request ID, error normalization, pagination parser, and member principal.
- Mutations that can be retried accept a bounded client idempotency key and enforce uniqueness in D1.
- Notification creation occurs in the same logical service operation as the source event. If atomic cross-record behavior cannot be expressed in one D1 batch, retries converge through deduplication.
- List endpoints use deterministic tie-break ordering and return canonical pagination metadata.
- Invalid pages, page sizes, filters, IDs, context kinds, message bodies, and idempotency keys fail closed with existing error conventions.

## Cloudflare free-service constraints

- Required runtime services are Workers, D1, static assets, and existing authentication/AI bindings.
- KV, R2, Queues, Durable Objects, Workflows, and paid scheduling are not required for collaboration correctness.
- No long-lived Worker process, WebSocket, polling loop, or per-user scheduled job is introduced.
- Queries are indexed and bounded. Notification and discussion retention remain explicit future operations rather than an unbounded read path.
- Before production release, current Cloudflare limits must be rechecked and recorded; local implementation evidence does not claim free-tier production acceptance.

## UX and accessibility

- Continue the existing shadcn-style primitives, spacing, colors, loading/error/empty states, and responsive shell.
- Boards support keyboard-operable status changes; drag-and-drop, if added, is an enhancement and never the only interaction.
- Notification unread state is conveyed by text/semantics, not color alone.
- Discussion composer has labels, bounded validation, pending state, duplicate-submit prevention, and recoverable errors.
- All new visible and accessible copy is catalog-backed with English and Simplified Chinese parity.

## Atomic delivery order

1. Shared pagination i18n contract and migration of every caller.
2. Desktop/mobile shell account footer, free-tier copy removal, and required-entry merge.
3. Task entry and existing task maturity audit/fixes.
4. Board projection and status workflow.
5. Notification storage, events, APIs, and inbox.
6. Contextual discussion storage, authorization, APIs, and UI.
7. Cross-feature deep links, unread state, documentation reconciliation, and full acceptance gate.

Each stage must be independently testable and committed. New behavior follows RED → GREEN → refactor. Documentation status changes only after the matching implementation and verification evidence exists.

## Acceptance criteria

- Chinese pages contain no English pagination summary or controls; English pages use the English catalog.
- Desktop and mobile expose identity, settings, theme, and logout from the navigation account area; the old top-right account menu and free-tier label are absent.
- Tasks, Boards, Notifications, and Messages have visible first-level entries for authorized signed-in users.
- No collaboration route is marked ready until its real API and UI states are implemented.
- Two authenticated users cannot read or mutate each other's tasks, board items, notifications, threads, or messages without explicit target authorization.
- Retried task status, notification generation, message send, and read mutations converge without duplicates or conflicting state.
- All collaboration lists use bounded server-side pagination and deterministic ordering.
- Roadmap, delivery ledger, AI checklist, frontend checklist, route registry, menu seed data, and runtime behavior agree.
- The complete project check, focused Worker/API tests, UI contract tests, i18n verification, migration/query-plan tests, and production build/dry-run pass.
- Push, deployment, remote migration, production requests, and browser acceptance remain separately authorized actions.
