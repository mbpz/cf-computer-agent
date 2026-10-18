import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const LEGACY_FILES = Object.freeze(["public/app.js", "public/workspace-ui.js", "public/navigation.js", "public/styles.css"]);
const SCAN_EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);
const CONTENT_ROOTS = Object.freeze(["frontend/pages", "frontend/features"]);
// Shared components render inside pages too, so they answer to the same control
// rule; only the table/overlay/motion-import rules stay page-specific, because a
// shared component legitimately imports the payloads it adapts.
const COMPONENT_ROOTS = Object.freeze(["frontend/components"]);
const DIRECT_OVERLAY_IMPORT = /from\s+["'][^"']*components\/motion\/(drawer|center-morph-modal|bottom-sheet|morphing-modal)["']/u;
const DIRECT_MOTION_IMPORT = /from\s+["']motion\/react["']/u;
const RAW_TABLE = /<table[\s>]/u;
// The pickers, fields and toggles a page reaches for. A page composes them from
// beUI payloads (`ui/select`, `ui/input`, `ui/checkbox`); a raw element is the
// platform control, which is the thing this gate forbids.
const RAW_NATIVE_SELECT = /<select[\s>]/u;
const RAW_NATIVE_CHECKBOX = /type=["']checkbox["']/u;
// File, hidden, range and radio controls are not text fields: a file picker is
// the operating system's own dialog and the others carry no typed value.
const RAW_NATIVE_TEXT_INPUT = /<input(?![^>]*type=["'](?:hidden|file|range|radio)["'])/u;
const RAW_NATIVE_TEXTAREA = /<textarea[\s>]/u;
// A page composes its actions from `ui/button` (beUI `button-base`). A shared
// component may own the trigger it adapts (`ui/sheet`, `ui/filter-select`) or be
// a payload, so this rule stays page-specific.
const RAW_NATIVE_BUTTON = /<button[\s>]/u;
// beUI has no disclosure slug: `motion/collapsible` is the payload, so a raw
// `<details>/<summary>` is the platform control the shell used before it. The
// gate reads the open element only, never the prose that mentions it.
const RAW_NATIVE_DISCLOSURE = /<(?:details|summary)[\s>]/u;
// beUI ships no textarea slug, so `ui/textarea.tsx` is the one native control the
// app keeps. `agents/prompt-input.tsx` is the vendored `prompt-input` payload,
// whose textarea is the payload's own control, and `agents/message-bubble.tsx`
// is the hand-landed `message-bubble` payload whose disclosure trigger is its
// own button. The payload layer under `components/motion/` is native by
// definition — that is where payloads live.
const NATIVE_ALLOWED = Object.freeze([
  "frontend/components/ui/textarea.tsx",
  "frontend/components/agents/prompt-input.tsx",
  "frontend/components/agents/message-bubble.tsx",
]);
const NATIVE_ALLOWED_PREFIX = "frontend/components/motion/";
// Payload families that keep private submodules next to their entry file, so the
// provenance comment lives on the entry, not on every plot/legend child.
const NATIVE_ALLOWED_PREFIXES = Object.freeze(["frontend/components/charts/"]);
// A vendored payload declares its own provenance on line one. Read that marker
// instead of maintaining a filename list: a newly landed payload is exempt the
// moment it records where it came from, and nothing else is.
const PAYLOAD_PROVENANCE = /beui\.dev/u;

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
      if (RAW_TABLE.test(content)) violations.push({ file, kind: "table" });
      if (DIRECT_OVERLAY_IMPORT.test(content)) violations.push({ file, kind: "overlay" });
      if (DIRECT_MOTION_IMPORT.test(content)) violations.push({ file, kind: "motion" });
      if (RAW_NATIVE_DISCLOSURE.test(content)) violations.push({ file, kind: "native-disclosure" });
      if (isNativeAllowed(file)) continue;
      violations.push(...nativeControlViolations(file, content));
      if (RAW_NATIVE_BUTTON.test(content)) violations.push({ file, kind: "native-button" });
    }
  }
  for (const directory of COMPONENT_ROOTS) {
    for (const { file, content } of await readSources(join(root, directory), root)) {
      // A vendored payload owns its own native elements; a first-party component
      // answers to the same control rule as a page.
      if (isNativeAllowed(file) || NATIVE_ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
      if (PAYLOAD_PROVENANCE.test(content)) continue;
      violations.push(...nativeControlViolations(file, content));
      if (RAW_NATIVE_BUTTON.test(content)) violations.push({ file, kind: "native-button" });
      if (RAW_NATIVE_DISCLOSURE.test(content)) violations.push({ file, kind: "native-disclosure" });
    }
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
}

function isNativeAllowed(file) {
  return NATIVE_ALLOWED.includes(file) || file.startsWith(NATIVE_ALLOWED_PREFIX);
}

function nativeControlViolations(file, content) {
  const violations = [];
  if (RAW_NATIVE_SELECT.test(content)) violations.push({ file, kind: "native-select" });
  if (RAW_NATIVE_CHECKBOX.test(content)) violations.push({ file, kind: "native-checkbox" });
  if (RAW_NATIVE_TEXT_INPUT.test(content)) violations.push({ file, kind: "native-input" });
  if (RAW_NATIVE_TEXTAREA.test(content)) violations.push({ file, kind: "native-textarea" });
  return violations;
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
    console.log(`[pass] legacy UI rollback files retained; frontend source/dist has no legacy references (${LEGACY_FILES.length} files); pages and shared components use beUI primitives: no raw select, checkbox, text input, textarea, button or disclosure outside a vendored payload`);
  }
}
