// Execute actual D1 operations, but deterministically place one writer between
// database calls. A batch remains indivisible; statements outside it do not.
export function writeAfterFirstRead(db: D1Database, write: () => Promise<void>): D1Database {
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  let queue = Promise.resolve();
  let written = false;
  function schedule<T>(read: () => Promise<T>): Promise<T> {
    const next = queue.then(async () => {
      const result = await read();
      if (!written) { written = true; await write(); }
      return result;
    });
    queue = next.then(() => undefined, () => undefined);
    return next;
  }
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const wrapped = new Proxy(statement, {
      get(target, key) {
        if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
        if (key === "all") return () => schedule(() => target.all());
        if (key === "first") return (column?: string) => schedule(() => column === undefined ? target.first() : target.first(column));
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    originals.set(wrapped, statement);
    return wrapped;
  }
  return new Proxy(db, {
    get(target, key) {
      if (key === "prepare") return (sql: string) => wrap(target.prepare(sql));
      if (key === "batch") return (statements: D1PreparedStatement[]) =>
        schedule(() => target.batch(statements.map((statement) => originals.get(statement) ?? statement)));
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
