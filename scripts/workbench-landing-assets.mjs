import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_NODES = ['MG_Desk', 'MG_Inbox', 'MG_Library', 'MG_Query', 'MG_Board', 'MG_Updates', 'MG_Assistant'];
const ANIMATION_NODES = ['MG_CaptureCard', 'MG_CitationCard', 'MG_TaskCard'];
const MODEL_LIMIT = 2 * 1024 * 1024;
const POSTER_LIMIT = 250 * 1024;
const ASSET_DIR = 'frontend/assets/workbench-landing';
const MATERIAL_EXTENSIONS = new Set([
  'KHR_materials_unlit', 'KHR_materials_ior', 'KHR_materials_specular',
  'KHR_materials_clearcoat', 'KHR_materials_transmission', 'KHR_materials_volume',
  'KHR_materials_sheen', 'KHR_materials_emissive_strength', 'KHR_texture_transform',
]);

function requireConstraint(condition, code, detail) {
  if (!condition) throw new Error(`${code}: ${detail}`);
}

const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function entry(array, index, code) {
  requireConstraint(Array.isArray(array) && integer(index) && index < array.length && object(array[index]), code, `invalid reference ${index}`);
  return array[index];
}

function metadataPolicy(json) {
  const pending = [json];
  while (pending.length) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      requireConstraint(key !== 'uri', 'EXTERNAL_RESOURCE', 'all resources must use embedded BIN bufferViews');
      // Export with export_extras=False. No report-controlled broad whitelist can leak custom properties.
      requireConstraint(key !== 'extras', 'PRIVATE_METADATA', 'GLB extras are not permitted');
      if (key === 'extensions') {
        requireConstraint(object(child), 'UNSUPPORTED_EXTENSION', 'invalid extensions object');
        for (const extension of Object.keys(child)) requireConstraint(MATERIAL_EXTENSIONS.has(extension), 'UNSUPPORTED_EXTENSION', extension);
      }
      if (child !== null && typeof child === 'object') pending.push(child);
    }
  }
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (json[key] === undefined) continue;
    requireConstraint(Array.isArray(json[key]), 'UNSUPPORTED_EXTENSION', key);
    for (const extension of json[key]) requireConstraint(MATERIAL_EXTENSIONS.has(extension), 'UNSUPPORTED_EXTENSION', String(extension));
  }
  const generator = json.asset.generator;
  requireConstraint(generator === undefined || (typeof generator === 'string' && /^Khronos glTF Blender I\/O v\d+(?:\.\d+)*(?:[-+][A-Za-z0-9.-]+)?$/.test(generator)), 'PRIVATE_METADATA', 'unrecognized asset.generator; only the Blender exporter version is allowed');
}

function parseGlb(buffer) {
  requireConstraint(Buffer.isBuffer(buffer), 'GLB_HEADER', 'expected a Buffer');
  requireConstraint(buffer.length <= MODEL_LIMIT, 'GLB_BUDGET', `${buffer.length} bytes exceeds ${MODEL_LIMIT}`);
  requireConstraint(buffer.length >= 20 && buffer.readUInt32LE(0) === 0x46546c67 && buffer.readUInt32LE(4) === 2 && buffer.readUInt32LE(8) === buffer.length, 'GLB_HEADER', 'invalid magic, version or declared length');
  let offset = 12;
  const chunks = [];
  while (offset < buffer.length) {
    requireConstraint(offset + 8 <= buffer.length, 'GLB_CHUNK', 'truncated chunk header');
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    requireConstraint(length > 0 && length % 4 === 0 && offset + 8 + length <= buffer.length, 'GLB_CHUNK', 'unaligned or out-of-bounds chunk');
    requireConstraint((chunks.length === 0 && type === 0x4e4f534a) || (chunks.length === 1 && type === 0x004e4942), 'GLB_CHUNK', 'expected JSON then one BIN, with no other chunks');
    chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  let json;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(chunks[0]));
  } catch {
    throw new Error('GLB_JSON: invalid UTF-8 or JSON');
  }
  requireConstraint(object(json) && object(json.asset) && json.asset.version === '2.0', 'GLB_JSON', 'expected a glTF 2.0 object');
  metadataPolicy(json);
  const bin = chunks[1];
  requireConstraint(bin && Array.isArray(json.buffers) && json.buffers.length === 1 && object(json.buffers[0]), 'GLB_BIN', 'one embedded buffer is required');
  const length = json.buffers[0].byteLength;
  requireConstraint(integer(length, 1) && length <= bin.length && bin.length - length <= 3, 'GLB_BIN', 'invalid embedded buffer byteLength');
  requireConstraint(bin.subarray(length).every(byte => byte === 0), 'GLB_BIN', 'nonzero BIN padding');
  for (const key of ['nodes', 'scenes', 'meshes', 'bufferViews', 'accessors', 'images', 'textures', 'materials']) {
    requireConstraint(json[key] === undefined || Array.isArray(json[key]), 'GLB_JSON', `${key} must be an array`);
  }
  return { json, bin: bin.subarray(0, length) };
}

