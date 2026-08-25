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
      assert.deepEqual(result, { missingRollbackFiles: [], sourceRefs: [], distRefs: [] });
    });
    await writeFile(join(root, "frontend", "dist", "bad.js"), "import './app.js';");
    const failed = await auditLegacyFrontend(root);
    assert.deepEqual(failed.distRefs, [{ file: "frontend/dist/bad.js", reference: "app.js" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
