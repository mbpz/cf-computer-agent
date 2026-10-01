import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const binary = /(?:\.(?:wasm|iso|img|bin)(?:\.(?:gz|xz|zst|br))?(?:[?#]|$)|(?:^|\/)(?:vmlinuz|initrd|initramfs|rootfs)(?:[.\/-]|$))/i;
function vmModule(id) {
  const path = id.replaceAll('\\', '/');
  return binary.test(path)
    || /(?:^|\/)node_modules\/(?:v86|xterm|@xterm\/[^/]+)\//.test(path)
    || /(?:^|\/)tools\/browser-vm\/(?:terminal[^/]*|probe(?:-worker|-browser)?|runtime[^/]*)\.[cm]?[jt]s(?:[?#]|$)/.test(path)
    || /(?:^|\/)frontend\/features\/environments\/(?:account-vm-runtime|authenticated-vm-runtime)\./.test(path);
}

/** Local emitted module-graph gate. Does not claim browser network/runtime acceptance. */
export async function verifyVmBuildIsolation(directory) {
  const root = await realpath(directory);
  const filePath = async file => {
    assert.ok(typeof file === 'string' && file.length && !isAbsolute(file)
      && !/[\\\u0000-\u001f:?#]/.test(file) && file.split('/').every(p => p && p !== '.' && p !== '..'), `VM_BUILD_PATH:${file}`);
    const full = await realpath(resolve(root, file));
    const offset = relative(root, full);
    assert.ok(offset && offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset), `VM_BUILD_PATH:${file}`);
    return full;
  };
  const read = async file => readFile(await filePath(file));
  const manifest = JSON.parse(await read('manifest.json'));
  const provenance = JSON.parse(await read('workbench-provenance.json'));
  assert.ok(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'VM_BUILD_MANIFEST');
  assert.ok(provenance?.schemaVersion === 1 && provenance.chunks && typeof provenance.chunks === 'object' && !Array.isArray(provenance.chunks), 'VM_BUILD_PROVENANCE');
  const entries = Object.keys(manifest).filter(k => manifest[k]?.isEntry === true);
  assert.ok(entries.length, 'VM_BUILD_ENTRY');
  for (const item of Object.values(manifest)) {
    assert.ok(item && typeof item === 'object', 'VM_BUILD_MANIFEST');
    await filePath(item.file);
  }
  const chunks = Object.keys(manifest).filter(k => /\.[cm]?js$/.test(manifest[k].file));
  const files = chunks.map(k => manifest[k].file);
  assert.equal(new Set(files).size, files.length, 'VM_BUILD_DUPLICATE_CHUNK');
  assert.deepEqual(Object.keys(provenance.chunks).sort(), [...files].sort(), 'VM_BUILD_INVENTORY');
  for (const key of chunks) {
    const item = manifest[key], evidence = provenance.chunks[item.file];
    assert.equal(evidence.isEntry, item.isEntry === true, `VM_BUILD_ENTRY:${key}`);
    assert.ok(Array.isArray(evidence.modules) && evidence.modules.length && evidence.modules.every(id => typeof id === 'string' && id.length), `VM_BUILD_MODULES:${key}`);
    for (const edge of ['imports', 'dynamicImports']) {
      const refs = item[edge] ?? [];
      assert.ok(Array.isArray(refs) && refs.every(k => typeof k === 'string' && Object.hasOwn(manifest, k) && chunks.includes(k)), `VM_BUILD_NODE:${key}:${edge}`);
      assert.ok(Array.isArray(evidence[edge]), `VM_BUILD_EDGES:${key}:${edge}`);
      assert.deepEqual([...evidence[edge]].sort(), refs.map(k => manifest[k].file).sort(), `VM_BUILD_EDGES:${key}:${edge}`);
    }
    assert.equal(createHash('sha256').update(await read(item.file)).digest('hex'), evidence.sha256, `VM_BUILD_DIGEST:${key}`);
  }
  const initial = new Set();
  const visit = key => {
    assert.ok(chunks.includes(key), `VM_BUILD_NODE:${key}`);
    if (initial.has(key)) return;
    initial.add(key);
    for (const next of manifest[key].imports ?? []) visit(next);
  };
  entries.forEach(visit);
  const assets = new Set();
  for (const key of initial) {
    const item = manifest[key];
    for (const id of provenance.chunks[item.file].modules) assert.ok(!vmModule(id), `VM_BUILD_EAGER_MODULE:${id}`);
    for (const kind of ['assets', 'css']) {
      const refs = item[kind] ?? [];
      assert.ok(Array.isArray(refs), `VM_BUILD_ASSETS:${key}`);
      for (const file of refs) {
        await filePath(file);
        const sourceIsBinary = Object.entries(manifest).some(([source, asset]) => asset.file === file && (binary.test(source) || (typeof asset.src === 'string' && binary.test(asset.src))));
        assert.ok(!binary.test(file) && !sourceIsBinary, `VM_BUILD_EAGER_ASSET:${file}`);
        assets.add(file);
      }
    }
  }
  return {
    scope: 'emitted-static-module-graph; not runtime network or production acceptance',
    entryKeys: entries.sort(), verifiedChunks: chunks.length,
    initialChunks: [...initial].map(k => manifest[k].file).sort(), initialAssets: [...assets].sort(),
    deferredVmChunks: chunks.filter(k => !initial.has(k) && provenance.chunks[manifest[k].file].modules.some(vmModule)).map(k => manifest[k].file).sort(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await verifyVmBuildIsolation(process.argv[2] ?? 'frontend/dist'), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
