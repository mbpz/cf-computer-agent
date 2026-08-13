# Access service-token smoke verification

Use this runbook only after an authorized Access-first deployment. It is not a substitute for `rtk npm run check`: local tests and workerd do not prove GitHub login, Access policy evaluation, remote D1 state, custom-domain routing, Durable Object recovery, or Workers AI provider behavior.

The smoke is an **automation** check. Cloudflare Access must evaluate the Service Auth policy before the request reaches the Worker, and the Worker then validates `APP_TOKEN`. Therefore every request sends all three credentials and only uses the automation-authorized Phase 0 compatibility paths: health, notes, search, and chat. It deliberately makes no `/api/admin/*`, session, member, space, submission, collection, or audit request. A browser-session check is a separate Access validation in [access-setup.md](./access-setup.md).

Do not add credentials to command arguments, `wrangler.jsonc`, `.dev.vars`, CI logs, shell history, or exported terminal transcripts. Enter each one interactively and erase the shell variables afterwards.

```bash
read -rs MEMORY_GARDEN_ACCESS_CLIENT_ID
export MEMORY_GARDEN_ACCESS_CLIENT_ID
read -rs MEMORY_GARDEN_ACCESS_CLIENT_SECRET
export MEMORY_GARDEN_ACCESS_CLIENT_SECRET
read -rs MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
rtk npm run smoke
unset MEMORY_GARDEN_ACCESS_CLIENT_ID MEMORY_GARDEN_ACCESS_CLIENT_SECRET MEMORY_GARDEN_TOKEN MEMORY_GARDEN_BASE_URL
```

Remote URLs must use HTTPS. `MEMORY_GARDEN_ALLOW_HTTP_LOCAL=true` is solely for an opted-in local contract mock on `localhost`, `127.0.0.0/8`, or `::1`; it cannot enable general HTTP and must never be used for a deployed host. The script fails before opening a connection if any of the base URL, Access client ID, Access client secret, or APP token is absent. It prints only a step name, HTTP status, request ID, and elapsed time; it never prints credentials, request headers, note content, or the complete Agent answer.

## Expected evidence

The command exits zero only if an Access Service Token plus APP token can perform all of these legacy-path checks:

- `GET /api/health` returns `{ "ok": true }`;
- `POST /api/notes` creates a note with `201`;
- `GET /api/notes` and `GET /api/search` include that note; and
- `POST /api/chat` has a non-empty answer and returns the created note in `sources`.

Every run creates one identifiable `smoke-<uuid>` note. It remains because Phase 1 exposes no deletion API; Phase 3's recovery-bin workflow will provide cleanup. Record redacted output, Worker version, custom domain, date, and request IDs in release evidence.

Do not use a workers.dev URL: `wrangler.jsonc` sets `workers_dev` and `preview_urls` to `false`. Confirm that both production and preview workers.dev URLs are disabled in the Cloudflare dashboard after the authorized deployment. This repository’s local configuration test cannot prove the remote deployment or dashboard state.