function binaryLayout(json, bin) {
  const views = (json.bufferViews ?? []).map((view, index) => {
    requireConstraint(object(view), 'BUFFER_VIEW', `invalid view ${index}`);
    const offset = view.byteOffset ?? 0;
    requireConstraint(view.buffer === 0 && integer(offset) && integer(view.byteLength, 1) && offset + view.byteLength <= bin.length, 'BUFFER_VIEW', `view ${index} is outside the embedded buffer`);
    if (view.byteStride !== undefined) requireConstraint(integer(view.byteStride, 4) && view.byteStride <= 252 && view.byteStride % 4 === 0, 'BUFFER_VIEW', `invalid stride in view ${index}`);
    return { ...view, byteOffset: offset };
  });
  const widths = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const types = { SCALAR: [1, 1], VEC2: [2, 1], VEC3: [3, 1], VEC4: [4, 1], MAT2: [2, 2], MAT3: [3, 3], MAT4: [4, 4] };
  const accessors = (json.accessors ?? []).map((accessor, index) => {
    requireConstraint(object(accessor), 'ACCESSOR', `invalid accessor ${index}`);
    requireConstraint(accessor.sparse === undefined, 'ACCESSOR_SPARSE', 'sparse accessors require a separately verified decoder');
    const view = entry(views, accessor.bufferView, 'ACCESSOR_BOUNDS');
    const width = widths[accessor.componentType];
    const shape = types[accessor.type];
    requireConstraint(integer(accessor.componentType) && width !== undefined && Array.isArray(shape) && integer(accessor.count, 1), 'ACCESSOR_FORMAT', `invalid format/count in accessor ${index}`);
    const [rows, columns] = shape;
    const size = columns === 1 ? rows * width : Math.ceil(rows * width / 4) * 4 * columns;
    const offset = accessor.byteOffset ?? 0;
    const stride = view.byteStride ?? size;
    requireConstraint(integer(offset) && offset % width === 0 && (view.byteOffset + offset) % width === 0 && stride >= size && stride % width === 0 && offset + (accessor.count - 1) * stride + size <= view.byteLength, 'ACCESSOR_BOUNDS', `accessor ${index} exceeds or misaligns its bufferView`);
    requireConstraint(accessor.normalized === undefined || (typeof accessor.normalized === 'boolean' && (!accessor.normalized || [5120, 5121, 5122, 5123].includes(accessor.componentType))), 'ACCESSOR_FORMAT', `invalid normalization in accessor ${index}`);
    return { ...accessor, offset: view.byteOffset + offset, stride, view };
  });
  return { views, accessors };
}

