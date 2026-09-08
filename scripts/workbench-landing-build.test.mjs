import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  assert.ok(closure(entries, true).has(sceneRuntimeKey), 'UNREACHABLE_SCENE_RUNTIME');
  const sceneExclusiveKeys = [...closure([sceneRuntimeKey], true)].filter(key => !initialStaticKeys.has(key));
  let sceneExclusiveGzipBytes = 0;
  const sceneChunks = [];
  for (const key of sceneExclusiveKeys) {
    const file = manifest[key].file;
    assert.match(file, /\.js$/, `NON_JS_SCENE_CHUNK:${key}`);
    const bytes = gzipSync(await readFile(resolve(directory, file))).byteLength;
    sceneExclusiveGzipBytes += bytes;
    sceneChunks.push({ file, gzipBytes: bytes });
  }
  const assets = [];
  for (const suffix of ['workbench.glb', 'poster-desktop.webp', 'poster-mobile.webp']) {
    const key = Object.keys(manifest).find(key => key.endsWith(`/workbench-landing/${suffix}`));
    assert.ok(key, `MISSING_BUILT_ASSET:${suffix}`);
    const file = manifest[key].file;
    const bytes = (await stat(resolve(directory, file))).size;
    assets.push({ source: suffix, file, bytes });
  }
  return { initialStaticKeys, sceneRuntimeKey, sceneExclusiveGzipBytes, sceneChunks, assets, modelBytes: assets[0].bytes };
}

test('real Vite output keeps all 3D JavaScript lazy and within its transitive gzip budget', async () => {
  const graph = await loadBuildGraph(resolve(root, 'frontend/dist/manifest.json'));
  assert.equal(graph.initialStaticKeys.has(graph.sceneRuntimeKey), false, 'EAGER_SCENE_RUNTIME');
  assert.ok(graph.sceneExclusiveGzipBytes > 0, 'EMPTY_SCENE_BUNDLE');
  assert.ok(graph.sceneExclusiveGzipBytes <= 250 * 1024, `SCENE_JS_BUDGET:${graph.sceneExclusiveGzipBytes}`);
  assert.ok(graph.modelBytes <= 2 * 1024 * 1024, `GLB_BUDGET:${graph.modelBytes}`);
  for (const asset of graph.assets.slice(1)) assert.ok(asset.bytes <= 250 * 1024, `POSTER_BUDGET:${asset.source}:${asset.bytes}`);
  console.log(JSON.stringify({ sceneExclusiveGzipBytes: graph.sceneExclusiveGzipBytes, sceneChunks: graph.sceneChunks, assets: graph.assets }));
});
