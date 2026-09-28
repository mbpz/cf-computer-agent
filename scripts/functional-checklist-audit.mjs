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
  const prose = [];
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    prose.push(line);
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
  // Only the explicitly current summary is an invariant. Historical batch
  // snapshots and fenced examples must retain their original counts.
  const currentSections = [...prose.join("\n").matchAll(
    /^## 当前计数与关闭条件[^\n]*\n([\s\S]*?)(?=^#{1,2} |$(?![\s\S]))/gm,
  )];
  if (currentSections.length) {
    assert.equal(currentSections.length, 1, "Current summary must have exactly one section");
    const counts = [...currentSections[0][1].matchAll(/(\d+) 范围内 \/ (\d+) 已关闭 \/ (\d+) 未关闭/g)];
    assert.equal(counts.length, 1, "Current summary must contain exactly one count tuple");
    assert.deepEqual(counts[0].slice(1).map(Number),
      [scoped.length, completedIds.length, remainingIds.length],
      "Current summary counts must match canonical parent checkboxes");
  }
  return { originalTotal: parents.size, inScope: scoped.length, completed: completedIds.length,
    remaining: remainingIds.length, completedIds, remainingIds, excludedIds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = resolve(import.meta.dirname, "../docs/product/2026-09-12-personal-workbench-completion-audit.md");
  console.log(JSON.stringify(auditFunctionalChecklist(readFileSync(path, "utf8")), null, 2));
}
