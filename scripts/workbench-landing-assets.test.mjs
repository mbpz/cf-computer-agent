import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectLandingGlb, verifyLandingAssets } from './workbench-landing-assets.mjs';

const requiredNodes = ['MG_Desk', 'MG_Inbox', 'MG_Library', 'MG_Query', 'MG_Board', 'MG_Updates', 'MG_Assistant'];
const animationNodes = ['MG_CaptureCard', 'MG_CitationCard', 'MG_TaskCard'];
const allNodes = [...requiredNodes, ...animationNodes];
const assetDir = 'frontend/assets/workbench-landing';

// Independent fixtures encode the wire format; none calls verifier helpers.
function chunk(type, bytes, padding = 0) {
  const result = Buffer.alloc(8 + Math.ceil(bytes.length / 4) * 4, padding);
  result.writeUInt32LE(result.length - 8, 0);
  result.writeUInt32LE(type, 4);
  bytes.copy(result, 8);
  return result;
}

function packGlb(json, bin, extra = []) {
  const chunks = [chunk(0x4e4f534a, Buffer.from(JSON.stringify(json)), 0x20)];
  if (bin !== null) chunks.push(chunk(0x004e4942, bin));
  chunks.push(...extra);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + chunks.reduce((sum, part) => sum + part.length, 0), 8);
  return Buffer.concat([header, ...chunks]);
}

function makeGlb({ nodes = allNodes, primitiveCount = 1, indicesCount = 3, mode = 4, indexed = true, mutate = () => {}, image } = {}) {
  const positionCount = indexed ? 3 : indicesCount;
  const positions = Buffer.alloc(positionCount * 12);
  const indices = Buffer.alloc(indexed ? indicesCount * 2 : 0);
  for (let i = 0; i < indicesCount && indexed; i++) indices.writeUInt16LE(i % 3, i * 2);
  let bin = Buffer.concat([positions, indices]);
  const json = {
    asset: { version: '2.0', generator: 'Khronos glTF Blender I/O v4.5.0' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes: nodes.map((name, i) => ({ name, ...(i === 0 ? { mesh: 0 } : {}) })),
    meshes: [{ primitives: Array.from({ length: primitiveCount }, () => ({ attributes: { POSITION: 0 }, ...(indexed ? { indices: 1 } : {}), mode })) }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positionCount, type: 'VEC3', min: [0, 0, 0], max: [0, 0, 0] }],
  };
  if (indexed) {
    json.bufferViews.push({ buffer: 0, byteOffset: positions.length, byteLength: indices.length });
    json.accessors.push({ bufferView: 1, componentType: 5123, count: indicesCount, type: 'SCALAR' });
  }
  if (image) {
    const padding = Buffer.alloc((4 - bin.length % 4) % 4);
    json.bufferViews.push({ buffer: 0, byteOffset: bin.length + padding.length, byteLength: image.bytes.length });
    json.images = [{ bufferView: json.bufferViews.length - 1, mimeType: image.mimeType }];
    json.textures = [{ source: 0 }];
    json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
    json.meshes[0].primitives[0].material = 0;
    bin = Buffer.concat([bin, padding, image.bytes]);
    json.buffers[0].byteLength = bin.length;
  }
  const state = { json, bin };
  mutate(json, state);
  return packGlb(json, state.bin, state.extra);
}

function riffChunk(type, payload) {
  const part = Buffer.alloc(8 + payload.length + payload.length % 2);
  part.write(type, 0, 'ascii');
  part.writeUInt32LE(payload.length, 4);
  payload.copy(part, 8);
  return part;
}

function webp(width, height, { kind = 'VP8L', size } = {}) {
  let payload;
  if (kind === 'VP8L') {
    payload = Buffer.alloc(5);
    payload[0] = 0x2f;
    payload.writeUInt32LE((width - 1) + ((height - 1) * 16384), 1);
  } else {
    payload = Buffer.alloc(10);
    payload[0] = 0x10;
    Buffer.from([0x9d, 0x01, 0x2a]).copy(payload, 3);
    payload.writeUInt16LE(width, 6);
    payload.writeUInt16LE(height, 8);
  }
  const chunks = [riffChunk(kind, payload)];
  const baseSize = 12 + chunks[0].length;
  if (size) chunks.push(riffChunk('JUNK', Buffer.alloc(size - baseSize - 8)));
  const result = Buffer.alloc(12);
  result.write('RIFF', 0);
  result.writeUInt32LE(chunks.reduce((sum, part) => sum + part.length, 4), 4);
  result.write('WEBP', 8);
  return Buffer.concat([result, ...chunks]);
}

