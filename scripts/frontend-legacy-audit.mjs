import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const LEGACY_FILES = Object.freeze(["public/app.js", "public/workspace-ui.js", "public/navigation.js", "public/styles.css"]);
const SCAN_EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);

export async function auditLegacyFrontend(root = process.cwd()) {
  const missingRollbackFiles = [];
  for (const path of LEGACY_FILES) {
    try { await stat(join(root, path)); } catch { missingRollbackFiles.push(path); }
  }
  const sourceRefs = await scanDirectory(join(root, "frontend"), root);
  const distRefs = await scanDirectory(join(root, "frontend", "dist"), root);
  return { missingRollbackFiles, sourceRefs, distRefs };
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
  if (result.missingRollbackFiles.length || result.sourceRefs.length || result.distRefs.length) {
    console.error(JSON.stringify(result));
    process.exitCode = 1;
  } else {
    console.log(`[pass] legacy UI rollback files retained; frontend source/dist has no legacy references (${LEGACY_FILES.length} files)`);
  }
}
