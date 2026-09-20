import { describe, expect, it } from 'vitest';
import { createD1DatabaseFacade } from '../../src/maintenance/d1';
import type { WorkScope } from '../../src/maintenance/lifecycle';

function scopeHarness() {
  let open = true;
  const uncertain: string[] = [];
  const tracked: Promise<unknown>[] = [];
  type Harness = WorkScope & { close(): void; uncertain: string[]; tracked: Promise<unknown>[] };
  let scope!: Harness;
  scope = {
    assertOpen() {
      if (!open) throw new Error('SCOPE_CLOSED');
    },
    markUncertain(reason = 'D1_OPERATION_FAILED') {
      uncertain.push(reason);
    },
    run<T>(factory: () => Promise<T>) {
      if (!open) return Promise.reject(new Error('SCOPE_CLOSED')) as Promise<T>;
      const promise = Promise.resolve().then(factory);
      tracked.push(promise);
      return promise.catch((error) => {
        scope.markUncertain('D1_OPERATION_FAILED');
        throw error;
      });
    },
    waitUntil(promise: Promise<unknown>) {
      tracked.push(promise);
    },
    wrapDatabase(database: D1Database) {
      return createD1DatabaseFacade(database, scope);
    },
    close() { open = false; },
    uncertain,
    tracked,
  };
  return scope;
}

function nativeDb(overrides: Partial<D1Database> = {}): D1Database {
  return {
    prepare() {
      const statement = {
        bind: (..._values: unknown[]) => statement as unknown as D1PreparedStatement,
        first: async () => null,
        run: async () => ({ success: true, meta: { changes: 0, duration: 0, last_row_id: 0, rows_read: 0, rows_written: 0, served_by: 'test', served_by_region: 'test', served_by_primary: true, total_attempts: 1 } }),
        all: async () => ({ results: [], success: true, meta: { changes: 0, duration: 0, last_row_id: 0, rows_read: 0, rows_written: 0, served_by: 'test', served_by_region: 'test', served_by_primary: true, total_attempts: 1 } }),
        raw: async () => [],
      };
      return statement as unknown as D1PreparedStatement;
    },
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    withSession: () => { throw new Error('unexpected withSession'); },
    dump: async () => new ArrayBuffer(0),
    ...overrides,
  } as D1Database;
}

describe('maintenance D1 facade', () => {
  it('defers native prepare until execution and rejects execution after scope closure', async () => {
    const scope = scopeHarness();
    let prepares = 0;
    const db = nativeDb({ prepare: () => { prepares++; throw new Error('native prepare should be lazy'); } });
    const statement = createD1DatabaseFacade(db, scope).prepare('SELECT 1').bind('value');
    expect(prepares).toBe(0);
    scope.close();
    await expect(statement.first()).rejects.toThrow('SCOPE_CLOSED');
    expect(prepares).toBe(0);
  });

  it('preserves native rejection and marks the work uncertain', async () => {
    const scope = scopeHarness();
    const db = nativeDb({
      prepare: () => ({
        bind: () => ({
          run: async () => { throw new Error('D1_DOWN'); },
        }),
      } as unknown as D1PreparedStatement),
    });
    await expect(createD1DatabaseFacade(db, scope).prepare('INSERT').run()).rejects.toThrow('D1_DOWN');
    expect(scope.uncertain).toEqual(['D1_OPERATION_FAILED']);
  });

  it('marks synchronous native prepare failure uncertain while preserving the error', async () => {
    const scope = scopeHarness();
    const db = nativeDb({ prepare: () => { throw new Error('PREPARE_DOWN'); } });
    await expect(createD1DatabaseFacade(db, scope).prepare('SELECT 1').first()).rejects.toThrow('PREPARE_DOWN');
    expect(scope.uncertain).toEqual(['D1_OPERATION_FAILED']);
  });

  it('tracks native batch failures through the same scope', async () => {
    const scope = scopeHarness();
    const db = nativeDb({ batch: async () => { throw new Error('BATCH_DOWN'); } });
    const facade = createD1DatabaseFacade(db, scope);
    await expect(facade.batch([facade.prepare('SELECT 1')])).rejects.toThrow('BATCH_DOWN');
    expect(scope.uncertain).toEqual(['D1_OPERATION_FAILED']);
  });

  it('rejects batch statements from another facade', async () => {
    const first = scopeHarness();
    const second = scopeHarness();
    const db = nativeDb();
    const firstFacade = createD1DatabaseFacade(db, first);
    const secondFacade = createD1DatabaseFacade(db, second);
    await expect(firstFacade.batch([secondFacade.prepare('SELECT 1')])).rejects.toThrow('D1_FACADE_MISMATCH');
  });

  it('rejects unsupported native operations explicitly', async () => {
    const scope = scopeHarness();
    const facade = createD1DatabaseFacade(nativeDb(), scope);
    await expect(facade.exec('SELECT 1')).rejects.toThrow('D1_OPERATION_UNSUPPORTED');
    expect(() => facade.withSession('first-primary')).toThrow('D1_OPERATION_UNSUPPORTED');
    await expect(facade.dump()).rejects.toThrow('D1_OPERATION_UNSUPPORTED');
  });

  it('does not mark successful empty results as uncertain', async () => {
    const scope = scopeHarness();
    const facade = createD1DatabaseFacade(nativeDb(), scope);
    await expect(facade.prepare('SELECT 1').all()).resolves.toMatchObject({ results: [] });
    expect(scope.uncertain).toEqual([]);
  });
});
