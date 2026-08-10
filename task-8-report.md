# Task 8 report: remote smoke verification and operations runbooks

## Delivered

- Added `scripts/smoke.mjs`, which reads the deployment URL from `MEMORY_GARDEN_BASE_URL` and the only supported authentication secret from `MEMORY_GARDEN_TOKEN`. Remote targets require HTTPS; HTTP requires the explicit `MEMORY_GARDEN_ALLOW_HTTP_LOCAL=true` opt-in and a loopback-only hostname/IP.
- The smoke verifies unauthenticated and authenticated health, note creation, listing, search, and chat. It creates one `smoke-<uuid>` note, then requires the chat response to contain a non-empty answer and the created source.
- Script output is limited to step name, status, request ID, and elapsed time. It never prints request headers, the token, note content, or the full Agent answer. Failures retain the relevant request ID when a response was received.
- Added smoke and rollback runbooks with interactive secret input, both-domain verification, pre-deployment version capture, and rollback/health re-check steps. The rollback guide explicitly preserves Durable Object data and requires schema/migration compatibility because a Worker rollback cannot reverse Durable Object migrations or data.
- Updated README and Phase 0 roadmap evidence to distinguish local verification from remote/provider evidence, preserve the remote completion gaps, and state that smoke may consume Workers AI quota and cannot guarantee zero billing.

## Local validation

Passed:

- `rtk node --check scripts/smoke.mjs`
- `rtk node --test scripts/smoke.test.mjs`: a red test established that unguarded HTTP reached the network; after the fix, it verifies HTTP rejection without opt-in and an opted-in loopback mock completing all six checks while redacting its token and note content.
- Missing-environment execution: exited 1 with only `[fail] configuration status=invalid request_id=missing elapsed_ms=0`.
- `rtk npm run check`: generated types, TypeScript, 38 unit tests, 19 workerd tests, and Wrangler dry build passed.
- `rtk git diff --check`

The workerd suite emits its intentional malformed-journal diagnostic and Wrangler emits the existing Workers AI binding quota warning; neither is a Task 8 failure.

## Remaining boundary

No deployment or remote smoke request was made. Remote evidence still requires separately authorized smoke runs against both the workers.dev and custom domains, followed by an independent later-activation Durable Object persistence check. The smoke-created note is intentionally retained because Phase 0 has no deletion API.
