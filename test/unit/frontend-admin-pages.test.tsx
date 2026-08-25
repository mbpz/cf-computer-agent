// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminDashboardPage } from "../../frontend/pages/admin/admin-dashboard-page";
import { ReviewQueuePage } from "../../frontend/pages/admin/review-queue-page";
import { AssetQueuePage } from "../../frontend/pages/admin/asset-queue-page";
import { MembersPage } from "../../frontend/pages/admin/members-page";
import { SpacesPage } from "../../frontend/pages/admin/spaces-page";
import { AuditPage } from "../../frontend/pages/admin/audit-page";
import { AdminForbiddenPage } from "../../frontend/pages/admin/admin-forbidden-page";

describe("React administrator pages", () => {
  it("renders dashboard metrics and a contributor 403 state", () => {
    expect(renderToStaticMarkup(<AdminDashboardPage metrics={{ pending: 3, assets: 2, members: 5 }} />)).toContain("Review queue");
    const forbidden = renderToStaticMarkup(<AdminForbiddenPage />);
    expect(forbidden).toContain("403");
    expect(forbidden).not.toContain("undefined");
  });

  it("renders review actions with pending/error state and no hidden authorization claim", () => {
    const html = renderToStaticMarkup(<ReviewQueuePage state={{ kind: "ready", items: [{ id: "sub-1", title: "Guide", submitter: "a@example.com", status: "pending" }], nextCursor: "next" }} onReview={vi.fn()} />);
    expect(html).toContain("Publish");
    expect(html).toContain("Request changes");
    expect(html).toContain("next");
  });

  it("renders asset retry and preview affordances", () => {
    const html = renderToStaticMarkup(<AssetQueuePage assets={[{ id: "asset-1", name: "guide.pdf", status: "failed_retryable", warnings: ["No title"] }]} onRetry={vi.fn()} />);
    expect(html).toContain("Retry");
    expect(html).toContain("Preview");
    expect(html).toContain("No title");
  });

  it("renders disabled member status, spaces/collections, and bounded audit pagination", () => {
    const members = renderToStaticMarkup(<MembersPage members={[{ id: "m1", email: "a@example.com", role: "contributor", status: "disabled" }]} onStatusChange={vi.fn()} />);
    expect(members).toContain("Disabled");
    expect(members).toContain("Enable");
    const spaces = renderToStaticMarkup(<SpacesPage spaces={[{ id: "s1", name: "Personal", slug: "personal", collections: ["Docs"] }]} onCreate={vi.fn()} />);
    expect(spaces).toContain("Personal");
    expect(spaces).toContain("Docs");
    const audit = renderToStaticMarkup(<AuditPage state={{ kind: "ready", events: [{ id: "e1", action: "submission.created", actor: "a@example.com", createdAt: "2026-08-25" }], nextCursor: "cursor-2" }} onLoadMore={vi.fn()} />);
    expect(audit).toContain("submission.created");
    expect(audit).toContain("Load more");
  });
});
