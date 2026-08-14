# Production Release Runbook Design

## Goal

Create one authoritative, copyable production release checklist for Memory Garden that covers authorized remote D1 migration, Access-first Worker deployment, browser verification, automation smoke, evidence capture, and safe rollback without executing any remote operation while authoring the document.

## Document structure

`docs/operations/production-release.md` becomes the release entry point. It contains six ordered gates:

1. Cloudflare Access and GitHub prerequisites.
2. Local verification and release evidence preparation.
3. Authorized remote D1 migration and read-only schema/seed verification.
4. Interactive Worker secret setup and authorized deployment.
5. Browser role and authorization verification.
6. Signed Access Service Token plus APP_TOKEN production smoke.

Each gate states its prerequisites, copyable commands, expected evidence, and a stop condition. A failed gate stops the rollout; later commands must not be run speculatively.

## Safety boundaries

- Access must protect `memory.crgmhrc.asia` before the first Phase 1 deployment.
- Production and preview workers.dev URLs remain disabled and are never smoke targets.
- Remote commands are visually marked and require explicit authorization at execution time.
- Secrets are collected only through silent interactive input or `wrangler secret put`; no real value appears in command arguments, files, examples, logs, or transcripts.
- D1 migration is append-only. The runbook verifies all five tables and the deterministic `default` and `legacy-personal` Space seeds after migration.
- Deployment captures the current Worker version before changing production.
- Rollback changes only the Worker version. It never reverses D1 migrations, deletes D1 rows, changes `KnowledgeBase` migration `v1`, deletes Durable Object/VFS data, or disables Access.
- Production smoke calls only automation-authorized legacy routes and notes that it creates a persistent `smoke-<uuid>` note and consumes Workers AI quota.
- Remote evidence remains explicitly unverified until an operator records the command result, version ID, request IDs, date, and custom domain.

## Documentation relationships

- `production-release.md` owns the end-to-end order and command sequence.
- `access-setup.md` remains the detailed GitHub IdP and Access policy guide.
- `smoke-test.md` remains the credential-safe smoke behavior reference.
- `rollback.md` remains the detailed compatibility and recovery guide.
- `README.md` links to the production release entry point instead of duplicating deploy commands.

Existing static smoke documentation tests will be extended to ensure the entry point remains Access-first, contains the D1 migration before deployment, never targets workers.dev, and links the three specialist runbooks.

## Acceptance criteria

- A new operator can follow one file from preflight through evidence capture without inferring command order.
- Every remote mutation has an explicit authorization warning and a preceding verification gate.
- Commands use the existing package scripts and the configured database name; no second D1 database is created.
- Secret-safe commands are copyable without embedding credentials.
- Local documentation/contract tests and the full repository check pass.
- No remote D1 migration, secret write, deployment, Access configuration, or production smoke occurs while implementing this documentation.
