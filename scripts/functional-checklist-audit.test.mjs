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

const currentSummary = (counts) => `## 当前计数与关闭条件（2026-09-28）

当前为 **${counts}**。

## 历史记录

此前为 **29 范围内 / 0 已关闭 / 29 未关闭**。
`;

test("checks current summary counts against parents without rewriting historical counts", () => {
  assert.equal(auditFunctionalChecklist(currentSummary("29 范围内 / 1 已关闭 / 28 未关闭") + fixture()).completed, 1);
  for (const counts of [
    "29 范围内 / 0 已关闭 / 29 未关闭",
    "30 范围内 / 1 已关闭 / 28 未关闭",
    "29 范围内 / 1 已关闭 / 27 未关闭",
  ]) assert.throws(() => auditFunctionalChecklist(currentSummary(counts) + fixture()), /Current summary counts/);
});

test("requires one unambiguous summary when the current-count heading is present", () => {
  for (const summary of [
    currentSummary("missing counts"),
    currentSummary("29 范围内 / 1 已关闭 / 28 未关闭") + currentSummary("29 范围内 / 1 已关闭 / 28 未关闭"),
  ]) assert.throws(() => auditFunctionalChecklist(summary + fixture()), /Current summary/);
});


test("ignores fenced current-summary examples and supports CRLF and a final summary section", () => {
  const example = "```md\n" + currentSummary("29 范围内 / 0 已关闭 / 29 未关闭") + "```\n";
  const summary = "## 当前计数与关闭条件\n当前为 **29 范围内 / 1 已关闭 / 28 未关闭**。";
  assert.equal(auditFunctionalChecklist(example + fixture() + "\n" + summary).completed, 1);
  assert.equal(auditFunctionalChecklist((fixture() + "\n" + summary).replaceAll("\n", "\r\n")).completed, 1);
});
