import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const digest = token => createHash('sha256').update(token).digest('hex');
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/control.mjs', ['control.mjs', 'text/javascript']],
  ['/probe.html', ['probe.html', 'text/html']], ['/client.mjs', ['client.mjs', 'text/javascript']],
  ['/page.mjs', ['page.mjs', 'text/javascript']],
]);

// Development admission probe only: deliberately has no DNS or outbound TCP adapter.
export async function startConnectorProbe({ allowedOrigin, port = 0, now = Date.now, handshakeMs = 3000, sessionMs = 60_000 } = {}) {
  const origin = new URL(allowedOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== allowedOrigin) throw new Error('An exact HTTPS origin is required');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  for (const duration of [handshakeMs, sessionMs]) if (!Number.isInteger(duration) || duration < 1 || duration > 60_000) throw new Error('Invalid timeout');
  let url;
  let pending;
  let stopped = false;
  let shutdown;
  const sockets = new Set();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self' ws://127.0.0.1:*; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const end = (status, body = '') => { res.statusCode = status; res.end(body); };
    if (stopped || req.headers.host !== new URL(url).host || (req.headers.origin && req.headers.origin !== url)) return end(403);
    if (req.url === '/pair') {
      if (req.method !== 'POST') return end(405);
      if (req.headers.origin !== url) return end(403);
      if (req.headers['content-type'] !== 'application/json') return end(415);
      // No request payload is accepted, including chunked bodies.
      if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) !== 0) return end(400);
      const token = randomBytes(32).toString('base64url');
      pending = { hash: digest(token), expiresAt: now() + 30_000, attempts: 0 };
      res.setHeader('Content-Type', 'application/json');
      return end(200, JSON.stringify({ token, expiresInMs: 30_000, allowedOrigin }));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return end(405);
    const file = files.get(req.url);
    if (!file) return end(404);
    try {
      const bytes = await readFile(new URL(file[0], import.meta.url));
      res.setHeader('Content-Type', `${file[1]}; charset=utf-8`);
      end(200, req.method === 'HEAD' ? undefined : bytes);
    } catch { end(500, 'Probe asset unavailable'); }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  server.timeout = 5000;
  server.maxConnections = 16;
  server.on('upgrade', (req, socket, head) => {
    const reject = status => { socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    if (stopped || req.url !== '/probe' || req.headers.host !== new URL(url).host || req.headers.origin !== allowedOrigin) return reject('403 Forbidden');
    if (sockets.size >= 4) return reject('429 Too Many Requests');
    wss.handleUpgrade(req, socket, head, ws => {
      sockets.add(ws);
      let authenticated = false;
      let killTimer;
      const close = (code = 1008) => {
        clearTimeout(timer);
        ws.close(code);
        killTimer ??= setTimeout(() => ws.terminate(), 100).unref();
      };
      let timer = setTimeout(close, handshakeMs).unref();
      ws.on('error', () => close());
      ws.on('close', () => { clearTimeout(timer); clearTimeout(killTimer); sockets.delete(ws); });
      ws.on('message', (bytes, binary) => {
        if (authenticated || binary) return close();
        if (pending && ++pending.attempts > 5) pending = undefined;
        let auth;
        try { auth = JSON.parse(bytes.toString()); } catch { return close(); }
        if (!auth || Object.keys(auth).sort().join(',') !== 'token,type' || auth.type !== 'probe-authenticate' || typeof auth.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(auth.token)) return close();
        if (!pending || now() >= pending.expiresAt || digest(auth.token) !== pending.hash) return close();
        pending = undefined; // Consume synchronously before accepting any other connection.
        authenticated = true;
        clearTimeout(timer);
        timer = setTimeout(() => close(1001), sessionMs).unref();
        ws.send(JSON.stringify({ type: 'probe-ready', version: 1, forwarding: false }));
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    close() {
      if (shutdown) return shutdown;
      stopped = true; pending = undefined;
      shutdown = new Promise(resolve => {
        const force = setTimeout(() => { for (const ws of sockets) ws.terminate(); }, 100).unref();
        for (const ws of sockets) ws.close(1001);
        server.close(() => { clearTimeout(force); wss.close(() => resolve()); });
        server.closeIdleConnections();
      });
      return shutdown;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = await startConnectorProbe({ allowedOrigin: process.argv[2], port: process.argv[3] === undefined ? 0 : Number(process.argv[3]) });
    console.log(`Handshake-only probe. Local control page: ${server.url}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void server.close(); });
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? 'Port already occupied; select another explicit port.' : 'Cannot start probe. Supply one exact HTTPS origin and an optional loopback port.');
    process.exitCode = 1;
  }
}