function extendedWebp(width, height, { canvasWidth = width, flags = 0, frame = true } = {}) {
  const header = Buffer.alloc(10);
  header[0] = flags;
  header.writeUIntLE(canvasWidth - 1, 4, 3);
  header.writeUIntLE(height - 1, 7, 3);
  const base = webp(width, height);
  const result = Buffer.concat([base.subarray(0, 12), riffChunk('VP8X', header), ...(frame ? [base.subarray(12)] : [])]);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

// Image-header fixtures intentionally test dimensions, not pixel decoding.
function png(width, height) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return { bytes, mimeType: 'image/png' };
}

function jpeg(width, height) {
  return { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9]), mimeType: 'image/jpeg' };
}

function fixtureRoot(t, { model = makeGlb(), desktop = webp(1600, 1000), mobile = webp(900, 1100), report } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'landing-verifier-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, assetDir), { recursive: true });
  mkdirSync(join(root, 'design/workbench-landing'), { recursive: true });
  writeFileSync(join(root, assetDir, 'workbench.glb'), model);
  writeFileSync(join(root, assetDir, 'poster-desktop.webp'), desktop);
  writeFileSync(join(root, assetDir, 'poster-mobile.webp'), mobile);
  writeFileSync(join(root, 'design/workbench-landing/asset-report.json'), JSON.stringify(report ?? {
    provenance: { kind: 'original-procedural-geometry', generator: 'scripts/blender/workbench-landing.py', externalAssets: [] },
    triangles: 999999, modelBytes: 1, maxTextureDimension: 999999,
  }));
  return root;
}

test('returns the exact inspection interface for Blender-style indexed primitives', () => {
  assert.deepEqual(inspectLandingGlb(makeGlb()), { triangles: 1, nodeNames: allNodes, maxTextureDimension: 0 });
});

test('rejects invalid GLB headers and versions', () => {
  assert.throws(() => inspectLandingGlb(Buffer.from('bad')), /GLB_HEADER/);
  for (const [offset, value] of [[0, 0], [4, 1], [8, 1]]) {
    const glb = makeGlb(); glb.writeUInt32LE(value, offset);
    assert.throws(() => inspectLandingGlb(glb), /GLB_HEADER/);
  }
});

test('rejects corrupt, unaligned, duplicated, reordered or unknown GLB chunks', () => {
  for (const [offset, value] of [[12, 0xffffffff], [12, 3], [16, 0x004e4942]]) {
    const glb = makeGlb(); glb.writeUInt32LE(value, offset);
    assert.throws(() => inspectLandingGlb(glb), /GLB_CHUNK/);
  }
  for (const type of [0x004e4942, 0x4e4f534a, 123]) {
    assert.throws(() => inspectLandingGlb(makeGlb({ mutate: (_, state) => { state.extra = [chunk(type, Buffer.alloc(4))]; } })), /GLB_CHUNK/);
  }
  const invalidJson = makeGlb(); invalidJson[20] = 0xff;
  assert.throws(() => inspectLandingGlb(invalidJson), /GLB_JSON/);
});

test('requires the embedded BIN and validates its declared byte length', () => {
  assert.throws(() => inspectLandingGlb(makeGlb({ mutate: (_, state) => { state.bin = null; } })), /GLB_BIN/);
  for (const byteLength of [0, -1, 1.5, 100000, 1]) {
    assert.throws(() => inspectLandingGlb(makeGlb({ mutate: json => { json.buffers[0].byteLength = byteLength; } })), /GLB_BIN/);
  }
});

