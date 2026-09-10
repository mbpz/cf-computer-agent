import { createHash } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const roles = ['engine', 'wasm', 'bios', 'vga-bios', 'kernel', 'rootfs'];

function objectWithFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: expected object`);
  }
  if (Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(value, key))) {
    throw new Error(`${label}: missing or unknown field`);
  }
}

function pinnedVersion(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
    && !['main', 'master', 'latest', 'current', 'head', 'nightly'].includes(value.toLowerCase());
}

function validateManifest(manifest) {
  objectWithFields(manifest, ['schemaVersion', 'engineVersion', 'imageVersion', 'rootfsMode', 'artifacts'], 'manifest');
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported manifest schema');
  if (!['embedded', 'external'].includes(manifest.rootfsMode)) throw new Error('Invalid rootfs mode');
  if (!pinnedVersion(manifest.engineVersion) || !pinnedVersion(manifest.imageVersion)) {
    throw new Error('Engine and image versions must be pinned');
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length > 64) {
    throw new Error('Invalid artifacts list');
  }
  const seenRoles = new Set();
  const seenPaths = new Set();
  for (const artifact of manifest.artifacts) {
    objectWithFields(artifact, ['role', 'path', 'bytes', 'sha256', 'source', 'license'], 'artifact');
    const { role, path, bytes, sha256, source, license } = artifact;
    if (!roles.includes(role)) throw new Error('Unknown artifact role');
    if (seenRoles.has(role)) throw new Error(`Duplicate role: ${role}`);
    seenRoles.add(role);
    if (typeof path !== 'string' || path.length > 1024 || !path || isAbsolute(path)
      || /[\\\u0000-\u001f:]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(`${role}: invalid resource path`);
    }
    if (seenPaths.has(path)) throw new Error(`Duplicate resource path: ${role}`);
    seenPaths.add(path);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error(`${role}: invalid size`);
    if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`${role}: invalid digest`);
    let url;
    try { url = new URL(source); } catch { throw new Error(`${role}: invalid source URL`); }
    if (typeof source !== 'string' || url.protocol !== 'https:' || !url.hostname
      || url.username || url.password || url.search || url.hash) throw new Error(`${role}: invalid source URL`);
    if (typeof license !== 'string' || !license.trim() || license.length > 256
      || /^(unknown|tbd|todo)$/i.test(license.trim())) throw new Error(`${role}: missing license`);
  }
  if (manifest.rootfsMode === 'embedded' && seenRoles.has('rootfs')) {
    throw new Error('Embedded image must not declare a separate rootfs');
  }
  const requiredRoles = manifest.rootfsMode === 'embedded' ? roles.filter(role => role !== 'rootfs') : roles;
  for (const role of requiredRoles) if (!seenRoles.has(role)) throw new Error(`Missing boot resource: ${role}`);
}

/** Verifies trusted local input paths and bytes; never downloads or executes artifacts. */
export async function verifyArtifacts(manifest, root) {
  validateManifest(manifest);
  const resourceRoot = await realpath(root);
  if (!(await stat(resourceRoot)).isDirectory()) throw new Error('Resource root must be a directory');
  let totalBytes = 0;
  for (const artifact of manifest.artifacts) {
    const resolved = await realpath(resolve(resourceRoot, artifact.path));
    const offset = relative(resourceRoot, resolved);
    if (!offset || offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
      throw new Error(`${artifact.role}: resource escapes outside root`);
    }
    const file = await open(resolved, 'r');
    try {
      const metadata = await file.stat();
      if (!metadata.isFile()) throw new Error(`${artifact.role}: resource must be a regular file`);
      if (metadata.size !== artifact.bytes) throw new Error(`${artifact.role}: size mismatch`);
      const hash = createHash('sha256');
      let bytes = 0;
      for await (const chunk of file.createReadStream({ autoClose: false })) {
        bytes += chunk.length;
        hash.update(chunk);
      }
      if (bytes !== artifact.bytes) throw new Error(`${artifact.role}: size changed during verification`);
      if (hash.digest('hex') !== artifact.sha256) throw new Error(`${artifact.role}: digest mismatch`);
      totalBytes += bytes;
      if (!Number.isSafeInteger(totalBytes)) throw new Error('Total resource size exceeds safe integer range');
    } finally {
      await file.close();
    }
  }
  return { artifacts: manifest.artifacts.length, bytes: totalBytes };
}
