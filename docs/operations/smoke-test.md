# Remote smoke verification

This runbook verifies a deployed Memory Garden API. It is not a substitute for local checks: first run `rtk npm run check`, which verifies generated types, TypeScript, unit tests, workerd integration tests, and a Wrangler dry build only. Local fixtures and workerd do not prove remote Durable Object persistence, Workers AI provider behavior, custom-domain routing, or production maturity.

Only run this after an authorized deployment. The chat check consumes Workers AI quota, so confirm the Cloudflare account plan and current usage first. This repository cannot enforce zero billing, set account budgets, or guarantee that Cloudflare free-tier policies will not change.

## Safe invocation

Use an interactive secret input. Do not put the token in a command argument, `.dev.vars`, `wrangler.jsonc`, shell history, CI logs, or an exported terminal transcript.

```bash
read -s MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
rtk npm run smoke
unset MEMORY_GARDEN_TOKEN MEMORY_GARDEN_BASE_URL
```

The script accepts only `MEMORY_GARDEN_TOKEN` for authentication. It prints each step's name, HTTP status, request ID, and elapsed time; it never prints the token, request headers, note content, or complete Agent answer.

## Expected evidence

The command exits zero only if all of these checks pass:

- unauthenticated `GET /api/health` returns `401`;
- authenticated `GET /api/health` returns `{ "ok": true }`;
- authenticated `POST /api/notes` creates a note with `201`;
- authenticated list and search responses include that note; and
- authenticated chat returns a non-empty answer and includes the created note in `sources`.

Every run creates one identifiable `smoke-<uuid>` note. It is intentional that the script does not delete data: Phase 0 exposes no deletion API, and Phase 3 will add deletion and cleanup through the recovery-bin workflow. Record the command output (without secrets), deployment version, domain, date, and any request IDs in the release evidence.

Run the smoke separately for the workers.dev URL and the custom domain. A passing run is a point-in-time remote API and Provider signal, not proof of later Durable Object activation/restart recovery or the long-term stability of the preview Computer dependency.
