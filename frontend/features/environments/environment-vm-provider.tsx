import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AccountVmRuntime } from './account-vm-runtime.mjs';
import { useAccountNetworkOwner } from './account-network-boundary';
import { reconcileAccountCheckpoints } from './storage/reconcile-checkpoints';
import { composeEnvironmentVm, type EnvironmentVmComposition } from './environment-vm-composition';

/** The page never claims a running environment: `ready` only means the account's
 * runtime object exists, and this version deliberately ships no VM engine or guest
 * images, so `VM_SESSION_UNAVAILABLE` makes every start fail closed. */
export type EnvironmentVmState =
  | { readonly status: 'preparing' }
  | { readonly status: 'ready'; readonly runtime: AccountVmRuntime }
  | { readonly status: 'unavailable'; readonly reason: string };

const loading: EnvironmentVmState = { status: 'preparing' };
const EnvironmentVmContext = createContext<EnvironmentVmState>(loading);

export function useEnvironmentVm(): EnvironmentVmState {
  return useContext(EnvironmentVmContext);
}

/** Owns exactly one `AccountVmRuntime` per account lifetime. The owner comes from
 * `AccountNetworkBoundary`, so a member change disposes it and rebinds both the
 * runtime and the checkpoint store. The runtime reference is stable across
 * renders, which `FilesPanel` requires. */
export function EnvironmentVmProvider({ children }: { children: ReactNode }) {
  const owner = useAccountNetworkOwner();
  const [state, setState] = useState<EnvironmentVmState>(loading);
  useEffect(() => {
    let cancelled = false;
    let composition: EnvironmentVmComposition | undefined;
    setState(loading);
    void (async () => {
      try {
        const next = await composeEnvironmentVm({ owner });
        if (cancelled) { next.checkpoints.close(); await next.runtime.stop().catch(() => {}); return; }
        composition = next;
        setState({ status: 'ready', runtime: next.runtime });
        // Only server tombstones may delete local checkpoints; absence from a
        // filtered or paginated list never does.
        await reconcileAccountCheckpoints({ owner, checkpoints: next.checkpoints, runtime: next.runtime }).catch(() => {});
      } catch (error) {
        if (!cancelled) setState({ status: 'unavailable', reason: error instanceof Error ? error.message : 'VM_RUNTIME_UNAVAILABLE' });
      }
    })();
    return () => {
      cancelled = true;
      if (!composition) return;
      composition.checkpoints.close();
      void composition.runtime.stop().catch(() => {});
    };
  }, [owner]);
  return <EnvironmentVmContext.Provider value={state}>{children}</EnvironmentVmContext.Provider>;
}
