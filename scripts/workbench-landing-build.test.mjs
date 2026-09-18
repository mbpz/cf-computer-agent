import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { verifyLandingAssets } from './workbench-landing-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isRuntime = id => /(^|\/)workbench-scene-runtime\.[^/]+$/.test(id.replaceAll('\\', '/').split('?')[0]);
const isThree = id => /(^|\/)node_modules\/three\//.test(id.replaceAll('\\', '/'));
const isCytoscape = id => /(^|\/)node_modules\/cytoscape\//.test(id.replaceAll('\\', '/'));

export async function loadBuildGraph(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const directory = dirname(manifestPath);
  const entries = Object.keys(manifest).filter(key => manifest[key].isEntry);
  assert.ok(entries.length, 'MISSING_INITIAL_ENTRY');
  const sceneRuntimeKey = Object.keys(manifest).find(key => key.endsWith('/workbench-scene-runtime.ts'));
  assert.ok(sceneRuntimeKey, 'MISSING_SCENE_RUNTIME');
  const closure = (seeds, dynamic) => {
    const visited = new Set();
    const visit = key => {
      if (visited.has(key)) return;
      assert.ok(manifest[key], `MISSING_GRAPH_NODE:${key}`);
      visited.add(key);
      for (const next of manifest[key].imports ?? []) visit(next);
      if (dynamic) for (const next of manifest[key].dynamicImports ?? []) visit(next);
    };
    seeds.forEach(visit);
    return visited;
  };
  const initialStaticKeys = closure(entries, false);
  const provenance = JSON.parse(await readFile(resolve(directory, 'workbench-provenance.json'), 'utf8'));
  assert.ok(provenance.schemaVersion === 1 && provenance.chunks && typeof provenance.chunks === 'object', 'PROVENANCE_SCHEMA');
  const javascriptKeys = Object.keys(manifest).filter(key => /\.js$/.test(manifest[key].file));
  const chunkBytes = new Map();
  for (const key of closure(javascriptKeys, true)) {
    const item = manifest[key];
    const evidence = provenance.chunks[item.file];
    assert.ok(evidence && typeof evidence === 'object', `PROVENANCE_CHUNK:${key}`);
    assert.ok(Array.isArray(evidence.modules) && evidence.modules.length && evidence.modules.every(id => typeof id === 'string' && id.length > 0), `PROVENANCE_MODULES:${key}`);
    assert.equal(evidence.isEntry, item.isEntry === true, `PROVENANCE_ENTRY:${key}`);
    for (const edge of ['imports', 'dynamicImports']) {
      assert.ok(Array.isArray(evidence[edge]), `PROVENANCE_IMPORTS:${key}:${edge}`);
      assert.deepEqual([...evidence[edge]].sort(), (item[edge] ?? []).map(next => manifest[next].file).sort(), `PROVENANCE_IMPORTS:${key}:${edge}`);
    }
    const bytes = await readFile(resolve(directory, item.file));
    assert.equal(evidence.sha256, sha256(bytes), `PROVENANCE_DIGEST:${key}`);
    chunkBytes.set(item.file, bytes);
  }
  assert.deepEqual(Object.keys(provenance.chunks).sort(), [...new Set(javascriptKeys.map(key => manifest[key].file))].sort(), 'PROVENANCE_INVENTORY');
  assert.ok(provenance.chunks[manifest[sceneRuntimeKey].file]?.modules.some(isRuntime), 'PROVENANCE_RUNTIME');
  for (const key of initialStaticKeys) {
    for (const id of provenance.chunks[manifest[key].file].modules) {
      assert.ok(!isCytoscape(id), `EAGER_CYTOSCAPE_MODULE:${id}`);
      assert.ok(!isThree(id) && !isRuntime(id), `EAGER_3D_MODULE:${id}`);
    }
  }
  assert.ok(closure(entries, true).has(sceneRuntimeKey), 'UNREACHABLE_SCENE_RUNTIME');
  const sceneClosureKeys = closure([sceneRuntimeKey], true);
  assert.ok([...sceneClosureKeys].some(key => provenance.chunks[manifest[key].file].modules.some(isThree)), 'PROVENANCE_THREE');
  const cytoscapeKeys = [...sceneClosureKeys].filter(key => provenance.chunks[manifest[key].file].modules.some(isCytoscape));
  if (cytoscapeKeys.length > 0) {
    assert.equal(cytoscapeKeys.length, 1, 'CYTOSCAPE_CHUNK_COUNT');
    assert.equal(initialStaticKeys.has(cytoscapeKeys[0]), false, 'EAGER_CYTOSCAPE');
  }
  const cytoscapeChunks = cytoscapeKeys.map(key => ({
    file: manifest[key].file,
    gzipBytes: gzipSync(chunkBytes.get(manifest[key].file)).byteLength,
    modules: provenance.chunks[manifest[key].file].modules.filter(isCytoscape),
  }));
  const sceneExclusiveKeys = [...sceneClosureKeys].filter(key => !initialStaticKeys.has(key) && !cytoscapeKeys.includes(key));
  let sceneExclusiveGzipBytes = 0;
  const sceneChunks = [];
  for (const key of sceneExclusiveKeys) {
    const file = manifest[key].file;
    assert.match(file, /\.js$/, `NON_JS_SCENE_CHUNK:${key}`);
    const bytes = gzipSync(chunkBytes.get(file)).byteLength;
    sceneExclusiveGzipBytes += bytes;
    sceneChunks.push({ file, gzipBytes: bytes });
  }
  assert.ok(sceneExclusiveGzipBytes > 0, 'EMPTY_SCENE_BUNDLE');
  assert.ok(sceneExclusiveGzipBytes <= 250 * 1024, `SCENE_JS_BUDGET:${sceneExclusiveGzipBytes}`);
  // The public interface receives <repository>/frontend/dist/manifest.json.
  const repository = resolve(directory, '../..');
  const assetNames = ['workbench.glb', 'poster-desktop.webp', 'poster-mobile.webp'];
  const sourcePath = name => resolve(repository, 'frontend/assets/workbench-landing', name);
  const inspectedBytes = new Map(assetNames.map(name => [name, readFileSync(sourcePath(name))]));
  const assetReport = verifyLandingAssets(repository);
  for (const name of assetNames) {
    assert.ok(inspectedBytes.get(name).equals(readFileSync(sourcePath(name))), `SOURCE_ASSET_CHANGED:${name}`);
  }
  const assets = [];
  for (const suffix of assetNames) {
    const key = Object.keys(manifest).find(key => key.endsWith(`/workbench-landing/${suffix}`));
    assert.ok(key, `MISSING_BUILT_ASSET:${suffix}`);
    const file = manifest[key].file;
    const emitted = await readFile(resolve(directory, file));
    assert.ok(emitted.equals(inspectedBytes.get(suffix)), `BUILT_ASSET_MISMATCH:${suffix}`);
    const bytes = emitted.length;
    assets.push({ source: suffix, file, bytes });
  }
  return { initialStaticKeys, sceneRuntimeKey, sceneExclusiveGzipBytes, sceneChunks, cytoscapeChunks, assets, modelBytes: assets[0].bytes, assetReport };
}

