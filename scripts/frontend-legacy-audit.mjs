import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const LEGACY_FILES = Object.freeze(["public/app.js", "public/workspace-ui.js", "public/navigation.js", "public/styles.css"]);
const SCAN_EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);
const CONTENT_ROOTS = Object.freeze(["frontend/pages", "frontend/features"]);
// The landing guide still mounts the beUI drawer directly for its citation
// focus contract; it moves onto ui/sheet with the landing page item (3.8).
const CONTENT_ALLOW = new Set(["frontend/pages/workbench-landing/workbench-feature-panel.tsx"]);
const DIRECT_OVERLAY_IMPORT = /from\s+["'][^"']*components\/motion\/(drawer|center-morph-modal|bottom-sheet|morphing-modal)["']/u;
const DIRECT_MOTION_IMPORT = /from\s+["']motion\/react["']/u;
const RAW_TABLE = /<table[\s>]/u;

export async function auditLegacyFrontend(root = process.cwd()) {
  const missingRollbackFiles = [];
  for (const path of LEGACY_FILES) {
    try { await stat(join(root, path)); } catch { missingRollbackFiles.push(path); }
  }
  const sourceRefs = await scanDirectory(join(root, "frontend"), root);
  const distRefs = await scanDirectory(join(root, "frontend", "dist"), root);
  const contentViolations = await scanContent(root);
  return { missingRollbackFiles, sourceRefs, distRefs, contentViolations };
}

async function scanContent(root) {
  const violations = [];
  for (const directory of CONTENT_ROOTS) {
    for (const { file, content } of await readSources(join(root, directory), root)) {
      if (CONTENT_ALLOW.has(file)) continue;
      if (RAW_TABLE.test(content)) violations.push({ file, kind: "table" });
      if (DIRECT_OVERLAY_IMPORT.test(content)) violations.push({ file, kind: "overlay" });
      if (DIRECT_MOTION_IMPORT.test(content)) violations.push({ file, kind: "motion" });
    }
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
}

async function readSources(directory, root) {
  const results = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { results.push(...await readSources(path, root)); continue; }
    if (!/\.(tsx|ts|jsx|js)$/u.test(entry.name)) continue;
    results.push({ file: relative(root, path).split("\\").join("/"), content: await readFile(path, "utf8") });
  }
  return results;
}

function legacyBasenames() {
  return LEGACY_FILES.map((path) => path.split("/").pop());
}

async function scanDirectory(directory, root) {
  const results = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...await scanDirectory(path, root));
      continue;
    }
    if (!SCAN_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) continue;
    const content = await readFile(path, "utf8");
    for (const basename of legacyBasenames()) {
      if (content.includes(basename)) results.push({ file: relative(root, path), reference: basename });
    }
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await auditLegacyFrontend(process.argv[2] || process.cwd());
  if (result.missingRollbackFiles.length || result.sourceRefs.length || result.distRefs.length || result.contentViolations.length) {
    console.error(JSON.stringify(result));
    process.exitCode = 1;
  } else {
    console.log(`[pass] legacy UI rollback files retained; frontend source/dist has no legacy references (${LEGACY_FILES.length} files); page content uses beUI table/overlay/motion primitives`);
  }
}
