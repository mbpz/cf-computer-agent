import { describe, expect, it } from "vitest";
import { createRouteGuard, drawerState } from "../../public/workspace-ui.js";

describe("createRouteGuard", () => {
  it("rejects an older route completion after newer navigation begins", () => {
    const guard = createRouteGuard();
    const home = guard.begin();
    const search = guard.begin();

    expect(guard.isCurrent(home)).toBe(false);
    expect(guard.isCurrent(search)).toBe(true);
  });
});

describe("drawerState", () => {
  it("removes a closed mobile drawer from focus and accessibility navigation", () => {
    expect(drawerState(false)).toEqual({ open: false, ariaExpanded: "false", ariaHidden: "true", inert: true });
  });

  it("exposes an open mobile drawer", () => {
    expect(drawerState(true)).toEqual({ open: true, ariaExpanded: "true", ariaHidden: "false", inert: false });
  });
});