test('requires all seven root nodes and all three animation nodes in the active scene', () => {
  assert.throws(() => inspectLandingGlb(makeGlb({ nodes: [] })), /MISSING_NODE/);
  for (const name of allNodes) {
    assert.throws(() => inspectLandingGlb(makeGlb({ nodes: allNodes.filter(node => node !== name) })), new RegExp(`MISSING_NODE.*${name}`));
  }
  assert.throws(() => inspectLandingGlb(makeGlb({ mutate: json => { json.scenes[0].nodes.pop(); } })), /MISSING_NODE.*MG_TaskCard/);
  assert.throws(() => inspectLandingGlb(makeGlb({ mutate: json => { json.scenes[0].nodes.splice(1, 1); json.nodes[0].children = [1]; } })), /ROOT_NODE.*MG_Inbox/);
  assert.throws(() => inspectLandingGlb(makeGlb({ mutate: json => { json.nodes.push({ name: 'MG_Desk' }); json.scenes[0].nodes.push(10); } })), /DUPLICATE_NODE/);
});

test('accepts nested animation nodes and rejects broken or cyclic scene graphs', () => {
  assert.equal(inspectLandingGlb(makeGlb({ mutate: json => { json.scenes[0].nodes = [0, 1, 2, 3, 4, 5, 6]; json.nodes[1].children = [7, 8, 9]; } })).triangles, 1);
  for (const mutate of [
    json => { json.scene = 9; },
    json => { json.scenes[0].nodes.push(999); },
    json => { json.nodes[0].children = [0]; },
    json => { json.nodes[0].children = [1]; },
    json => { json.nodes[0].mesh = 5; },
  ]) assert.throws(() => inspectLandingGlb(makeGlb({ mutate })), /SCENE_GRAPH|MESH_REFERENCE/);
});

test('counts mesh instances and primitives, but not unused meshes', () => {
  assert.equal(inspectLandingGlb(makeGlb({ primitiveCount: 2, indicesCount: 6, mutate: json => { json.nodes[1].mesh = 0; json.meshes.push(structuredClone(json.meshes[0])); } })).triangles, 8);
  assert.equal(inspectLandingGlb(makeGlb({ indexed: false, indicesCount: 6 })).triangles, 2);
  assert.equal(inspectLandingGlb(makeGlb({ mutate: json => { delete json.meshes[0].primitives[0].mode; } })).triangles, 1);
});

test('enforces the strict 60000 triangle boundary including instances', () => {
  assert.equal(inspectLandingGlb(makeGlb({ indicesCount: 180000 })).triangles, 60000);
  assert.throws(() => inspectLandingGlb(makeGlb({ indicesCount: 180003 })), /TRIANGLE_BUDGET/);
  assert.throws(() => inspectLandingGlb(makeGlb({ indicesCount: 90003, mutate: json => { json.nodes[1].mesh = 0; } })), /TRIANGLE_BUDGET/);
});

test('rejects non-triangle modes and incomplete triangles', () => {
  for (const mode of [0, 1, 2, 3, 5, 6, 7, -1, '4', null]) assert.throws(() => inspectLandingGlb(makeGlb({ mode })), /PRIMITIVE_MODE/);
  for (const indexed of [true, false]) assert.throws(() => inspectLandingGlb(makeGlb({ indexed, indicesCount: 4 })), /TRIANGLE_COUNT/);
});

test('validates accessor bounds, formats, indices, offsets and strides', () => {
  const mutations = [
    json => { json.accessors[1].count = 9999; },
    json => { json.accessors[1].count = -1; },
    json => { json.accessors[1].byteOffset = 1; },
    json => { json.accessors[0].bufferView = 99; },
    json => { json.accessors[0].componentType = 123; },
    json => { json.accessors[0].type = 'NOPE'; },
    json => { json.bufferViews[0].byteStride = 8; },
    json => { json.bufferViews[0].byteStride = 13; },
    json => { json.bufferViews[0].byteOffset = -1; },
    json => { json.bufferViews[0].byteLength = 999999; },
    json => { json.bufferViews[0].buffer = 1; },
    json => { json.meshes[0].primitives[0].indices = 99; },
    json => { json.accessors[1].componentType = 5122; },
    json => { json.accessors[1].normalized = true; },
    json => { json.accessors[0].type = 'SCALAR'; },
    (_, state) => { state.bin.writeUInt16LE(3, 36); },
    (_, state) => { state.bin.writeFloatLE(NaN, 0); },
  ];
  for (const mutate of mutations) assert.throws(() => inspectLandingGlb(makeGlb({ mutate })), /ACCESSOR|BUFFER_VIEW|POSITION/);
});

