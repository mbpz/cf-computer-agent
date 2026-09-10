import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyArtifacts } from './browser-vm-artifacts.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-vm-artifacts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'assets');
  await mkdir(root);
  const artifacts = [];
  for (const role of ['engine', 'wasm', 'bios', 'vga-bios', 'kernel', 'rootfs']) {
    const bytes = Buffer.from(role);
    const path = `${role}.bin`;
    await writeFile(join(root, path), bytes);
    artifacts.push({ role, path, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      source: `https://artifacts.example.test/versions/1/${path}`, license: 'BSD-2-Clause' });
  }
  return { directory, root, manifest: {
    schemaVersion: 1, engineVersion: '0.5.458', imageVersion: 'probe-1', rootfsMode: 'external', artifacts,
  } };
}

test('verifies actual bytes of every required boot resource', async t => {
  const { root, manifest } = await fixture(t);
  assert.deepEqual(await verifyArtifacts(manifest, root), { artifacts: 6, bytes: 34 });
});

test('rejects incomplete boot inputs instead of reporting a usable engine', async t => {
  const { root, manifest } = await fixture(t);
  manifest.artifacts.shift();
  await assert.rejects(verifyArtifacts(manifest, root), /missing.*engine/i);
});

test('accepts an embedded root filesystem without inventing a separate disk artifact', async t => {
  const { root, manifest } = await fixture(t);
  manifest.rootfsMode = 'embedded';
  manifest.artifacts.pop();
  assert.deepEqual(await verifyArtifacts(manifest, root), { artifacts: 5, bytes: 28 });
});

test('rejects missing external root filesystems and contradictory embedded manifests', async t => {
  const { root, manifest } = await fixture(t);
  await assert.rejects(verifyArtifacts({ ...manifest, rootfsMode: 'embedded' }, root), /embedded.*rootfs/i);
  manifest.artifacts.pop();
  await assert.rejects(verifyArtifacts(manifest, root), /missing.*rootfs/i);
  await assert.rejects(verifyArtifacts({ ...manifest, rootfsMode: 'auto' }, root), /rootfs.*mode/i);
});

test('rejects same-size tampering by comparing file digest', async t => {
  const { root, manifest } = await fixture(t);
  await writeFile(join(root, 'engine.bin'), 'ENGINE');
  await assert.rejects(verifyArtifacts(manifest, root), /engine.*digest/i);
});

test('rejects declared size mismatch', async t => {
  const { root, manifest } = await fixture(t);
  manifest.artifacts[0].bytes = 7;
  await assert.rejects(verifyArtifacts(manifest, root), /engine.*size/i);
});

test('rejects parent traversal even if the target exists and matches the hash', async t => {
  const { directory, root, manifest } = await fixture(t);
  await writeFile(join(directory, 'outside.bin'), 'engine');
  manifest.artifacts[0].path = '../outside.bin';
  await assert.rejects(verifyArtifacts(manifest, root), /path/i);
});

test('rejects absolute paths and nonportable separator aliases', async t => {
  const { root, manifest } = await fixture(t);
  for (const path of [join(root, 'engine.bin'), '..\\outside.bin', './engine.bin', 'nested//engine.bin']) {
    manifest.artifacts[0].path = path;
    await assert.rejects(verifyArtifacts(manifest, root), /path/i);
  }
});

test('rejects symlinks escaping the resource directory', async t => {
  const { directory, root, manifest } = await fixture(t);
  await writeFile(join(directory, 'outside.bin'), 'engine');
  await symlink(join(directory, 'outside.bin'), join(root, 'link.bin'));
  manifest.artifacts[0].path = 'link.bin';
  await assert.rejects(verifyArtifacts(manifest, root), /outside|escape/i);
});

test('rejects duplicate roles and duplicate resource paths', async t => {
  const { root, manifest } = await fixture(t);
  manifest.artifacts.push({ ...manifest.artifacts[0] });
  await assert.rejects(verifyArtifacts(manifest, root), /duplicate/i);
  manifest.artifacts.pop();
  manifest.artifacts[1].path = 'engine.bin';
  await assert.rejects(verifyArtifacts(manifest, root), /duplicate.*path/i);
});

test('rejects credentialed, insecure or token-bearing source URLs', async t => {
  const { root, manifest } = await fixture(t);
  for (const source of ['http://example.test/a', 'https://user:password@example.test/a',
    'https://example.test/a?token=secret', 'https://example.test/a#secret', 'file:///a']) {
    manifest.artifacts[0].source = source;
    await assert.rejects(verifyArtifacts(manifest, root), /source/i);
  }
});

test('rejects unspecified licenses and floating engine/image versions', async t => {
  const { root, manifest } = await fixture(t);
  manifest.artifacts[0].license = ' ';
  await assert.rejects(verifyArtifacts(manifest, root), /license/i);
  manifest.artifacts[0].license = 'BSD-2-Clause';
  manifest.engineVersion = 'latest';
  await assert.rejects(verifyArtifacts(manifest, root), /version/i);
  manifest.engineVersion = '0.5.458';
  manifest.imageVersion = 'main';
  await assert.rejects(verifyArtifacts(manifest, root), /version/i);
});

test('rejects unsupported schema, unknown fields and malformed digests before reading files', async t => {
  const { root, manifest } = await fixture(t);
  await assert.rejects(verifyArtifacts({ ...manifest, schemaVersion: 2 }, root), /schema/i);
  await assert.rejects(verifyArtifacts({ ...manifest, typo: true }, root), /field/i);
  manifest.artifacts[0].sha256 = 'xyz';
  await assert.rejects(verifyArtifacts(manifest, root), /digest/i);
});

test('rejects directories and absent files as boot resources', async t => {
  const { root, manifest } = await fixture(t);
  await mkdir(join(root, 'directory'));
  manifest.artifacts[0].path = 'directory';
  await assert.rejects(verifyArtifacts(manifest, root), /file/i);
  manifest.artifacts[0].path = 'absent';
  await assert.rejects(verifyArtifacts(manifest, root), /absent|ENOENT/);
});
