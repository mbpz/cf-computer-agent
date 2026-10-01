import { createAccountVmNetwork } from './account-network.mjs';
let epoch = 0;

/** Account lifetime of network handles; not a VM engine/storage owner.
 * No connection is opened until a caller explicitly calls network.connect().
 * An HTTP shell can own an empty registry, but network() still requires HTTPS.
 * Disposal is terminal, including failed logout. A new verified session must
 * create a fresh owner; old callbacks and handles are never revived.
 */
export function createAccountNetworkOwner({ origin, memberId, events, requester, NativeWebSocket, clock, createChannel }) {
  if (typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin)
    || new URL(origin).origin !== origin || typeof memberId !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(memberId)) throw new Error('INVALID_SCOPE');
  const scope = Object.freeze({ origin, memberId, sessionEpoch: ++epoch });
  const controller = new AbortController(), networks = new Map(), removed = new Set(), removalListeners = new Set();
  // Messages are untrusted invalidation hints, never deletion or authorization.
  const channel = createChannel?.('memory-garden-account-invalidation-v1');
  function receive(event) {
    const data = event.data;
    if (data && data.v === 1 && data.kind === 'invalidate'
      && data.origin === origin && data.memberId === memberId) dispose();
  }
  channel?.addEventListener('message', receive);
  function broadcast() {
    try { channel?.postMessage({v: 1, kind: 'invalidate', origin, memberId}); }
    catch { /* Local revocation must still succeed if channel delivery fails. */ }
  }
  function revoke() { if (!controller.signal.aborted) { broadcast(); dispose(); } }
  function assertEnvironment(environmentId, invalidCode = 'INVALID_ENVIRONMENT') {
    if (typeof environmentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(environmentId)) throw new Error(invalidCode);
    if (controller.signal.aborted) throw new Error('ACCOUNT_CLOSED');
    if (removed.has(environmentId)) throw new Error('ENVIRONMENT_REMOVED');
  }
  function dispose() {
    if (controller.signal.aborted) return;
    // Invalidate every callback before releasing resources that may re-enter.
    controller.abort();
    channel?.removeEventListener('message', receive);
    channel?.close();
    removalListeners.clear();
    events?.removeEventListener('pagehide', dispose);
    const pending = [...networks.values()]; networks.clear();
    for (const network of pending) network.dispose();
  }
  events?.addEventListener('pagehide', dispose);
  return Object.freeze({ scope, signal: controller.signal, dispose, revoke, assertEnvironment,
    onEnvironmentRemoved(listener) {
      if (controller.signal.aborted) return () => {};
      removalListeners.add(listener);
      return () => removalListeners.delete(listener);
    },
    disconnectEnvironment(environmentId) { networks.get(environmentId)?.disconnect(); },
    network(environmentId) {
      assertEnvironment(environmentId, 'INVALID_SCOPE');
      if (!networks.has(environmentId)) networks.set(environmentId, createAccountVmNetwork({
        environmentId, scope, isCurrent: candidate => !controller.signal.aborted && candidate.sessionEpoch === scope.sessionEpoch,
        events, requester, NativeWebSocket, clock,
      }));
      return networks.get(environmentId);
    },
    removeEnvironment(environmentId) {
      if (controller.signal.aborted) return;
      if (typeof environmentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(environmentId)) throw Error('INVALID_ENVIRONMENT');
      broadcast();
      removed.add(environmentId);
      for (const listener of removalListeners) {
        try { listener(environmentId); } catch { /* One subscriber cannot prevent invalidation. */ }
      }
      const network = networks.get(environmentId); networks.delete(environmentId);
      network?.dispose();
    },
  });
}
