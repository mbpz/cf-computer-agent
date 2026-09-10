import { randomBytes, createHash } from 'node:crypto';
import { connect } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { resolveProbeDestination } from './destination-policy.mjs';

// DEVELOPMENT ONLY: loopback G0 capability, not production member authentication.
// Native WISP v1 begins only after a single-use JSON authentication frame.
const WINDOW = 16;
const MAX_STREAMS = 8;
const MAX_BYTES = 64 * 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest('hex');

function frame(type, id, body) {
  const result = Buffer.alloc(5 + body.length);
  result[0] = type;
  result.writeUInt32LE(id, 1);
  body.copy(result, 5);
  return result;
}

function continued(id) {
  const body = Buffer.alloc(4);
  body.writeUInt32LE(WINDOW);
  return frame(3, id, body);
}

export function attachLocalProbeRelay(server, { origin, resolve4, dial = connect, now = Date.now }) {
  const tickets = new Map();
  const sessions = new Set();
  const diagnostics = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });
  let stopped = false;
  const issueTicket = () => {
    if (stopped) throw new Error('Local relay closed');
    for (const [key, expires] of tickets) if (expires <= now()) tickets.delete(key);
    if (tickets.size >= 8) throw new Error('Local ticket capacity reached');
    const ticket = randomBytes(32).toString('base64url');
    tickets.set(digest(ticket), now() + 30_000);
    return ticket;
  };

  const upgrade = (request, socket, head) => {
    if (stopped || request.url !== '/relay' || request.headers.origin !== origin()
      || `http://${request.headers.host}` !== origin() || wss.clients.size >= 8) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
  };
  server.on('upgrade', upgrade);

  wss.on('connection', ws => {
    const streams = new Map();
    let authenticated = false;
    let ended = false;
    let bytes = 0;
    let frames = 0;
    let lastId = 0;
    let forceCloseTimer;
    const authTimer = setTimeout(() => fail(), 3000);
    const leaseTimer = setTimeout(() => fail(), 120_000);

    function clean() {
      if (ended) return;
      ended = true;
      clearTimeout(authTimer);
      clearTimeout(leaseTimer);
      sessions.delete(ws);
      diagnostics.delete(ws);
      for (const stream of streams.values()) stream.socket?.destroy();
      streams.clear();
    }

    function fail() {
      clean();
      ws.close(1008, 'Local relay policy rejected');
      // A peer may never complete the closing handshake. Bound resource lifetime.
      forceCloseTimer ??= setTimeout(() => ws.terminate(), 1000);
      forceCloseTimer.unref();
    }

    function account(length) {
      bytes += length;
      if (bytes > MAX_BYTES) { fail(); return false; }
      return !ended;
    }

    function send(data, callback) {
      if (ended || ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 1024 * 1024 || !account(data.length)) { fail(); return; }
      ws.send(data, error => { if (error) fail(); else callback?.(); });
    }

    function closeStream(id, reason = 2) {
      const stream = streams.get(id);
      if (stream) {
        streams.delete(id);
        stream.socket?.destroy();
      }
      send(frame(4, id, Buffer.from([reason])));
    }

    function write(stream, data) {
      stream.pendingWrites++;
      stream.socket.write(data, error => {
        stream.pendingWrites--;
        if (ended || streams.get(stream.id) !== stream) return;
        if (error) { closeStream(stream.id); return; }
        stream.writtenBytes += data.length;
        // WISP CONTINUE replaces the window; never replenish before all its
        // frames have been consumed and written, or a slow peer can overrun it.
        if (stream.credits === 0 && stream.pendingWrites === 0) {
          stream.credits = WINDOW;
          send(continued(stream.id));
        }
      });
    }

    async function openStream(id, address, port) {
      const stream = { id, credits: WINDOW, queued: [], pendingWrites: 0, socket: null, ready: false, readBytes: 0, writtenBytes: 0 };
      streams.set(id, stream); // Count DNS-pending streams against the limit.
      try {
        const destination = await resolveProbeDestination(address, port, resolve4);
        if (ended || ws.readyState !== WebSocket.OPEN || streams.get(id) !== stream) return;
        // DNS is validated once. Dial this address, NEVER the original hostname.
        const socket = dial({ host: destination.address, port: destination.port });
        stream.socket = socket;
        socket.setTimeout(15_000, () => closeStream(id));
        socket.once('connect', () => {
          if (ended || streams.get(id) !== stream) { socket.destroy(); return; }
          stream.ready = true;
          for (const data of stream.queued) write(stream, data);
          stream.queued = [];
        });
        socket.on('data', data => {
          stream.readBytes += data.length;
          socket.pause();
          send(frame(2, id, data), () => socket.resume());
        });
        socket.on('error', () => { if (streams.get(id) === stream) closeStream(id); });
        socket.on('close', () => { if (streams.get(id) === stream) closeStream(id); });
      } catch {
        if (!ended && streams.get(id) === stream) closeStream(id, 3);
      }
    }

    ws.on('message', (data, isBinary) => {
      if (ended || !account(data.length) || ++frames > 100_000) { fail(); return; }
      if (!authenticated) {
        if (isBinary || data.length > 256) { fail(); return; }
        let payload;
        try { payload = JSON.parse(data.toString()); } catch { fail(); return; }
        if (!payload || payload.type !== 'authenticate' || typeof payload.ticket !== 'string'
          || !/^[A-Za-z0-9_-]{43}$/.test(payload.ticket) || Object.keys(payload).length !== 2) { fail(); return; }
        const key = digest(payload.ticket);
        const expires = tickets.get(key);
        tickets.delete(key); // Consume before any asynchronous work or acknowledgement.
        if (!expires || expires <= now() || sessions.size >= 1) { fail(); return; }
        authenticated = true;
        sessions.add(ws);
        // Local diagnostics contain counters only. No tickets, DNS addresses,
        // payloads or socket objects escape; state is removed on session close.
        diagnostics.set(ws, () => ({ bytes, frames, streams: [...streams.values()].map(stream => ({
          id: stream.id, ready: stream.ready, credits: stream.credits,
          pendingWrites: stream.pendingWrites, queuedFrames: stream.queued.length,
          readBytes: stream.readBytes, writtenBytes: stream.writtenBytes,
        })) }));
        clearTimeout(authTimer);
        send(continued(0));
        return;
      }
      if (!isBinary || data.length < 5) { fail(); return; }
      const type = data[0];
      const id = data.readUInt32LE(1);
      if (id === 0) { fail(); return; }
      if (type === 1) {
        if (data.length < 9 || data.length > 64 || id <= lastId) { fail(); return; }
        lastId = id;
        if (data[5] !== 1 || streams.size >= MAX_STREAMS) { closeStream(id, 3); return; }
        void openStream(id, data.subarray(8).toString('utf8'), data.readUInt16LE(6));
      } else if (type === 2) {
        const stream = streams.get(id);
        // A close may cross an in-flight DATA frame; closed IDs cannot be reused.
        if (!stream) { if (id > lastId) fail(); return; }
        if (--stream.credits < 0 || data.length === 5) { fail(); return; }
        const payload = data.subarray(5);
        if (stream.ready) write(stream, payload);
        else stream.queued.push(payload); // At most WINDOW * maxPayload per stream.
      } else if (type === 4 && data.length === 6) {
        const stream = streams.get(id);
        if (stream) {
          streams.delete(id);
          stream.socket?.destroy();
        }
      } else fail();
    });
    ws.on('error', clean);
    ws.on('close', () => { clean(); clearTimeout(forceCloseTimer); });
  });

  return {
    issueTicket,
    inspect: () => [...diagnostics.values()].map(snapshot => snapshot()),
    close: async () => {
      stopped = true;
      tickets.clear();
      server.removeListener('upgrade', upgrade);
      for (const ws of wss.clients) ws.terminate();
      await new Promise(resolve => wss.close(resolve));
    },
  };
}
