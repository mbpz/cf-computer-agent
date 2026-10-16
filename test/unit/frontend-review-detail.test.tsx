// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewDetailPage } from "../../frontend/pages/admin/review-detail-page";
import { ReviewDetailRoute } from "../../frontend/pages/admin/review-detail-route";
import { reviewDetailModel } from "../../frontend/components/review/review-detail-model";
import { pageKindForPath } from "../../frontend/app-routes";
import { ReviewDecisionFeedback } from "../../frontend/components/review/review-decision-controls";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

describe("React review detail boundary", () => {
  it("dispatches parameterized review routes", () => {
    expect(pageKindForPath("/admin/submissions/sub-1")).toBe("admin-submission-detail");
    expect(pageKindForPath("/admin/submissions/not safe/extra")).toBe("not-found");
  });

  it("renders bounded content and all review actions", () => {
    const onDecision = vi.fn();
    const detail = reviewDetailModel({ id: "sub-1", title: "Guide", submitter: "a@example.com", status: "review_pending", content: "# Guide\n\nBody", warnings: ["No title"] });
    const html = renderToStaticMarkup(<ReviewDetailPage state={{ kind: "ready", detail }} onDecision={onDecision} />);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
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

  it("states a past-review submission as closed next to its real status text", () => {
    const detail = reviewDetailModel({ id: "sub-1", title: "Guide", submitter: "a@example.com", status: "rejected", content: "Body" });
    const html = renderToStaticMarkup(<ReviewDetailPage state={{ kind: "ready", detail }} onDecision={vi.fn()} />);
    expect(html).toContain('data-review-state="closed"');
    expect(html).toContain("no longer awaiting review");
    // The real status stays visible as text, not colour alone.
    expect(html).toContain("rejected");
    expect(html).not.toContain("data-review-state=\"read-only\"");
  });

  it("states read-only access as text when the decision capability is absent", () => {
    const detail = reviewDetailModel({ id: "sub-1", title: "Guide", submitter: "a@example.com", status: "review_pending", content: "Body" });
    const html = renderToStaticMarkup(<ReviewDetailPage state={{ kind: "ready", detail }} />);
    expect(html).toContain('data-review-state="read-only"');
    expect(html).toContain("cannot make a review decision");
    expect(html).toContain("review_pending");
  });

  it("adds no restricted note to a decidable pending submission", () => {
    const detail = reviewDetailModel({ id: "sub-1", title: "Guide", submitter: "a@example.com", status: "review_pending", content: "Body" });
    const html = renderToStaticMarkup(<ReviewDetailPage state={{ kind: "ready", detail }} onDecision={vi.fn()} />);
    expect(html).not.toContain("data-review-state");
    expect(html).toContain("Publish");
  });

  it("pairs retry-same-decision with the reload route for an unknown result", () => {
    const detail = reviewDetailModel({ id: "sub-1", title: "Guide", submitter: "a@example.com", status: "review_pending", content: "Body" });
    const html = renderToStaticMarkup(<ReviewDetailPage state={{ kind: "ready", detail }} onDecision={vi.fn()} onRetry={vi.fn()} onRetryDecision={vi.fn()}
      decisionState={{ kind: "error", action: "publish", recovery: "retry" }} />);
    expect(html).toContain("The result is unknown");
    expect(html).toContain("Retry same decision");
    expect(html).toContain("Reload current state");
  });

  it("starts real detail routes in a bounded loading state", () => {
    const html = renderToStaticMarkup(<ReviewDetailRoute id="sub-1" />);
    expect(html).toContain("aria-busy");
    expect(html).not.toContain("undefined");
  });

  it.each([
    ["indexed", "已发布，可以搜索。"],
    ["pending", "已发布，搜索索引正在等待处理。"],
    ["search_degraded", "已发布，搜索当前处于降级状态。"],
    ["failed", "已发布，搜索索引失败。"],
  ] as const)("renders the authoritative %s receipt in Chinese", (searchStatus, text) => {
    const html = renderToStaticMarkup(<ReviewDecisionFeedback locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })}
      state={{ kind: "success", receipt: { action: "publish", status: "published", revisionId: "rev-1", knowledgeItemId: "item-1", searchStatus } }} />);
    expect(html).toContain(text); expect(html).toContain("rev-1"); expect(html).toContain("item-1");
    expect(html).not.toContain("ADMIN_REVIEW_");
  });
});
