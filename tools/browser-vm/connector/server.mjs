import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { createConnectorDevice } from './authority.ts';
import { createConnectorConsumeClient } from './consume-client.ts';

const fields = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const single = (req, name, value) => req.headers[name] === value
  && req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === name).length === 1;

/** Trusted assembly only: fetch/clock/keys are installed by the host, never a web
 * request. No CLI/discovery, credential files, forwarding or host network changes.
 * This version authorizes a control channel; LC-007 supplies the data plane.
 */
export async function startConnectorServer(options) {
  if (!options || Object.keys(options).some(key => !['allowedOrigin', 'policyVersion', 'verificationKeys', 'port', 'fetch', 'clock'].includes(key))) {
    throw new Error('Invalid connector configuration');
  }
  const { allowedOrigin, policyVersion, verificationKeys, clock, port = 0 } = options;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid connector port');
  const consume = createConnectorConsumeClient({ issuerOrigin: allowedOrigin, fetch: options.fetch });
  const device = createConnectorDevice({ allowedOrigin, policyVersion, verificationKeys, clock, consume });
  const assets = new Map();
  try {
    for (const [path, file, type] of [['/', 'control.html', 'text/html'], ['/control.js', 'control.js', 'text/javascript']]) {
      assets.set(path, { bytes: await readFile(new URL(file, import.meta.url)), type });
    }
  } catch (error) { device.close(); throw error; }
  let url, host, stopped = false, shutdown, pairingBusy = false;
  const sockets = new Set(), channels = new Set();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 10_240, maxFragments: 32, maxBufferedChunks: 64,
    perMessageDeflate: false, autoPong: false });
  const server = createServer({ maxHeaderSize: 8192, connectionsCheckingInterval: 1000 }, (req, res) => {
    // Catch async pairing cancellation during shutdown; never log credentials/errors.
    void handleHttp(req, res).catch(() => {
      if (!res.headersSent) { res.statusCode = 503; res.end(); } else res.destroy();
    });
  });
  server.headersTimeout = 5000; server.requestTimeout = 5000; server.timeout = 5000;
  server.maxConnections = 16; server.maxHeadersCount = 32; server.maxRequestsPerSocket = 32;
  server.on('connection', socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket));
  });
  async function handleHttp(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const end = (status, body = '') => { res.statusCode = status; res.end(body); };
    const reject = status => { res.setHeader('Connection', 'close'); end(status); };
    const json = value => { res.setHeader('Content-Type', 'application/json'); end(200, JSON.stringify(value)); };
    if (stopped || !single(req, 'host', host) || (req.headers.origin !== undefined && !single(req, 'origin', url))) return reject(403);
    if (req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] ?? 0) !== 0) return reject(400);
    if (req.url === '/pair' || req.url === '/stop') {
      if (req.method !== 'POST') return reject(405);
      if (!single(req, 'origin', url)) return reject(403);
      if (!single(req, 'content-type', 'application/json')) return reject(415);
      if (req.url === '/stop') {
        res.once('finish', () => { void close(); });
        res.once('close', () => { void close(); });
        return json({ stopped: true });
      }
      if (pairingBusy) return reject(409);
      pairingBusy = true;
      try { const result = await device.issuePairing(); if (!stopped && !res.destroyed) json(result); else reject(503); }
      finally { pairingBusy = false; }
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return reject(405);
    if (req.url === '/identity') {
      if (req.method === 'HEAD') return end(200);
      return json({ version: 1, connectorId: device.connectorId, allowedOrigin, policyVersion, forwarding: false });
    }
    const asset = assets.get(req.url);
    if (!asset) return reject(404);
    res.setHeader('Content-Type', `${asset.type}; charset=utf-8`);
    end(200, req.method === 'HEAD' ? '' : asset.bytes);
  }
  server.on('upgrade', (req, socket, head) => {
    const reject = status => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      const timer = setTimeout(() => socket.destroy(), 100).unref();
      socket.once('close', () => clearTimeout(timer));
    };
    if (stopped || req.method !== 'GET' || req.url !== '/connector' || !single(req, 'host', host)
      || !single(req, 'origin', allowedOrigin) || req.headers.cookie !== undefined || req.headers.authorization !== undefined
      || req.headers['sec-websocket-protocol'] !== undefined || req.headers['transfer-encoding'] !== undefined
      || Number(req.headers['content-length'] ?? 0) !== 0) return reject('403 Forbidden');
    if (channels.size >= 4) return reject('429 Too Many Requests');
    wss.handleUpgrade(req, socket, head, ws => {
      let channel, phase = 'waiting', killTimer;
      const stop = (code = 1008) => {
        if (phase === 'closed') return;
        phase = 'closed'; channel?.close();
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.close(code);
          killTimer = setTimeout(() => ws.terminate(), 100).unref();
        }
      };
      channels.add(stop);
      const send = value => {
        if (phase === 'closed' || !channel?.isActive() || ws.readyState !== WebSocket.OPEN) return;
        // No accumulating output if a peer stops reading; no send queue/retry.
        const text = JSON.stringify(value);
        if (ws.bufferedAmount + Buffer.byteLength(text) > 4096) return stop();
        ws.send(text, error => { if (error) stop(); });
      };
      ws.on('error', () => stop());
      ws.on('close', () => { stop(); clearTimeout(killTimer); channels.delete(stop); });
      // This version has no heartbeat/control-frame protocol. In particular, do
      // not acknowledge pings from an unauthenticated peer or let them extend TTL.
      ws.on('ping', () => stop()); ws.on('pong', () => stop());
      try {
        channel = device.open(allowedOrigin, { release: () => stop(), renewalDue: () => {
          const lease = channel.getLease();
          if (lease) send({ type: 'renewal-needed', version: 1, leaseId: lease.leaseId, revision: lease.revision });
        } });
      } catch { stop(); return; }
      ws.on('message', (bytes, binary) => {
        void handleMessage(bytes, binary).catch(() => stop());
      });
      async function handleMessage(bytes, binary) {
        if (phase === 'closed') return;
        if (binary) return stop();
        let frame;
        try { frame = JSON.parse(bytes.toString()); } catch { return stop(); }
        if (fields(frame, ['type', 'version']) && frame.type === 'disconnect' && frame.version === 1) return stop(1000);
        if (phase === 'pending') return stop();
        const initial = phase === 'waiting';
        if (frame?.version !== 1 || frame.type !== (initial ? 'authenticate' : 'renew')
          || !fields(frame, initial ? ['type', 'version', 'pairingCode', 'ticket'] : ['type', 'version', 'ticket'])
          || typeof frame.ticket !== 'string' || frame.ticket.length > 8192
          || (initial && (typeof frame.pairingCode !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(frame.pairingCode)))) return stop();
        phase = 'pending'; // Claim synchronously before hashing/signature/HTTP awaits.
        const accepted = initial ? await channel.connect({ pairingCode: frame.pairingCode, ticket: frame.ticket }) : await channel.renew(frame.ticket);
        if (phase === 'closed') return;
        if (!accepted) return stop();
        const lease = channel.getLease(); if (!lease) return stop();
        phase = 'active';
        send({ type: initial ? 'ready' : 'renewed', version: 1, forwarding: false, lease });
      }
    });
  });
  function close() {
    if (shutdown) return shutdown;
    stopped = true;
    // Mark adapter closed first so device.release cannot replace shutdown's code.
    for (const stop of channels) stop(1001);
    device.close();
    shutdown = new Promise(resolve => {
      const force = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 100).unref();
      server.close(() => {
        clearTimeout(force);
        wss.close(() => resolve());
      });
      server.closeIdleConnections();
    });
    return shutdown;
  }
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    url = `http://127.0.0.1:${server.address().port}`; host = new URL(url).host;
  } catch (error) { await close(); throw error; }
  // Any later listener failure invalidates authority instead of keeping leases.
  server.on('error', () => { void close(); });
  return Object.freeze({ url, close });
}
