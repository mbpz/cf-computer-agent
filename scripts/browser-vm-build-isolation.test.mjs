import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyVmBuildIsolation } from './browser-vm-build-isolation.mjs';

async function fixture(t, { module = 'node_modules/v86/build/libv86.mjs', eager = false, merged = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vm-build-isolation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  const manifest = {
    'index.html': { file: 'assets/main.js', isEntry: true, imports: ['_shared.js'], dynamicImports: ['vm.js'] },
    '_shared.js': { file: 'assets/shared.js', ...(eager ? { imports: ['vm.js'] } : {}) },
    'vm.js': { file: 'assets/unrelated-name.js', isDynamicEntry: true },
  };
  const modules = {
    'assets/main.js': ['frontend/main.tsx', ...(merged ? [module] : [])],
    'assets/shared.js': ['node_modules/react/index.js'],
    'assets/unrelated-name.js': [module],
  };
  const provenance = { schemaVersion: 1, chunks: {} };
  for (const item of Object.values(manifest)) {
    const code = `export const value = ${JSON.stringify(item.file)};`;
    await writeFile(join(root, item.file), code);
    provenance.chunks[item.file] = {
      modules: modules[item.file], sha256: createHash('sha256').update(code).digest('hex'),
      imports: (item.imports ?? []).map(key => manifest[key].file),
      dynamicImports: (item.dynamicImports ?? []).map(key => manifest[key].file),
      isEntry: item.isEntry === true,
    };
  }
  const save = async () => {
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(root, 'workbench-provenance.json'), JSON.stringify(provenance));
  };
  await save();
  return { root, manifest, provenance, save };
}

test('accepts a lazy VM chunk and reports only static first-load dependencies', async t => {
  const f = await fixture(t);
  const report = await verifyVmBuildIsolation(f.root);
  assert.deepEqual(report.initialChunks, ['assets/main.js', 'assets/shared.js']);
  assert.equal(report.verifiedChunks, 3);
  assert.deepEqual(report.deferredVmChunks, ['assets/unrelated-name.js']);
});

for (const module of [
  'node_modules/v86/build/libv86.mjs', 'node_modules/@xterm/xterm/lib/xterm.js',
  'node_modules/xterm/lib/xterm.js', 'tools/browser-vm/terminal-client.mjs',
  'frontend/features/environments/account-vm-runtime.mjs',
  'frontend/assets/guest.wasm?init',
]) test(`rejects merged eager VM module: ${module}`, async t => {
  const f = await fixture(t, { module, merged: true });
  await assert.rejects(verifyVmBuildIsolation(f.root), /VM_BUILD_EAGER_MODULE/);
});

test('rejects transitive static VM dependency even with a dynamic import remaining', async t => {
  const f = await fixture(t, { eager: true });
  await assert.rejects(verifyVmBuildIsolation(f.root), /VM_BUILD_EAGER_MODULE/);
});

test('permits lightweight environment metadata and connector policy modules', async t => {
  const f = await fixture(t, { module: 'tools/browser-vm/connector/destination-common.mjs', merged: true });
  assert.deepEqual((await verifyVmBuildIsolation(f.root)).deferredVmChunks, []);
});

test('checks every entry, including a separate authenticated business entry', async t => {
  const f = await fixture(t);
  f.manifest['vm.js'].isEntry = true;
  f.provenance.chunks['assets/unrelated-name.js'].isEntry = true;
  await f.save();
  await assert.rejects(verifyVmBuildIsolation(f.root), /VM_BUILD_EAGER_MODULE/);
});

for (const [name, mutate, error] of [
  ['changed bytes', async f => writeFile(join(f.root, 'assets/main.js'), 'changed'), /VM_BUILD_DIGEST/],
  ['missing provenance', f => { delete f.provenance.chunks['assets/main.js']; }, /VM_BUILD_INVENTORY/],
  ['empty identities', f => { f.provenance.chunks['assets/main.js'].modules = []; }, /VM_BUILD_MODULES/],
  ['hidden static edge', f => { f.provenance.chunks['assets/main.js'].imports.push('assets/unrelated-name.js'); }, /VM_BUILD_EDGES/],
  ['missing graph node', f => { f.manifest['index.html'].imports.push('missing.js'); }, /VM_BUILD_NODE/],
  ['no entry', f => { f.manifest['index.html'].isEntry = false; }, /VM_BUILD_ENTRY/],
  ['escaping file', f => { f.manifest['index.html'].file = '../outside.js'; }, /VM_BUILD_PATH/],
]) test(`fails closed: ${name}`, async t => {
  const f = await fixture(t); await mutate(f); await f.save();
  await assert.rejects(verifyVmBuildIsolation(f.root), error);
});

