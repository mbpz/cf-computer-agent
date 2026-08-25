// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewDetailPage } from "../../frontend/pages/admin/review-detail-page";
import { ReviewDetailRoute } from "../../frontend/pages/admin/review-detail-route";
import { reviewDetailModel } from "../../frontend/components/review/review-detail-model";
import { pageKindForPath } from "../../frontend/app-routes";

describe("React review detail boundary", () => {
  it("dispatches parameterized review routes", () => {
    expect(pageKindForPath("/admin/submissions/sub-1")).toBe("admin-submission-detail");
    expect(pageKindForPath("/admin/submissions/not safe/extra")).toBe("not-found");
  });

  it("renders bounded content and all review actions", () => {
    const onDecision = vi.fn();
    const detail = reviewDetailModel({ id: "sub-1", title: "Guide", submitter: "a@example.com", status: "review_pending", content: "# Guide\n\nBody", warnings: ["No title"] });
    const html = renderToStaticMarkup(<ReviewDetailPage state={{ kind: "ready", detail }} onDecision={onDecision} />);
    expect(html).toContain("Guide");
    expect(html).toContain("Publish");
    expect(html).toContain("Request changes");
    expect(html).toContain("Reject");
    expect(html).toContain("No title");
    expect(html).not.toContain("undefined");
  });

  it("fails closed for malformed detail payloads", () => {
    expect(reviewDetailModel({ id: "", content: "private" })).toBeNull();
    const html = renderToStaticMarkup(<ReviewDetailPage state={{ kind: "error", message: "Unavailable" }} />);
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("private");
  });

  it("starts real detail routes in a bounded loading state", () => {
    const html = renderToStaticMarkup(<ReviewDetailRoute id="sub-1" />);
    expect(html).toContain("aria-busy");
    expect(html).not.toContain("undefined");
  });
});
