# Local maintenance coordination harness

This is an independently configured, synthetic-only test harness for the
modules in `src/maintenance`. Its local worker connects the real app's guarded
HTTP/Cron entry to a local coordinator. It does not load production Wrangler
configuration, change the production legacy entry, or export an HTTP control
endpoint (the HTTP adapter is a later R05 step).

```sh
rtk proxy npm run test:ops:maintenance
rtk proxy npm exec tsc -- --project tools/maintenance/tsconfig.json
```

The existing installed Workerd supports compatibility date `2026-08-08`; this
harness pins that date without upgrading dependencies or production settings.
Its bindings include a local SQLite coordinator, synthetic D1 databases and R2,
local Knowledge/AgentSession Durable Objects, and a public synthetic control
token used only in tests. Runtime
RPC-denial tests print expected error logs; the test process must still exit 0
with no Vitest unhandled-error summary. RPC thenables are normalized through an
async helper before rejection assertions.

## Protocol and trust boundary

- One coordinator instance represents one *configured* database boundary. The
  module does not discover or enforce a real binding-to-instance mapping.
- `acquire(id)` durably registers a unique permit before a handler may run.
  Closing admission and recording permits use synchronous SQL transactions.
  Reused IDs cannot acquire again, even after completion or a new epoch.
- `beginDrain(window, epoch, capability)` closes admission. `DRAINED` means only that this
  coordinator has zero registered active permits. It never means global
  production `FROZEN` or a consistent multi-storage backup.
- Exact completion retries are safe. `resume(window, epoch, capability)` requires matching window/epoch
  and no active work; it increments epoch. Only the latest matching resume may
  be retried while still open. Older control calls cannot reopen a newer window.
- Internal `status`, `acquire` and `complete` RPC clients remain trusted callers.
  Both mutation RPCs independently authenticate a dedicated capability on every
  attempt, before parameter validation or control transactions, including retries.
  The configured value is held in a JavaScript private field; no RPC secret getter
  is exposed. Missing/malformed configuration rejects controls without disabling
  business admission. Permit IDs and epochs are not authentication credentials
  or database-enforced fencing tokens. Fleet/external-writer fencing remains
  unimplemented. Synthetic new-configuration-instance tests are not evidence of
  live production token rotation. Never use the public test token in production.
- Completed IDs remain as replay tombstones. At 10,000 total records admission
  fails closed. There is no cleanup/TTL, automatic recovery, or production
  capacity claim. Sizing and safe compaction are blockers before deployment.

## Work lifetime contract

`guardFetch(client, background, handler)` acquires before invoking `handler`.
The host must register the supplied completion promise with its execution
context before services/authentication can run. `guardScheduled` waits for the
root and registered descendants. Neither adapter is wired into `src/index.ts`.

Handlers must await work or register **every** descendant with
`scope.waitUntil(promise)` / `scope.run(factory)`. A pending descendant may
register more descendants after the root returns. Once sealed, `run` rejects
without invoking its factory. Prefer `run` for deferred producers: `waitUntil`
cannot undo side effects of an already-created promise after scope closure.
Bare timers, fire-and-forget callbacks, direct original-context `waitUntil`,
Agent DO callbacks and external writers are not automatically intercepted.

Response bodies stay tracked until EOF. Stream producers that can outlive EOF
must also register their work. Cancellation, stream errors, rejected work or
timeouts latch uncertainty; the durable permit remains active even if other
work later finishes. WebSocket responses are unsupported and fail closed.
Runtime termination and lost admission replies can leave orphan permits.
There is deliberately no forced-release or expiry path.

Completion transport failure is reported as unconfirmed. If the server actually
completed the permit before its reply was lost, server-side `DRAINED` can be
truthful while the client reports uncertainty; this never reopens admission.
Malformed admission replies cannot invoke handlers. None of these results
authorize backup, migration, deployment or production resume.

See `docs/operations/evidence/2026-09-19-maintenance-coordinator.md` for evidence
and the maintenance design for the remaining integration and production gates.
