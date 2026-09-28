import { it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
  function inTimezone(timezone, expression) {
    const result = buildSync({ stdin: { contents: `import { defaultCalendarRange, localCalendarInstant, localCalendarTime } from "./frontend/lib/calendar-query"; console.log(JSON.stringify(${expression}));`, resolveDir: process.cwd() }, bundle: true, platform: "node", format: "cjs", write: false });
    return JSON.parse(execFileSync(process.execPath, ["-e", result.outputFiles[0].text], { env: { ...process.env, TZ: timezone }, encoding: "utf8" }));
  }
  it("uses calendar days not fixed hours across spring DST", () => {
    assert.deepEqual(inTimezone("America/New_York", 'defaultCalendarRange(new Date("2026-03-07T18:00:00Z"))'), { from: "2026-03-07T05:00:00.000Z", to: "2026-03-21T04:00:00.000Z" });
  });
  it("uses calendar days across fall DST and rejects nonexistent local times", () => {
    assert.deepEqual(inTimezone("America/New_York", 'defaultCalendarRange(new Date("2026-10-31T18:00:00Z"))'), { from: "2026-10-31T04:00:00.000Z", to: "2026-11-14T05:00:00.000Z" });
    assert.deepEqual(inTimezone("America/New_York", 'localCalendarInstant("2026-03-08T02:30")'), null);
  });
  it("round-trips local midnight across UTC day boundary", () => {
    assert.deepEqual(inTimezone("Asia/Shanghai", 'localCalendarTime("2026-09-27T16:00:00.000Z")'), "2026-09-28T00:00");
    assert.deepEqual(inTimezone("Asia/Shanghai", 'localCalendarInstant("2026-09-28T00:00")'), "2026-09-27T16:00:00.000Z");
    assert.equal(inTimezone("Asia/Shanghai", 'localCalendarInstant("2026-02-30T00:00")'), null);
  });
