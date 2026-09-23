import { abortAllDurableObjects, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { env } from './env';
import { CONTROL_TOKEN, OTHER_CONTROL_TOKEN } from './control-fixtures';
import type { MaintenanceControlClient } from '../../src/maintenance/contracts';
import { MaintenanceCoordinator } from '../../src/maintenance/coordinator';

function gate() { return env.MAINTENANCE.getByName(crypto.randomUUID()); }
// RPC promises are thenables; normalize before Vitest's rejection matcher.
async function settled<T>(promise: PromiseLike<T>): Promise<T> { return await promise; }

describe('durable maintenance admission', () => {
  it('checks every control retry before entering a storage transaction', async () => {
    const g = gate();
    await runInDurableObject(g, (instance, state) => {
      if (!(instance instanceof MaintenanceCoordinator)) throw new Error('UNEXPECTED_COORDINATOR_INSTANCE');
      const controlled = instance;
      controlled.beginDrain('retry', 0, CONTROL_TOKEN);
      const before = instance.status();
      const transaction = vi.spyOn(state.storage, 'transactionSync');
      try {
        expect(() => controlled.beginDrain('retry', 0, OTHER_CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
        expect(() => controlled.resume('retry', 0, OTHER_CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
        expect(transaction).not.toHaveBeenCalled();
        expect(instance.status()).toEqual(before);
      } finally { transaction.mockRestore(); }
      controlled.resume('retry', 0, CONTROL_TOKEN);
      const reopened = instance.status();
      expect(() => controlled.resume('retry', 0, OTHER_CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
      expect(instance.status()).toEqual(reopened);
    });
  });

  // The runtime requires an env object; invalid configuration is a missing or
  // malformed binding within that object, not an invalid DurableObject env.
  it.each([{}, { MAINTENANCE_CONTROL_TOKEN: undefined }, { MAINTENANCE_CONTROL_TOKEN: null }, { MAINTENANCE_CONTROL_TOKEN: 'bad' }])(
    'fails closed for bad configuration %j without disabling business admission', async configuration => {
      const g = gate();
      await runInDurableObject(g, (_instance, state) => {
        const unconfigured = new MaintenanceCoordinator(state, configuration);
        const controlled = unconfigured;
        const permit = unconfigured.acquire('business');
        expect(permit).toEqual({ id: 'business', epoch: 0 });
        const before = unconfigured.status();
        expect(() => controlled.beginDrain('config', 0, CONTROL_TOKEN)).toThrow('CONTROL_UNAVAILABLE');
        expect(() => controlled.resume('config', 0, CONTROL_TOKEN)).toThrow('CONTROL_UNAVAILABLE');
        expect(unconfigured.status()).toEqual(before);
        expect(unconfigured.complete(permit!)).toEqual({ phase: 'OPEN', epoch: 0, window: null, active: 0 });
      });
    },
  );

  it('rejects an old capability on a new configuration instance without resetting durable state', async () => {
    const g = gate();
    await runInDurableObject(g, (instance, state) => {
      if (!(instance instanceof MaintenanceCoordinator)) throw new Error('UNEXPECTED_COORDINATOR_INSTANCE');
      // Serial synthetic instance test, not a claim about live production hot rotation.
      instance.beginDrain('rotation', 0, CONTROL_TOKEN);
      const before = instance.status();
      const rotated = new MaintenanceCoordinator(state, { MAINTENANCE_CONTROL_TOKEN: OTHER_CONTROL_TOKEN });
      const controlled = rotated;
      expect(() => controlled.resume('rotation', 0, CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
      expect(rotated.status()).toEqual(before);
      expect(controlled.resume('rotation', 0, OTHER_CONTROL_TOKEN)).toEqual({ phase: 'OPEN', epoch: 1, window: null, active: 0 });
    });
  });
  it.each(['beginDrain', 'resume'] as const)('rejects unauthorized %s before parameters or state changes', async action => {
    const g = gate();
    const before = await g.status();
    const controlled: MaintenanceControlClient = g;
    await expect(settled(controlled[action]('bad window', -1, OTHER_CONTROL_TOKEN))).rejects.toThrow('CONTROL_UNAUTHORIZED');
    expect(await g.status()).toEqual(before);
  });

  it.each(['beginDrain', 'resume'] as const)('rejects missing capability for %s without changing state', async action => {
    const g = gate();
    const before = await g.status();
    const legacy = g as unknown as { [K in typeof action]: (window: string, epoch: number) => Promise<unknown> };
    await expect(settled(legacy[action]('no-capability', 0))).rejects.toThrow('CONTROL_UNAUTHORIZED');
    expect(await g.status()).toEqual(before);
  });
  it('closes admission before draining and never calls local zero work FROZEN', async () => {
    const g = gate();
    const permit = await g.acquire('request-1');
    expect(permit).toEqual({ id: 'request-1', epoch: 0 });
    expect(await g.beginDrain('window-1', 0, CONTROL_TOKEN)).toEqual({ phase: 'DRAINING', epoch: 0, window: 'window-1', active: 1 });
    expect(await g.acquire('request-2')).toBeNull();
    await expect(settled(g.resume('window-1', 0, CONTROL_TOKEN))).rejects.toThrow('ACTIVE_WORK');
    expect(await g.complete(permit!)).toEqual({ phase: 'DRAINED', epoch: 0, window: 'window-1', active: 0 });
  });

  it('makes exact completion and control retries safe but fences stale controls', async () => {
    const g = gate();
    const p = (await g.acquire('one'))!;
    await g.beginDrain('window-1', 0, CONTROL_TOKEN);
    await g.beginDrain('window-1', 0, CONTROL_TOKEN);
    await expect(settled(g.beginDrain('other', 0, CONTROL_TOKEN))).rejects.toThrow('WINDOW_CONFLICT');
    await expect(settled(g.complete({ ...p, epoch: 1 }))).rejects.toThrow('PERMIT_MISMATCH');
    await expect(settled(g.complete({ id: 'unknown', epoch: 0 }))).rejects.toThrow('PERMIT_MISMATCH');
    await g.complete(p);
    await g.complete(p);
    expect(await g.resume('window-1', 0, CONTROL_TOKEN)).toMatchObject({ phase: 'OPEN', epoch: 1 });
    expect(await g.resume('window-1', 0, CONTROL_TOKEN)).toMatchObject({ phase: 'OPEN', epoch: 1 });
    await g.beginDrain('window-2', 1, CONTROL_TOKEN);
    await expect(settled(g.resume('window-1', 0, CONTROL_TOKEN))).rejects.toThrow('STALE_CONTROL');
    await expect(settled(g.beginDrain('old', 0, CONTROL_TOKEN))).rejects.toThrow('STALE_CONTROL');
    expect(await g.status()).toMatchObject({ phase: 'DRAINED', epoch: 1, window: 'window-2' });
  });

  it('rejects replayed admissions even after completion and resume', async () => {
    const g = gate();
    const p = (await g.acquire('one'))!;
    await expect(settled(g.acquire('one'))).rejects.toThrow('PERMIT_REUSED');
    await g.complete(p);
    await g.beginDrain('window-1', 0, CONTROL_TOKEN);
    await g.resume('window-1', 0, CONTROL_TOKEN);
    await expect(settled(g.acquire('one'))).rejects.toThrow('PERMIT_REUSED');
  });

  it('serializes concurrent admission and close without losing admitted work', async () => {
    const g = gate();
    const attempts = Array.from({ length: 30 }, (_, i) => g.acquire(`work-${i}`));
    const close = g.beginDrain('race', 0, CONTROL_TOKEN);
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
    const g = env.MAINTENANCE.getByName(name);
    await g.acquire('abandoned');
    await g.beginDrain('restart', 0, CONTROL_TOKEN);
    await abortAllDurableObjects();
    const restarted = env.MAINTENANCE.getByName(name);
    expect(await restarted.status()).toEqual({ phase: 'DRAINING', active: 1, epoch: 0, window: 'restart' });
    expect(await restarted.acquire('new')).toBeNull();
    await expect(settled(restarted.resume('restart', 0, CONTROL_TOKEN))).rejects.toThrow('ACTIVE_WORK');
  });

  it('isolates database coordination boundaries', async () => {
    const a = gate(); const b = gate();
    await a.beginDrain('only-a', 0, CONTROL_TOKEN);
    expect(await b.acquire('unrelated')).toEqual({ id: 'unrelated', epoch: 0 });
    expect(await a.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it('rejects malformed controls without changing state', async () => {
    const g = gate();
    for (const id of ['', 'x'.repeat(129), 'contains spaces']) {
      await expect(settled(g.acquire(id))).rejects.toThrow('INVALID_ID');
    }
    await expect(settled(g.beginDrain('valid', -1, CONTROL_TOKEN))).rejects.toThrow('INVALID_EPOCH');
    await expect(settled(g.beginDrain('valid', 0.5, CONTROL_TOKEN))).rejects.toThrow('INVALID_EPOCH');
    expect(await g.status()).toEqual({ phase: 'OPEN', epoch: 0, window: null, active: 0 });
  });

  it('exposes no HTTP maintenance control route', async () => {
    expect((await SELF.fetch('https://local.test/maintenance/resume', { method: 'POST' })).status).toBe(404);
  });

  it('fails closed at the record ceiling without deleting replay tombstones', async () => {
    const g = gate();
    await runInDurableObject(g, (_instance, state) => {
      state.storage.sql.exec(`WITH RECURSIVE n(i) AS (
        VALUES(1) UNION ALL SELECT i + 1 FROM n WHERE i < 9999
      ) INSERT INTO permits SELECT 'past-' || i, 0, 1 FROM n`);
    });
    const last = (await g.acquire('last'))!;
    await g.complete(last);
    await expect(settled(g.acquire('overflow'))).rejects.toThrow('CAPACITY_EXCEEDED');
    await expect(settled(g.acquire('past-1'))).rejects.toThrow('PERMIT_REUSED');
    expect(await g.beginDrain('full', 0, CONTROL_TOKEN)).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it('does not let an old completion release a newer epoch permit', async () => {
    const g = gate();
    const old = (await g.acquire('old'))!;
    await g.complete(old);
    await g.beginDrain('first', 0, CONTROL_TOKEN); await g.resume('first', 0, CONTROL_TOKEN);
    const current = (await g.acquire('current'))!;
    await g.beginDrain('second', 1, CONTROL_TOKEN);
    await g.complete(old);
    expect(await g.status()).toMatchObject({ epoch: 1, active: 1, phase: 'DRAINING' });
    await g.complete(current);
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });
});
