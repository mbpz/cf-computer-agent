import { abortAllDurableObjects, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { env } from './env';
import { authorizedMaintenance } from './control-client';

function gate() { return authorizedMaintenance(env.MAINTENANCE.getByName(crypto.randomUUID())); }
// RPC promises are thenables; normalize before Vitest's rejection matcher.
async function settled<T>(promise: PromiseLike<T>): Promise<T> { return await promise; }

describe('durable maintenance admission', () => {
  it('closes admission before draining and never calls local zero work FROZEN', async () => {
    const g = gate();
    const permit = await g.acquire('request-1');
    expect(permit).toEqual({ id: 'request-1', epoch: 0 });
    expect(await g.beginDrain('window-1', 0)).toEqual({ phase: 'DRAINING', epoch: 0, window: 'window-1', active: 1 });
    expect(await g.acquire('request-2')).toBeNull();
    await expect(settled(g.resume('window-1', 0))).rejects.toThrow('ACTIVE_WORK');
    expect(await g.complete(permit!)).toEqual({ phase: 'DRAINED', epoch: 0, window: 'window-1', active: 0 });
  });

  it('makes exact completion and control retries safe but fences stale controls', async () => {
    const g = gate();
    const p = (await g.acquire('one'))!;
    await g.beginDrain('window-1', 0);
    await g.beginDrain('window-1', 0);
    await expect(settled(g.beginDrain('other', 0))).rejects.toThrow('WINDOW_CONFLICT');
    await expect(settled(g.complete({ ...p, epoch: 1 }))).rejects.toThrow('PERMIT_MISMATCH');
    await expect(settled(g.complete({ id: 'unknown', epoch: 0 }))).rejects.toThrow('PERMIT_MISMATCH');
    await g.complete(p);
    await g.complete(p);
    expect(await g.resume('window-1', 0)).toMatchObject({ phase: 'OPEN', epoch: 1 });
    expect(await g.resume('window-1', 0)).toMatchObject({ phase: 'OPEN', epoch: 1 });
    await g.beginDrain('window-2', 1);
    await expect(settled(g.resume('window-1', 0))).rejects.toThrow('STALE_CONTROL');
    await expect(settled(g.beginDrain('old', 0))).rejects.toThrow('STALE_CONTROL');
    expect(await g.status()).toMatchObject({ phase: 'DRAINED', epoch: 1, window: 'window-2' });
  });

  it('rejects replayed admissions even after completion and resume', async () => {
    const g = gate();
    const p = (await g.acquire('one'))!;
    await expect(settled(g.acquire('one'))).rejects.toThrow('PERMIT_REUSED');
    await g.complete(p);
    await g.beginDrain('window-1', 0);
    await g.resume('window-1', 0);
    await expect(settled(g.acquire('one'))).rejects.toThrow('PERMIT_REUSED');
  });

  it('serializes concurrent admission and close without losing admitted work', async () => {
    const g = gate();
    const attempts = Array.from({ length: 30 }, (_, i) => g.acquire(`work-${i}`));
    const close = g.beginDrain('race', 0);
    const later = Array.from({ length: 30 }, (_, i) => g.acquire(`later-${i}`));
    const [results] = await Promise.all([Promise.all([...attempts, ...later]), close]);
    const permits = results.filter(p => p !== null);
    expect((await g.status()).active).toBe(permits.length);
    expect(await g.acquire('after-close')).toBeNull();
    await Promise.all(permits.map(p => g.complete(p)));
    expect(await g.status()).toMatchObject({ phase: 'DRAINED', active: 0 });
  });

  it('retains abandoned permits and closed admission across object restart', async () => {
    const name = crypto.randomUUID();
    const g = authorizedMaintenance(env.MAINTENANCE.getByName(name));
    await g.acquire('abandoned');
    await g.beginDrain('restart', 0);
    await abortAllDurableObjects();
    const restarted = authorizedMaintenance(env.MAINTENANCE.getByName(name));
    expect(await restarted.status()).toEqual({ phase: 'DRAINING', active: 1, epoch: 0, window: 'restart' });
    expect(await restarted.capacity()).toMatchObject({ records: 1, tombstones: 0, capacityRemaining: 9_999, alert: 'NONE', requiresManualReview: true });
    expect(await restarted.acquire('new')).toBeNull();
    await expect(settled(restarted.resume('restart', 0))).rejects.toThrow('ACTIVE_WORK');
  });

  it('isolates database coordination boundaries', async () => {
    const a = gate(); const b = gate();
    await a.beginDrain('only-a', 0);
    expect(await b.acquire('unrelated')).toEqual({ id: 'unrelated', epoch: 0 });
    expect(await a.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it('rejects malformed controls without changing state', async () => {
    const g = gate();
    for (const id of ['', 'x'.repeat(129), 'contains spaces']) {
      await expect(settled(g.acquire(id))).rejects.toThrow('INVALID_ID');
    }
    await expect(settled(g.beginDrain('valid', -1))).rejects.toThrow('INVALID_EPOCH');
    await expect(settled(g.beginDrain('valid', 0.5))).rejects.toThrow('INVALID_EPOCH');
    expect(await g.status()).toEqual({ phase: 'OPEN', epoch: 0, window: null, active: 0 });
  });

  it('exposes no HTTP maintenance control route', async () => {
    expect((await SELF.fetch('https://local.test/maintenance/resume', { method: 'POST' })).status).toBe(404);
  });

  it('rejects control calls without the injected capability before changing state', async () => {
    const raw = env.MAINTENANCE.getByName(crypto.randomUUID());
    await expect(settled(raw.beginDrain('unauthorized', 0, 'wrong-capability'))).rejects.toThrow('CONTROL_UNAUTHORIZED');
    await expect(settled(raw.resume('unauthorized', 0, 'wrong-capability'))).rejects.toThrow('CONTROL_UNAUTHORIZED');
    expect(await raw.status()).toEqual({ phase: 'OPEN', epoch: 0, window: null, active: 0 });
    expect(await authorizedMaintenance(raw).beginDrain('authorized', 0)).toMatchObject({ phase: 'DRAINED' });
  });

  it('fails closed at the record ceiling without deleting replay tombstones', async () => {
    const raw = env.MAINTENANCE.getByName(crypto.randomUUID());
    await runInDurableObject(raw, (_instance, state) => {
      state.storage.sql.exec(`WITH RECURSIVE n(i) AS (
        VALUES(1) UNION ALL SELECT i + 1 FROM n WHERE i < 9999
      ) INSERT INTO permits SELECT 'past-' || i, 0, 1 FROM n`);
    });
    expect(await raw.capacity()).toMatchObject({ records: 9_999, tombstones: 9_999, capacityRemaining: 1, alert: 'CRITICAL', requiresManualReview: false });
    const last = (await raw.acquire('last'))!;
    await raw.complete(last);
    await expect(settled(raw.acquire('overflow'))).rejects.toThrow('CAPACITY_EXCEEDED');
    await expect(settled(raw.acquire('past-1'))).rejects.toThrow('PERMIT_REUSED');
    expect(await raw.beginDrain('full', 0, 'synthetic-maintenance-control-token')).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it('does not let an old completion release a newer epoch permit', async () => {
    const g = gate();
    const old = (await g.acquire('old'))!;
    await g.complete(old);
    await g.beginDrain('first', 0); await g.resume('first', 0);
    const current = (await g.acquire('current'))!;
    await g.beginDrain('second', 1);
    await g.complete(old);
    expect(await g.status()).toMatchObject({ epoch: 1, active: 1, phase: 'DRAINING' });
    await g.complete(current);
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });
});
