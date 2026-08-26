// @vitest-environment node
import { describe, expect, it } from "vitest";
import { postLogout } from "../../frontend/lib/logout";

describe("frontend logout boundary", () => {
  it("revokes the browser session with POST and same-origin credentials", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    await postLogout("/auth/logout", async (input, init) => {
      calls.push({ input, init });
      return new Response(null, { status: 204 });
    });
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe("/auth/logout");
    expect(calls[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(calls[0]?.init).toMatchObject({ cache: "no-store", headers: { accept: "application/json" } });
  });

  it("rejects an invalid logout target before making a request", async () => {
    await expect(postLogout("https://evil.example/logout", async () => {
      throw new Error("request must not run");
    })).rejects.toThrow("LOGOUT_TARGET_INVALID");
  });
});
