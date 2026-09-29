import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectorAuthorizationVerifier } from '../shared/connector-authorization.ts';

const binding = Object.freeze({
  purpose: 'connect', origin: 'https://workbench.example.test',
  connectorId: 'connector-1', memberId: 'member-1', environmentId: 'environment-1',
  runtimeId: 'runtime-1', generation: 2, policyVersion: 'policy-1', leaseId: null,
});
const claims = () => ({ ...binding, version: 1, ticketId: 'ticket-1', issuedAtMs: 100_000, expiresAtMs: 160_000 });
const pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
const header = { alg: 'EdDSA', typ: 'memory-garden-connector+jws', kid: 'test-key-1' };
const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const verify = createConnectorAuthorizationVerifier([{ keyId: header.kid, publicKey: pair.publicKey }]);
async function token(payload = claims(), protectedHeader = header) {
  const input = `${b64(protectedHeader)}.${b64(payload)}`;
  const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

// Real Node WebCrypto signatures: removing crypto verification or a fixed header,
// key, claim binding, or deadline check must break the corresponding rejection.
test('accepts a real Ed25519 signature with a locally pinned public key', async () => {
  const result = await verify(await token(), binding, () => 110_000);
  assert.deepEqual(result, claims());
  assert.equal(Object.isFrozen(result), true);
});

test('rejects payload and signature tampering', async () => {
  const valid = await token();
  const [h, p, s] = valid.split('.');
  assert.equal(await verify(`${h}.${b64({ ...claims(), ticketId: 'forged' })}.${s}`, binding, () => 110_000), undefined);
  const forged = Buffer.from(s, 'base64url'); forged[0] ^= 1;
  assert.equal(await verify(`${h}.${p}.${forged.toString('base64url')}`, binding, () => 110_000), undefined);
});

test('rejects another private key even when the key ID matches', async () => {
  const other = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
  const foreign = createConnectorAuthorizationVerifier([{ keyId: header.kid, publicKey: other.publicKey }]);
  assert.equal(await foreign(await token(), binding, () => 110_000), undefined);
});

test('pins algorithm, type and exact protected header; never trusts embedded keys or URLs', async () => {
  for (const modified of [
    { ...header, alg: 'none' }, { ...header, alg: 'HS256' }, { ...header, alg: 'ES256' },
    { ...header, typ: 'JWT' }, { ...header, kid: 'unknown' },
    { ...header, jku: 'https://attacker.invalid/keys' }, { ...header, jwk: {} },
    { ...header, crit: [] }, { ...header, b64: false },
    '{"alg":"none","alg":"EdDSA","typ":"memory-garden-connector+jws","kid":"test-key-1"}',
  ]) assert.equal(await verify(await token(claims(), modified), binding, () => 110_000), undefined);
});

test('signed malformed claims and duplicate JSON keys still fail closed', async () => {
  for (const payload of [
    { ...claims(), admin: true }, { ...claims(), version: 2 },
    { ...claims(), generation: 0 }, { ...claims(), expiresAtMs: 160_001 },
    JSON.stringify(claims()).replace('"version":1', '"version":2,"version":1'),
  ]) assert.equal(await verify(await token(payload), binding, () => 110_000), undefined);
});

test('checks every authority binding after signature verification', async () => {
  const valid = await token();
  for (const [key, value] of Object.entries({
    memberId: 'other', environmentId: 'other', connectorId: 'other', runtimeId: 'other',
    generation: 3, policyVersion: 'other', origin: 'https://other.example.test',
  })) assert.equal(await verify(valid, { ...binding, [key]: value }, () => 110_000), undefined, key);
});

test('connect and renew cannot be interchanged; renewal pins the lease', async () => {
  const renewal = { ...binding, purpose: 'renew', leaseId: 'lease-1' };
  const signed = await token({ ...claims(), ...renewal });
  assert.deepEqual(await verify(signed, renewal, () => 110_000), { ...claims(), ...renewal });
  assert.equal(await verify(signed, binding, () => 110_000), undefined);
  assert.equal(await verify(signed, { ...renewal, leaseId: 'lease-2' }, () => 110_000), undefined);
  assert.equal(await verify(await token(), renewal, () => 110_000), undefined);
});

test('rejects future issuance and exact expiry; uses current time after asynchronous verification', async () => {
  const valid = await token();
  assert.equal(await verify(valid, binding, () => 99_999), undefined);
  assert.ok(await verify(valid, binding, () => 159_999));
  assert.equal(await verify(valid, binding, () => 160_000), undefined);
  let clock = 110_000;
  const pending = verify(valid, binding, () => clock);
  clock = 160_000;
  assert.equal(await pending, undefined);
});

test('snapshots expected scope before asynchronous verification', async () => {
  const valid = await token();
  const expected = { ...binding, memberId: 'different' };
  const pending = verify(valid, expected, () => 110_000);
  expected.memberId = binding.memberId;
  assert.equal(await pending, undefined);
});

test('missing or ambiguous trust fails closed and private or non-Ed25519 keys are not accepted', async () => {
  const valid = await token();
  const rsa = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  for (const keys of [undefined, [],
    [{ keyId: header.kid, publicKey: pair.privateKey }],
    [{ keyId: header.kid, publicKey: rsa.publicKey }],
    [{ keyId: header.kid, publicKey: pair.publicKey }, { keyId: header.kid, publicKey: pair.publicKey }],
  ]) assert.equal(await createConnectorAuthorizationVerifier(keys)(valid, binding, () => 110_000), undefined);
});

test('rotation trusts only explicit keys and configuration is snapshotted', async () => {
  const keys = [{ keyId: header.kid, publicKey: pair.publicKey }];
  const old = createConnectorAuthorizationVerifier(keys);
  keys[0].keyId = 'changed'; keys.length = 0;
  assert.ok(await old(await token(), binding, () => 110_000));
  const rotated = createConnectorAuthorizationVerifier([{ keyId: 'next', publicKey: pair.publicKey }]);
  assert.equal(await rotated(await token(), binding, () => 110_000), undefined);
  assert.ok(await rotated(await token(claims(), { ...header, kid: 'next' }), binding, () => 110_000));
});

test('rejects noncanonical encoding and bounded malformed input without throwing', async () => {
  const valid = await token();
  const [h, p, s] = valid.split('.');
  for (const input of [null, {}, '', 'a.b.c', valid + '.extra', 'x'.repeat(8193),
    `${h}=.${p}.${s}`, `${h}.${p}=.${s}`, `${h}.${p}.${s}=`, `${h}.${p}.AA`,
    `${h}.${p}.${s.slice(0, -1)}!`, valid + '\n',
  ]) assert.equal(await verify(input, binding, () => 110_000), undefined);
});
