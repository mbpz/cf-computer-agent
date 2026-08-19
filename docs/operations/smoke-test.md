# Signed automation smoke verification

Use this runbook only after an explicitly authorized GitHub OAuth deployment. It is not a substitute for `rtk npm run check`: local tests do not prove GitHub login, remote D1 state, custom-domain routing, Durable Object recovery, or Workers AI provider behavior.

The smoke is an **automation** check, not a browser session check. Each request requires `AUTOMATION_CLIENT_ID`, `AUTOMATION_SECRET`, and `APP_TOKEN`; the client signs the exact method, path/query, timestamp, nonce, and body. It only uses the automation-authorized legacy paths: health, notes, search, and chat. It deliberately makes no `/api/admin/*`, session, member, space, submission, collection, or audit request.

Do not add credentials to command arguments, `wrangler.jsonc`, `.dev.vars`, CI logs, shell history, or exported terminal transcripts. Enter each one interactively and erase the shell variables afterwards.

Provision these settings only through the one-version bulk workflow in [github-oauth-setup.md](./github-oauth-setup.md). Never use `wrangler secret put`: it can deploy a partially configured version before the signed smoke is ready.

## Authorized remote command

```bash
read -rs AUTOMATION_CLIENT_ID
export AUTOMATION_CLIENT_ID
read -rs AUTOMATION_SECRET
export AUTOMATION_SECRET
read -rs APP_TOKEN
export APP_TOKEN
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
rtk npm run smoke
unset AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN MEMORY_GARDEN_BASE_URL
```

Remote URLs must use HTTPS. `MEMORY_GARDEN_ALLOW_HTTP_LOCAL=true` is solely for an opted-in local contract mock on `localhost`, `127.0.0.0/8`, or `::1`; it cannot enable general HTTP and must never be used for a deployed host. The script fails before opening a connection if any required setting is absent. It prints only a step name, HTTP status, request ID, and elapsed time; it never prints credentials, request headers, note content, or the complete Agent answer.

## Expected evidence

The command exits zero only if signed automation can perform all of these legacy-path checks:

- `GET /api/health` returns `{ "ok": true }`;
- `POST /api/notes` creates a note with `201`;
- `GET /api/notes` and `GET /api/search` include that note; and
- `POST /api/chat` has a non-empty answer and returns the created note in `sources`.

Every run creates one identifiable `smoke-<uuid>` note. It remains because Phase 1 exposes no deletion API; Phase 3's recovery-bin workflow will provide cleanup. Record redacted output, Worker version, custom domain, date, and request IDs in release evidence. Do not use a workers.dev URL: `wrangler.jsonc` sets both `workers_dev` and `preview_urls` to `false`; confirm the deployed account preserves that setting during the authorized rollout.
