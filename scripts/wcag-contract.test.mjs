import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertWcagCss } from "./wcag-contract.mjs";

test("frontend tokens provide WCAG AA text contrast and focus-visible", async () => {
  const css = await readFile(join(process.cwd(), "frontend/styles/globals.css"), "utf8");
  assert.deepEqual(assertWcagCss(css), { light: true, dark: true, focusVisible: true });
});
