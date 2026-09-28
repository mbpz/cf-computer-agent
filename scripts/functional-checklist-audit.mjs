import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedIds = Object.entries({ A: 6, B: 9, C: 7, D: 8 }).flatMap(([group, size]) =>
  Array.from({ length: size }, (_, i) => `${group}${String(i + 1).padStart(2, "0")}`));

// Read-only accounting of the canonical functional checklist, not a verifier of
// business completion. A checked parent still requires human-reviewed evidence.
export function auditFunctionalChecklist(markdown) {
  const parents = new Map();
  let parent = null;
  let fence = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const row = /^- \[([ x])\] ([A-D]\d{2})\s+(.+)$/.exec(line);
    if (/^- \[[^\]]*\] [A-D]\d{2}\b/.test(line)) assert(row, `Malformed parent row: ${line}`);
    if (row) {
      const [, status, id, title] = row;
      assert(expectedIds.includes(id), `Unknown parent ${id}`);
      assert(!parents.has(id), `Duplicate parent ${id}`);
      parent = { id, title, done: status === "x" };
      parents.set(id, parent);
    } else if (/^\s+- \[ \]/.test(line) && parent?.done) {
      assert.fail(`${parent.id} has an unfinished child`);
    } else if (/^#{1,6} /.test(line)) {
      parent = null;
    }
  }
  assert.deepEqual([...parents.keys()].sort(), expectedIds, "Canonical parent inventory must contain exactly A01-D08 (30 tasks)");
  const excludedIds = ["D08"];
  const scoped = [...parents.values()].filter(parent => !excludedIds.includes(parent.id));
  const completedIds = scoped.filter(parent => parent.done).map(parent => parent.id);
  const remainingIds = scoped.filter(parent => !parent.done).map(parent => parent.id);
  return { originalTotal: parents.size, inScope: scoped.length, completed: completedIds.length,
    remaining: remainingIds.length, completedIds, remainingIds, excludedIds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = resolve(import.meta.dirname, "../docs/product/2026-09-12-personal-workbench-completion-audit.md");
  console.log(JSON.stringify(auditFunctionalChecklist(readFileSync(path, "utf8")), null, 2));
}
