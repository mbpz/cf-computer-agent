// Test-only entry: never referenced by Wrangler or production bundles.
import { DurableObject } from 'cloudflare:workers';
// The unrelated knowledge binding must exist during service construction.
// Any actual invocation is a harness failure, not a simulated success.
export class UnusedKnowledge extends DurableObject {
  fetch() { throw new Error('Unexpected knowledge access'); }
}
import { createApp } from '../../../src/app.ts';
import { MembersRepository } from '../../../src/members/repository.ts';
import { SessionService } from '../../../src/identity/session.ts';
let pair;
export default {
  async fetch(request, env, ctx) {
    pair ??= await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
    const now = env.TEST_REAL_CLOCK === true ? Date.now() : await env.DB.prepare('SELECT now FROM connector_test_clock').first('now');
    if (new URL(request.url).pathname === '/__test/session') {
      if (request.headers.get('x-test-secret') !== env.TEST_SECRET) return new Response(null, { status: 403 });
      const members = new MembersRepository(env.DB);
      const sessions = new SessionService(env.DB, members, { waitUntil: p => ctx.waitUntil(p) });
      const { token } = await sessions.create(await members.findById('member-a'));
      return Response.json({ token, publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey) });
    }
    return createApp({ connectorAuthorization: {
      origin: env.TEST_ORIGIN, policyVersion: 'policy-1',
      signingKey: { keyId: 'integration-test', privateKey: pair.privateKey },
      verificationKeys: [{ keyId: 'integration-test', publicKey: pair.publicKey }], now: () => now,
    } }).fetch(request, env, ctx);
  },
};