test('rejects initial WASM/image asset references, not unrelated landing media', async t => {
  const f = await fixture(t);
  f.manifest['index.html'].assets = ['assets/guest.iso'];
  await writeFile(join(f.root, 'assets/guest.iso'), 'fixture-image');
  await f.save();
  await assert.rejects(verifyVmBuildIsolation(f.root), /VM_BUILD_EAGER_ASSET/);
  f.manifest['index.html'].assets = ['assets/poster.webp'];
  await writeFile(join(f.root, 'assets/poster.webp'), 'fixture-poster');
  await f.save();
  assert.deepEqual((await verifyVmBuildIsolation(f.root)).initialAssets, ['assets/poster.webp']);
});

test('real Vite producer: lazy engine passes, eager engine fails even with hashed chunk names', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vm-build-producer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const frontend = join(root, 'frontend');
  await mkdir(frontend);
  await mkdir(join(root, 'node_modules/v86'), { recursive: true });
  await writeFile(join(root, 'node_modules/v86/package.json'), JSON.stringify({ name: 'v86', type: 'module', main: 'index.js' }));
  await writeFile(join(root, 'node_modules/v86/index.js'), 'export const engine = "test engine dependency";');
  await writeFile(join(frontend, 'index.html'), '<script type="module" src="/main.js"></script>');
  const { build } = await import('vite');
  const { workbenchLandingProvenance } = await import('./workbench-landing-provenance.mjs');
  for (const eager of [false, true]) {
    await writeFile(join(frontend, 'main.js'), eager ? 'import {engine} from "v86"; window.engine=engine;' : 'window.start = () => import("v86");');
    await build({ configFile: false, root: frontend, logLevel: 'silent', plugins: [workbenchLandingProvenance()], build: { manifest: 'manifest.json' } });
    if (eager) await assert.rejects(verifyVmBuildIsolation(join(frontend, 'dist')), /VM_BUILD_EAGER_MODULE/);
    else assert.equal((await verifyVmBuildIsolation(join(frontend, 'dist'))).deferredVmChunks.length, 1);
  }
});

test('rejects an image asset whose emitted filename hides its original WASM identity', async t => {
  const f = await fixture(t);
  f.manifest['guest.wasm'] = { src: 'guest.wasm', file: 'assets/opaque.dat' };
  f.manifest['index.html'].assets = ['assets/opaque.dat'];
  await writeFile(join(f.root, 'assets/opaque.dat'), 'fixture-wasm');
  await f.save();
  await assert.rejects(verifyVmBuildIsolation(f.root), /VM_BUILD_EAGER_ASSET/);
});

test('rejects a compressed image in the initial asset set', async t => {
  const f = await fixture(t);
  f.manifest['index.html'].assets = ['assets/alpine.iso.gz'];
  await writeFile(join(f.root, 'assets/alpine.iso.gz'), 'fixture-compressed-image');
  await f.save();
  await assert.rejects(verifyVmBuildIsolation(f.root), /VM_BUILD_EAGER_ASSET/);
});

test('rejects symlink escapes without reading bytes outside the output root', async t => {
  const f = await fixture(t);
  await symlink('/etc/hosts', join(f.root, 'assets/outside.js'));
  f.manifest['index.html'].file = 'assets/outside.js';
  await f.save();
  await assert.rejects(verifyVmBuildIsolation(f.root), /VM_BUILD_PATH/);
});

test('cyclic static dependencies terminate and still check the complete closure', async t => {
  const f = await fixture(t);
  f.manifest['_shared.js'].imports = ['index.html'];
  f.provenance.chunks['assets/shared.js'].imports = ['assets/main.js'];
  await f.save();
  assert.equal((await verifyVmBuildIsolation(f.root)).initialChunks.length, 2);
});
