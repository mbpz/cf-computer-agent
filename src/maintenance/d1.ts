import type { WorkScope } from './lifecycle';

function isResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return result.success === true && Array.isArray(result.results)
    && typeof result.meta === 'object' && result.meta !== null;
}

/** Request-local facade; native handles never leave this closure. */
export function createD1Facade(database: D1Database, scope: WorkScope): D1Database {
  const nativeStatements = new WeakMap<D1PreparedStatement, D1PreparedStatement>();

  function execute<T>(factory: () => Promise<T>, valid?: (value: unknown) => boolean): Promise<T> {
    scope.assertOpen();
    // run registers before invoking factory, including synchronous native throws.
    // Validate inside that lifetime, before it can settle and seal the scope.
    return scope.run(async () => {
      const value = await factory();
      if (valid && !valid(value)) scope.markUncertain('D1_RESULT_INVALID');
      return value;
    });
  }

  function wrap(native: D1PreparedStatement): D1PreparedStatement {
    function first<T = unknown>(column: string): Promise<T | null>;
    function first<T = Record<string, unknown>>(): Promise<T | null>;
    function first<T>(column?: string): Promise<T | null> {
      return execute(() => column === undefined ? native.first<T>() : native.first<T>(column));
    }

    function raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
    function raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
    function raw<T>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
      return execute<T[] | [string[], ...T[]]>(() => {
        if (options?.columnNames === true) return native.raw<T>({ columnNames: true });
        return options === undefined ? native.raw<T>() : native.raw<T>({ columnNames: options.columnNames });
      });
    }

    const statement: D1PreparedStatement = {
      bind(...values: unknown[]) {
        scope.assertOpen();
        return wrap(native.bind(...values));
      },
      first,
      run<T = Record<string, unknown>>() { return execute(() => native.run<T>(), isResult); },
      all<T = Record<string, unknown>>() { return execute(() => native.all<T>(), isResult); },
      raw,
    };
    nativeStatements.set(statement, native);
    return statement;
  }

  function unsupported(): never {
    scope.assertOpen();
    throw new Error('D1_API_UNSUPPORTED');
  }

  return {
    prepare(query: string) {
      scope.assertOpen();
      return wrap(database.prepare(query));
    },
    batch<T = unknown>(statements: D1PreparedStatement[]) {
      scope.assertOpen();
      // Validate every handle before dispatch; never pass raw/foreign statements.
      const native = statements.map(statement => {
        const handle = nativeStatements.get(statement);
        if (!handle) throw new Error('D1_STATEMENT_SCOPE_MISMATCH');
        return handle;
      });
      return execute(() => database.batch<T>(native), value => Array.isArray(value) && value.every(isResult));
    },
    exec: unsupported,
    withSession: unsupported,
    dump: unsupported,
  };
}
