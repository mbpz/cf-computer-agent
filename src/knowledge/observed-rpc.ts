import { AppError } from '../http';
import { observeStorage, type StorageObserver } from '../maintenance/storage';
import type { RpcResult } from './types';

/** Raw transport rejection and caught remote storage failure are independent
 * of the successful RPC's domain result. Map domain errors only after this.
 */
export function observeKnowledgeRpc<T>(observer: StorageObserver | undefined, factory: () => Promise<RpcResult<T>>): Promise<RpcResult<T>> {
  return observeStorage(observer, async () => {
    const result = await factory();
    if (result.storageUncertain) observer?.markUncertain('STORAGE_RESULT_UNCERTAIN');
    return result;
  });
}

/** Per-invocation evidence on the DO side; no permit or mutable observer crosses
 * RPC. A fixed boolean survives domain-error mapping without exposing details.
 */
export async function captureKnowledgeRpc<T>(operation: (observer: StorageObserver) => Promise<T>): Promise<RpcResult<T>> {
  let uncertain = false;
  const observer: StorageObserver = {
    async run(factory) {
      try { return await factory(); }
      catch (error) { uncertain = true; throw error; }
    },
    markUncertain() { uncertain = true; },
  };
  let result: RpcResult<T>;
  try { result = { ok: true, value: await operation(observer) }; }
  catch (error) {
    if (!(error instanceof AppError)) throw error;
    result = { ok: false, error: { code: error.code, message: error.message, status: error.status, retryable: error.retryable } };
  }
  return uncertain ? { ...result, storageUncertain: true } : result;
}