test('real Vite output keeps all 3D JavaScript lazy and within its transitive gzip budget', async () => {
  const graph = await loadBuildGraph(resolve(root, 'frontend/dist/manifest.json'));
  assert.equal(graph.initialStaticKeys.has(graph.sceneRuntimeKey), false, 'EAGER_SCENE_RUNTIME');
  assert.ok(graph.sceneExclusiveGzipBytes > 0, 'EMPTY_SCENE_BUNDLE');
  assert.ok(graph.sceneExclusiveGzipBytes <= 250 * 1024, `SCENE_JS_BUDGET:${graph.sceneExclusiveGzipBytes}`);
  assert.ok(graph.modelBytes <= 2 * 1024 * 1024, `GLB_BUDGET:${graph.modelBytes}`);
  for (const asset of graph.assets.slice(1)) assert.ok(asset.bytes <= 250 * 1024, `POSTER_BUDGET:${asset.source}:${asset.bytes}`);
  console.log(JSON.stringify({ sceneExclusiveGzipBytes: graph.sceneExclusiveGzipBytes, sceneChunks: graph.sceneChunks, cytoscapeChunks: graph.cytoscapeChunks, assets: graph.assets, assetReport: graph.assetReport }));
});

// Temporary wire-format fixtures deliberately do not depend on repository assets.
function fixtureGlb(mutate = () => {}) {
  const names = ['MG_Desk', 'MG_Inbox', 'MG_Library', 'MG_Query', 'MG_Board', 'MG_Updates', 'MG_Assistant', 'MG_CaptureCard', 'MG_CitationCard', 'MG_TaskCard'];
  const json = {
    asset: { version: '2.0', generator: 'Khronos glTF Blender I/O v4.5.0' },
    scene: 0, scenes: [{ nodes: names.map((_, index) => index) }],
    nodes: names.map((name, index) => ({ name, ...(index === 0 ? { mesh: 0 } : {}) })),
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  };
  mutate(json);
  const encoded = Buffer.from(JSON.stringify(json));
  const size = Math.ceil(encoded.length / 4) * 4;
  const buffer = Buffer.alloc(12 + 8 + size + 8 + 36);
  buffer.writeUInt32LE(0x46546c67, 0); buffer.writeUInt32LE(2, 4); buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(size, 12); buffer.writeUInt32LE(0x4e4f534a, 16);
  buffer.fill(0x20, 20, 20 + size); encoded.copy(buffer, 20);
  buffer.writeUInt32LE(36, 20 + size); buffer.writeUInt32LE(0x004e4942, 24 + size);
  return buffer;
}

