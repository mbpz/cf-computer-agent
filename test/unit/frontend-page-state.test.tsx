// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageState } from "../../frontend/components/ui/page-state";

describe("shared page state primitive", () => {
  it.each([
    ["loading", "aria-busy=\"true\""],
    ["empty", "Nothing here"],
    ["error", "Something failed"],
    ["forbidden", "Access denied"],
    ["degraded", "Limited results"],
  ] as const)("renders the %s state without undefined values", (kind, marker) => {
    const html = renderToStaticMarkup(<PageState kind={kind} title={kind === "loading" ? "Loading" : marker.replace("aria-busy=\"true\"", "")} description="Details" />);
    expect(html).toContain(marker);
    expect(html).not.toContain("undefined");
  });
});
