import type { WorkScope } from './lifecycle';

function isResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return result.success === true && Array.isArray(result.results)
    && typeof result.meta === 'object' && result.meta !== null;
}

/** Request-local facade; native handles never leave this closure. */
export function createD1Facade(database: D1Database, scope: WorkScope): D1Database {
  return scopedDatabase(database, scope, false);
}

/** Compatibility entry for existing callers, with the same closure-private handles. */
export function createD1DatabaseFacade(database: D1Database, scope: WorkScope): D1Database {
  return scopedDatabase(database, scope, true);
}

function scopedDatabase(database: D1Database, scope: WorkScope, legacyErrors: boolean): D1Database {
  const nativeStatements = new WeakMap<D1PreparedStatement, () => D1PreparedStatement>();

  function execute<T>(factory: () => Promise<T>, valid?: (value: unknown) => boolean): Promise<T> {
    // The request-local API fences synchronously; legacy callers consume rejections.
    if (!legacyErrors) scope.assertOpen();
    // run registers before invoking factory, including synchronous native throws.
    // Validate inside that lifetime, before it can settle and seal the scope.
    return scope.run(async () => {
      const value = await factory();
      if (valid && !valid(value)) scope.markUncertain('D1_RESULT_INVALID');
      return value;
    });
  }

  function wrap(materialize: () => D1PreparedStatement): D1PreparedStatement {
    function first<T = unknown>(column: string): Promise<T | null>;
    function first<T = Record<string, unknown>>(): Promise<T | null>;
    function first<T>(column?: string): Promise<T | null> {
      return execute(() => column === undefined ? materialize().first<T>() : materialize().first<T>(column));
    }

    function raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
    function raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
    function raw<T>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
      return execute<T[] | [string[], ...T[]]>(() => {
        if (options?.columnNames === true) return materialize().raw<T>({ columnNames: true });
        return options === undefined ? materialize().raw<T>() : materialize().raw<T>({ columnNames: options.columnNames });
      });
    }

    const statement: D1PreparedStatement = {
      bind(...values: unknown[]) {
        scope.assertOpen();
        return wrap(() => materialize().bind(...values));
      },
      first,
      run<T = Record<string, unknown>>() { return execute(() => materialize().run<T>(), isResult); },
      all<T = Record<string, unknown>>() { return execute(() => materialize().all<T>(), isResult); },
      raw,
    };
    nativeStatements.set(statement, materialize);
    return statement;
  }

  function unsupported(): never {
    scope.assertOpen();
    throw new Error(legacyErrors ? 'D1_OPERATION_UNSUPPORTED' : 'D1_API_UNSUPPORTED');
  }

  return {
    prepare(query: string) {
      scope.assertOpen();
      if (typeof query !== 'string') throw new TypeError('D1_QUERY_INVALID');
      return wrap(() => database.prepare(query).bind());
    },
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      try {
        scope.assertOpen();
        // Validate every handle before dispatch; never pass raw/foreign statements.
        const native = statements.map(statement => {
          const handle = nativeStatements.get(statement);
          if (!handle) throw new Error(legacyErrors ? 'D1_FACADE_MISMATCH' : 'D1_STATEMENT_SCOPE_MISMATCH');
          return handle;
        });
        return execute(() => database.batch<T>(native.map(materialize => materialize())), value => Array.isArray(value) && value.every(isResult));
      } catch (error) {
        if (legacyErrors) return Promise.reject(error);
        throw error;
      }
    },
    async exec() { return unsupported(); },
    withSession: unsupported,
    async dump() { return unsupported(); },
  };
}
