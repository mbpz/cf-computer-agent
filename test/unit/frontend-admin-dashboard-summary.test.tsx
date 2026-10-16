// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";

vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const listPaths = {
  pending: "/api/admin/submissions?page=1&pageSize=20&status=review_pending",
  assets: "/api/admin/assets?page=1&pageSize=20",
  members: "/api/admin/members?page=1&pageSize=20",
};
const summaryPath = "/api/admin/summary";
type Metric = keyof typeof listPaths;

function listPage(metric: Metric, total: number) {
  return Response.json({
    items: Array.from({ length: Math.min(total, 20) }, (_, i) => metric === "assets"
      ? { asset: { id: `asset-${i}`, originalName: `asset-${i}.txt` }, job: { status: "succeeded" } }
      : { id: `${metric}-${i}`, title: "Review item", email: "member@app.test", ...(metric === "pending" ? { submitterId: "member-1" } : { role: "contributor" }), status: metric === "pending" ? "review_pending" : "active" }),
    pagination: { page: 1, pageSize: 20, total, totalPages: Math.ceil(total / 20) },
  });
}

const trend = [
  { day: "2026-10-10", submissions: 2, publications: 0 },
  { day: "2026-10-11", submissions: 0, publications: 0 },
  { day: "2026-10-12", submissions: 1, publications: 1 },
  { day: "2026-10-13", submissions: 0, publications: 0 },
  { day: "2026-10-14", submissions: 3, publications: 2 },
  { day: "2026-10-15", submissions: 0, publications: 0 },
  { day: "2026-10-16", submissions: 4, publications: 1 },
];
const activity = [
  { id: "event-1", actorKind: "member", actorId: "member-1", action: "submission.created", resourceType: "submission", resourceId: "submission-1", metadata: { kind: "markdown" }, createdAt: "2026-10-16T09:00:00.000Z" },
  { id: "event-2", actorKind: "system", actorId: null, action: "knowledge.published", resourceType: "knowledge", resourceId: "knowledge-1", metadata: { visibility: "shared" }, createdAt: "2026-10-16T08:00:00.000Z" },
];

