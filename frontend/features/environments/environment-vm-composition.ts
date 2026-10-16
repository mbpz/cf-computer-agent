import type { Fetcher } from '../../lib/api';
import type { AccountNetworkOwner } from './account-network-owner.mjs';
import type { AccountVmRuntime } from './account-vm-runtime.mjs';
import type { CheckpointStore } from './storage/checkpoints.mjs';

/** This version deliberately ships no VM engine or guest images: the six pinned
 * boot artifacts total ≈66 MiB and their pins grant no redistribution permission,
 * so the product decision is to keep `/environments` metadata-only for now. A
 * production `VmSession` worker entry is therefore an explicit exclusion, not
 * pending work. Every composition still fails closed with this code instead of
 * inventing a session: G0 runs first, and a start can only ever end in a reported
 * failure, never in a claimed running environment. The engine modules and images
 * stay in the tree, unmounted. */
export const VM_SESSION_UNAVAILABLE = 'VM_SESSION_UNAVAILABLE';

export interface EnvironmentVmComposition {
  readonly runtime: AccountVmRuntime;
  readonly checkpoints: CheckpointStore;
}

/** Composes the one account-scoped VM runtime the environment page mounts.
 *
 * All VM modules load through dynamic imports so the emitted eager graph never
 * contains them (see `scripts/browser-vm-build-isolation.mjs`). The returned
 * runtime is stable for one `owner`; callers must not re-create it per render.
 * `requester` is a raw fetch-like (`Fetcher`), not `apiFetch`: `apiFetch` is the
 * wrapper that turns non-2xx responses into typed `ApiRequestError`, and it
 * already wraps the default `fetch` when no requester is supplied.
 * `locks` exists as a dependency-injection seam for tests; production uses the
 * browser's Web Locks manager.
 */
export async function composeEnvironmentVm({ owner, requester, locks }: {
  owner: AccountNetworkOwner; requester?: Fetcher; locks?: Pick<LockManager, 'request'> | null;
}): Promise<EnvironmentVmComposition> {
  const [authenticated, storage, identityModule] = await Promise.all([
    import('./authenticated-vm-runtime'),
    import('./storage/checkpoints.mjs'),
    import('./storage/checkpoint-identity.mjs'),
  ]);
  const identity = await identityModule.alpineCheckpointIdentity();
  const checkpoints = storage.createCheckpointStore({ owner, identity });
  const runtime = authenticated.createAuthenticatedVmRuntime({
    owner,
    checkpoints,
    ...(requester ? { requester } : {}),
    ...(locks !== undefined ? { locks } : {}),
    createSession() { throw Error(VM_SESSION_UNAVAILABLE); },
  });
  return { runtime, checkpoints };
}
