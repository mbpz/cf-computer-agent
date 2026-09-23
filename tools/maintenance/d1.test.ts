import { CONTROL_TOKEN } from './control-fixtures';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from './env';
import { createD1Facade } from '../../src/maintenance/d1';
import { guardFetch, type Completion } from '../../src/maintenance/lifecycle';

function background() {
  const tasks: Promise<Completion>[] = [];
  return { tasks, register: (task: Promise<Completion>) => { tasks.push(task); } };
}
function gate() { return env.MAINTENANCE.getByName(crypto.randomUUID()); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const success = () => ({
  success: true as const, results: [],
  meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 },
});

// Faults impossible to request from real D1 (sync throws/malformed responses)
// are injected only at this native boundary. Real SQL behavior is tested below.
function nativePort(execute?: (method: string, args: unknown[]) => unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  function call(method: string, receiver: unknown, owner: unknown, args: unknown[]) {
    if (receiver !== owner) throw new Error('NATIVE_RECEIVER_CHANGED');
    calls.push({ method, args });
    if (execute) return execute(method, args);
    if (method === 'first') return Promise.resolve(null);
    if (method === 'raw' || method === 'batch') return Promise.resolve([]);
    return Promise.resolve(success());
  }
  const statement = {
    bind(...values: unknown[]) { calls.push({ method: 'bind', args: values }); return statement; },
    first(...args: unknown[]) { return call('first', this, statement, args); },
    run(...args: unknown[]) { return call('run', this, statement, args); },
    all(...args: unknown[]) { return call('all', this, statement, args); },
    raw(...args: unknown[]) { return call('raw', this, statement, args); },
  };
  const database = {
    prepare(query: string) { calls.push({ method: 'prepare', args: [query] }); return statement; },
    batch(statements: D1PreparedStatement[]) { return call('batch', this, database, [statements]); },
    exec(query: string) { calls.push({ method: 'exec', args: [query] }); return Promise.resolve({ count: 0, duration: 0 }); },
    withSession(...args: unknown[]) {
      calls.push({ method: 'withSession', args });
      return { prepare: database.prepare, batch: database.batch, getBookmark: () => null };
    },
    dump() { calls.push({ method: 'dump', args: [] }); return Promise.resolve(new ArrayBuffer(0)); },
  };
  return { database: database as unknown as D1Database, calls };
}

type Execution = 'first' | 'run' | 'all' | 'raw' | 'batch';
function execute(database: D1Database, method: Execution): Promise<unknown> {
  const statement = database.prepare('SELECT ? AS value').bind('synthetic');
  switch (method) {
    case 'first': return statement.first();
    case 'run': return statement.run();
    case 'all': return statement.all();
    case 'raw': return statement.raw();
    case 'batch': return database.batch([statement]);
  }
}