// The inspector validates WebP container headers, not pixel decoding; match that boundary.
function fixtureWebp(width, height) {
  const buffer = Buffer.alloc(26);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(18, 4); buffer.write('WEBP', 8);
  buffer.write('VP8L', 12); buffer.writeUInt32LE(5, 16); buffer[20] = 0x2f;
  buffer.writeUInt32LE((width - 1) + (height - 1) * 16384, 21);
  return buffer;
}

async function buildFixture(t, { eager = false, merged = false, cytoscapeEager = false } = {}) {
  const repository = await mkdtemp(resolve(tmpdir(), 'landing-build-gate-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const directory = resolve(repository, 'frontend/dist');
  await mkdir(resolve(directory, 'assets'), { recursive: true });
  const runtime = 'pages/workbench-landing/workbench-scene-runtime.ts';
  const cytoscape = '_cytoscape.js';
  const manifest = {
    'index.html': { file: 'assets/index.js', isEntry: true, imports: ['_shared.js', ...(eager ? ['_three.js'] : []), ...(cytoscapeEager ? [cytoscape] : [])], dynamicImports: [runtime] },
    '_shared.js': { file: 'assets/shared.js' },
    [runtime]: { file: 'assets/scene.js', imports: ['_shared.js', ...(merged ? [] : ['_three.js'])], isDynamicEntry: true },
    ...(!merged ? { '_three.js': { file: 'assets/three.js' } } : {}),
    ...(cytoscapeEager ? { [cytoscape]: { file: 'assets/cytoscape.js' } } : {}),
  };
  const modules = {
    'assets/index.js': ['frontend/main.tsx', ...(merged ? ['node_modules/three/build/three.core.js'] : [])],
    'assets/shared.js': ['node_modules/react/index.js', 'frontend/pages/workbench-landing/workbench-scene-config.ts'],
    'assets/scene.js': ['frontend/pages/workbench-landing/workbench-scene-runtime.ts'],
    'assets/three.js': ['node_modules/three/build/three.core.js'],
    'assets/cytoscape.js': ['node_modules/cytoscape/dist/cytoscape.esm.mjs'],
  };
  const provenance = { schemaVersion: 1, chunks: {} };
  for (const item of Object.values(manifest)) {
    const code = `export const fixture = ${JSON.stringify(item.file)};`;
    await writeFile(resolve(directory, item.file), code);
    provenance.chunks[item.file] = {
      modules: modules[item.file], sha256: createHash('sha256').update(code).digest('hex'),
      imports: (item.imports ?? []).map(key => manifest[key].file),
      dynamicImports: (item.dynamicImports ?? []).map(key => manifest[key].file),
      isEntry: item.isEntry === true,
    };
  }
  const sourceDirectory = resolve(repository, 'frontend/assets/workbench-landing');
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(resolve(repository, 'design/workbench-landing'), { recursive: true });
  await writeFile(resolve(repository, 'design/workbench-landing/asset-report.json'), JSON.stringify({ provenance: {
    kind: 'original-procedural-geometry', generator: 'scripts/blender/workbench-landing.py', externalAssets: [],
  } }));
  for (const [name, bytes] of [
    ['workbench.glb', fixtureGlb()], ['poster-desktop.webp', fixtureWebp(1600, 1000)], ['poster-mobile.webp', fixtureWebp(900, 1100)],
  ]) {
    manifest[`assets/workbench-landing/${name}`] = { file: `assets/${name}` };
    await writeFile(resolve(directory, `assets/${name}`), bytes);
    await writeFile(resolve(sourceDirectory, name), bytes);
  }
  const manifestPath = resolve(directory, 'manifest.json');
  const save = async () => {
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(resolve(directory, 'workbench-provenance.json'), JSON.stringify(provenance));
  };
  await save();
  return { repository, directory, sourceDirectory, manifestPath, manifest, provenance, runtime, save };
}

test('regression: rejects eager Three shared with a still-dynamic runtime', async t => {
  const fixture = await buildFixture(t, { eager: true });
  await assert.rejects(loadBuildGraph(fixture.manifestPath), /EAGER_3D_MODULE/);
});

test('regression: rejects eager Cytoscape in the initial static inventory', async t => {
  const fixture = await buildFixture(t, { cytoscapeEager: true });
  await assert.rejects(loadBuildGraph(fixture.manifestPath), /EAGER_CYTOSCAPE_MODULE/);
});

test('regression: a real Vite build produces module provenance tied to emitted chunk bytes', async t => {
  const fixture = await buildFixture(t);
  const frontend = resolve(fixture.repository, 'frontend');
  await mkdir(resolve(frontend, 'pages/workbench-landing'), { recursive: true });
  await mkdir(resolve(fixture.repository, 'node_modules/three'), { recursive: true });
  await writeFile(resolve(fixture.repository, 'node_modules/three/package.json'), JSON.stringify({ name: 'three', type: 'module', main: 'index.js' }));
  await writeFile(resolve(fixture.repository, 'node_modules/three/index.js'), 'export const scene = "three fixture";');
  await writeFile(resolve(frontend, 'index.html'), '<script type="module" src="/main.js"></script>');
  await writeFile(resolve(frontend, 'main.js'), `
    import desktop from './assets/workbench-landing/poster-desktop.webp?url';
    import mobile from './assets/workbench-landing/poster-mobile.webp?url';
    window.posters = [desktop, mobile];
    window.loadScene = () => import('./pages/workbench-landing/workbench-scene-runtime.ts');
  `);
  await writeFile(resolve(frontend, 'pages/workbench-landing/workbench-scene-runtime.ts'), `
    export { scene } from 'three';
    export { default as model } from '../../assets/workbench-landing/workbench.glb?url';
  `);
  const { build } = await import('vite');
  const { workbenchLandingProvenance } = await import('./workbench-landing-provenance.mjs');
  await build({ configFile: false, root: frontend, logLevel: 'silent', plugins: [workbenchLandingProvenance()], build: { outDir: 'producer-dist', assetsInlineLimit: 0, manifest: 'manifest.json' } });
  const output = resolve(frontend, 'producer-dist');
  const provenance = JSON.parse(await readFile(resolve(output, 'workbench-provenance.json'), 'utf8'));
  assert.equal(provenance.schemaVersion, 1);
  const chunks = Object.entries(provenance.chunks);
  assert.ok(chunks.some(([, chunk]) => chunk.modules.includes('node_modules/three/index.js')));
  assert.ok(chunks.some(([, chunk]) => chunk.modules.includes('frontend/pages/workbench-landing/workbench-scene-runtime.ts')));
  for (const [file, chunk] of chunks) {
    assert.equal(chunk.sha256, createHash('sha256').update(await readFile(resolve(output, file))).digest('hex'));
    assert.ok(chunk.modules.every(id => !id.includes(fixture.repository)), 'NO_LOCAL_PATHS_IN_PROVENANCE');
  }
  const graph = await loadBuildGraph(resolve(output, 'manifest.json'));
  assert.equal(graph.assetReport.triangles, 1);
  assert.equal(graph.initialStaticKeys.has(graph.sceneRuntimeKey), false);
});

test('regression: rejects stale or incomplete provenance instead of trusting chunk labels', async t => {
  for (const [name, mutate, expected] of [
    ['modified bytes', async f => writeFile(resolve(f.directory, 'assets/three.js'), 'modified'), /PROVENANCE_DIGEST/],
    ['missing chunk', f => { delete f.provenance.chunks['assets/three.js']; }, /PROVENANCE_CHUNK/],
    ['empty modules', f => { f.provenance.chunks['assets/three.js'].modules = []; }, /PROVENANCE_MODULES/],
    ['missing runtime identity', f => { f.provenance.chunks['assets/scene.js'].modules = ['frontend/unrelated.ts']; }, /PROVENANCE_RUNTIME/],
    ['hidden initial edge', f => { f.provenance.chunks['assets/index.js'].imports.push('assets/three.js'); }, /PROVENANCE_IMPORTS/],
    ['hidden dynamic edge', f => { f.provenance.chunks['assets/scene.js'].dynamicImports.push('assets/three.js'); }, /PROVENANCE_IMPORTS/],
    ['entry mismatch', f => { f.provenance.chunks['assets/three.js'].isEntry = true; }, /PROVENANCE_ENTRY/],
    ['unknown version', f => { f.provenance.schemaVersion = 99; }, /PROVENANCE_SCHEMA/],
  ]) await t.test(name, async t => {
    const fixture = await buildFixture(t);
    await mutate(fixture);
    await fixture.save();
    await assert.rejects(loadBuildGraph(fixture.manifestPath), expected);
  });
});

test('regression: merged Three and runtime modules cannot hide in initial or shared chunks', async t => {
  for (const [file, id] of [
    ['assets/index.js', 'node_modules/three/build/three.core.js'],
    ['assets/shared.js', 'node_modules/three/examples/jsm/loaders/GLTFLoader.js'],
    ['assets/shared.js', 'C:\\repo\\node_modules\\three\\build\\three.module.js'],
    ['assets/index.js', 'frontend/pages/workbench-landing/workbench-scene-runtime.ts?commonjs-proxy'],
  ]) await t.test(id, async t => {
    const fixture = await buildFixture(t, { merged: file === 'assets/index.js' && isThree(id) });
    fixture.provenance.chunks[file].modules.push(id);
    await fixture.save();
    await assert.rejects(loadBuildGraph(fixture.manifestPath), /EAGER_3D_MODULE/);
  });
});

test('regression: genuine shared React and config are allowed and excluded from scene gzip', async t => {
  const fixture = await buildFixture(t);
  const graph = await loadBuildGraph(fixture.manifestPath);
  assert.deepEqual(graph.sceneChunks.map(chunk => chunk.file).sort(), ['assets/scene.js', 'assets/three.js']);
  const expected = await Promise.all(['assets/scene.js', 'assets/three.js'].map(async file => gzipSync(await readFile(resolve(fixture.directory, file))).length));
  assert.equal(graph.sceneExclusiveGzipBytes, expected.reduce((sum, value) => sum + value, 0));
});

test('regression: transitive dynamic descendants count toward the gzip gate even through cycles', async t => {
  const fixture = await buildFixture(t);
  fixture.manifest[fixture.runtime].dynamicImports = ['_leaf.js'];
  fixture.provenance.chunks['assets/scene.js'].dynamicImports = ['assets/leaf.js'];
  fixture.manifest['_leaf.js'] = { file: 'assets/leaf.js', imports: [fixture.runtime, '_shared.js'] };
  // Deterministic high-entropy payload: compressed size cannot accidentally fit the budget.
  const code = Buffer.concat(Array.from({ length: 10000 }, (_, index) => createHash('sha256').update(String(index)).digest()));
  await writeFile(resolve(fixture.directory, 'assets/leaf.js'), code);
  fixture.provenance.chunks['assets/leaf.js'] = {
    modules: ['frontend/pages/workbench-landing/scene-detail.ts'], sha256: sha256(code),
    imports: ['assets/scene.js', 'assets/shared.js'], dynamicImports: [], isEntry: false,
  };
  await fixture.save();
  await assert.rejects(loadBuildGraph(fixture.manifestPath), /SCENE_JS_BUDGET/);
});

test('regression: actual source assets must pass the asset inspector, not just fit byte budgets', async t => {
  const fixture = await buildFixture(t);
  const invalid = fixtureGlb(json => { json.nodes[0].name = 'MissingDesk'; });
  await writeFile(resolve(fixture.sourceDirectory, 'workbench.glb'), invalid);
  await writeFile(resolve(fixture.directory, 'assets/workbench.glb'), invalid);
  await assert.rejects(loadBuildGraph(fixture.manifestPath), /MISSING_NODE/);
});

test('regression: emitted assets must be byte-identical to inspected sources, including same-size mutations', async t => {
  for (const name of ['workbench.glb', 'poster-desktop.webp', 'poster-mobile.webp']) await t.test(name, async t => {
    const fixture = await buildFixture(t);
    const path = resolve(fixture.directory, `assets/${name}`);
    const bytes = await readFile(path);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(path, bytes);
    await assert.rejects(loadBuildGraph(fixture.manifestPath), /BUILT_ASSET_MISMATCH/);
  });
});

test('regression: provenance must cover the complete emitted JavaScript inventory', async t => {
  for (const [name, mutate, expected] of [
    ['unlisted entry', f => { f.provenance.chunks['assets/other-entry.js'] = { ...f.provenance.chunks['assets/index.js'] }; }, /PROVENANCE_INVENTORY/],
    ['unproven Three identity', f => { f.provenance.chunks['assets/three.js'].modules = ['frontend/unrelated.js']; }, /PROVENANCE_THREE/],
  ]) await t.test(name, async t => {
    const fixture = await buildFixture(t);
    mutate(fixture);
    await fixture.save();
    await assert.rejects(loadBuildGraph(fixture.manifestPath), expected);
  });
});

test('regression: actual inspector enforces dimensions, private metadata and original-geometry provenance', async t => {
  for (const [name, mutate, expected] of [
    ['wrong desktop dimensions', f => writeFile(resolve(f.sourceDirectory, 'poster-desktop.webp'), fixtureWebp(900, 1100)), /POSTER_DIMENSIONS/],
    ['private extras', f => writeFile(resolve(f.sourceDirectory, 'workbench.glb'), fixtureGlb(json => { json.extras = { private: 'fixture' }; })), /PRIVATE_METADATA/],
    ['external GLB resource', f => writeFile(resolve(f.sourceDirectory, 'workbench.glb'), fixtureGlb(json => { json.buffers[0].uri = 'external.bin'; })), /EXTERNAL_RESOURCE/],
    ['unproven geometry', f => writeFile(resolve(f.repository, 'design/workbench-landing/asset-report.json'), '{}'), /ASSET_PROVENANCE/],
  ]) await t.test(name, async t => {
    const fixture = await buildFixture(t);
    await mutate(fixture);
    await assert.rejects(loadBuildGraph(fixture.manifestPath), expected);
  });
});

test('regression: dynamic and static transitive scene chunks are counted exactly once across cycles', async t => {
  const fixture = await buildFixture(t);
  fixture.manifest['_three.js'].dynamicImports = [fixture.runtime];
  fixture.provenance.chunks['assets/three.js'].dynamicImports = ['assets/scene.js'];
  fixture.manifest[fixture.runtime].dynamicImports = ['_three.js'];
  fixture.provenance.chunks['assets/scene.js'].dynamicImports = ['assets/three.js'];
  await fixture.save();
  const graph = await loadBuildGraph(fixture.manifestPath);
  const expected = await Promise.all(['assets/scene.js', 'assets/three.js'].map(async file => gzipSync(await readFile(resolve(fixture.directory, file))).length));
  assert.equal(graph.sceneChunks.length, 2);
  assert.equal(graph.sceneExclusiveGzipBytes, expected.reduce((sum, bytes) => sum + bytes, 0));
});
