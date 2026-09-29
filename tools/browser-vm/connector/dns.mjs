import { CONNECTOR_HOSTS, isPublicIpv4Destination } from './destination-common.mjs';
import { createDestinationResolver } from './destination-policy.mjs';

const names = new Set(CONNECTOR_HOSTS);
const realClock = { monotonicNow: () => performance.now(), setTimer: setTimeout, clearTimer: clearTimeout };

/** Lease-scoped name association only. TCP CONNECT must still carry a domain and
 * independently resolve/pin its destination; this answer never authorizes IP dial.
 */
export function createConnectorDns({ authority, resolveDestination = createDestinationResolver(), clock = realClock, onAnswer }) {
  const pending = new Map();
  let closed = false, lastId = 0;
  function release(record) {
    if (!pending.delete(record.id)) return;
    clock.clearTimer(record.timer); record.untrack?.(); record.controller.abort();
  }
  function close() {
    if (closed) return;
    closed = true;
    for (const record of [...pending.values()]) release(record);
    authority.close();
  }
  function request(frame) {
    if (closed) return;
    if (!authority.isActive() || !frame || Object.getPrototypeOf(frame) !== Object.prototype
      || Reflect.ownKeys(frame).length !== 4
      || !['type','version','requestId','hostname'].every(key => Object.hasOwn(frame, key))
      || frame.type !== 'resolve-destination' || frame.version !== 1
      || !Number.isSafeInteger(frame.requestId) || frame.requestId <= lastId || frame.requestId > 0xffffffff
      || !names.has(frame.hostname) || pending.size >= 3) return close();
    const record = { id: frame.requestId, hostname: frame.hostname, controller: new AbortController(), deadline: clock.monotonicNow() + 5000 };
    lastId = record.id; pending.set(record.id, record);
    try {
      record.untrack = authority.track(() => close());
      record.timer = clock.setTimer(close, 5000);
      // Invoke synchronously after claiming the shared resource, so coalesced
      // invalid controls cannot sneak additional DNS work through a later await.
      const result = resolveDestination({ hostname: record.hostname, port: 443 }, record.controller.signal);
      void Promise.resolve(result).then(pin => {
        if (closed || !pending.has(record.id)) return;
        if (!authority.isActive() || clock.monotonicNow() >= record.deadline
          || pin?.hostname !== record.hostname || pin.port !== 443 || pin.family !== 4
          || !isPublicIpv4Destination(pin.address)) return close();
        release(record);
        onAnswer({ type: 'destination-resolved', version: 1, requestId: record.id, hostname: record.hostname, address: pin.address });
      }).catch(close);
    } catch { close(); }
  }
  return Object.freeze({ request, close });
}
