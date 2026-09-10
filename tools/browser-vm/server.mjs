import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ALPINE_FILE } from './alpine-artifact.mjs';
import { ALPINE_ISO_ARTIFACTS } from './alpine-iso.mjs';
import { attachLocalProbeRelay } from './relay/local-relay.mjs';
import { startRecoveryFixture } from './recovery-fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));

export async function startProbeServer({ assets, isoAssets, recovery = false }) {
  if (typeof assets !== 'string' || !assets) throw new Error('Explicit development assets required');
  if (isoAssets !== undefined && (typeof isoAssets !== 'string' || !isoAssets)) throw new Error('Explicit ISO assets required');
  if (typeof recovery !== 'boolean' || (recovery && !isoAssets)) throw new Error('Recovery requires explicit ISO assets');
  const files = new Map([
    ['/', [join(directory, 'index.html'), 'text/html; charset=utf-8']],
    ...['browser.mjs', 'probe-core.mjs', 'probe-checkpoint.mjs', 'serial-protocol.mjs', 'probe-worker.mjs', 'probe-worker-client.mjs', 'alpine-artifact.mjs', 'alpine-iso.mjs', 'authenticated-probe-socket.mjs',
      'terminal-session.mjs', 'terminal-client.mjs', 'terminal-worker.mjs', 'terminal-worker-endpoint.mjs'].map(name => [
      `/${name}`, [join(directory, name), 'text/javascript; charset=utf-8'],
    ]),
    ['/engine/libv86.mjs', [resolve(directory, '../../node_modules/v86/build/libv86.mjs'), 'text/javascript']],
    ['/engine/v86.wasm', [resolve(directory, '../../node_modules/v86/build/v86.wasm'), 'application/wasm']],
    ...['seabios.bin', 'vgabios.bin', 'buildroot-bzimage68.bin', ALPINE_FILE].map(name => [
      `/boot/${name}`, [join(assets, name), 'application/octet-stream'],
    ]),
  ]);
  if (isoAssets) for (const artifact of ALPINE_ISO_ARTIFACTS.filter(asset => asset.location === 'iso')) {
    files.set(`/iso/${artifact.name}`, [join(isoAssets, artifact.name), 'application/octet-stream']);
  }
  if (recovery) for (const name of ['recovery.html', 'recovery-browser.mjs', 'recovery-worker.mjs', 'recovery-core.mjs']) {
    files.set(`/${name}`, [join(directory, name), name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8']);
  }
  const recoveryFixture = recovery ? await startRecoveryFixture() : undefined;
  let origin;
  let relay;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // v86's pinned scheduler creates a blob Worker. This policy is local-probe-only.
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if (`http://${request.headers.host}` !== origin
      || (request.headers.origin && request.headers.origin !== origin)) {
      response.writeHead(403).end('Forbidden origin');
      return;
    }
    if (request.url === '/relay-ticket') {
      if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }).end(); return; }
      if (request.headers.origin !== origin) { response.writeHead(403).end(); return; }
      // No member data or parameters are accepted by this local-only proof.
      // Do not buffer the body, reflect input, log capabilities, or return a ticket in a URL.
      request.resume();
      try {
        const ticket = relay.issueTicket();
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ticket, url: origin.replace('http:', 'ws:') + '/relay' }));
      } catch { response.writeHead(429).end('Local relay capacity reached'); }
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (recoveryFixture && /^\/recovery-inspect(?:\?run=[a-f0-9-]{36})?$/.test(request.url)) {
      const run = new URL(request.url, origin).searchParams.get('run');
      const content = JSON.stringify({ ...recoveryFixture.inspect(run), activeSessions: relay.inspect().length });
      response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(content) });
      response.end(request.method === 'HEAD' ? undefined : content);
      return;
    }
    const target = files.get(request.url);
    if (!target) { response.writeHead(404).end('Not found'); return; }
    try {
      const content = await readFile(target[0]);
      response.writeHead(200, { 'Content-Type': target[1], 'Content-Length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      response.writeHead(404).end('Development asset unavailable');
    }
  });
  await new Promise((ready, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', ready);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  relay = attachLocalProbeRelay(server, { origin: () => origin, ...recoveryFixture?.relayOptions });
  return { url: origin, inspectRelay: relay.inspect, close: async () => {
    await relay.close();
    await recoveryFixture?.close();
    await new Promise((done, reject) => {
    server.close(error => error ? reject(error) : done());
    server.closeAllConnections();
    });
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await startProbeServer({ assets: process.argv[2], isoAssets: process.argv[3], recovery: process.argv[4] === '--recovery-fixture' });
  console.log(`Local-only Linux verification: ${server.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
