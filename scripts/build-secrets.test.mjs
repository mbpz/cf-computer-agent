import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findBuildSecretLeaks } from "./build-secrets.mjs";

test("build secret scan accepts ordinary frontend text and hashes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "memory-garden-build-secrets-"));
  try {
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "index.js"), "const digest = 'a'.repeat(64); const label = 'access';");
    await writeFile(join(dir, "assets", "chunk.js"), "export const copy = 'sign in';");
    assert.deepEqual(await findBuildSecretLeaks(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("build secret scan detects credential names and bearer-shaped values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "memory-garden-build-secrets-"));
  try {
    await writeFile(join(dir, "index.js"), "const client_secret = 'should-not-ship'; const auth = 'Bearer abcdefghijklmnopqrstuvwxyz123456';");
    const leaks = await findBuildSecretLeaks(dir);
    assert.equal(leaks.length, 2);
    assert.match(leaks[0].reason, /credential|bearer/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
