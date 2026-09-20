import { applyD1Migrations, createExecutionContext, reset, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from './env';
import { localEnvironment } from './resources';
import { createWorkerEntry } from '../../src/worker-entry';
import { SessionService } from '../../src/identity/session';
import { MembersRepository } from '../../src/members/repository';
import { MIGRATIONS } from '../../test/fixtures/d1';

const ORIGIN = 'https://memory.crgmhrc.asia';
const incoming = (url: string, init?: RequestInit) => new Request(url, init) as Request<unknown, IncomingRequestCfProperties<unknown>>;
const gate = () => env.MAINTENANCE.getByName(crypto.randomUUID());

async function seedMember() {
  await applyD1Migrations(env.SYNTHETIC_DB, MIGRATIONS);
  await env.SYNTHETIC_DB.prepare(`INSERT INTO members
    (id, access_sub, email, role, status, created_at, updated_at)
    VALUES ('stream-member', 'github:stream', 'stream@example.test', 'contributor', 'active', ?, ?)`)
    .bind('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z').run();
}

async function createAgentSession(worker: ReturnType<typeof createWorkerEntry>, token: string) {
  const context = createExecutionContext();
  const response = await worker.fetch(incoming(`${ORIGIN}/api/agent/sessions`, {
    method: 'POST', headers: { cookie: `__Host-memory-session=${token}`, origin: ORIGIN },
  }), localEnvironment(env), context);
  const body = await response.json() as { session: { id: string } };
  await waitOnExecutionContext(context);
  return body.session.id;
}

describe('guarded agent stream lifecycle', () => {
  beforeEach(async () => { await reset(); });

  it('keeps the maintenance permit uncertain when a consumer cancels before EOF', async () => {
    await seedMember();
    const members = new MembersRepository(env.SYNTHETIC_DB);
    const session = await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
      .create((await members.findById('stream-member'))!);
    const encoder = new TextEncoder();
    const ai = {
      async run(): Promise<ReadableStream> {
        return new ReadableStream({
          start(controller) { controller.enqueue(encoder.encode('data: {"response":"partial"}\n\n')); },
        });
      },
    };
    const g = gate();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g, dependencies: { ai: ai as unknown as Ai } });
    const sessionId = await createAgentSession(worker, session.token);

    const streamContext = createExecutionContext();
    const response = await worker.fetch(incoming(`${ORIGIN}/api/agent/sessions/${sessionId}/stream`, {
      method: 'POST',
      headers: { cookie: `__Host-memory-session=${session.token}`, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'hold this stream' }),
    }), localEnvironment(env), streamContext);
    const reader = response.body!.getReader();
    await expect(reader.read()).resolves.toMatchObject({ done: false });
    await reader.cancel('client disconnected');
    await waitOnExecutionContext(streamContext);

    // The cancellation chain completed, but the producer's final turn termination
    // is still an uncertain write and therefore cannot release the permit.
    expect(await g.status()).toMatchObject({ phase: 'OPEN', active: 1 });
  });

  it('holds a permit while a client never consumes an open stream', async () => {
    await seedMember();
    const members = new MembersRepository(env.SYNTHETIC_DB);
    const session = await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
      .create((await members.findById('stream-member'))!);
    const ai = { async run(): Promise<ReadableStream> { return new ReadableStream(); } };
    const g = gate();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g, dependencies: { ai: ai as unknown as Ai } });
    const sessionId = await createAgentSession(worker, session.token);
    const context = createExecutionContext();
    const response = await worker.fetch(incoming(`${ORIGIN}/api/agent/sessions/${sessionId}/stream`, {
      method: 'POST',
      headers: { cookie: `__Host-memory-session=${session.token}`, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'do not consume' }),
    }), localEnvironment(env), context);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(await g.status()).toMatchObject({ phase: 'OPEN', active: 1 });
    await response.body!.getReader().cancel('test cleanup');
    await waitOnExecutionContext(context);
  });

  it('retains uncertainty when the upstream stream errors before EOF', async () => {
    await seedMember();
    const members = new MembersRepository(env.SYNTHETIC_DB);
    const session = await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
      .create((await members.findById('stream-member'))!);
    const ai = {
      async run(): Promise<ReadableStream> {
        return new ReadableStream({ start(controller) { controller.error(new Error('synthetic upstream error')); } });
      },
    };
    const g = gate();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g, dependencies: { ai: ai as unknown as Ai } });
    const sessionId = await createAgentSession(worker, session.token);
    const context = createExecutionContext();
    const response = await worker.fetch(incoming(`${ORIGIN}/api/agent/sessions/${sessionId}/stream`, {
      method: 'POST',
      headers: { cookie: `__Host-memory-session=${session.token}`, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'fail this stream' }),
    }), localEnvironment(env), context);
    await expect(response.arrayBuffer()).rejects.toThrow();
    await waitOnExecutionContext(context);
    expect(await g.status()).toMatchObject({ phase: 'OPEN', active: 1 });
  });

  it('releases a permit only after a normal EOF and Durable Object completion', async () => {
    await seedMember();
    const members = new MembersRepository(env.SYNTHETIC_DB);
    const session = await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
      .create((await members.findById('stream-member'))!);
    const encoder = new TextEncoder();
    const ai = {
      async run(): Promise<ReadableStream> {
        return new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode('data: {"response":"complete"}\n\n'));
          controller.close();
        } });
      },
    };
    const g = gate();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g, dependencies: { ai: ai as unknown as Ai } });
    const sessionId = await createAgentSession(worker, session.token);
    const context = createExecutionContext();
    const response = await worker.fetch(incoming(`${ORIGIN}/api/agent/sessions/${sessionId}/stream`, {
      method: 'POST',
      headers: { cookie: `__Host-memory-session=${session.token}`, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'complete this stream' }),
    }), localEnvironment(env), context);
    await expect(response.text()).resolves.toContain('complete');
    await waitOnExecutionContext(context);
    expect(await g.status()).toMatchObject({ phase: 'OPEN', active: 0 });
  });

  it('keeps a permit when reader cancellation itself fails', async () => {
    await seedMember();
    const members = new MembersRepository(env.SYNTHETIC_DB);
    const session = await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
      .create((await members.findById('stream-member'))!);
    const encoder = new TextEncoder(); let cancelCalled = false;
    const ai = {
      async run(): Promise<ReadableStream> {
        return new ReadableStream({
          start(controller) { controller.enqueue(encoder.encode('data: {"response":"partial"}\n\n')); },
          cancel() { cancelCalled = true; throw new Error('synthetic reader cancel failure'); },
        });
      },
    };
    const g = gate();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g, dependencies: { ai: ai as unknown as Ai } });
    const sessionId = await createAgentSession(worker, session.token);
    const context = createExecutionContext();
    const response = await worker.fetch(incoming(`${ORIGIN}/api/agent/sessions/${sessionId}/stream`, {
      method: 'POST',
      headers: { cookie: `__Host-memory-session=${session.token}`, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'cancel failure' }),
    }), localEnvironment(env), context);
    const reader = response.body!.getReader();
    await reader.read();
    await expect(reader.cancel('synthetic failure')).rejects.toThrow('synthetic reader cancel failure');
    await waitOnExecutionContext(context);
    expect(cancelCalled).toBe(true);
    expect(await g.status()).toMatchObject({ phase: 'OPEN', active: 1 });
  });
});
