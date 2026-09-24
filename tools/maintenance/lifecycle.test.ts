import { CONTROL_TOKEN } from './control-fixtures';
import { env } from './env';
import { describe, expect, it } from 'vitest';
import { guardFetch, guardScheduled, type WorkScope, type Completion } from '../../src/maintenance/lifecycle';
import type { MaintenanceClient } from '../../src/maintenance/contracts';

function gate() { return env.MAINTENANCE.getByName(crypto.randomUUID()); }
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function background() {
  const tasks: Promise<Completion>[] = [];
  return { tasks, register: (promise: Promise<Completion>) => { tasks.push(promise); } };
}

describe('tracked maintenance work', () => {
  it('denies a GET-like handler before services, auth or analytics can write', async () => {
    const g = gate(); const bg = background(); let writes = 0;
    await g.beginDrain('closed', 0, CONTROL_TOKEN);
    const response = await guardFetch(g, bg.register, async () => { writes++; return new Response(null); });
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(writes).toBe(0);
    expect(bg.tasks).toHaveLength(0);
    expect(await guardScheduled(g, async () => { writes++; })).toBe(false);
    expect(writes).toBe(0);
  });

  it('keeps a returned response active until registered background writes finish', async () => {
    const g = gate(); const bg = background(); const late = deferred(); let writes = 0;
    const response = await guardFetch(g, bg.register, async scope => {
      scope.waitUntil(late.promise.then(() => { writes++; }));
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(await g.beginDrain('drain', 0, CONTROL_TOKEN)).toMatchObject({ phase: 'DRAINING', active: 1 });
    late.resolve();
    expect(await Promise.all(bg.tasks)).toEqual([{ released: true }]);
    expect(writes).toBe(1);
    expect(await g.status()).toMatchObject({ phase: 'DRAINED', active: 0 });
  });

  it('tracks a late child registered by an existing child after root completion', async () => {
    const g = gate(); const bg = background(); const parent = deferred(); const child = deferred();
    const registered = deferred(); let writes = 0;
    await guardFetch(g, bg.register, async scope => {
      scope.waitUntil(parent.promise.then(() => {
        scope.waitUntil(child.promise.then(() => { writes++; }));
        registered.resolve();
      }));
      return new Response(null);
    });
    await g.beginDrain('drain', 0, CONTROL_TOKEN);
    parent.resolve(); await registered.promise;
    expect(await g.status()).toMatchObject({ active: 1 });
    child.resolve(); await Promise.all(bg.tasks);
    expect(writes).toBe(1);
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it('refuses a late factory after the scope is sealed before it can write', async () => {
    const g = gate(); const bg = background(); let saved!: WorkScope; let writes = 0;
    await guardFetch(g, bg.register, async scope => { saved = scope; return new Response(null); });
    await Promise.all(bg.tasks);
    await expect(saved.run(async () => { writes++; })).rejects.toThrow('SCOPE_CLOSED');
    expect(writes).toBe(0);
  });

  it('allows synchronous admission checks while the root is still open', async () => {
    const g = gate(); const bg = background(); let writes = 0;
    const response = await guardFetch(g, bg.register, async scope => {
      scope.assertOpen();
      writes++;
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(writes).toBe(1);
    expect(await Promise.all(bg.tasks)).toEqual([{ released: true }]);
  });

  it('fences synchronous work before the completion RPC returns', async () => {
    const g = gate(); const bg = background(); const completing = deferred(); const reply = deferred();
    let saved!: WorkScope; let writes = 0;
    const client: MaintenanceClient = {
      acquire: id => g.acquire(id),
      async complete(permit) {
        completing.resolve();
        await reply.promise;
        return g.complete(permit);
      },
    };
    await guardFetch(client, bg.register, async scope => { saved = scope; return new Response(null); });
    await completing.promise;
    try {
      expect(() => { saved.assertOpen(); writes++; }).toThrow('SCOPE_CLOSED');
      expect(writes).toBe(0);
      expect(await g.status()).toMatchObject({ active: 1 });
    } finally {
      reply.resolve();
      await Promise.all(bg.tasks);
    }
    expect(() => saved.assertOpen()).toThrow('SCOPE_CLOSED');
  });

  it('retains explicit uncertainty without changing a handled business response', async () => {
    const g = gate(); const bg = background(); let saved!: WorkScope;
    const response = await guardFetch(g, bg.register, async scope => {
      saved = scope;
      scope.markUncertain('D1_RESULT_INVALID');
      return new Response(null, { status: 409 });
    });
    expect(response.status).toBe(409);
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.beginDrain('explicit-uncertainty', 0, CONTROL_TOKEN)).toMatchObject({ active: 1, phase: 'DRAINING' });
    expect(() => saved.markUncertain('D1_RESULT_INVALID')).toThrow('SCOPE_CLOSED');
  });

  it('does not finish uncertain work until an already registered child settles', async () => {
    const g = gate(); const bg = background(); const child = deferred(); let finished = false; let writes = 0;
    const response = await guardFetch(g, bg.register, async scope => {
      scope.waitUntil(child.promise.then(() => { scope.assertOpen(); writes++; }));
      scope.markUncertain('APP_UNEXPECTED_ERROR');
      return new Response(null);
    });
    const completion = Promise.all(bg.tasks).then(result => { finished = true; return result; });
    try {
      expect(response.status).toBe(200);
      expect(await g.beginDrain('uncertain-child', 0, CONTROL_TOKEN)).toMatchObject({ active: 1, phase: 'DRAINING' });
      expect(finished).toBe(false);
    } finally {
      child.resolve();
      await completion;
    }
    expect(writes).toBe(1);
    expect(await completion).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it('tracks run factories and holds Cron until all descendants finish', async () => {
    const g = gate(); const child = deferred(); const started = deferred(); let writes = 0;
    const scheduled = guardScheduled(g, async scope => {
      void scope.run(async () => { started.resolve(); await child.promise; writes++; });
    });
    await started.promise;
    expect(await g.beginDrain('cron', 0, CONTROL_TOKEN)).toMatchObject({ phase: 'DRAINING', active: 1 });
    child.resolve();
    expect(await scheduled).toBe(true);
    expect(writes).toBe(1);
    expect(await g.status()).toMatchObject({ phase: 'DRAINED', active: 0 });
  });

  it('does not equate Response construction with stream completion', async () => {
    const g = gate(); const bg = background();
    const response = await guardFetch(g, bg.register, async () => new Response('streamed'));
    expect(await g.beginDrain('stream', 0, CONTROL_TOKEN)).toMatchObject({ active: 1, phase: 'DRAINING' });
    expect(await response.text()).toBe('streamed');
    expect(await Promise.all(bg.tasks)).toEqual([{ released: true }]);
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it('keeps a producer tracked even after its response stream ends', async () => {
    const g = gate(); const bg = background(); const producer = deferred(); let writes = 0;
    const response = await guardFetch(g, bg.register, async scope => {
      scope.waitUntil(producer.promise.then(() => { writes++; }));
      return new Response('finished body');
    });
    await response.text();
    expect(await g.beginDrain('producer', 0, CONTROL_TOKEN)).toMatchObject({ active: 1 });
    producer.resolve(); await Promise.all(bg.tasks);
    expect(writes).toBe(1);
    expect(await g.status()).toMatchObject({ phase: 'DRAINED' });
  });

  it('retains a canceled stream permit even after a late producer callback', async () => {
    const g = gate(); const bg = background(); const producer = deferred(); let writes = 0;
    const response = await guardFetch(g, bg.register, async scope => {
      scope.waitUntil(producer.promise.then(() => { writes++; }));
      return new Response(new ReadableStream());
    });
    await response.body!.cancel();
    await g.beginDrain('cancel', 0, CONTROL_TOKEN);
    producer.resolve();
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(writes).toBe(1);
    expect(await g.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it('retains a permit on stream failure', async () => {
    const g = gate(); const bg = background();
    const response = await guardFetch(g, bg.register, async () => new Response(new ReadableStream({
      pull(controller) { controller.error(new Error('source failed')); },
    })));
    await expect(response.text()).rejects.toThrow('source failed');
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.beginDrain('error', 0, CONTROL_TOKEN)).toMatchObject({ active: 1 });
  });

  it.each([false, true])('tracks the entire response cancellation tail (reject: %s)', async fail => {
    const g = gate(); const bg = background(); const entered = deferred(); const tail = deferred();
    const failure = new Error('synthetic cancellation failure');
    let saved!: WorkScope; let finished = false; let writes = 0; let cancelReason: unknown;
    const response = await guardFetch(g, bg.register, async scope => {
      saved = scope;
      return new Response(new ReadableStream({ async cancel(reason) {
        cancelReason = reason;
        entered.resolve();
        await tail.promise;
        // The cancellation factory still owns this late continuation.
        await saved.run(async () => { writes++; });
        if (fail) throw failure;
      } }));
    });
    const completion = Promise.all(bg.tasks).then(result => { finished = true; return result; });
    const canceled = response.body!.cancel('synthetic disconnect').catch(error => error);
    try {
      await entered.promise;
      expect(await g.beginDrain('cancel-tail', 0, CONTROL_TOKEN)).toMatchObject({ active: 1, phase: 'DRAINING' });
      expect(cancelReason).toBe('synthetic disconnect');
      expect(finished).toBe(false);
    } finally {
      tail.resolve();
      await canceled;
      await completion;
    }
    expect(await canceled).toBe(fail ? failure : undefined);
    expect(writes).toBe(1);
    expect(await completion).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it('retains failed background work even when its rejection is caught by the handler', async () => {
    const g = gate(); const bg = background();
    await guardFetch(g, bg.register, async scope => {
      await scope.run(async () => { throw new Error('unknown write result'); }).catch(() => {});
      return new Response(null);
    });
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.beginDrain('failed', 0, CONTROL_TOKEN)).toMatchObject({ active: 1 });
  });

  it('marks raw uncertainty explicitly and never reopens a sealed scope', async () => {
    const g = gate(); const bg = background(); let saved!: WorkScope;
    await guardFetch(g, bg.register, async scope => {
      saved = scope;
      scope.markUncertain('D1_OPERATION_FAILED');
      return new Response(null);
    });
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    await expect(saved.run(async () => undefined)).rejects.toThrow('SCOPE_CLOSED');
    expect(await g.beginDrain('explicit-uncertain', 0, CONTROL_TOKEN)).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it('reuses one D1 facade per scope and rejects it after sealing', async () => {
    const g = gate(); const bg = background(); let first!: D1Database; let second!: D1Database; let saved!: WorkScope;
    await guardFetch(g, bg.register, async scope => {
      saved = scope;
      first = scope.wrapDatabase(env.SYNTHETIC_DB);
      second = scope.wrapDatabase(env.SYNTHETIC_DB);
      return new Response(null);
    });
    expect(first).toBe(second);
    await Promise.all(bg.tasks);
    expect(() => saved.wrapDatabase(env.SYNTHETIC_DB)).toThrow('SCOPE_CLOSED');
  });

  it('retains permits on root handler failure without leaking the error response', async () => {
    const g = gate(); const bg = background();
    const response = await guardFetch(g, bg.register, async () => { throw new Error('private details'); });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private details');
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.beginDrain('root', 0, CONTROL_TOKEN)).toMatchObject({ active: 1 });
  });

  it('never starts work if acquire response is lost after durable admission', async () => {
    const g = gate(); const bg = background(); let writes = 0;
    const network: MaintenanceClient = {
      async acquire(id) { await g.acquire(id); throw new Error('lost reply'); },
      async complete(p) { return await g.complete(p); },
    };
    expect((await guardFetch(network, bg.register, async () => { writes++; return new Response(null); })).status).toBe(503);
    expect(writes).toBe(0);
    expect(await g.beginDrain('network', 0, CONTROL_TOKEN)).toMatchObject({ active: 1 });
  });

  it('does not drop durable work when the completion request fails', async () => {
    const g = gate(); const bg = background();
    const network: MaintenanceClient = {
      async acquire(id) { return await g.acquire(id); },
      async complete() { throw new Error('network unavailable'); },
    };
    await guardFetch(network, bg.register, async () => new Response(null));
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'COMPLETION_UNCONFIRMED' }]);
    expect(await g.beginDrain('network', 0, CONTROL_TOKEN)).toMatchObject({ active: 1 });
  });

  it('does not invoke work if background lifetime registration fails', async () => {
    const g = gate(); let writes = 0;
    const response = await guardFetch(g, () => { throw new Error('context unavailable'); }, async () => {
      writes++; return new Response(null);
    });
    expect(response.status).toBe(503);
    expect(writes).toBe(0);
    expect(await g.beginDrain('context', 0, CONTROL_TOKEN)).toMatchObject({ active: 1 });
  });

  it('keeps a timed-out descendant uncertain even when remaining work later settles', async () => {
    const g = gate(); const bg = background(); const slow = deferred(); const timeout = deferred();
    await guardFetch(g, bg.register, async scope => {
      scope.waitUntil(slow.promise);
      scope.waitUntil(timeout.promise);
      return new Response(null);
    });
    await g.beginDrain('timeout', 0, CONTROL_TOKEN);
    timeout.reject(new Error('operation timed out'));
    expect(await g.status()).toMatchObject({ active: 1 });
    slow.resolve();
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it('reports a lost completion reply as unconfirmed without reopening admission', async () => {
    const g = gate(); const bg = background(); const child = deferred();
    const network: MaintenanceClient = {
      async acquire(id) { return await g.acquire(id); },
      async complete(p) { await g.complete(p); throw new Error('reply lost'); },
    };
    await guardFetch(network, bg.register, async scope => { scope.waitUntil(child.promise); return new Response(null); });
    await g.beginDrain('reply', 0, CONTROL_TOKEN);
    child.resolve();
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'COMPLETION_UNCONFIRMED' }]);
    // Server saw valid completion, so local zero is truthful; admission stays closed.
    expect(await g.status()).toMatchObject({ phase: 'DRAINED', active: 0 });
    expect(await g.acquire('after-reply-loss')).toBeNull();
  });

  it('holds real synthetic D1 writes through drain and denies further writers', async () => {
    const g = gate(); const bg = background(); const late = deferred();
    await env.SYNTHETIC_DB.exec('CREATE TABLE IF NOT EXISTS maintenance_writes (id TEXT PRIMARY KEY)');
    const id = crypto.randomUUID();
    const write = () => env.SYNTHETIC_DB.prepare('INSERT INTO maintenance_writes VALUES (?)').bind(id).run();
    const count = () => env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM maintenance_writes WHERE id = ?').bind(id).first<number>('n');
    await guardFetch(g, bg.register, async scope => {
      scope.waitUntil(late.promise.then(write));
      return new Response(null);
    });
    expect(await g.beginDrain('d1', 0, CONTROL_TOKEN)).toMatchObject({ phase: 'DRAINING' });
    expect(await count()).toBe(0);
    late.resolve(); await Promise.all(bg.tasks);
    expect(await count()).toBe(1);
    expect(await g.status()).toMatchObject({ phase: 'DRAINED' });
    const forbidden = () => env.SYNTHETIC_DB.prepare('DELETE FROM maintenance_writes WHERE id = ?').bind(id).run();
    expect((await guardFetch(g, bg.register, async () => { await forbidden(); return new Response(null); })).status).toBe(503);
    expect(await guardScheduled(g, async () => { await forbidden(); })).toBe(false);
    expect(await count()).toBe(1);
  });

  it('rejects a malformed admission reply before invoking a handler', async () => {
    const g = gate(); const bg = background(); let writes = 0;
    const invalidReplies = [
      () => ({ id: 'different', epoch: 0 }),
      (id: string) => ({ id, epoch: -1 }),
      (id: string) => ({ id, epoch: 0.5 }),
      (id: string) => ({ id, epoch: Number.MAX_SAFE_INTEGER + 1 }),
      () => ({}),
    ];
    for (const invalid of invalidReplies) {
      const network: MaintenanceClient = {
        async acquire(id) { return invalid(id) as Awaited<ReturnType<MaintenanceClient['acquire']>>; },
        async complete(p) { return await g.complete(p); },
      };
      expect((await guardFetch(network, bg.register, async () => { writes++; return new Response(null); })).status).toBe(503);
    }
    expect(writes).toBe(0);
  });
});
