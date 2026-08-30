# Memory Garden Agent

Memory Garden is a private personal workbench for a small invited team on Cloudflare's free tier. The AI knowledge base is its first major module: submit and govern sources, search and read them, then ask grounded questions with citations. The workbench adds personal execution and administration without turning local verification into a production claim.

## Current maturity

- User-isolated tasks are implemented and locally verified; the task UI remains **partial** while detail, retention, and production role journeys are completed.
- Unified numbered pagination, independent scrolling, the compact shadcn Shell, and administrator governance are implemented and locally verified.
- Boards, notifications, and messages are **Coming Soon**. They are planned as task- and knowledge-context features, not as existing collaboration services.
- **Current-main release and acceptance are determined only by the [delivery status ledger](./docs/product/delivery-status-ledger.md).** A README statement, local gate, historical candidate, or anonymous smoke does not establish a current production release or signed browser acceptance.

The ledger records implementation, verification, release, and acceptance separately for every product atom. The [Roadmap](./ROADMAP.md) gives the delivery order; the specialist checklists give local implementation detail:

- [AI knowledge-base checklist](./docs/product/ai-knowledge-base-checklist.md)
- [shadcn/ui frontend checklist](./docs/product/shadcn-ui-frontend-checklist.md)
- [Production environment handbook](./docs/operations/production-environment-handbook.md)
- [Current evidence index](./docs/operations/evidence/)

## Product and architecture

```text
Browser UI → GitHub OAuth → Worker API → D1 control plane
                                      └─ personal Durable Object
                                         ├─ source and note storage
                                         ├─ search index
                                         └─ grounded answer with citations
```

The knowledge-base core supports text, Markdown, and code submissions; controlled review and publication; owner-scoped lists; FTS search; reader/citation retrieval; and grounded answers. The workbench provides the shell, navigation, settings, tasks, and admin areas for members, roles, menus, spaces, audit, and analytics.

GitHub OAuth provides a primary, verified identity; `ALLOWED_MEMBER_EMAILS` authorizes login before any D1 member lookup. D1 then governs the member record, hashed session, role, active/disabled status, and capability. Automation requires both an HMAC signature and `APP_TOKEN`; it is limited to compatible legacy smoke routes and never acts as an administrator.

`@cloudflare/computer` remains Preview, so it is kept behind storage boundaries rather than treated as a production-stability guarantee.

## Local development and verification

```bash
npm install
rtk npm run verify:delivery-status
rtk npm run test:smoke
rtk npm run check
rtk npm run dev
```

`rtk npm run check` is the full local gate: contracts, smoke, unit and Workerd tests, generated types, TypeScript, and a Wrangler dry build. It is evidence for local verification only. Use the [production environment handbook](./docs/operations/production-environment-handbook.md) for configuration, migration, deployment, rollback, and recorded release evidence.

Do not place `GITHUB_OAUTH_CLIENT_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `ALLOWED_MEMBER_EMAILS`, `AUTOMATION_SECRET`, or `APP_TOKEN` in the repository, `wrangler.jsonc`, `.dev.vars`, command lines, logs, screenshots, or chat. Keep production values as Worker secrets.

## Deployment and operations

Deploy only through the handbook's ordered preflight: verify the exact commit, run the current local gate, back up D1, inspect and apply approved forward-only migrations, upload the exact Worker/assets version, and capture scoped release and role-journey acceptance evidence. Do not use a README command as a substitute for that procedure, and do not expose a workers.dev or preview URL as the formal entrypoint.

Remote automation smoke is an authorized post-deploy check, not browser acceptance. It uses interactive credentials, protects headers and payloads, and is limited to health, legacy notes/search, and cited-answer compatibility routes. See the [smoke-test procedure](./docs/operations/smoke-test.md).

## API boundary

- Session and member scope: `GET /api/session`, `GET /api/spaces`, `POST /api/submissions`, `GET /api/submissions/mine`
- Knowledge: `GET /api/knowledge`, `GET /api/knowledge/search`, `GET /api/knowledge/:id`, `GET /api/knowledge/citations/:id`, `POST /api/knowledge/chat`
- Tasks: `/api/tasks*` for active members with `tasks:use`; member isolation, idempotent writes, and numbered pagination.
- Administration: `/api/admin/*` for active administrators only
- Legacy automation compatibility: `GET /api/health`, `GET`/`POST /api/notes`, `GET /api/search`, `POST /api/chat`

Browser clients never hold the automation token or OAuth client secret. Member and object visibility are rechecked server-side; write paths use idempotency and redacted audit metadata where the ledgered feature requires them.

## Free-tier boundary and degradation

The free text core works without paid storage: text, Markdown, and code use the Worker, D1, Durable Object, and FTS path. R2, Vectorize, Queue, and Workers AI are optional enhancements; when unavailable, they degrade safely and do not block the free text core. Binary originals require the configured storage path and otherwise fail explicitly rather than creating partial data.

Free tier is an account policy, not a perpetual-price guarantee. The deployer must review Cloudflare plan limits, usage, and budget protections before production changes. Capacity protection, recovery drills, and full production acceptance remain governed by the [Roadmap](./ROADMAP.md) and the [delivery status ledger](./docs/product/delivery-status-ledger.md).
