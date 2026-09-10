import { createServer } from 'node:http';
import { connect } from 'node:net';

// Explicit diagnostic mode only: every permitted dial terminates at this fixed
// loopback fixture. No destination, path or port is taken from an HTTP parameter.
export async function startRecoveryFixture() {
  const runs = new Map();
  const server = createServer((request, response) => {
    request.resume();
    const match = /^\/([a-f0-9-]{36})\/(once|hold|after|offline)$/.exec(request.url ?? '');
    if (!match || !['GET', 'POST'].includes(request.method)) { response.writeHead(400).end(); return; }
    const [, id, action] = match;
    if (!runs.has(id)) {
      if (runs.size >= 16) { response.writeHead(429).end(); return; }
      runs.set(id, { requests: [], holdClosed: false });
    }
    const run = runs.get(id);
    if (run.requests.length >= 16) { response.writeHead(429).end(); return; }
    run.requests.push({ method: request.method, path: `/${action}` });
    response.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'close' });
    if (action === 'hold') {
      response.on('close', () => { run.holdClosed = true; });
      response.write('LIVE-STREAM\n');
    } else response.end(action === 'once' ? 'ONCE-ACK' : 'FRESH-GRANT-ACK');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    relayOptions: {
      resolve4: async hostname => {
        if (hostname !== 'dl-cdn.alpinelinux.org') throw new Error('Fixture destination rejected');
        return ['93.184.216.34'];
      },
      dial: ({ host, port }) => {
        if (host !== '93.184.216.34' || port !== 80) throw new Error('Fixture dial rejected');
        return connect({ host: '127.0.0.1', port: server.address().port });
      },
    },
    inspect: id => {
      const run = runs.get(id);
      return { mode: 'loopback-http-fixture', requests: run ? [...run.requests] : [], holdClosed: run?.holdClosed ?? false };
    },
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}
