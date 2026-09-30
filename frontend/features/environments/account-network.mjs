import { createVmNetworkLifecycle } from './network-lifecycle.mjs';
import { createVmConnectorSession } from './connector-session.mjs';

const systemClock = {
  monotonicNow: () => performance.now(), wallNow: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id),
};
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const error = code => new Error(code);

// A transport that ignores AbortSignal must not retain the UI's pending action.
function cancellable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(error('NETWORK_CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
async function readJson(response, signal) {
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw error(`NETWORK_API_${response.status}`); // Never expose server response text/tickets.
  }
  const reader = response.body?.getReader();
  if (!reader) throw error('INVALID_RESPONSE');
  let text = '', bytes = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const { done, value } = await cancellable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16384) throw error('INVALID_RESPONSE');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (cause) {
    if (signal.aborted) throw error('NETWORK_CANCELLED');
    throw error('INVALID_RESPONSE');
  } finally {
    void reader.cancel().catch(() => {});
  }
}
function validateAuthority(value, origin) {
  if (!object(value) || !identifier(value.runtimeId) || !identifier(value.connectorId)
    || !Number.isSafeInteger(value.generation) || value.generation < 1
    || value.origin !== origin || typeof value.policyVersion !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.policyVersion)
    || !['active', 'revoked'].includes(value.state)) throw error('INVALID_AUTHORITY');
  return value;
}

/** One immutable account epoch + environment owns this network runtime.
 * The caller supplies the current authenticated scope and invalidates on account
 * changes; backend cookies remain the authority. No member identity is sent in
 * payloads. Manual pairing only. No localStorage, guest commands or auto retries.
 * attach() requires a fresh paused engine, including after snapshot restoration.
 */
