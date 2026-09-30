import { CONNECTOR_HOSTS, isPublicIpv4Destination } from './destination-common.mjs';

// Browser-compatible formal connector transport; no probe capability, host lookup,
// global WebSocket replacement, reconnect, or credential persistence. A VM network
// adapter must supply policy-approved domain CONNECT frames, not v86's raw IPs.
const realClock = {
  wallNow: () => Date.now(), monotonicNow: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id),
};
const names = new Set(CONNECTOR_HOSTS);
const encoder = new TextEncoder();
const fields = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const validTicket = value => typeof value === 'string' && value.length > 0 && value.length <= 8192;
function bytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('Invalid binary message');
}
const invalid = () => { throw new Error('Invalid connector protocol'); };

/** renewTicket(immutableLease, AbortSignal) obtains one NEW member-authorized
 * ticket from the product's fixed-origin API. It must never retry an ambiguous
 * issuance. This transport neither knows nor handles browser session credentials.
 * onFrame receives bounded WISP v1 binary only; onReady fires once after the
 * initial credit. Callback errors revoke the session. close is terminal.
 */
export function createConnectorEgressClient({ url, pairingCode, ticket,
  NativeWebSocket = globalThis.WebSocket, renewTicket, onReady, onFrame, onClose, clock = realClock }) {
  const match = typeof url === 'string' && /^ws:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/connector$/u.exec(url);
  if (!match || Number(match[1]) > 65535 || typeof pairingCode !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(pairingCode)
    || !validTicket(ticket) || [NativeWebSocket, renewTicket, onReady, onFrame, onClose].some(fn => typeof fn !== 'function')) {
    throw new Error('Explicit connector endpoint, authorization and callbacks required');
  }
  let socket, phase = 'connecting', lease, pending, lastId = 0, usedBytes = 0, usedFrames = 0;
  const streams = new Map(), downloads = new Map(), timers = new Set(), queries = new Map();
  let lastQueryId = 0;
  let sampledWall = clock.wallNow(), sampledMono = clock.monotonicNow();
  const now = () => {
    const mono = clock.monotonicNow();
    // Re-anchor after each forward wall jump. Retaining only the initial anchor
    // lets a later rollback extend leases accepted after that jump.
    sampledWall = Math.max(clock.wallNow(), sampledWall + Math.max(0, mono - sampledMono));
    sampledMono = mono; return sampledWall;
  };
  let operationDeadline = clock.monotonicNow() + 5000, operationTimer, expiryTimer, renewalTimer;
  const later = (fn, ms) => { const id = clock.setTimer(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clear = id => { if (timers.delete(id)) clock.clearTimer(id); };
  function finish() {
    if (phase === 'closed') return false;
    phase = 'closed'; pairingCode = ''; ticket = ''; streams.clear(); downloads.clear(); lease = undefined;
    const request = pending; pending = undefined;
    for (const id of timers) clock.clearTimer(id);
    timers.clear(); request?.controller.abort();
    for (const query of queries.values()) query.reject(new Error('Connector DNS ended'));
    queries.clear();
    try { socket?.close(1000); } catch { /* No retry, including failed native close. */ }
    try { onClose(); } catch { /* State is already irreversibly closed. */ }
    return false;
  }
  function live() {
    if (phase === 'closed') return false;
    if ((lease && now() >= lease.expiresAtMs) || (operationDeadline !== undefined && clock.monotonicNow() >= operationDeadline)) return finish();
    return true;
  }
  function charge(size) {
    // Browser WebSocket exposes complete messages, not raw fragments. This local
    // cap is conservative; the connector's raw wire meter remains authoritative.
    if (++usedFrames > 99999 || (usedBytes += size + 14) > 64 * 1024 * 1024 - 139) return finish();
    return true;
  }
  function transmit(value) {
    if (!live() || socket?.readyState !== 1) return finish();
    const body = typeof value === 'object' && !(value instanceof Uint8Array) ? JSON.stringify(value) : value;
    const size = typeof body === 'string' ? encoder.encode(body).length : body.byteLength;
    // No application queue, and no more than all eight permitted upload windows.
    if (!charge(size) || socket.bufferedAmount + size > 8 * 16 * 16389 + 10240) return finish();
    try { socket.send(body); return true; } catch { return finish(); }
  }
  function acceptLease(value) {
    const time = now();
    if (!fields(value, ['leaseId','revision','expiresAtMs','renewAfterMs'])
      || typeof value.leaseId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.leaseId)
      || !integer(value.revision) || value.revision !== (lease ? lease.revision + 1 : 1)
      || !integer(value.expiresAtMs) || value.expiresAtMs <= time || value.expiresAtMs > time + 60000
      || !integer(value.renewAfterMs) || value.renewAfterMs < time || value.renewAfterMs > time + 30000
      || value.renewAfterMs >= value.expiresAtMs
      || (lease && (value.leaseId !== lease.leaseId || value.expiresAtMs <= lease.expiresAtMs || value.renewAfterMs <= lease.renewAfterMs))) return invalid();
    lease = Object.freeze({ ...value });
    clear(expiryTimer); clear(renewalTimer);
    expiryTimer = later(finish, lease.expiresAtMs - now());
    scheduleRenewal();
  }
  function scheduleRenewal() {
    clear(renewalTimer);
    // Timers may fire before a fractional monotonic deadline. Re-arm only the
    // local wakeup, never issue early or extend the independently enforced lease.
    renewalTimer = later(() => {
      if (!live()) return;
      if (now() < lease.renewAfterMs) { scheduleRenewal(); return; }
      startRenewal();
    }, Math.max(1, Math.ceil(lease.renewAfterMs - now())));
  }
  function startRenewal() {
    if (!live()) return;
    if (phase !== 'active' || now() < lease.renewAfterMs) return finish();
    if (pending) return; // Timer and server notification can race for the same lease.
    const request = { controller: new AbortController(), sent: false };
    pending = request; operationDeadline = clock.monotonicNow() + 5000;
    clear(operationTimer); operationTimer = later(finish, 5000);
    void (async () => {
      try {
        const credential = await renewTicket(lease, request.controller.signal);
        if (!live() || pending !== request) return;
        if (!validTicket(credential)) return finish();
        request.sent = true;
        transmit({ type: 'renew', version: 1, ticket: credential });
      } catch { finish(); }
    })();
  }
  function control(frame) {
    if (frame?.version !== 1) return invalid();
    if (phase === 'authenticating' && frame.type === 'ready') {
      if (!fields(frame, ['type','version','forwarding','lease']) || frame.forwarding !== false) return invalid();
      acceptLease(frame.lease); phase = 'enabling';
      transmit({ type: 'start-egress', version: 1, protocol: 'wisp-v1-drain-v1' }); return;
    }
    if (phase === 'enabling' && frame.type === 'egress-ready') {
      if (!fields(frame, ['type','version','protocol','forwarding']) || frame.protocol !== 'wisp-v1-drain-v1' || frame.forwarding !== true) return invalid();
      phase = 'window'; return;
    }
    if (phase === 'active' && frame.type === 'destination-resolved') {
      const query = queries.get(frame.requestId);
      if (!fields(frame, ['type','version','requestId','hostname','address']) || !query
        || frame.hostname !== query.hostname || !isPublicIpv4Destination(frame.address)
        || clock.monotonicNow() >= query.deadline) return invalid();
      queries.delete(frame.requestId); clear(query.timer);
      query.resolve(Object.freeze({ hostname: frame.hostname, address: frame.address })); return;
    }
    if (phase === 'active' && frame.type === 'renewal-needed') {
      if (!fields(frame, ['type','version','leaseId','revision']) || frame.leaseId !== lease.leaseId || frame.revision !== lease.revision) return invalid();
      startRenewal(); return;
    }
    if (phase === 'active' && frame.type === 'renewed' && pending?.sent) {
      if (!fields(frame, ['type','version','forwarding','lease']) || frame.forwarding !== true) return invalid();
      acceptLease(frame.lease);
      const request = pending; pending = undefined; request.controller.abort();
      operationDeadline = undefined; clear(operationTimer); return;
    }
    return invalid();
  }
  function incoming(value) {
    const b = bytes(value);
    if (b.byteLength < 6 || b.byteLength > 16389) return invalid();
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength), id = view.getUint32(1, true);
    if (phase === 'window') {
      if (b[0] !== 3 || id !== 0 || b.length !== 9 || view.getUint32(5,true) !== 16) return invalid();
      phase = 'active'; operationDeadline = undefined; clear(operationTimer);
      onFrame(b.slice().buffer); if (live()) onReady(lease); return;
    }
    if (phase !== 'active' || !id || id > lastId) return invalid();
    if (b[0] === 3) {
      if (b.length !== 9 || view.getUint32(5,true) !== 16) return invalid();
      if (streams.has(id)) { if (streams.get(id) !== 0) return invalid(); streams.set(id,16); }
    } else if (b[0] === 4) {
      if (b.length !== 6 || b[5] !== 2) return invalid();
    } else if (b[0] !== 2) return invalid();
    // A voluntary close can cross data/credit/close already sent by the peer.
    if (!streams.has(id)) return;
    if (b[0] === 4) { streams.delete(id); downloads.delete(id); }
    if (b[0] === 2) {
      const entry = downloads.get(id);
      if (!entry || entry.pending) return invalid();
      entry.bytes += b.length - 5; entry.pending = true;
    }
    onFrame(b.slice().buffer);
  }
  function message(event) {
    if (!live()) return;
    try {
      if (typeof event.data === 'string') {
        if (event.data.length > 10240 || encoder.encode(event.data).length > 10240) return finish();
        if (charge(encoder.encode(event.data).length)) control(JSON.parse(event.data));
      } else {
        const b = bytes(event.data); if (charge(b.byteLength)) incoming(b);
      }
    } catch { finish(); }
  }
  function send(value) {
    if (!live() || phase !== 'active') return finish();
    try {
      const b = bytes(value);
      if (b.length < 6 || b.length > 16389) return finish();
      const view = new DataView(b.buffer,b.byteOffset,b.byteLength), id = view.getUint32(1,true);
      if (!id) return finish();
      if (b[0] === 1) {
        if (b.length < 9 || b.length > 261 || id <= lastId || streams.size >= 8 || b[5] !== 1 || ![80,443].includes(view.getUint16(6,true))
          || !names.has(String.fromCharCode(...b.subarray(8)))) return finish();
        lastId = id; streams.set(id,16); downloads.set(id,{bytes:0,pending:false});
      } else if (b[0] === 2) {
        if (!streams.has(id) || streams.get(id) < 1) return finish();
        streams.set(id,streams.get(id)-1);
      } else if (b[0] === 4 && b.length === 6 && b[5] === 2 && streams.has(id)) { streams.delete(id); downloads.delete(id); }
      else return finish();
      return transmit(b);
    } catch { return finish(); }
  }
  function acknowledge(id) {
    if (!live() || phase !== 'active' || !Number.isInteger(id) || id < 1 || id > lastId) return finish();
    // Final data may still drain from the guest after a formal stream CLOSE.
    if (!streams.has(id)) return true;
    const entry = downloads.get(id);
    if (!entry?.pending) return finish();
    entry.pending = false;
    return transmit({ type: 'downstream-drained', version: 1, streamId: id, bytes: entry.bytes });
  }
  function resolve(hostname) {
    if (!live() || phase !== 'active' || !names.has(hostname) || queries.size >= 3 || lastQueryId >= 0xffffffff) {
      finish(); return Promise.reject(new Error('Connector DNS denied'));
    }
    return new Promise((resolve, reject) => {
      const requestId = ++lastQueryId;
      queries.set(requestId, { hostname, resolve, reject, deadline: clock.monotonicNow() + 5000, timer: later(finish,5000) });
      transmit({ type: 'resolve-destination', version: 1, requestId, hostname });
    });
  }
  operationTimer = later(finish,5000);
  try {
    socket = new NativeWebSocket(url); socket.binaryType = 'arraybuffer';
    socket.addEventListener('open', () => {
      if (!live()) return;
      if (phase !== 'connecting') return finish();
      phase = 'authenticating';
      const frame = { type: 'authenticate', version: 1, pairingCode, ticket };
      pairingCode = ''; ticket = ''; transmit(frame);
    });
    socket.addEventListener('message', message);
    socket.addEventListener('error', finish); socket.addEventListener('close', finish);
  } catch { finish(); }
  return Object.freeze({ send, resolve, acknowledge, close: finish, get readyState() { return phase === 'closed' ? 3 : phase === 'active' ? 1 : 0; } });
}
