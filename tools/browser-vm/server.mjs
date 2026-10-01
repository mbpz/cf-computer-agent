import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ALPINE_FILE } from './alpine-artifact.mjs';
import { buildChunkedImage } from './chunked-image.mjs';
import { ALPINE_ISO_ARTIFACTS } from './alpine-iso.mjs';
import { attachLocalProbeRelay } from './relay/local-relay.mjs';
import { startRecoveryFixture } from './recovery-fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));

export async function startProbeServer({ assets, isoAssets, recovery = false, directDownload = false, runtimeOwner = false, checkpointRecovery = false, chunkedImages = false }) {
  if (typeof assets !== 'string' || !assets) throw new Error('Explicit development assets required');
  if (isoAssets !== undefined && (typeof isoAssets !== 'string' || !isoAssets)) throw new Error('Explicit ISO assets required');
  if (typeof recovery !== 'boolean' || (recovery && !isoAssets)) throw new Error('Recovery requires explicit ISO assets');
  if (typeof directDownload !== 'boolean') throw new Error('Direct download requires explicit boolean opt-in');
  if (typeof runtimeOwner !== 'boolean' || (runtimeOwner && !isoAssets)) throw new Error('Runtime owner requires explicit ISO assets');
  if (typeof checkpointRecovery !== 'boolean') throw new Error('Checkpoint recovery requires explicit boolean opt-in');
  if (typeof chunkedImages !== 'boolean' || (chunkedImages && !isoAssets)) throw new Error('Chunked images require explicit ISO assets and boolean opt-in');
  const recoveryBundles = new Map();
  if (checkpointRecovery) {
    const { build } = await import('esbuild');
    for (const name of ['checkpoint-recovery-browser.mjs', 'checkpoint-recovery-worker.mjs']) {
      const result = await build({entryPoints:[join(directory, name)], bundle:true, write:false, format:'esm', platform:'browser', target:'es2022'});
      recoveryBundles.set('/' + name, result.outputFiles[0].contents);
    }
  }
  let runtimeBundle;
  if (runtimeOwner) {
    const { build } = await import('esbuild');
    const result = await build({entryPoints:[join(directory, 'runtime-owner-browser.mjs')], bundle:true, write:false, format:'esm', platform:'browser', target:'es2022', jsx:'automatic'});
    runtimeBundle = result.outputFiles[0].contents;
  }
  const files = new Map([
    ['/', [join(directory, 'index.html'), 'text/html; charset=utf-8']],
    ...['browser.mjs', 'probe-core.mjs', 'probe-checkpoint.mjs', 'serial-protocol.mjs', 'probe-worker.mjs', 'probe-worker-client.mjs', 'alpine-artifact.mjs', 'alpine-iso.mjs', 'authenticated-probe-socket.mjs',
      'terminal-session.mjs', 'shared-files.mjs', 'file-protocol.mjs', 'terminal-client.mjs', 'terminal-worker.mjs', 'terminal-worker-endpoint.mjs'].map(name => [
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
  if (directDownload) for (const name of ['direct-download.html', 'direct-download-browser.mjs', 'direct-download-page.mjs', 'direct-download.mjs']) {
    files.set(`/${name}`, [join(directory, name), name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8']);
  }
  if (runtimeOwner) {
    files.set('/runtime-owner.html', [join(directory, 'runtime-owner.html'), 'text/html; charset=utf-8']);
    files.set('/runtime-owner.css', [join(directory, 'runtime-owner.css'), 'text/css; charset=utf-8']);
  }
  if (checkpointRecovery) files.set('/checkpoint-recovery.html', [join(directory, 'checkpoint-recovery.html'), 'text/html; charset=utf-8']);
  const imageFiles = new Map();
  if (chunkedImages) {
    // Build from the pinned original files BEFORE opening a listener. No arbitrary
    // filesystem paths or download proxy are exposed by these immutable routes.
    for (const artifact of ALPINE_ISO_ARTIFACTS) {
      const path = files.get(`/${artifact.location}/${artifact.name}`)[0];
      const {files: chunks} = await buildChunkedImage(await readFile(path), artifact);
      for (const entry of chunks) imageFiles.set(...entry);
    }
    files.set('/chunked-image.mjs', [join(directory,'chunked-image.mjs'),'text/javascript; charset=utf-8']);
    files.set('/terminal-worker.mjs?chunked=1', files.get('/terminal-worker.mjs'));
  }
  const recoveryFixture = recovery ? await startRecoveryFixture() : undefined;
  let origin;
  let relay;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // v86's pinned scheduler creates a blob Worker. This policy is local-probe-only.
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if (runtimeOwner && request.url === '/runtime-owner.html') response.setHeader('Content-Security-Policy', response.getHeader('Content-Security-Policy') + "; style-src 'self';");
    if (directDownload && request.url === '/direct-download.html') {
      // No same-origin connect permission: this document cannot contact the local relay.
      response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src https://dl-cdn.alpinelinux.org https://api.github.com https://github.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    }
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
    const recoveryBundle = recoveryBundles.get(request.url);
    if (recoveryBundle) {
      response.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8','Content-Length':recoveryBundle.length});
      response.end(request.method === 'HEAD' ? undefined : recoveryBundle); return;
    }
    if (runtimeBundle && request.url === '/runtime-owner-browser.mjs') {
      response.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8','Content-Length':runtimeBundle.length});
      response.end(request.method === 'HEAD' ? undefined : runtimeBundle); return;
    }
    const chunk = imageFiles.get(request.url);
    if (chunk) {
      response.writeHead(200, {'Content-Type':request.url.endsWith('.json')?'application/json':'application/octet-stream','Content-Length':chunk.byteLength});
      response.end(request.method==='HEAD'?undefined:chunk); return;
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
  const server = await startProbeServer({ assets: process.argv[2], isoAssets: process.argv[3], recovery: process.argv[4] === '--recovery-fixture', directDownload: process.argv[4] === '--direct-download', runtimeOwner: process.argv[4] === '--runtime-owner', checkpointRecovery: process.argv.slice(4).includes('--checkpoint-recovery'), chunkedImages: process.argv.slice(4).includes('--chunked-images') });
  console.log(`Local-only Linux verification: ${server.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
