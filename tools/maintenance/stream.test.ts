import { applyD1Migrations, createExecutionContext, reset, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../../src/identity/session';
import { MembersRepository } from '../../src/members/repository';
import { createWorkerEntry } from '../../src/worker-entry';
import { MIGRATIONS } from '../../test/fixtures/d1';
import { env } from './env';
import { localEnvironment } from './resources';

const ORIGIN = 'https://memory.crgmhrc.asia';
const MEMBER = 'stream-member';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
async function fixture(finalize: 'completeTurn' | 'terminateTurn', failure?: Error) {
  await env.SYNTHETIC_DB.prepare(`INSERT INTO members
    (id, access_sub, email, role, status, created_at, updated_at)
    VALUES (?, 'github:stream', 'stream@example.test', 'contributor', 'active', ?, ?)`)
    .bind(MEMBER, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z').run();
  const members = new MembersRepository(env.SYNTHETIC_DB);
  const { token } = await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
    .create((await members.findById(MEMBER))!);
  const id = env.AGENT_SESSIONS.newUniqueId();
  const stub = env.AGENT_SESSIONS.get(id);
  await stub.create({ sessionId: id.toString(), memberId: MEMBER, now: '2026-09-21T00:00:00.000Z' });
  const entered = deferred(); const gate = deferred(); const settled = deferred();
  // Only the selected RPC boundary is delayed/faulted. Authentication, route,
  // producer, coordinator and persisted AgentSession all use real local code.
  const wrappedStub = Object.create(stub, { [finalize]: { value: async (...args: string[]) => {
    entered.resolve();
    try {
      await gate.promise;
      if (failure) throw failure;
      return finalize === 'completeTurn'
        ? await stub.completeTurn(args[0]!, args[1]!, args[2]!)
        : await stub.terminateTurn(args[0]!, args[1]!);
    } finally { settled.resolve(); }
  } } });
  const appEnv = localEnvironment(env);
  Object.defineProperty(appEnv, 'AGENT_SESSIONS', { value: Object.create(env.AGENT_SESSIONS, {
    get: { value: () => wrappedStub },
    idFromString: { value: (value: string) => env.AGENT_SESSIONS.idFromString(value) },
  }) });
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  const source = new ReadableStream<Uint8Array>({ start(controller) { upstream = controller; } });
  const ai: Ai = Object.create(appEnv.AI, { run: { value: async () => source } });
  const g = env.MAINTENANCE.getByName(crypto.randomUUID());
  const ctx = createExecutionContext();
  let registered = () => [] as Promise<unknown>[];
  const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g,
    dependencies: { ai, get analyticsNow() {
      // A call-through observer: the real scope registers and settles tasks.
      const observer = vi.spyOn(this.workScope!, 'run');
      registered = () => observer.mock.results.filter(result => result.type === 'return').map(result => result.value);
      return () => new Date('2026-09-21T00:00:00.000Z');
    } } });
  const response = await worker.fetch(new Request(`${ORIGIN}/api/agent/sessions/${id}/stream`, {
    method: 'POST', headers: { cookie: `__Host-memory-session=${token}`, origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Synthetic stream question' }),
  }) as Request<unknown, IncomingRequestCfProperties<unknown>>, appEnv, ctx);
  const turnId = response.headers.get('x-agent-turn-id')!;
  let finished = false;
  const completion = waitOnExecutionContext(ctx).then(() => { finished = true; });
  return { response, upstream, g, entered, gate, settled, completion, get finished() { return finished; },
    registered: () => registered(),
    turn: () => stub.getTurn(MEMBER, turnId), messages: () => stub.listMessages(MEMBER, {}) };
}

describe('real Agent stream producer completion', () => {
  beforeEach(async () => { await reset(); await applyD1Migrations(env.SYNTHETIC_DB, MIGRATIONS); });

  it.each(['completeTurn', 'terminateTurn'] as const)(
    'keeps the producer registered after consumer cancellation while %s is pending', async finalize => {
      const f = await fixture(finalize);
      const reader = f.response.body!.getReader();
      try {
        expect(f.response.status).toBe(200);
        f.upstream.enqueue(new TextEncoder().encode('data: {"response":"synthetic answer"}\n\n'));
        await reader.read();
        if (finalize === 'completeTurn') { f.upstream.close(); await f.entered.promise; }
        await reader.cancel('synthetic disconnect');
        await f.entered.promise;
        expect(await f.g.beginDrain(`stream-${finalize}`, 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
        expect(await f.turn()).toMatchObject({ ok: true, value: { status: 'active' } });
        expect(f.finished).toBe(false);
      } finally {
        f.gate.resolve();
        await f.settled.promise;
        await f.completion;
      }
      expect(await f.turn()).toMatchObject({ ok: true, value: { status: finalize === 'completeTurn' ? 'completed' : 'terminated' } });
      expect(await f.g.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
    },
  );

  it.each([true, false])('waits for final persistence and response EOF (consume immediately: %s)', async consume => {
    const f = await fixture('completeTurn');
    let bodyFinished = false;
    let body: Promise<string> | undefined;
    try {
      f.upstream.enqueue(new TextEncoder().encode('data: {"response":"synthetic answer"}\n\n'));
      f.upstream.close();
      if (consume) body = f.response.text().then(text => { bodyFinished = true; return text; });
      await f.entered.promise;
      expect(await f.g.beginDrain('stream-eof', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
      expect(await f.turn()).toMatchObject({ ok: true, value: { status: 'active' } });
      expect(f.finished).toBe(false);
      expect(bodyFinished).toBe(false);
      f.gate.resolve(); await f.settled.promise;
      expect(await f.turn()).toMatchObject({ ok: true, value: { status: 'completed' } });
      if (!consume) {
        expect(await f.g.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
        expect(f.finished).toBe(false);
        body = f.response.text();
      }
      expect(await body).toContain('synthetic answer');
    } finally {
      f.gate.resolve();
      if (!body) body = f.response.text();
      await body;
      await f.completion;
    }
    expect(await f.messages()).toMatchObject({ ok: true, value: { items: [
      { role: 'assistant', content: 'synthetic answer' }, { role: 'user', content: 'Synthetic stream question' },
    ] } });
    expect(await f.g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it.each(['completeTurn', 'terminateTurn'] as const)('retains the original %s rejection before stream error notification', async finalize => {
    const failure = new Error(`synthetic ${finalize} failure`);
    const f = await fixture(finalize, failure);
    const reader = f.response.body!.getReader();
    let terminal: Promise<unknown> | undefined;
    try {
      f.upstream.enqueue(new TextEncoder().encode('data: {"response":"synthetic answer"}\n\n'));
      await reader.read();
      if (finalize === 'completeTurn') {
        f.upstream.close();
        terminal = reader.read().catch(error => error);
      } else terminal = reader.cancel('synthetic disconnect');
      await f.entered.promise;
      expect(await f.g.beginDrain('stream-failed-write', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
      expect(f.finished).toBe(false);
    } finally {
      f.gate.resolve();
      await f.settled.promise;
      await terminal;
      await f.completion;
    }
    if (finalize === 'completeTurn') expect(await terminal).toBe(failure);
    const tasks = await Promise.allSettled(f.registered());
    expect(tasks.some(task => task.status === 'rejected' && task.reason === failure)).toBe(true);
    expect(await f.turn()).toMatchObject({ ok: true, value: { status: 'active' } });
    expect(await f.g.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it('retains a raw upstream read failure with no assistant write', async () => {
    const f = await fixture('completeTurn');
    const failure = new Error('synthetic upstream failure');
    f.upstream.error(failure);
    await expect(f.response.text()).rejects.toBe(failure);
    await f.completion;
    expect((await Promise.allSettled(f.registered())).some(task => task.status === 'rejected' && task.reason === failure)).toBe(true);
    expect(await f.turn()).toMatchObject({ ok: true, value: { status: 'active' } });
    expect(await f.g.beginDrain('stream-read-failure', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
  });
});