function webpDimensions(buffer) {
  requireConstraint(buffer.length >= 20 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' && buffer.readUInt32LE(4) + 8 === buffer.length, 'WEBP_HEADER', 'invalid RIFF/WebP header or length');
  let offset = 12;
  let canvas;
  let image;
  while (offset < buffer.length) {
    requireConstraint(offset + 8 <= buffer.length, 'WEBP_CHUNK', 'truncated chunk header');
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    requireConstraint(end + length % 2 <= buffer.length, 'WEBP_CHUNK', 'chunk exceeds RIFF length');
    const bytes = buffer.subarray(offset + 8, end);
    if (type === 'VP8X') {
      requireConstraint(offset === 12 && length === 10 && !canvas && (bytes[0] & 0xc3) === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0, 'WEBP_HEADER', 'invalid or animated VP8X');
      canvas = { width: bytes.readUIntLE(4, 3) + 1, height: bytes.readUIntLE(7, 3) + 1 };
    } else if (type === 'VP8L' || type === 'VP8 ') {
      requireConstraint(!image, 'WEBP_HEADER', 'multiple image payloads');
      if (type === 'VP8L') {
        requireConstraint(length >= 5 && bytes[0] === 0x2f && (bytes[4] & 0xe0) === 0, 'WEBP_HEADER', 'invalid VP8L header');
        const bits = bytes.readUInt32LE(1);
        image = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      } else {
        requireConstraint(length >= 10 && (bytes[0] & 1) === 0 && bytes[3] === 0x9d && bytes[4] === 1 && bytes[5] === 0x2a, 'WEBP_HEADER', 'invalid VP8 keyframe');
        image = { width: bytes.readUInt16LE(6) & 0x3fff, height: bytes.readUInt16LE(8) & 0x3fff };
      }
    } else requireConstraint(type !== 'ANIM' && type !== 'ANMF', 'WEBP_HEADER', 'animated images are not permitted');
    offset = end + length % 2;
  }
  requireConstraint(image && image.width > 0 && image.height > 0, 'WEBP_HEADER', 'missing image payload or zero dimensions');
  requireConstraint(!canvas || (canvas.width === image.width && canvas.height === image.height), 'WEBP_HEADER', 'canvas and image dimensions disagree');
  return image;
}

function imageDimensions(buffer, mimeType) {
  if (mimeType === 'image/png') {
    requireConstraint(buffer.length >= 33 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.readUInt32BE(8) === 13 && buffer.toString('ascii', 12, 16) === 'IHDR', 'IMAGE_HEADER', 'invalid PNG IHDR');
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    requireConstraint(width > 0 && height > 0, 'IMAGE_HEADER', 'zero PNG dimensions');
    return { width, height };
  }
  requireConstraint(mimeType === 'image/jpeg' && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8, 'IMAGE_HEADER', 'only embedded PNG/JPEG textures are supported');
  let offset = 2;
  while (offset < buffer.length) {
    requireConstraint(buffer[offset++] === 0xff, 'IMAGE_HEADER', 'invalid JPEG marker');
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    requireConstraint(marker !== undefined && marker !== 0xda && marker !== 0xd9 && offset + 2 <= buffer.length, 'IMAGE_HEADER', 'JPEG has no valid frame header');
    const length = buffer.readUInt16BE(offset);
    requireConstraint(length >= 2 && offset + length <= buffer.length, 'IMAGE_HEADER', 'truncated JPEG segment');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      requireConstraint(length >= 8 && length === 8 + buffer[offset + 7] * 3, 'IMAGE_HEADER', 'invalid JPEG frame length');
      const width = buffer.readUInt16BE(offset + 5);
      const height = buffer.readUInt16BE(offset + 3);
      requireConstraint(width > 0 && height > 0, 'IMAGE_HEADER', 'zero JPEG dimensions');
      return { width, height };
    }
    offset += length;
  }
  throw new Error('IMAGE_HEADER: missing JPEG frame');
}

function textureDimensions(json, bin, views) {
  let maxTextureDimension = 0;
  for (const image of json.images ?? []) {
    requireConstraint(object(image), 'IMAGE_HEADER', 'invalid image');
    const view = entry(views, image.bufferView, 'BUFFER_VIEW');
    requireConstraint(view.byteStride === undefined && view.target === undefined, 'BUFFER_VIEW', 'image bufferView must contain tightly packed image bytes');
    const { width, height } = imageDimensions(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength), image.mimeType);
    maxTextureDimension = Math.max(maxTextureDimension, width, height);
    requireConstraint(maxTextureDimension <= 1024, 'TEXTURE_DIMENSION', `${width}x${height} exceeds 1024 pixels per side`);
  }
  for (const texture of json.textures ?? []) {
    requireConstraint(object(texture), 'TEXTURE_REFERENCE', 'invalid texture');
    entry(json.images, texture.source, 'TEXTURE_REFERENCE');
    if (texture.sampler !== undefined) entry(json.samplers, texture.sampler, 'TEXTURE_REFERENCE');
  }
  const pending = [...(json.materials ?? [])];
  while (pending.length) {
    const material = pending.pop();
    requireConstraint(object(material), 'TEXTURE_REFERENCE', 'invalid material');
    for (const [key, value] of Object.entries(material)) {
      if (/Texture$/.test(key)) {
        requireConstraint(object(value), 'TEXTURE_REFERENCE', key);
        entry(json.textures, value.index, 'TEXTURE_REFERENCE');
      }
      if (object(value)) pending.push(value);
    }
  }
  return maxTextureDimension;
}

