import { createAccountVmNetwork } from './account-network.mjs';
let epoch = 0;

/** Account lifetime of network handles; not a VM engine/storage owner.
 * No connection is opened until a caller explicitly calls network.connect().
 * An HTTP shell can own an empty registry, but network() still requires HTTPS.
 * Disposal is terminal, including failed logout. A new verified session must
 * create a fresh owner; old callbacks and handles are never revived.
 */
export function createAccountNetworkOwner({ origin, memberId, events, requester, NativeWebSocket, clock }) {
  if (typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin)
    || new URL(origin).origin !== origin || typeof memberId !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(memberId)) throw new Error('INVALID_SCOPE');
  const scope = Object.freeze({ origin, memberId, sessionEpoch: ++epoch });
  const controller = new AbortController(), networks = new Map(), removed = new Set();
  function dispose() {
    if (controller.signal.aborted) return;
    // Invalidate every callback before releasing resources that may re-enter.
    controller.abort();
    events?.removeEventListener('pagehide', dispose);
    const pending = [...networks.values()]; networks.clear();
    for (const network of pending) network.dispose();
  }
  events?.addEventListener('pagehide', dispose);
  return Object.freeze({ scope, signal: controller.signal, dispose,
    network(environmentId) {
      if (controller.signal.aborted) throw new Error('ACCOUNT_CLOSED');
      if (removed.has(environmentId)) throw new Error('ENVIRONMENT_REMOVED');
      if (!networks.has(environmentId)) networks.set(environmentId, createAccountVmNetwork({
        environmentId, scope, isCurrent: candidate => !controller.signal.aborted && candidate.sessionEpoch === scope.sessionEpoch,
        events, requester, NativeWebSocket, clock,
      }));
      return networks.get(environmentId);
    },
    removeEnvironment(environmentId) {
      removed.add(environmentId);
      const network = networks.get(environmentId); networks.delete(environmentId);
      network?.dispose();
    },
  });
}