test('supports interleaved POSITION accessors without reading past their view', () => {
  const mutate = (json, state) => {
    state.bin = Buffer.concat([Buffer.alloc(48), state.bin.subarray(36)]);
    json.buffers[0].byteLength = state.bin.length;
    json.bufferViews[0].byteLength = 48;
    json.bufferViews[0].byteStride = 16;
    json.bufferViews[1].byteOffset = 48;
  };
  assert.equal(inspectLandingGlb(makeGlb({ mutate })).triangles, 1);
  assert.throws(() => inspectLandingGlb(makeGlb({ mutate: (json, state) => { mutate(json, state); json.bufferViews[0].byteLength = 43; } })), /ACCESSOR_BOUNDS/);
});

test('validates unreferenced accessors and their primitive component-type values', () => {
  for (const componentType of ['5126', 'toString', null, 5127]) {
    assert.throws(() => inspectLandingGlb(makeGlb({ mutate: json => {
      json.accessors.push({ ...json.accessors[0], componentType });
    } })), /ACCESSOR_FORMAT/);
  }
  assert.throws(() => inspectLandingGlb(makeGlb({ mutate: json => {
    json.accessors.push({ ...json.accessors[0], count: 100 });
  } })), /ACCESSOR_BOUNDS/);
});

test('rejects packed vertex attributes that are not four-byte aligned', () => {
  assert.throws(() => inspectLandingGlb(makeGlb({ mutate: json => {
    json.accessors.push({ bufferView: 0, componentType: 5121, count: 3, type: 'VEC3', normalized: true });
    json.meshes[0].primitives[0].attributes.COLOR_0 = 2;
  } })), /ACCESSOR_ATTRIBUTE/);
});

test('accepts unsigned index widths but rejects the reserved primitive-restart value', () => {
  function indexedGlb(componentType, width, last) {
    return makeGlb({ indexed: false, indicesCount: 258, mutate: (json, state) => {
      const indices = Buffer.alloc(3 * width);
      indices.writeUIntLE(0, 0, width);
      indices.writeUIntLE(1, width, width);
      indices.writeUIntLE(last, 2 * width, width);
      json.bufferViews.push({ buffer: 0, byteOffset: state.bin.length, byteLength: indices.length });
      json.accessors.push({ bufferView: 1, componentType, count: 3, type: 'SCALAR' });
      json.meshes[0].primitives[0].indices = 1;
      state.bin = Buffer.concat([state.bin, indices]);
      json.buffers[0].byteLength = state.bin.length;
    } });
  }
  assert.equal(inspectLandingGlb(indexedGlb(5121, 1, 254)).triangles, 1);
  assert.equal(inspectLandingGlb(indexedGlb(5123, 2, 255)).triangles, 1);
  assert.equal(inspectLandingGlb(indexedGlb(5125, 4, 255)).triangles, 1);
  assert.throws(() => inspectLandingGlb(indexedGlb(5121, 1, 255)), /ACCESSOR_INDICES/);
});

test('rejects nonzero BIN padding rather than treating it as buffer data', () => {
  const glb = makeGlb();
  glb[glb.length - 1] = 1;
  assert.throws(() => inspectLandingGlb(glb), /GLB_BIN/);
});

test('rejects sparse or compressed accessors instead of undercounting them', () => {
  assert.throws(() => inspectLandingGlb(makeGlb({ mutate: json => { json.accessors[0].sparse = { count: 1 }; } })), /ACCESSOR_SPARSE/);
  assert.throws(() => inspectLandingGlb(makeGlb({ mutate: json => { json.meshes[0].primitives[0].extensions = { KHR_draco_mesh_compression: {} }; } })), /UNSUPPORTED_EXTENSION/);
});