export function createAccountVmNetwork({ environmentId, scope, isCurrent, events,
  requester = fetch, NativeWebSocket, clock = systemClock, onState = () => {},
  operationId = () => crypto.randomUUID() }) {
  if (!identifier(environmentId) || !object(scope) || !identifier(scope.memberId)
    || !Number.isSafeInteger(scope.sessionEpoch) || scope.sessionEpoch < 0
    || typeof isCurrent !== 'function' || typeof scope.origin !== 'string'
    || !/^https:\/\//.test(scope.origin) || new URL(scope.origin).origin !== scope.origin) throw error('INVALID_SCOPE');
  const account = Object.freeze({ origin: scope.origin, memberId: scope.memberId, sessionEpoch: scope.sessionEpoch });
  const base = `/api/environments/${environmentId}/`;
  let active, disposed = false, state = Object.freeze({ status: 'offline', reason: 'initial' });
  const publish = (status, reason) => {
    state = Object.freeze({ status, reason });
    try { onState(state); } catch { /* Rendering cannot prevent cancellation. */ }
  };
  const lifecycle = createVmNetworkLifecycle({ clock, onState(next) {
    if (!active) return;
    if (next.status === 'offline' || next.status === 'closed') stop(next.reason, next.status === 'closed');
    else if (next.status === 'connected' && clock.monotonicNow() >= active.deadline) stop('connection-timeout');
    else publish(next.status, next.reason);
  } });
  function stop(reason, terminal = false) {
    if (disposed) return;
    disposed = terminal;
    const attempt = active; active = undefined;
    if (attempt) { clock.clearTimer(attempt.timer); attempt.controller.abort(); }
    if (terminal) {
      events?.removeEventListener('offline', offline);
      events?.removeEventListener('pagehide', pagehide);
      lifecycle.dispose();
    } else lifecycle.disconnect();
    publish(terminal ? 'closed' : 'offline', reason);
  }
  function assertCurrent(attempt) {
    if (!isCurrent(account)) { stop('account-changed', true); throw error('ACCOUNT_CHANGED'); }
    if (disposed || active !== attempt || attempt.controller.signal.aborted) throw error('NETWORK_CANCELLED');
    if (!attempt.established && clock.monotonicNow() >= attempt.deadline) {
      stop('connection-timeout'); throw error('NETWORK_CANCELLED');
    }
  }
  async function request(attempt, path, body, extraSignal) {
    assertCurrent(attempt);
    const signal = extraSignal ? AbortSignal.any([attempt.controller.signal, extraSignal]) : attempt.controller.signal;
    if (signal.aborted) throw error('NETWORK_CANCELLED');
    const response = await cancellable(requester(base + path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      redirect: 'error', cache: 'no-store', signal,
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), signal);
    assertCurrent(attempt);
    const value = await readJson(response, signal);
    assertCurrent(attempt);
    return value;
  }
  const ticket = value => {
    if (!object(value) || typeof value.ticket !== 'string' || value.ticket.length < 1 || value.ticket.length > 8192) throw error('INVALID_RESPONSE');
    return value.ticket;
  };
  async function connect({ port, connectorId, pairingCode } = {}) {
    if (disposed) throw error('NETWORK_CLOSED');
    if (active) throw error('NETWORK_BUSY');
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || !identifier(connectorId)
      || typeof pairingCode !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(pairingCode)) throw error('INVALID_CONNECTOR');
    const attempt = { controller: new AbortController(), deadline: clock.monotonicNow() + 10000 };
    active = attempt;
    attempt.timer = clock.setTimer(() => { if (active === attempt) stop('connection-timeout'); }, 10000);
    publish('connecting', 'reserving');
    try {
      const current = await request(attempt, 'connector-authority');
      if (!object(current) || !Object.hasOwn(current, 'authority')) throw error('INVALID_AUTHORITY');
      const expectedGeneration = current.authority === null ? 0 : validateAuthority(current.authority, account.origin).generation;
      const reserved = await request(attempt, 'connector-authority', { operationId: operationId(), connectorId, expectedGeneration });
      const authority = validateAuthority(reserved?.authority, account.origin);
      if (authority.generation !== expectedGeneration + 1 || authority.connectorId !== connectorId || authority.state !== 'active') throw error('INVALID_AUTHORITY');
      const binding = { runtimeId: authority.runtimeId, generation: authority.generation };
      await lifecycle.connect({ ...binding, open({ signal, onClose }) {
        attempt.session = createVmConnectorSession({ signal, onClose, NativeWebSocket, clock,
          authorize: async () => ({ url: `ws://127.0.0.1:${port}/connector`, pairingCode,
            ticket: ticket(await request(attempt, 'connector-tickets', { ...binding, operationId: operationId() })) }),
          renewTicket: async (lease, leaseSignal) => ticket(await request(attempt, 'connector-renewals', {
            ...binding, leaseId: lease.leaseId, operationId: operationId(),
          }, leaseSignal)),
        });
        return attempt.session;
      } });
      assertCurrent(attempt);
      attempt.established = true;
      clock.clearTimer(attempt.timer);
      return state;
    } catch (cause) {
      if (active === attempt) stop('connection-failed');
      // Only locally generated error codes are safe to show; fetch errors can contain URLs.
      if (/^(ACCOUNT_CHANGED|NETWORK_(CANCELLED|API_[0-9]{3})|INVALID_(AUTHORITY|RESPONSE))$/.test(cause?.message)) throw cause;
      throw error('NETWORK_CONNECTION_FAILED');
    } finally { pairingCode = ''; }
  }
  function attach(machine) {
    if (!active) throw error('NETWORK_NOT_READY');
    assertCurrent(active);
    active.session?.attach(machine);
    if (!active?.session) throw error('NETWORK_NOT_READY');
  }
  const offline = () => stop('browser-offline');
  const pagehide = () => stop('page-hidden', true);
  events?.addEventListener('offline', offline);
  events?.addEventListener('pagehide', pagehide);
  return Object.freeze({ connect, attach, disconnect: () => stop('user-disconnect'),
    beforeRestore: () => stop('snapshot-restore'), dispose: () => stop('disposed', true), get state() { return state; } });
}
