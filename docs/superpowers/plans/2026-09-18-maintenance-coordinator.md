# Local Maintenance Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement and test persistent admission/drain coordination and tracked request/background/stream lifetimes using only synthetic local work.

**Architecture:** One SQLite Durable Object per database coordination boundary, synchronous transactional commands, no external I/O in transactions. A separate lifecycle adapter obtains a durable permit before invoking work and releases it only after root and registered descendants settle successfully. `DRAINED` means registered local work reached zero, never global production `FROZEN`.

**Tech Stack:** Existing TypeScript, Cloudflare Workers test runtime, SQLite-backed Durable Objects, Vitest. No new packages.

**Spec:** `docs/operations/d1-backup-maintenance-design.md`, local phase approved by user “确认” on 2026-09-18.

## Global Constraints

- No production entry/config/binding changes, remote queries, export, deployment, commit or push.
- Continue the existing `codex/admin-audit-recovery` linked worktree; preserve unrelated edits.
- Unknown work, cancellation, failed completion and abandoned permits never expire into success.
- No public maintenance HTTP endpoint; test worker exports the class but returns 404 for HTTP.
- Unregistered asynchronous work is prohibited by the adapter contract, not magically intercepted. Real app integration and full writer audit remain separate.
- Local state is `OPEN → DRAINING → DRAINED → OPEN`; global `FROZEN/RESUMING`, operator authentication, fleet fencing, backups and external writers remain outside this phase.
- Completed permit records are retained for replay protection. A bounded 10,000-record safety ceiling refuses admission, not automatic eviction; production sizing/compaction must be designed before integration.

## Task 1: Durable admission and drain

**Files:** create `src/maintenance/coordinator.ts`, `src/maintenance/contracts.ts`, `tools/maintenance/worker.ts`, `tools/maintenance/vitest.config.ts`, `tools/maintenance/coordinator.test.ts`, `tools/maintenance/tsconfig.json`; modify `package.json` for a separate test script.

**Interfaces:** `Permit = { id: string; epoch: number }`; `Snapshot = { phase: 'OPEN'|'DRAINING'|'DRAINED'; epoch: number; window: string|null; active: number }`. RPC: `acquire(id): Permit|null`, `complete(permit): Snapshot`, `beginDrain(window, expectedEpoch): Snapshot`, `resume(window, expectedEpoch): Snapshot`, `status(): Snapshot`.

- [x] Write behavior tests for admission/close ordering, stale/duplicate controls, permit replay, wrong epochs, database isolation and restart preservation. Example:
  ```ts
  const permit = await gate.acquire('request-1');
  expect(await gate.beginDrain('backup-1', 0)).toMatchObject({ phase: 'DRAINING', active: 1 });
  expect(await gate.acquire('request-2')).toBeNull();
  expect(await gate.complete(permit!)).toMatchObject({ phase: 'DRAINED', active: 0 });
  ```
- [x] Run `rtk proxy npm run test:ops:maintenance`; establish red due to absent behavior.
- [x] Implement singleton control row and permit table in SQL. Wrap each command in `ctx.storage.transactionSync`; persist before replying. Validate bounded identifiers and safe integer epochs. Completion is idempotent only for the same recorded permit. Reused admission IDs fail rather than grant execution twice. Resume requires matching window/epoch and zero active permits; duplicate latest resume is a no-op, old controls never mutate a later window.
  ```ts
  return this.ctx.storage.transactionSync(() => {
    const state = this.status();
    if (state.phase !== 'OPEN') return null;
    // Unique INSERT; never grant a previously issued permit again.
    this.ctx.storage.sql.exec('INSERT INTO permits VALUES (?, ?, 0)', id, state.epoch);
    return { id, epoch: state.epoch };
  });
  ```
- [x] Run isolated suite and local TypeScript checks; self-review atomicity, retries and restart cases. Keep uncommitted.

## Task 2: Tracked work lifetime and failure closure

**Files:** create `src/maintenance/lifecycle.ts`, `tools/maintenance/lifecycle.test.ts`.

**Interfaces:** `MaintenanceClient` exposes acquire/complete; `WorkScope.waitUntil(promise): void`, `WorkScope.run(factory): Promise<T>`. `guardFetch(client, background, handler): Promise<Response>` and `guardScheduled(client, handler): Promise<boolean>` obtain unique permits before handler invocation. Background callback receives completion promise; HTTP denial is static 503. The root scope includes returned response-body consumption; cancel/error retains permit. Async producers must also be registered; body termination alone does not prove producer completion.

- [x] Write failing tests with real coordinator plus deferred synthetic writers: GET denial has no handler side effects; root response precedes child finish; a pending child may register a late child; unconsumed stream stays active; cancellation/rejection keeps permit; Cron remains tracked; acquire/completion transport failure never executes unadmitted work or drops an unacknowledged active permit.
  ```ts
  const response = await guardFetch(gate, p => background.push(p), async scope => {
    scope.waitUntil(late.promise.then(() => { writes += 1; }));
    return new Response(null);
  });
  expect(response.status).toBe(200);
  expect(await gate.beginDrain('backup-1', 0)).toMatchObject({ active: 1 });
  late.resolve();
  await Promise.all(background);
  expect(await gate.status()).toMatchObject({ phase: 'DRAINED', active: 0 });
  ```
- [x] Run red suite; implement synchronous pending registration, root hold, terminal seal and failure latch. Seal before sending completion; `run(factory)` refuses a closed scope before invoking factory. No timers, TTL or polling. Wait for nested registered promises. On unknown result retain durable permit.
- [x] Re-run green suite, test stream read/cancel/error and delayed child paths. Review wrappers against API and explicitly document unsafe untracked callbacks/ExecutionContext integration still pending.

## Task 3: Evidence and regression

**Files:** create `tools/maintenance/README.md`, `docs/operations/evidence/2026-09-19-maintenance-coordinator.md`; update spec, ROADMAP and delivery ledger without promoting release/acceptance. Implementation evidence uses the actual verification date, September 19.

- [x] Run `rtk proxy npm run test:ops:maintenance`, `rtk proxy npm run typecheck`, `rtk proxy npm exec tsc -- --project tools/maintenance/tsconfig.json`, backup-tool regression and delivery contracts. Run full existing `npm test` if feasible; report exact evidence, never infer unrun build/deploy results.
- [x] Document red/green evidence, local-only boundaries, retained orphan behavior, resource ceiling, protocol trust assumptions and remaining integration work.
- [x] Check `git diff --check`, review actual modified paths, preserve the existing worktree and all uncommitted changes. No branch integration actions.

## Self-review

All approved local requirements map to Tasks 1–2. The broader design's app-route audit, auth, fleet/external writer control and real maintenance proof are deliberately excluded and stay unchecked. This plan is executed inline under the user's confirmation; no delegation or additional permission gate is required for these local changes.