test('rejects all resource URIs including data URLs and unknown private extras', () => {
  for (const uri of ['https://example.test/private.png', '../private.bin', 'file:///private/file', 'data:image/png;base64,AAAA']) {
    for (const mutate of [json => { json.buffers[0].uri = uri; }, json => { json.images = [{ uri }]; }]) {
      assert.throws(() => inspectLandingGlb(makeGlb({ mutate })), /EXTERNAL_RESOURCE/);
    }
  }
  for (const mutate of [
    json => { json.extras = { secret: 'private' }; },
    json => { json.materials = [{ extras: { privatePath: '/Users/private' } }]; },
    json => { json.nodes[0].extras = { mg_owner: 'memory-garden-landing-v1' }; },
    json => { json.asset.generator = 'Blender /Users/private/project.blend'; },
  ]) assert.throws(() => inspectLandingGlb(makeGlb({ mutate })), /PRIVATE_METADATA/);
});

test('reads actual embedded PNG and JPEG dimensions at the 1024 pixel boundary', () => {
  for (const image of [png(1024, 512), jpeg(512, 1024)]) assert.equal(inspectLandingGlb(makeGlb({ image })).maxTextureDimension, 1024);
  for (const image of [png(1025, 1), jpeg(1, 1025)]) assert.throws(() => inspectLandingGlb(makeGlb({ image })), /TEXTURE_DIMENSION/);
  assert.throws(() => inspectLandingGlb(makeGlb({ image: { bytes: Buffer.from('bad'), mimeType: 'image/png' } })), /IMAGE_HEADER/);
  assert.throws(() => inspectLandingGlb(makeGlb({ image: png(10, 10), mutate: json => { json.images[0].bufferView = 99; } })), /BUFFER_VIEW/);
  assert.throws(() => inspectLandingGlb(makeGlb({ image: png(10, 10), mutate: json => { json.textures[0].source = 99; } })), /TEXTURE_REFERENCE/);
});

test('accepts ordinary Blender material extensions without allowing extra metadata', () => {
  assert.equal(inspectLandingGlb(makeGlb({ mutate: json => {
    json.extensionsUsed = ['KHR_materials_ior', 'KHR_materials_specular'];
    json.materials = [{ extensions: { KHR_materials_ior: { ior: 1.45 }, KHR_materials_specular: { specularFactor: 0.5 } } }];
  } })).triangles, 1);
});

test('enforces GLB bytes from the actual buffer, not JSON declarations', () => {
  const initialSize = makeGlb({ mutate: json => { json.scenes[0].name = ''; } }).length;
  const exact = makeGlb({ mutate: json => { json.scenes[0].name = 'x'.repeat(2 * 1024 * 1024 - initialSize); } });
  assert.equal(exact.length, 2097152);
  assert.equal(inspectLandingGlb(exact).triangles, 1);
  assert.throws(() => inspectLandingGlb(Buffer.alloc(2 * 1024 * 1024 + 1)), /GLB_BUDGET/);
});

test('returns exact AssetReport using real files and ignores self-reported counts', t => {
  const root = fixtureRoot(t);
  assert.deepEqual(verifyLandingAssets(root), {
    modelBytes: makeGlb().length, triangles: 1, nodeNames: allNodes, maxTextureDimension: 0,
    posters: [
      { path: `${assetDir}/poster-desktop.webp`, bytes: 26, width: 1600, height: 1000 },
      { path: `${assetDir}/poster-mobile.webp`, bytes: 26, width: 900, height: 1100 },
    ],
  });
});

test('enforces poster sizes and dimensions from both lossy and lossless headers', t => {
  assert.equal(verifyLandingAssets(fixtureRoot(t, { desktop: webp(1600, 1000, { kind: 'VP8 ', size: 250 * 1024 }) })).posters[0].bytes, 256000);
  assert.throws(() => verifyLandingAssets(fixtureRoot(t, { desktop: webp(1600, 1000, { size: 250 * 1024 + 2 }) })), /POSTER_BUDGET/);
  assert.throws(() => verifyLandingAssets(fixtureRoot(t, { desktop: webp(1599, 1000) })), /POSTER_DIMENSIONS/);
  assert.throws(() => verifyLandingAssets(fixtureRoot(t, { mobile: webp(900, 1099) })), /POSTER_DIMENSIONS/);
  assert.throws(() => verifyLandingAssets(fixtureRoot(t, { mobile: Buffer.from('bad') })), /WEBP_HEADER/);
  const broken = webp(900, 1100); broken.writeUInt32LE(999999, 16);
  assert.throws(() => verifyLandingAssets(fixtureRoot(t, { mobile: broken })), /WEBP_CHUNK/);
  const badRiff = webp(900, 1100); badRiff.writeUInt32LE(4, 4);
  assert.throws(() => verifyLandingAssets(fixtureRoot(t, { mobile: badRiff })), /WEBP_HEADER/);
});