function meshTriangleCounts(json, bin, accessors) {
  return (json.meshes ?? []).map((mesh, meshIndex) => {
    requireConstraint(object(mesh) && Array.isArray(mesh.primitives) && mesh.primitives.length > 0, 'MESH_REFERENCE', `invalid mesh ${meshIndex}`);
    let triangles = 0;
    for (const primitive of mesh.primitives) {
      requireConstraint(object(primitive), 'PRIMITIVE_MODE', 'invalid primitive');
      requireConstraint(primitive.mode === undefined || primitive.mode === 4, 'PRIMITIVE_MODE', 'only TRIANGLES (4) are supported');
      requireConstraint(object(primitive.attributes), 'POSITION', 'missing attributes');
      const position = entry(accessors, primitive.attributes.POSITION, 'ACCESSOR_POSITION');
      requireConstraint(position.type === 'VEC3' && position.componentType === 5126 && !position.normalized, 'ACCESSOR_POSITION', 'POSITION must be non-normalized float VEC3');
      for (const [semantic, index] of Object.entries(primitive.attributes)) {
        const attribute = entry(accessors, index, 'ACCESSOR_ATTRIBUTE');
        requireConstraint(attribute.count === position.count, 'ACCESSOR_ATTRIBUTE', `${semantic} count differs from POSITION`);
        requireConstraint(attribute.offset % 4 === 0 && attribute.stride % 4 === 0, 'ACCESSOR_ATTRIBUTE', `${semantic} vertex elements must be four-byte aligned`);
      }
      for (let i = 0; i < position.count; i++) {
        for (let axis = 0; axis < 3; axis++) requireConstraint(Number.isFinite(bin.readFloatLE(position.offset + i * position.stride + axis * 4)), 'POSITION', 'non-finite vertex');
      }
      let count = position.count;
      if (primitive.indices !== undefined) {
        const indices = entry(accessors, primitive.indices, 'ACCESSOR_INDICES');
        requireConstraint(indices.type === 'SCALAR' && [5121, 5123, 5125].includes(indices.componentType) && !indices.normalized && indices.view.byteStride === undefined, 'ACCESSOR_INDICES', 'indices must be tightly packed unsigned scalars');
        count = indices.count;
        const width = { 5121: 1, 5123: 2, 5125: 4 }[indices.componentType];
        const restart = 2 ** (8 * width) - 1;
        for (let i = 0; i < count; i++) {
          const value = bin.readUIntLE(indices.offset + i * width, width);
          requireConstraint(value < position.count && value !== restart, 'ACCESSOR_INDICES', 'index is outside POSITION accessor or is a reserved restart value');
        }
      }
      requireConstraint(count % 3 === 0, 'TRIANGLE_COUNT', 'primitive vertex/index count must be divisible by 3');
      if (primitive.material !== undefined) entry(json.materials, primitive.material, 'MATERIAL_REFERENCE');
      triangles += count / 3;
    }
    return triangles;
  });
}

/** Inspect the active scene. Public shape: { triangles, nodeNames, maxTextureDimension }. */
export function inspectLandingGlb(buffer) {
  const { json, bin } = parseGlb(buffer);
  const scene = entry(json.scenes, json.scene ?? 0, 'SCENE_GRAPH');
  requireConstraint(Array.isArray(scene.nodes), 'SCENE_GRAPH', 'scene needs root nodes');
  const visited = new Set();
  const rootNames = new Set();
  const names = new Set();
  const meshInstances = [];
  const pending = scene.nodes.map(index => ({ index, root: true })).reverse();
  while (pending.length) {
    const { index, root } = pending.pop();
    const node = entry(json.nodes, index, 'SCENE_GRAPH');
    requireConstraint(!visited.has(index), 'SCENE_GRAPH', 'cycle, repeated root or multiple parents');
    visited.add(index);
    if (node.name !== undefined) {
      requireConstraint(typeof node.name === 'string', 'SCENE_GRAPH', 'invalid node name');
      if ([...ROOT_NODES, ...ANIMATION_NODES].includes(node.name)) requireConstraint(!names.has(node.name), 'DUPLICATE_NODE', node.name);
      names.add(node.name);
      if (root) rootNames.add(node.name);
    }
    if (node.mesh !== undefined) {
      entry(json.meshes, node.mesh, 'MESH_REFERENCE');
      meshInstances.push(node.mesh);
    }
    requireConstraint(node.children === undefined || Array.isArray(node.children), 'SCENE_GRAPH', 'children must be an array');
    for (const child of [...(node.children ?? [])].reverse()) pending.push({ index: child, root: false });
  }
  for (const name of [...ROOT_NODES, ...ANIMATION_NODES]) requireConstraint(names.has(name), 'MISSING_NODE', name);
  for (const name of ROOT_NODES) requireConstraint(rootNames.has(name), 'ROOT_NODE', `${name} must be a scene root`);
  const { views, accessors } = binaryLayout(json, bin);
  const counts = meshTriangleCounts(json, bin, accessors);
  const triangles = meshInstances.reduce((sum, mesh) => sum + counts[mesh], 0);
  requireConstraint(triangles <= 60000, 'TRIANGLE_BUDGET', `${triangles} scene-instance triangles exceeds 60000`);
  const maxTextureDimension = textureDimensions(json, bin, views);
  // Stable file order, including nested animation nodes, not traversal-dependent ordering.
  const nodeNames = json.nodes.filter((node, index) => visited.has(index) && typeof node.name === 'string').map(node => node.name);
  return { triangles, nodeNames, maxTextureDimension };
}

