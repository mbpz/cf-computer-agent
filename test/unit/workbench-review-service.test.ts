import { describe, expect, it } from "vitest";
import { WorkbenchReviewService, reviewRange } from "../../src/workbench-review/service";

describe("WorkbenchReviewService UTC ranges", () => {
  it.each([
    ["2021-01-01T10:00:00.000Z", "2020-W53", "2020-12-28", "2021-01-04"],
    ["2026-09-09T10:00:00.000Z", "2026-W37", "2026-09-07", "2026-09-14"],
    ["2026-09-13T23:59:59.999Z", "2026-W37", "2026-09-07", "2026-09-14"],
    ["2026-09-14T00:00:00.000Z", "2026-W38", "2026-09-14", "2026-09-21"],
    ["2024-12-30T00:00:00.000Z", "2025-W01", "2024-12-30", "2025-01-06"],
  ])("uses stable ISO weeks at %s", (now,periodKey,from,to) => {
    expect(reviewRange("weekly",new Date(now))).toEqual({periodKey,from:`${from}T00:00:00.000Z`,to:`${to}T00:00:00.000Z`});
  });
  it("uses UTC rather than the local calendar day across leap day", () => {
    expect(reviewRange("daily",new Date("2024-03-01T01:00:00+08:00"))).toEqual({periodKey:"2024-02-29",from:"2024-02-29T00:00:00.000Z",to:"2024-03-01T00:00:00.000Z"});
  });
  it.each([undefined, "monthly", "", 0])("rejects invalid period %s before touching storage", async period => {
    const service = new WorkbenchReviewService({refresh: async () => { throw new Error("UNEXPECTED_STORAGE"); }});
    await expect(service.get("member-a",period)).rejects.toMatchObject({code:"WORKBENCH_REVIEW_PERIOD_INVALID",status:400});
  });
});