test('reads extended WebP frames and rejects forged canvas sizes or animation', t => {
  assert.equal(verifyLandingAssets(fixtureRoot(t, { desktop: extendedWebp(1600, 1000) })).posters[0].width, 1600);
  for (const desktop of [extendedWebp(1599, 1000, { canvasWidth: 1600 }), extendedWebp(1600, 1000, { flags: 2 }), extendedWebp(1600, 1000, { frame: false })]) {
    assert.throws(() => verifyLandingAssets(fixtureRoot(t, { desktop })), /WEBP_HEADER/);
  }
});

test('enforces both poster and model budgets on real files', t => {
  assert.throws(() => verifyLandingAssets(fixtureRoot(t, { model: Buffer.alloc(2097153) })), /GLB_BUDGET/);
  assert.throws(() => verifyLandingAssets(fixtureRoot(t, { mobile: Buffer.alloc(256001) })), /POSTER_BUDGET/);
});

test('requires original procedural geometry provenance without trusting reported budgets', t => {
  for (const report of [{}, { provenance: { kind: 'downloaded', generator: 'scripts/blender/workbench-landing.py', externalAssets: [] } }, { provenance: { kind: 'original-procedural-geometry', generator: '/private/model.py', externalAssets: [] } }, { provenance: { kind: 'original-procedural-geometry', generator: 'scripts/blender/workbench-landing.py', externalAssets: ['stock.glb'] } }]) {
    assert.throws(() => verifyLandingAssets(fixtureRoot(t, { report })), /ASSET_PROVENANCE/);
  }
  const root = fixtureRoot(t);
  const path = join(root, 'design/workbench-landing/asset-report.json');
  writeFileSync(path, '{broken');
  assert.throws(() => verifyLandingAssets(root), /ASSET_PROVENANCE/);
  rmSync(path);
  assert.throws(() => verifyLandingAssets(root), /ASSET_FILE.*asset-report/);
});

test('reports missing actual files with the constraint and path', t => {
  const root = fixtureRoot(t);
  rmSync(join(root, assetDir, 'workbench.glb'));
  assert.throws(() => verifyLandingAssets(root), /ASSET_FILE.*workbench\.glb/);
});

test('CLI resolves assets from its script repository root, not the caller working directory', t => {
  const root = fixtureRoot(t);
  mkdirSync(join(root, 'scripts'));
  // Copying the implementation into a fixture repo exercises the real entrypoint without real assets.
  const script = fileURLToPath(new URL('./workbench-landing-assets.mjs', import.meta.url));
  copyFileSync(script, join(root, 'scripts/workbench-landing-assets.mjs'));
  const cli = join(root, 'scripts/workbench-landing-assets.mjs');
  const result = spawnSync(process.execPath, [cli, '--check'], { cwd: dirname(root), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).triangles, 1);
  writeFileSync(join(root, assetDir, 'poster-mobile.webp'), webp(1, 1));
  const failed = spawnSync(process.execPath, [cli, '--check'], { cwd: dirname(root), encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /POSTER_DIMENSIONS/);
  const usage = spawnSync(process.execPath, [cli, '--unknown'], { encoding: 'utf8' });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /USAGE/);
});

test('public module import does not depend on a caller entrypoint existing on disk', () => {
  const url = new URL('./workbench-landing-assets.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `process.argv[1] = '/does-not-exist/virtual-entrypoint.mjs'; const api = await import(${JSON.stringify(url)}); console.log(typeof api.inspectLandingGlb);`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'function');
});