function readAsset(root, path, limit, budgetCode) {
  try {
    const file = join(root, path);
    const stat = statSync(file);
    requireConstraint(stat.isFile(), 'ASSET_FILE', `${path} is not a regular file`);
    requireConstraint(stat.size <= limit, budgetCode, `${path}: ${stat.size} bytes exceeds ${limit}`);
    const buffer = readFileSync(file);
    requireConstraint(buffer.length <= limit, budgetCode, `${path}: ${buffer.length} bytes exceeds ${limit}`);
    return buffer;
  } catch (error) {
    if (error.code) throw new Error(`ASSET_FILE: ${path}: ${error.code}`);
    throw error;
  }
}

/**
 * Read real files under root. Provenance is a declaration, never a source of measured counts.
 * AssetReport: { modelBytes, triangles, nodeNames, maxTextureDimension, posters: [{path,bytes,width,height}] }.
 */
export function verifyLandingAssets(root) {
  requireConstraint(typeof root === 'string' && root.length > 0, 'ASSET_ROOT', 'expected repository root path');
  const model = readAsset(root, `${ASSET_DIR}/workbench.glb`, MODEL_LIMIT, 'GLB_BUDGET');
  const inspection = inspectLandingGlb(model);
  const posters = [
    ['poster-desktop.webp', 1600, 1000],
    ['poster-mobile.webp', 900, 1100],
  ].map(([name, expectedWidth, expectedHeight]) => {
    const path = `${ASSET_DIR}/${name}`;
    const buffer = readAsset(root, path, POSTER_LIMIT, 'POSTER_BUDGET');
    const { width, height } = webpDimensions(buffer);
    requireConstraint(width === expectedWidth && height === expectedHeight, 'POSTER_DIMENSIONS', `${path}: expected ${expectedWidth}x${expectedHeight}, got ${width}x${height}`);
    return { path, bytes: buffer.length, width, height };
  });
  const reportBytes = readAsset(root, 'design/workbench-landing/asset-report.json', MODEL_LIMIT, 'ASSET_PROVENANCE');
  let report;
  try { report = JSON.parse(reportBytes.toString('utf8')); } catch { throw new Error('ASSET_PROVENANCE: invalid JSON source report'); }
  const provenance = object(report) ? report.provenance : undefined;
  requireConstraint(object(provenance) && provenance.kind === 'original-procedural-geometry' && provenance.generator === 'scripts/blender/workbench-landing.py' && Array.isArray(provenance.externalAssets) && provenance.externalAssets.length === 0, 'ASSET_PROVENANCE', 'expected provenance {kind:"original-procedural-geometry",generator:"scripts/blender/workbench-landing.py",externalAssets:[]}');
  return { modelBytes: model.length, ...inspection, posters };
}

function isMainModule() {
  try { return Boolean(process.argv[1]) && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url); } catch { return false; }
}

if (isMainModule()) {
  try {
    requireConstraint(process.argv.length === 3 && process.argv[2] === '--check', 'USAGE', 'node scripts/workbench-landing-assets.mjs --check');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    console.log(JSON.stringify(verifyLandingAssets(root), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
