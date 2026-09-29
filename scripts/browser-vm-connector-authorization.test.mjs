import test from 'node:test';
import assert from 'node:assert/strict';
import { readConnectorAuthorizationClaims } from '../shared/connector-authorization.ts';

const binding = Object.freeze({
  purpose: 'connect', origin: 'https://workbench.example.test',
  connectorId: 'connector-1', memberId: 'member-1', environmentId: 'environment-1',
  runtimeId: 'runtime-1', generation: 2, policyVersion: 'policy-1', leaseId: null,
});
const claims = () => ({ ...binding, version: 1, ticketId: 'ticket-1', issuedAtMs: 100_000, expiresAtMs: 160_000 });

// Removing any binding comparison, relaxing the time window or accepting an
// arbitrary purpose must break these tests. No signature/authentication is mocked.
test('accepts exact connect binding and returns an independent frozen claim snapshot', () => {
  const input = claims();
  const parsed = readConnectorAuthorizationClaims(input, binding, 100_000);
  assert.deepEqual(parsed, input);
  assert.notEqual(parsed, input);
  assert.equal(Object.isFrozen(parsed), true);
  input.memberId = 'another-member';
  assert.equal(parsed.memberId, 'member-1');
});

test('renewal requires the expected lease and cannot be used to connect', () => {
  const expected = { ...binding, purpose: 'renew', leaseId: 'lease-1' };
  const input = { ...claims(), ...expected };
  assert.deepEqual(readConnectorAuthorizationClaims(input, expected, 100_001), input);
  assert.equal(readConnectorAuthorizationClaims(input, binding, 100_001), undefined);
  assert.equal(readConnectorAuthorizationClaims(input, { ...expected, leaseId: 'lease-2' }, 100_001), undefined);
  assert.equal(readConnectorAuthorizationClaims({ ...input, leaseId: null }, expected, 100_001), undefined);
  assert.equal(readConnectorAuthorizationClaims({ ...claims(), leaseId: 'lease-1' }, binding, 100_001), undefined);
  const invalidConnect = { ...binding, leaseId: 'lease-1' };
  assert.equal(readConnectorAuthorizationClaims({ ...claims(), ...invalidConnect }, invalidConnect, 100_001), undefined);
});

for (const [key, value] of Object.entries({
  origin: 'https://other.example.test', connectorId: 'connector-2', memberId: 'member-2',
  environmentId: 'environment-2', runtimeId: 'runtime-2', generation: 3, policyVersion: 'policy-2',
})) {
  test(`rejects mismatched ${key} in claims and expected binding`, () => {
    assert.equal(readConnectorAuthorizationClaims({ ...claims(), [key]: value }, binding, 110_000), undefined);
    assert.equal(readConnectorAuthorizationClaims(claims(), { ...binding, [key]: value }, 110_000), undefined);
  });
}

test('requires all and only the defined own fields on both sides', () => {
  for (const key of Object.keys(claims())) {
    const input = claims(); delete input[key];
    assert.equal(readConnectorAuthorizationClaims(input, binding, 110_000), undefined, key);
  }
  for (const key of Object.keys(binding)) {
    const expected = { ...binding }; delete expected[key];
    assert.equal(readConnectorAuthorizationClaims(claims(), expected, 110_000), undefined, key);
  }
  for (const input of [null, [], 'ticket', 5, { ...claims(), token: 'extra' }, Object.create(claims())]) {
    assert.equal(readConnectorAuthorizationClaims(input, binding, 110_000), undefined);
  }
  for (const expected of [null, [], { ...binding, isAdmin: true }, Object.create(binding)]) {
    assert.equal(readConnectorAuthorizationClaims(claims(), expected, 110_000), undefined);
  }
});

test('rejects invalid versions, purposes, generations and bounded identifiers without coercion', () => {
  for (const value of [0, 2, '1', null]) assert.equal(readConnectorAuthorizationClaims({ ...claims(), version: value }, binding, 110_000), undefined);
  for (const value of ['', 'CONNECT', 'renew', null]) {
    assert.equal(readConnectorAuthorizationClaims({ ...claims(), purpose: value }, binding, 110_000), undefined);
    assert.equal(readConnectorAuthorizationClaims({ ...claims(), purpose: value }, { ...binding, purpose: value }, 110_000), undefined);
  }
  for (const value of [0, -1, 1.5, '2', NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.equal(readConnectorAuthorizationClaims({ ...claims(), generation: value }, { ...binding, generation: value }, 110_000), undefined);
  }
  for (const key of ['connectorId', 'memberId', 'environmentId', 'runtimeId', 'policyVersion', 'ticketId']) {
    for (const value of ['', 'x'.repeat(129), ' id', 'id\n', 'id/value', 'é', 1, null]) {
      const expected = key === 'ticketId' ? binding : { ...binding, [key]: value };
      assert.equal(readConnectorAuthorizationClaims({ ...claims(), [key]: value }, expected, 110_000), undefined, key);
    }
  }
  const expected = { ...binding, purpose: 'renew', leaseId: 'bad/lease' };
  assert.equal(readConnectorAuthorizationClaims({ ...claims(), ...expected }, expected, 110_000), undefined);
});

test('requires an exact canonical HTTPS origin even when both sides match', () => {
  for (const origin of ['http://workbench.example.test', 'null', '*', 'https://workbench.example.test/',
    'https://workbench.example.test/path', 'https://user:pass@workbench.example.test',
    'https://workbench.example.test?x=1', 'https://workbench.example.test#x',
    'https://WORKBENCH.example.test', 'https://workbench.example.test:443', 'not-a-url']) {
    assert.equal(readConnectorAuthorizationClaims({ ...claims(), origin }, { ...binding, origin }, 110_000), undefined, origin);
  }
});

test('accepts up to 60 seconds only and expiry has no grace period', () => {
  assert.ok(readConnectorAuthorizationClaims(claims(), binding, 159_999));
  for (const now of [99_999, 160_000, 160_001, NaN, Infinity, '110000', -1, 110_000.5]) {
    assert.equal(readConnectorAuthorizationClaims(claims(), binding, now), undefined);
  }
  for (const expiresAtMs of [100_000, 99_999, 160_001, 160_000.5, Infinity, '160000']) {
    assert.equal(readConnectorAuthorizationClaims({ ...claims(), expiresAtMs }, binding, 110_000), undefined);
  }
  for (const issuedAtMs of [-1, NaN, 100_000.5, '100000', Number.MAX_SAFE_INTEGER]) {
    assert.equal(readConnectorAuthorizationClaims({ ...claims(), issuedAtMs }, binding, 110_000), undefined);
  }
  assert.ok(readConnectorAuthorizationClaims({ ...claims(), expiresAtMs: 100_001 }, binding, 100_000));
});

test('rejects hidden, symbolic or accessor fields instead of executing non-JSON values', () => {
  let reads = 0;
  const accessor = { ...claims() };
  Object.defineProperty(accessor, 'memberId', { enumerable: true, get() { reads++; return 'member-1'; } });
  const hidden = Object.defineProperty(claims(), 'extra', { value: true });
  for (const input of [accessor, hidden, { ...claims(), [Symbol('extra')]: true }]) {
    assert.equal(readConnectorAuthorizationClaims(input, binding, 110_000), undefined);
  }
  assert.equal(reads, 0);
});
