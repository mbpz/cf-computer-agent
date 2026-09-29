import { connect, isIP } from 'node:net';
import { createDestinationResolver, isPublicDestinationAddress } from './destination-policy.mjs';

const MAX_STREAMS = 8, WINDOW = 16, MAX_CHUNK = 16 * 1024;
const MAX_BYTES = 64 * 1024 * 1024, MAX_FRAMES = 100_000;
const CONNECT_TIMEOUT = 5000, IDLE_TIMEOUT = 15_000;
const realClock = { monotonicNow: () => performance.now(), setTimer: setTimeout, clearTimer: clearTimeout };
const ignoreFailure = action => { try { action(); } catch { /* Never prevent release of other resources. */ } };

/** Host-only composition: the browser cannot supply dial, resolver, clock or authority.
 * open/write returning true means accepted within bounds, not connected or delivered.
 * onReady reports remaining upload credits; onCredit replaces the upload window; onData resolves only after downstream send.
 * Each stream is registered with the existing hard-lease authority BEFORE DNS starts.
 */
export function createConnectorStreams({
  authority, resolveDestination = createDestinationResolver(), dial = connect, clock = realClock,
  onReady, onData, onCredit, onClose,
}) {
  const streams = new Map();
  let stopped = false, lastId = 0, bytes = 0, frames = 0;
  function active() {
    if (stopped) return false;
    try { if (authority.isActive()) return true; } catch { /* fail closed */ }
    close(); return false;
  }
  function account(size = 0) {
    if (stopped) return false;
    if (bytes + size > MAX_BYTES || frames + 1 > MAX_FRAMES) { close(); return false; }
    bytes += size; frames++; return true;
  }
  function notify(callback, ...args) {
    try { callback(...args); return !stopped; } catch { close(); return false; }
  }
  function dispose(stream, reason) {
    if (stream.closed) return;
    stream.closed = true; streams.delete(stream.id);
    ignoreFailure(() => stream.abort.abort());
    ignoreFailure(() => clock.clearTimer(stream.timer));
    ignoreFailure(() => stream.unregister?.());
    stream.queue.length = 0;
    ignoreFailure(() => stream.socket?.pause());
    ignoreFailure(() => stream.socket?.destroy());
    // No arbitrary DNS/socket/transport diagnostics are exposed to the peer.
    if (!stopped && !account()) return;
    notify(onClose, stream.id, reason);
  }
  function close() {
    if (stopped) return;
    stopped = true;
    // Revoke authority before cleanup callbacks can attempt more transport output.
    ignoreFailure(() => authority.close());
    for (const stream of [...streams.values()]) dispose(stream, 'closed');
  }
  function live(stream) {
    if (stream.closed || !active()) return false;
    if (stream.deadline !== undefined && clock.monotonicNow() >= stream.deadline) {
      dispose(stream, 'timeout'); return false;
    }
    return true;
  }
  function arm(stream, duration) {
    clock.clearTimer(stream.timer);
    stream.deadline = clock.monotonicNow() + duration;
    stream.timer = clock.setTimer(() => {
      if (!stream.closed) dispose(stream, 'timeout');
    }, duration);
  }
  function progress(stream) { arm(stream, IDLE_TIMEOUT); }
  function replenish(stream) {
    if (!live(stream) || !stream.connected || stream.blocked || stream.queue.length || stream.pendingWrites || stream.credits !== 0) return;
    if (!account()) return;
    stream.credits = WINDOW;
    notify(onCredit, stream.id, WINDOW);
  }
  function flush(stream) {
    if (!live(stream) || !stream.connected || stream.flushing) return;
    stream.flushing = true;
    try {
      while (live(stream) && !stream.blocked && stream.queue.length) {
        const chunk = stream.queue.shift();
        stream.pendingWrites++;
        // Defer completion handling until write() has returned its backpressure signal,
        // even if an injected transport completes synchronously.
        const accepted = stream.socket.write(chunk, error => queueMicrotask(() => {
          if (!live(stream)) return;
          stream.pendingWrites--;
          if (error) { dispose(stream, 'io'); return; }
          progress(stream); replenish(stream);
        }));
        if (!accepted) stream.blocked = true;
      }
    } catch { dispose(stream, 'io'); }
    finally { stream.flushing = false; }
    replenish(stream);
  }
  async function begin(stream, target) {
    try {
      const pin = await resolveDestination(target, stream.abort.signal);
      if (!live(stream)) return;
      // Defense in depth for trusted composition mistakes; default resolver owns full
      // domain + complete-answer policy. Dial never receives hostname or lookup results.
      if (!pin || !isPublicDestinationAddress(pin.address) || isIP(pin.address) !== pin.family || ![80, 443].includes(pin.port)) {
        dispose(stream, 'destination'); return;
      }
      arm(stream, CONNECT_TIMEOUT);
      const socket = dial({
        host: pin.address, port: pin.port, family: pin.family, autoSelectFamily: false,
        highWaterMark: MAX_CHUNK, allowHalfOpen: false,
        lookup: (_hostname, _options, callback) => callback(new Error('Connector lookup denied')),
      });
      stream.socket = socket;
      socket.on('error', () => dispose(stream, 'io'));
      if (!live(stream)) { socket.destroy(); return; }
      socket.pause();
      socket.once('connect', () => {
        if (!live(stream)) return;
        stream.connected = true; progress(stream);
        if (!account() || !notify(onReady, stream.id, stream.credits) || !live(stream)) return;
        flush(stream);
        read();
      });
      socket.on('drain', () => {
        if (!live(stream)) return;
        stream.blocked = false; flush(stream);
      });
      // highWaterMark is a buffering threshold, NOT a maximum native TCP chunk.
      // Stay in paused/readable mode and pull one bounded frame only after the
      // previous downstream send completes. No secondary raw-chunk queue.
      function read() {
        if (!live(stream) || !stream.connected || stream.readPending) return;
        let chunk;
        try {
          const available = socket.readableLength;
          if (!available) return;
          stream.readPending = true;
          chunk = socket.read(Math.min(MAX_CHUNK, available));
        } catch { dispose(stream, 'io'); return; }
        if (chunk === null) { stream.readPending = false; return; }
        if (!Buffer.isBuffer(chunk) || chunk.length < 1 || chunk.length > MAX_CHUNK) { close(); return; }
        if (!account(chunk.length)) return;
        progress(stream);
        let sent;
        try { sent = onData(stream.id, chunk); } catch { close(); return; }
        Promise.resolve(sent).then(() => {
          if (!live(stream)) return;
          stream.readPending = false; read();
        }, () => { if (!stream.closed && !stopped) close(); });
      }
      socket.on('readable', read);
      socket.on('end', () => dispose(stream, 'remote'));
      socket.on('close', () => dispose(stream, 'remote'));
    } catch { dispose(stream, stream.socket ? 'connect' : 'destination'); }
  }
  return Object.freeze({
    open(id, target) {
      if (!active()) return false;
      if (!Number.isInteger(id) || id <= lastId || id > 0xffff_ffff || streams.size >= MAX_STREAMS) { close(); return false; }
      if (!account()) return false;
      lastId = id;
      const stream = {
        id, abort: new AbortController(), closed: false, connected: false, blocked: false,
        queue: [], pendingWrites: 0, credits: WINDOW, readPending: false, flushing: false,
        timer: undefined, deadline: undefined, socket: undefined, unregister: undefined,
      };
      streams.set(id, stream);
      try { stream.unregister = authority.track(() => dispose(stream, 'authorization')); }
      catch { close(); return false; }
      if (!live(stream)) { ignoreFailure(() => stream.unregister?.()); return false; }
      void begin(stream, target);
      return true;
    },
    write(id, chunk) {
      if (!active()) return false;
      const stream = streams.get(id);
      if (!stream || !Buffer.isBuffer(chunk) || chunk.length < 1 || chunk.length > MAX_CHUNK || stream.credits <= 0) { close(); return false; }
      if (!live(stream) || !account(chunk.length)) return false;
      stream.credits--;
      // Own the bytes while DNS/connect/drain is pending; at most one 16-frame window.
      stream.queue.push(Buffer.from(chunk)); flush(stream);
      return !stream.closed && !stopped;
    },
    closeStream(id) {
      if (!active()) return false;
      if (!account()) return false;
      const stream = streams.get(id);
      if (!stream) return false;
      dispose(stream, 'closed'); return true;
    },
    close,
  });
}
