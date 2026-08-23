// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  contextualPanelModel,
  displayDate,
  displayValue,
  shellControlsModel,
} from "../../public/workspace-ui.js";

describe("workspace shell", () => {
  it("keeps session controls in the top-right utility cluster", () => {
    expect(shellControlsModel()).toEqual({ placement: "topbar-right", mobile: "topbar-right" });
  });

  it("defines a contextual aside only when useful context exists", () => {
    expect(contextualPanelModel([])).toEqual({ visible: false, items: [] });
    expect(contextualPanelModel([{ label: "Status", value: "Ready" }])).toEqual({
      visible: true,
      items: [{ label: "Status", value: "Ready" }],
    });
  });
});

describe("display boundaries", () => {
  it.each([undefined, null, "", "   "]) ("renders %s as a localized-safe placeholder", (value) => {
    expect(displayValue(value)).toBe("—");
  });

  it("preserves meaningful values without leaking object coercion", () => {
    expect(displayValue("  Ready  ")).toBe("Ready");
    expect(displayValue(42)).toBe("42");
    expect(displayValue({})).toBe("—");
  });

  it("normalizes whitespace-only context entries", () => {
    expect(contextualPanelModel([{ label: "  ", value: "Ready" }, { label: "Owner", value: undefined }])).toEqual({
      visible: false,
      items: [],
    });
  });

  it("renders invalid dates as a placeholder", () => {
    expect(displayDate(undefined)).toBe("—");
    expect(displayDate("not-a-date")).toBe("—");
  });
});
