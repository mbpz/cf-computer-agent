import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditLegacyFrontend } from "./frontend-legacy-audit.mjs";

test("legacy audit retains rollback files and rejects frontend references", async () => {
  const root = await mkdtemp(join(tmpdir(), "memory-garden-legacy-audit-"));
  try {
    await mkdir(join(root, "public"));
    await mkdir(join(root, "frontend", "dist"), { recursive: true });
    for (const file of ["app.js", "workspace-ui.js", "navigation.js", "styles.css"]) await writeFile(join(root, "public", file), "legacy");
    await writeFile(join(root, "frontend", "dist", "index.js"), "const app = true;");
    await assert.doesNotReject(async () => {
      const result = await auditLegacyFrontend(root);
      assert.deepEqual(result, { missingRollbackFiles: [], sourceRefs: [], distRefs: [], contentViolations: [] });
    });
    await writeFile(join(root, "frontend", "dist", "bad.js"), "import './app.js';");
    const failed = await auditLegacyFrontend(root);
    assert.deepEqual(failed.distRefs, [{ file: "frontend/dist/bad.js", reference: "app.js" }]);
    await mkdir(join(root, "frontend", "pages"), { recursive: true });
    await mkdir(join(root, "frontend", "features"), { recursive: true });
    await writeFile(join(root, "frontend", "pages", "raw.tsx"), "export const X = () => <table><tbody /></table>;");
    await writeFile(join(root, "frontend", "pages", "drawer.tsx"), "import { Drawer } from '../components/motion/drawer';");
    await writeFile(join(root, "frontend", "pages", "controls.tsx"), "export const Y = () => <><select aria-label=\"a\" /><input type=\"checkbox\" /><input value=\"\" /><textarea /></>;");
    await writeFile(join(root, "frontend", "pages", "disclosure.tsx"), "export const D = () => <details><summary>more</summary></details>;");
    await writeFile(join(root, "frontend", "features", "file.tsx"), "export const Z = () => <input type=\"file\" aria-label=\"upload\" />;");
    await mkdir(join(root, "frontend", "components", "ui"), { recursive: true });
    await mkdir(join(root, "frontend", "components", "motion"), { recursive: true });
    await mkdir(join(root, "frontend", "components", "agents"), { recursive: true });
    await mkdir(join(root, "frontend", "components", "charts"), { recursive: true });
    await writeFile(join(root, "frontend", "components", "ui", "textarea.tsx"), "export const T = () => <textarea aria-label=\"body\" />;");
    await writeFile(join(root, "frontend", "components", "motion", "payload.tsx"), "export const P = () => <><input aria-label=\"p\" /><textarea aria-label=\"q\" /><button type=\"button\" /></>;");
    await writeFile(join(root, "frontend", "components", "ui", "legacy.tsx"), "export const L = () => <><input aria-label=\"raw\" /><button type=\"button\" /><details><summary>s</summary></details></>;");
    await writeFile(join(root, "frontend", "components", "agents", "vendored.tsx"), "// beui.dev/components/agents/vendored\nexport const V = () => <><button type=\"button\" /><details><summary>s</summary></details></>;");
    await writeFile(join(root, "frontend", "components", "charts", "plot.tsx"), "export const C = () => <button type=\"button\" />;");
    const content = await auditLegacyFrontend(root);
    assert.deepEqual(content.contentViolations, [
      { file: "frontend/components/ui/legacy.tsx", kind: "native-button" },
      { file: "frontend/components/ui/legacy.tsx", kind: "native-disclosure" },
      { file: "frontend/components/ui/legacy.tsx", kind: "native-input" },
      { file: "frontend/pages/controls.tsx", kind: "native-checkbox" },
      { file: "frontend/pages/controls.tsx", kind: "native-input" },
      { file: "frontend/pages/controls.tsx", kind: "native-select" },
      { file: "frontend/pages/controls.tsx", kind: "native-textarea" },
      { file: "frontend/pages/disclosure.tsx", kind: "native-disclosure" },
      { file: "frontend/pages/drawer.tsx", kind: "overlay" },
      { file: "frontend/pages/raw.tsx", kind: "table" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
