import type { WorkScope } from './lifecycle';
import { AppError } from '../http';

/** Register the entire task before starting it, before business-level catches. */
export function runWork<T>(scope: WorkScope | undefined, factory: () => Promise<T>): Promise<T> {
  return scope ? scope.run(factory) : factory();
}

/** Track each complete I/O branch, including work after its first await. */
export function parallelWork<T extends readonly unknown[]>(
  scope: WorkScope | undefined,
  factories: { [K in keyof T]: () => Promise<T[K]> },
): Promise<T>;
export async function parallelWork(
  scope: WorkScope | undefined,
  factories: readonly (() => Promise<unknown>)[],
): Promise<unknown[]> {
  if (!scope) return Promise.all(factories.map(factory => factory()));
  const branches = factories.map(factory => scope.run(async () => {
    try { return { ok: true as const, value: await factory() }; }
    catch (error) {
      // Expected business denials are not uncertain storage completion. Raw D1
      // failures are independently observed by the facade, before translation.
      if (error instanceof AppError && error.status < 500) return { ok: false as const, error };
      throw error;
    }
  }).then(result => {
    if (!result.ok) throw result.error;
    return result.value;
  }));
  try { return await Promise.all(branches); }
  catch (error) {
    // Keep request-owned resources alive until every sibling has settled;
    // otherwise app finally/dispose can invalidate a still-running branch.
    await Promise.allSettled(branches);
    throw error;
  }
}
