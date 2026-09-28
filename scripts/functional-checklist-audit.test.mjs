import assert from "node:assert/strict";
import test from "node:test";
import { auditFunctionalChecklist } from "./functional-checklist-audit.mjs";

const fixture = () => [
  ...["A01", "A02", "A03", "A04", "A05", "A06"],
  ...["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B09"],
  ...["C01", "C02", "C03", "C04", "C05", "C06", "C07"],
  ...["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08"],
].map(id => `- [${id === "B03" ? "x" : " "}] ${id} task`).join("\n");

test("counts parent tasks, not completed children or historical prose", () => {
  const report = auditFunctionalChecklist(fixture().replace("A01 task", "A01 task\n  - [x] child") + "\n历史：完成 30，未完成 0");
  assert.equal(report.originalTotal, 30);
  assert.equal(report.inScope, 29);
  assert.equal(report.completed, 1);
  assert.equal(report.remaining, 28);
  assert.deepEqual(report.completedIds, ["B03"]);
  assert.deepEqual(report.excludedIds, ["D08"]);
});

test("reflects newly closed parents without a hardcoded remaining count", () => {
  const report = auditFunctionalChecklist(fixture().replace("[ ] A03", "[x] A03").replace("[ ] A04", "[x] A04"));
  assert.equal(report.completed, 3);
  assert.equal(report.remaining, 26);
  assert.deepEqual(report.completedIds, ["A03", "A04", "B03"]);
});

test("release-only D08 is excluded even when checked", () => {
  const report = auditFunctionalChecklist(fixture().replace("[ ] D08", "[x] D08"));
  assert.equal(report.completed, 1);
  assert.equal(report.remaining, 28);
});

test("rejects duplicate, missing, unknown and malformed parent rows", () => {
  for (const input of [
    fixture() + "\n- [ ] A01 duplicate",
    fixture().replace("- [ ] A01 task\n", ""),
    fixture() + "\n- [ ] A07 unknown",
    fixture().replace("- [ ] A01", "- [?] A01"),
    fixture() + "\n- [?] A01 malformed duplicate",
  ]) assert.throws(() => auditFunctionalChecklist(input));
});

test("refuses to count a checked parent whose child remains open", () => {
  assert.throws(() => auditFunctionalChecklist(fixture().replace("B03 task", "B03 task\n  - [ ] still open")), /B03.*unfinished child/);
});

test("ignores quoted and fenced example checkboxes", () => {
  const input = fixture() + "\n> - [x] A01 example\n```md\n- [x] A01 example\n```\n~~~md\n- [ ] B03 example\n~~~";
  assert.equal(auditFunctionalChecklist(input).completed, 1);
});