describe("administration dashboard trend and activity snapshot", () => {
  let app: MountedApp | undefined;
  afterEach(async () => { await app?.unmount(); app = undefined; });
  const requests: string[] = [];
  let pendingTotal = 47;

  const fetcher = (summary: () => Promise<Response> | Response): typeof fetch => async (input, init) => {
    const path = String(input);
    if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture("admin", "0x0") });
    if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
    const metric = (Object.keys(listPaths) as Metric[]).find((key) => listPaths[key] === path);
    if (metric) {
      requests.push(path);
      return listPage(metric, metric === "pending" ? pendingTotal : { assets: 61, members: 25 }[metric]);
    }
    if (path === summaryPath) { requests.push(path); return summary(); }
    throw new Error(`Unexpected dashboard request ${path}`);
  };

  async function mount(summary: () => Promise<Response> | Response) {
    requests.length = 0;
    pendingTotal = 47;
    app = await mountAuthenticatedApp({ url: "https://app.test/admin", role: "admin", permissionMask: "0x0", fetch: fetcher(summary) });
  }

  const trendSection = () => app!.container.querySelector("[data-dashboard-trend]")!;
  const activitySection = () => app!.container.querySelector("[data-dashboard-activity]")!;
  const metricValue = (key: Metric) => app!.container.querySelector(`[data-dashboard-metric="${key}"] [data-metric-value] .sr-only`)?.textContent;
  const trendCell = (day: string, kind: "submissions" | "publications") => trendSection().querySelector(`[data-trend-point="${day}"] [data-trend-${kind}]`)?.textContent;
  const click = async (selector: string, twice = false) => act(async () => {
    const button = app!.container.querySelector<HTMLButtonElement>(selector)!;
    expect(button).not.toBeNull(); button.click(); if (twice) button.click();
  });

  it("renders the server's trend buckets and newest audit events, and keeps card totals independent", async () => {
    await mount(() => Response.json({ trend, activity }));
    await waitForApp(() => trendCell("2026-10-16", "submissions") === "4");
    expect(trendCell("2026-10-10", "submissions")).toBe("2");
    expect(trendCell("2026-10-14", "publications")).toBe("2");
    expect(trendSection().querySelector('[data-page-state="ready"]')).not.toBeNull();
    expect(metricValue("pending")).toBe("47");
    expect(requests).toContain(summaryPath);

    const events = activitySection().querySelectorAll("[data-activity-event]");
    expect(events).toHaveLength(2);
    expect(events[0]?.getAttribute("data-activity-event")).toBe("event-1");
    expect(events[0]?.querySelector("[data-activity-action]")?.textContent).toBe("submission.created");
    expect(events[0]?.querySelector("[data-activity-resource]")?.textContent).toContain("submission-1");
    expect(events[0]?.querySelector("[data-activity-actor]")?.textContent).toBe("member-1");
    expect(events[0]?.querySelector("[data-activity-time]")?.textContent).toBe("2026-10-16T09:00:00.000Z");
    expect(events[1]?.querySelector("[data-activity-actor]")?.textContent).toBe("system");
  });

  it("renders an error with a retry action instead of a fabricated zero, then recovers on retry", async () => {
    let healthy = false;
    await mount(() => healthy ? Response.json({ trend, activity }) : apiError(503, "TEMPORARILY_UNAVAILABLE"));
    await waitForApp(() => trendSection().querySelector('[data-dashboard-trend-retry]') !== null);
    // No series is rendered, so nothing claims a real zero during the outage.
    expect(trendSection().querySelector("[data-trend-point]")).toBeNull();
    expect(trendSection().querySelector('[data-page-state="ready"]')).toBeNull();
    expect(trendSection().querySelector('[data-page-state="empty"]')).toBeNull();
    expect(activitySection().querySelector("[data-activity-event]")).toBeNull();
    expect(activitySection().querySelector('[role="alert"]')).not.toBeNull();
    expect(metricValue("pending")).toBe("47");

    const issued = requests.filter((path) => path === summaryPath).length;
    healthy = true;
    await click("[data-dashboard-trend-retry]");
    expect(requests.filter((path) => path === summaryPath).length).toBe(issued + 1);
    await waitForApp(() => trendCell("2026-10-16", "submissions") === "4");
    expect(activitySection().querySelectorAll("[data-activity-event]")).toHaveLength(2);
  });

  it("treats a malformed summary payload as an error and retries each section once per click", async () => {
    let payload: unknown = { trend: "not-a-series" };
    await mount(() => Response.json(payload));
    await waitForApp(() => activitySection().querySelector('[role="alert"]') !== null);
    expect(trendSection().querySelector("[data-trend-point]")).toBeNull();

    payload = { trend, activity };
    const issued = requests.filter((path) => path === summaryPath).length;
    await click("[data-dashboard-activity-retry]", true);
    expect(requests.filter((path) => path === summaryPath).length).toBe(issued + 1);
    await waitForApp(() => activitySection().querySelectorAll("[data-activity-event]").length === 2);
    expect(trendSection().querySelectorAll("[data-trend-point]")).toHaveLength(7);
  });

  it("rejects a summary whose activity entry is malformed instead of rendering it", async () => {
    let payload: unknown = { trend, activity: [{ ...activity[0], actorKind: "robot" }] };
    await mount(() => Response.json(payload));
    await waitForApp(() => activitySection().querySelector('[role="alert"]') !== null);
    expect(activitySection().querySelector("[data-activity-event]")).toBeNull();
    expect(trendSection().querySelector("[data-trend-point]")).toBeNull();

    payload = { trend, activity };
    await click("[data-dashboard-trend-retry]");
    await waitForApp(() => activitySection().querySelectorAll("[data-activity-event]").length === 2);
    expect(trendSection().querySelectorAll("[data-trend-point]")).toHaveLength(7);
  });

  it("re-reads the authoritative totals when the dashboard is re-entered after a write elsewhere", async () => {
    await mount(() => Response.json({ trend, activity }));
    await waitForApp(() => metricValue("pending") === "47");

    const leave = async (path: string) => act(async () => {
      app!.browser.history.pushState({}, "", path);
      app!.browser.dispatchEvent(new app!.browser.PopStateEvent("popstate"));
    });
    await leave("/settings");
    await waitForApp(() => app!.container.querySelector("[data-admin-dashboard]") === null);

    // The decision write elsewhere drops one pending submission before the re-entry.
    pendingTotal = 46;
    requests.length = 0;
    await leave("/admin");
    await waitForApp(() => metricValue("pending") === "46");
    expect(requests).toContain(listPaths.pending);
    expect(requests).toContain(summaryPath);
    await waitForApp(() => trendCell("2026-10-16", "submissions") === "4");
  });
});
