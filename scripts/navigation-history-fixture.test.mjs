import { test } from "node:test";
import assert from "node:assert/strict";
import { seedHistoryFixture } from "../design/navigation/history-fixture-start.mjs";

function fixture(pathname, search = "") {
  const calls = [];
  const owner = { location: { pathname, search }, history: { replaceState(...args) { calls.push(["replace", ...args]); } } };
  seedHistoryFixture(owner, (...args) => calls.push(args));
  return calls;
}
test("explicit fixture landing seeds the two-entry sequence", () => {
  assert.deepEqual(fixture("/"), [["replace", {}, "", "/inbox"], ["push", "/tasks"]]);
});
for (const [path, search] of [["/tasks", ""], ["/tasks", "?page=2"], ["/inbox", ""], ["/", "?preserve=1"]]) {
  test(`document arrival at ${path}${search} never reseeds history`, () => {
    assert.deepEqual(fixture(path, search), []);
  });
}
