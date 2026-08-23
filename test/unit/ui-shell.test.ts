// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  contextualPanelModel,
  compactChildren,
  contentLayoutModel,
  displayDate,
  displayValue,
  designSystemModel,
  dashboardMetricsModel,
  shellPresentationModel,
  shellControlsModel,
} from "../../public/workspace-ui.js";

describe("workspace shell", () => {
  it("derives dashboard metrics from safe submission data", () => {
    expect(dashboardMetricsModel([
      { status: "review_pending" },
      { status: "published" },
      { status: "published" },
      { status: "revision_requested" },
      null,
    ])).toEqual({ total: 4, pending: 1, published: 2, needsRevision: 1 });
    expect(dashboardMetricsModel(undefined)).toEqual({ total: 0, pending: 0, published: 0, needsRevision: 0 });
  });

  it("publishes the Cloudflare-inspired workbench design contract", () => {
    expect(designSystemModel()).toEqual({
      name: "cloudflare-workbench",
      density: "comfortable",
      breakpoints: { tablet: 960, mobile: 760 },
      primitives: ["shell", "topbar", "navigation", "page-header", "content", "context-rail", "state"],
      reducedMotion: true,
    });
  });

  it("publishes the mature workbench presentation contract", () => {
    expect(shellPresentationModel()).toEqual({
      theme: "ink-garden",
      density: "comfortable",
      navigation: "grouped",
      context: "secondary",
    });
  });

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

  it("lets pages reclaim the context rail when there is no context", () => {
    expect(contentLayoutModel(false)).toEqual({ className: "content-layout full-width" });
    expect(contentLayoutModel(true)).toEqual({ className: "content-layout has-context" });
  });
});

describe("display boundaries", () => {
  it("does not turn absent optional controls into visible text nodes", () => {
    const row = {};
    expect(compactChildren(row, undefined, null)).toEqual([row]);
  });

  it.each([undefined, null, "", "   "]) ("renders %s as a localized-safe placeholder", (value) => {
    expect(displayValue(value)).toBe("Not provided");
  });

  it("preserves meaningful values without leaking object coercion", () => {
    expect(displayValue("  Ready  ")).toBe("Ready");
    expect(displayValue(42)).toBe("42");
    expect(displayValue({})).toBe("Not provided");
  });

  it("normalizes whitespace-only context entries", () => {
    expect(contextualPanelModel([{ label: "  ", value: "Ready" }, { label: "Owner", value: undefined }])).toEqual({
      visible: false,
      items: [],
    });
  });

  it("renders invalid dates as a placeholder", () => {
    expect(displayDate(undefined)).toBe("Not provided");
    expect(displayDate("not-a-date")).toBe("Not provided");
  });
});
