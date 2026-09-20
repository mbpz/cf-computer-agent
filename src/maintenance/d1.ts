import type { WorkScope } from './lifecycle';

const FACADE_OWNER = Symbol('maintenance-d1-facade-owner');

interface FacadeStatement extends D1PreparedStatement {
  readonly [FACADE_OWNER]: symbol;
  materialize(): D1PreparedStatement;
}

export function createD1DatabaseFacade(database: D1Database, scope: WorkScope): D1Database {
  const owner = Symbol('maintenance-d1-owner');
  return new TrackedD1Database(database, scope, owner);
}

class TrackedD1Database implements D1Database {
  constructor(
    private readonly database: D1Database,
    private readonly scope: WorkScope,
    private readonly owner: symbol,
  ) {}

  prepare(query: string): D1PreparedStatement {
    if (typeof query !== 'string') throw new TypeError('D1_QUERY_INVALID');
    this.scope.assertOpen();
    return new TrackedPreparedStatement(this.database, this.scope, this.owner, query);
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    try {
      this.scope.assertOpen();
      const candidates = statements.map((statement) => {
        const candidate = statement as Partial<FacadeStatement>;
        if (candidate[FACADE_OWNER] !== this.owner || typeof candidate.materialize !== 'function') {
          throw new Error('D1_FACADE_MISMATCH');
        }
        return candidate;
      });
      return this.scope.run(() => this.database.batch<T>(candidates.map((candidate) => candidate.materialize!())));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  exec(_query: string): Promise<D1ExecResult> {
    this.scope.assertOpen();
    return Promise.reject(new Error('D1_OPERATION_UNSUPPORTED'));
  }

  withSession(_constraintOrBookmark?: string): D1DatabaseSession {
    this.scope.assertOpen();
    throw new Error('D1_OPERATION_UNSUPPORTED');
  }

  dump(): Promise<ArrayBuffer> {
    this.scope.assertOpen();
    return Promise.reject(new Error('D1_OPERATION_UNSUPPORTED'));
  }
}

class TrackedPreparedStatement implements FacadeStatement {
  readonly [FACADE_OWNER]: symbol;

  constructor(
    private readonly database: D1Database,
    private readonly scope: WorkScope,
    owner: symbol,
    private readonly query: string,
    private readonly values: readonly unknown[] = [],
  ) {
    this[FACADE_OWNER] = owner;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    this.scope.assertOpen();
    return new TrackedPreparedStatement(this.database, this.scope, this[FACADE_OWNER], this.query, values);
  }

  materialize(): D1PreparedStatement {
    this.scope.assertOpen();
    return this.database.prepare(this.query).bind(...this.values);
  }

  first<T = Record<string, unknown>>(): Promise<T | null>;
  first<T = unknown>(columnName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    return this.scope.run(() => {
      const statement = this.materialize();
      return columnName === undefined ? statement.first<T>() : statement.first<T>(columnName);
    });
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.scope.run(() => this.materialize().run<T>());
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.scope.run(() => this.materialize().all<T>());
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
    return this.scope.run(async () => {
      const statement = this.materialize();
      return options?.columnNames
        ? await statement.raw<T>({ columnNames: true }) as unknown as T[]
        : await statement.raw<T>(options as { columnNames?: false });
    });
  }
}
