import { apiFetch, ApiRequestError, type Fetcher } from '../../../lib/api';
import { reconcileDeletedEnvironments } from '../deletion-reconciler';
import type { AccountNetworkOwner } from '../account-network-owner.mjs';
import type { AccountVmRuntime } from '../account-vm-runtime.mjs';
import type { CheckpointStore } from './checkpoints.mjs';

/** Explicit authenticated reconciliation, not a background scheduler. Call before
 * formal start/restore once that mounting passes G0. Only server tombstones allow
 * deletion: absence from a filtered/paginated environment list never does.
 * A complete receipt means the local transaction committed, not physical erasure.
 */
export async function reconcileAccountCheckpoints({owner,checkpoints,runtime,requester,timeoutMs=10000}: {
  owner: AccountNetworkOwner; checkpoints: CheckpointStore; runtime: AccountVmRuntime;
  requester?: Fetcher; timeoutMs?: number;
}) {
  // Require the very same verified account lifetime, not just a matching member ID.
  if (checkpoints.scope !== owner.scope) throw Error('INVALID_CHECKPOINT_SCOPE');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw Error('INVALID_TIMEOUT');
  return reconcileDeletedEnvironments({
    ...owner.scope, signal:owner.signal,
    isCurrent:scope=>!owner.signal.aborted && scope.sessionEpoch===owner.scope.sessionEpoch,
    async fetchPage({page,pageSize,signal}) {
      const deadline=new AbortController(), timer=setTimeout(()=>deadline.abort(),timeoutMs);
      const cancel=AbortSignal.any([signal,deadline.signal]);let abort=()=>{};
      try {
        return await Promise.race([
          apiFetch<unknown>(`/api/environments/tombstones?page=${page}&pageSize=${pageSize}`,{
            method:'GET',requester,signal:cancel,redirect:'error',cache:'no-store',
          }),
          new Promise<never>((_,reject)=>{abort=()=>reject(Error('CANCELLED'));cancel.addEventListener('abort',abort,{once:true});if(cancel.aborted)abort();}),
        ]);
      } catch(error) {
        if (error instanceof ApiRequestError && [401,403].includes(error.status)) owner.revoke();
        throw error;
      } finally {clearTimeout(timer);cancel.removeEventListener('abort',abort);}
    },
    async removeLocalCopy({environmentId,assertCurrent}) {
      assertCurrent();owner.removeEnvironment(environmentId);
      // Invalidating the owner stops only the affected VM, never another environment.
      if(runtime.getSnapshot().environmentId===environmentId)await runtime.stop();
      assertCurrent();await checkpoints.remove(environmentId);assertCurrent();
    },
  });
}
