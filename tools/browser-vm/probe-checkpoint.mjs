// Development-only corruption/compatibility guard, NOT encryption or authenticity.
// Identity is a caller-declared runtime contract, not proof of asset provenance.
const MAX_BYTES = 512 * 1024 * 1024;
const fields = ['engineVersion', 'imageVersion', 'memoryBytes', 'filesystem'];

function copyIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid checkpoint compatibility identity');
  const result = Object.fromEntries(fields.map(key => [key, value[key]]));
  if (!['engineVersion', 'imageVersion', 'filesystem'].every(key => typeof result[key] === 'string' && result[key].trim().length > 0 && result[key].length <= 200)
    || !Number.isSafeInteger(result.memoryBytes) || result.memoryBytes <= 0 || result.memoryBytes > MAX_BYTES) {
    throw new Error('Invalid checkpoint compatibility identity');
  }
  return result;
}

function ownState(state, bytes) {
  if (!(state instanceof ArrayBuffer) || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_BYTES || state.byteLength !== bytes) {
    throw new Error('Invalid checkpoint state size');
  }
  // Copy before any await: the caller cannot mutate bytes during hashing.
  return state.slice(0);
}

async function digest(state) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', state)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function sealCheckpoint(state, identity) {
  const version = copyIdentity(identity);
  const owned = ownState(state, state?.byteLength);
  return { schemaVersion: 1, identity: version, bytes: owned.byteLength, sha256: await digest(owned), state: owned };
}

export async function restoreCheckpoint(machine, record, expectedIdentity) {
  if (!record || record.schemaVersion !== 1 || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    throw new Error('Invalid checkpoint envelope');
  }
  const expected = copyIdentity(expectedIdentity);
  const saved = copyIdentity(record.identity);
  if (fields.some(key => saved[key] !== expected[key])) throw new Error('Checkpoint compatibility mismatch');
  const expectedDigest = record.sha256;
  const state = ownState(record.state, record.bytes);
  if (await digest(state) !== expectedDigest) throw new Error('Checkpoint digest mismatch');
  await machine.restore_state(state);
}
