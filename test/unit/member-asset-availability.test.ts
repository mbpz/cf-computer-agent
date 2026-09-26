// @vitest-environment node
import { describe, expect, it } from "vitest";
import { routeMemberApi, type MemberRouteServices } from "../../src/routes/member";

describe("member availability authorization", () => {
  it("rejects automation before observing storage configuration", async () => {
    const services = new Proxy({}, { get() { throw new Error("must authorize before accessing services"); } }) as MemberRouteServices;
    const url = new URL("https://app.test/api/assets/availability");
    await expect(routeMemberApi(new Request(url), url, { requestId: "availability-test" }, { kind: "automation", role: "automation" }, services)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