describe('request scoped D1 facade', () => {
  beforeEach(async () => {
    await env.SYNTHETIC_DB.exec('CREATE TABLE IF NOT EXISTS maintenance_facade_rows (id TEXT PRIMARY KEY, value TEXT)');
  });

  it('keeps prepare/bind lazy and preserves real first/all/raw overloads and run results', async () => {
    const g = gate(); const bg = background(); const id = crypto.randomUUID();
    const values: unknown[] = [];
    const response = await guardFetch(g, bg.register, async scope => {
      const db = createD1Facade(env.SYNTHETIC_DB, scope);
      const insert = db.prepare('INSERT INTO maintenance_facade_rows VALUES (?, ?)').bind(id, 'hello');
      values.push(await env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM maintenance_facade_rows WHERE id = ?').bind(id).first('n'));
      values.push((await insert.run()).meta.changes);
      const query = db.prepare('SELECT value FROM maintenance_facade_rows WHERE id = ?').bind(id);
      values.push(await query.first(), await query.first<string>('value'));
      values.push((await query.all<{ value: string }>()).results);
      values.push(await query.raw<[string]>(), await query.raw<[string]>({ columnNames: false }), await query.raw<[string]>({ columnNames: true }));
      values.push(await db.prepare('SELECT value FROM maintenance_facade_rows WHERE id = ?').bind('missing-' + id).first());
      values.push((await db.prepare('SELECT value FROM maintenance_facade_rows WHERE id = ?').bind('missing-' + id).all()).results);
      values.push((await db.prepare('UPDATE maintenance_facade_rows SET value = ? WHERE id = ?').bind('none', 'missing-' + id).run()).meta.changes);
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(values).toEqual([0, 1, { value: 'hello' }, 'hello', [{ value: 'hello' }], [['hello']], [['hello']], [['value'], ['hello']], null, [], 0]);
    expect(await Promise.all(bg.tasks)).toEqual([{ released: true }]);
  });

  it('preserves a real same-facade batch and does not duplicate writes', async () => {
    const g = gate(); const bg = background(); const id = crypto.randomUUID(); let results: D1Result[] = [];
    const response = await guardFetch(g, bg.register, async scope => {
      const db = createD1Facade(env.SYNTHETIC_DB, scope);
      results = await db.batch([
        db.prepare('INSERT INTO maintenance_facade_rows VALUES (?, ?)').bind(id, 'before'),
        db.prepare('UPDATE maintenance_facade_rows SET value = ? WHERE id = ?').bind('after', id),
        db.prepare('SELECT value FROM maintenance_facade_rows WHERE id = ?').bind(id),
      ]);
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(results).toHaveLength(3);
    expect(results[0].meta.changes).toBe(1);
    expect(results[1].meta.changes).toBe(1);
    expect(results[2].results).toEqual([{ value: 'after' }]);
    expect(await Promise.all(bg.tasks)).toEqual([{ released: true }]);
  });

  it('retains a real constraint failure even when the handler maps it to 409', async () => {
    const g = gate(); const bg = background(); const id = crypto.randomUUID();
    await env.SYNTHETIC_DB.prepare('INSERT INTO maintenance_facade_rows VALUES (?, ?)').bind(id, 'original').run();
    const response = await guardFetch(g, bg.register, async scope => {
      const db = createD1Facade(env.SYNTHETIC_DB, scope);
      return db.prepare('INSERT INTO maintenance_facade_rows VALUES (?, ?)').bind(id, 'duplicate').run()
        .then(() => new Response(null), () => new Response(null, { status: 409 }));
    });
    expect(response.status).toBe(409);
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.beginDrain('constraint', 0, CONTROL_TOKEN)).toMatchObject({ active: 1, phase: 'DRAINING' });
    expect(await env.SYNTHETIC_DB.prepare('SELECT value FROM maintenance_facade_rows WHERE id = ?').bind(id).first('value')).toBe('original');
  });

  for (const mode of ['sync', 'async'] as const) {
    it.each<Execution>(['first', 'run', 'all', 'raw', 'batch'])(`observes ${mode} %s failure before the business catch`, async method => {
      const g = gate(); const bg = background(); const error = new Error('synthetic database failure');
      const port = nativePort(() => { if (mode === 'sync') throw error; return Promise.reject(error); });
      let received: unknown;
      const response = await guardFetch(g, bg.register, async scope => {
        try { await execute(createD1Facade(port.database, scope), method); } catch (reason) { received = reason; }
        return new Response(null, { status: 409 });
      });
      expect(response.status).toBe(409);
      expect(received).toBe(error);
      expect(port.calls.filter(call => call.method === method)).toHaveLength(1);
      expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    });
  }

  it.each<Execution>(['run', 'all', 'batch'])('preserves a %s success:false result while retaining uncertainty', async method => {
    const g = gate(); const bg = background();
    const failure = { ...success(), success: false, error: 'synthetic failure' };
    const result = method === 'batch' ? [failure] : failure;
    const port = nativePort(() => Promise.resolve(result)); let received: unknown;
    const response = await guardFetch(g, bg.register, async scope => {
      received = await execute(createD1Facade(port.database, scope), method);
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(received).toBe(result);
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
  });

  it.each<Execution>(['run', 'all', 'batch'])('does not turn a malformed %s result into successful completion', async method => {
    const g = gate(); const bg = background(); const port = nativePort(() => Promise.resolve(undefined)); let received: unknown = 'unset';
    const response = await guardFetch(g, bg.register, async scope => {
      received = await execute(createD1Facade(port.database, scope), method);
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(received).toBeUndefined();
    expect(await Promise.all(bg.tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
  });

  it('holds an unawaited native query until it settles', async () => {
    const g = gate(); const bg = background(); const query = deferred<D1Result>(); const started = deferred<void>();
    const port = nativePort(() => { started.resolve(); return query.promise; });
    let finished = false;
    const response = await guardFetch(g, bg.register, async scope => {
      void createD1Facade(port.database, scope).prepare('SELECT 1').run().catch(() => {});
      return new Response(null);
    });
    const completion = Promise.all(bg.tasks).then(result => { finished = true; return result; });
    await started.promise;
    try {
      expect(response.status).toBe(200);
      expect(await g.beginDrain('slow-query', 0, CONTROL_TOKEN)).toMatchObject({ active: 1, phase: 'DRAINING' });
      expect(finished).toBe(false);
    } finally { query.resolve(success()); await completion; }
    expect(await completion).toEqual([{ released: true }]);
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it.each(['raw', 'other-facade', 'other-database'] as const)('rejects a %s statement before any native batch execution', async origin => {
    const g = gate(); const bg = background(); const port = nativePort(); const other = nativePort(); let caught: unknown;
    const response = await guardFetch(g, bg.register, async scope => {
      const db = createD1Facade(port.database, scope);
      const source = origin === 'raw' ? port.database : createD1Facade(origin === 'other-facade' ? port.database : other.database, scope);
      const statements = [db.prepare('SELECT 1'), source.prepare('SELECT 2')];
      port.calls.length = 0; other.calls.length = 0;
      try { await db.batch(statements); } catch (error) { caught = error; }
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('D1_STATEMENT_SCOPE_MISMATCH');
    expect(port.calls).toEqual([]);
    expect(other.calls).toEqual([]);
    await Promise.all(bg.tasks);
  });

  const operations = {
    prepare: (db: D1Database, _statement: D1PreparedStatement) => db.prepare('SELECT 2'),
    bind: (_db: D1Database, statement: D1PreparedStatement) => statement.bind('late'),
    first: (_db: D1Database, statement: D1PreparedStatement) => statement.first(),
    run: (_db: D1Database, statement: D1PreparedStatement) => statement.run(),
    all: (_db: D1Database, statement: D1PreparedStatement) => statement.all(),
    raw: (_db: D1Database, statement: D1PreparedStatement) => statement.raw(),
    batch: (db: D1Database, statement: D1PreparedStatement) => db.batch([statement]),
    exec: (db: D1Database, _statement: D1PreparedStatement) => db.exec('SELECT 2'),
    withSession: (db: D1Database, _statement: D1PreparedStatement) => db.withSession(),
    dump: (db: D1Database, _statement: D1PreparedStatement) => db.dump(),
  };

  it.each(Object.keys(operations) as (keyof typeof operations)[])('fences late %s before reaching the native database', async method => {
    const g = gate(); const bg = background(); const port = nativePort(); let db!: D1Database; let statement!: D1PreparedStatement;
    await guardFetch(g, bg.register, async scope => {
      db = createD1Facade(port.database, scope); statement = db.prepare('SELECT ?');
      return new Response(null);
    });
    expect(await Promise.all(bg.tasks)).toEqual([{ released: true }]);
    port.calls.length = 0;
    await expect(Promise.resolve().then<unknown>(() => operations[method](db, statement))).rejects.toThrow('SCOPE_CLOSED');
    expect(port.calls).toEqual([]);
  });

  it.each(['exec', 'withSession', 'dump'] as const)('explicitly rejects unsupported %s while open without forwarding', async method => {
    const g = gate(); const bg = background(); const port = nativePort(); let caught: unknown;
    const response = await guardFetch(g, bg.register, async scope => {
      const db = createD1Facade(port.database, scope); const statement = db.prepare('SELECT 1'); port.calls.length = 0;
      try { await operations[method](db, statement); } catch (error) { caught = error; }
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('D1_API_UNSUPPORTED');
    expect(port.calls).toEqual([]);
    await Promise.all(bg.tasks);
  });
});
