// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKBENCH_MATURITY_CAPABILITIES } from "../../shared/workbench-maturity-capabilities";
import { mountApp, mountAuthenticatedApp, type MountedApp, waitForApp } from "../helpers/authenticated-app-harness";
import {
  apiError,
  createMaturityRouteFetch,
  DIRECT_PATH_BY_ROUTE,
  isReadySelector,
  PRIVATE_THREAD_MARKERS,
  READY_MARKER_BY_ROUTE,
  type MaturityProbeState,
  type MaturityRouteId,
} from "../helpers/workbench-maturity-route-fixtures";

vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

type Claim = Readonly<{ kind: "supported" } | { kind: "gap"; reason: string }>;
type StateClaims = Readonly<Record<MaturityProbeState, Claim>>;

const supported = Object.freeze({ kind: "supported" } as const);
const gap = (reason: string): Claim => Object.freeze({ kind: "gap", reason });
const listWithRetry = Object.freeze({ loading: supported, empty: supported, error: supported, ready: supported });
const listWithoutRetry = (subject: string): StateClaims => Object.freeze({
  loading: supported,
  empty: supported,
  error: gap(`${subject} renders an initial-load error but provides no route-owned retry action.`),
  ready: supported,
});
const staticReady = (subject: string): StateClaims => Object.freeze({
  loading: gap(`${subject} has no route-owned loading controller.`),
  empty: gap(`${subject} has no route-owned empty state.`),
  error: gap(`${subject} has no route-owned retryable initial-load error state.`),
  ready: supported,
});

const ROUTE_STATE_MATRIX = Object.freeze({
  home: { loading: gap("Home renders its ready shell while recent knowledge is pending."), empty: supported, error: gap("Home swallows recent-knowledge failures into the empty recent panel."), ready: supported },
  submit: listWithRetry,
  knowledge: listWithRetry,
  search: listWithRetry,
  agent: { loading: supported, empty: gap("Agent has no explicit empty-answer state."), error: supported, ready: supported },
  "my-submissions": listWithRetry,
  tasks: listWithRetry,
  boards: listWithRetry,
  settings: staticReady("Settings"),
  admin: staticReady("Administration dashboard"),
  "admin-submissions": listWithoutRetry("Review queue"),
  "admin-duplicates": listWithoutRetry("Duplicate queue"),
  "admin-assets": listWithoutRetry("Asset queue"),
  "admin-members": listWithoutRetry("Members"),
  "admin-roles": listWithoutRetry("Roles"),
  "admin-menus": listWithoutRetry("Menus"),
  "admin-spaces": listWithoutRetry("Spaces"),
  "admin-audit": {
    loading: supported,
    empty: gap("Audit controller resolves a raw numbered page through an incompatible generation/page destructure, so empty never renders."),
    error: gap("Audit renders an initial-load error but provides no route-owned retry action."),
    ready: gap("Audit controller resolves a raw numbered page through an incompatible generation/page destructure, so ready never renders."),
  },
  "admin-analytics": { loading: supported, empty: supported, error: gap("Analytics renders an initial-load error but provides no route-owned retry action."), ready: supported },
  notifications: listWithRetry,
  messages: listWithRetry,
  "knowledge-reader": { loading: supported, empty: gap("Knowledge reader treats a missing revision as an error, not an empty state."), error: supported, ready: supported },
  "message-thread": listWithRetry,
  "admin-submission-detail": { loading: supported, empty: gap("Submission detail treats a missing preview as an error, not an empty state."), error: gap("Submission detail renders an initial-load error but provides no route-owned retry action."), ready: supported },
} as const satisfies Record<MaturityRouteId, StateClaims>);

const PERMISSION_MASK_BY_ROUTE = Object.freeze({
  home: "0x0", submit: "0x0", knowledge: "0x0", search: "0x0", agent: "0x0", "my-submissions": "0x0",
  tasks: "0x100000", boards: "0x100000", settings: "0x0", admin: "0x0", "admin-submissions": "0x0",
  "admin-duplicates": "0x0", "admin-assets": "0x0", "admin-members": "0x0", "admin-roles": "0x0",
  "admin-menus": "0x0", "admin-spaces": "0x0", "admin-audit": "0x0", "admin-analytics": "0x0",
  notifications: "0x0", messages: "0x0", "knowledge-reader": "0x0", "message-thread": "0x0", "admin-submission-detail": "0x0",
} as const satisfies Record<MaturityRouteId, string>);

describe("workbench maturity exhaustive route/state audit", () => {
  let journey: MountedApp | undefined;

  afterEach(async () => {
    await journey?.unmount();
    journey = undefined;
  });

  for (const capability of WORKBENCH_MATURITY_CAPABILITIES) {
    for (const state of ["loading", "empty", "error", "ready"] as const) {
      const claim = ROUTE_STATE_MATRIX[capability.routeId][state];
      it(`${capability.routeId} ${state}: ${claim.kind}`, async () => {
        const requests: string[] = [];
        const role = capability.requiredRole === "admin" ? "admin" : "contributor";
        const permissionMask = PERMISSION_MASK_BY_ROUTE[capability.routeId];
        const directPath = DIRECT_PATH_BY_ROUTE[capability.routeId] ?? capability.pathname;
        const startAtEntry = state === "ready" && capability.routePattern === undefined;
        const initialPath = capability.routeId === "search" && state !== "ready" ? "/search?q=route%20audit" : directPath;
        journey = await mountAuthenticatedApp({
          url: `https://app.test${startAtEntry ? "/" : initialPath}`,
          role,
          permissionMask,
          fetch: createMaturityRouteFetch({ routeId: capability.routeId, state, role, permissionMask, requests }),
        });
        await waitForServerNavigation(journey, requests);

        if (startAtEntry) await navigateFromOwningEntry(journey, capability.routeId, capability.pathname);
        else expect(journey.browser.location.pathname).toBe(directPath);

        if (capability.routePattern !== undefined) {
          await ensureRouteEntry(journey, capability.parentRouteId!);
          expect(journey.container.querySelector(`[data-route-id="${capability.parentRouteId}"]`)).not.toBeNull();
          expect(journey.container.querySelector(`[data-route-id="${capability.routeId}"]`)).toBeNull();
        }

        if ((capability.routeId === "search" && state === "ready") || ((capability.routeId === "submit" || capability.routeId === "agent") && state !== "ready")) {
          await triggerActionState(journey, capability.routeId);
        }

        if (claim.kind === "supported") await assertSupportedState(journey, capability.routeId, state);
        else await assertExplicitGap(journey, capability.routeId, state, claim.reason);
      });
    }
  }
});

describe("workbench maturity server projection and authorization audit", () => {
  let journey: MountedApp | undefined;

  afterEach(async () => {
    await journey?.unmount();
    journey = undefined;
  });

  it("renders Login instead of the workbench for an anonymous session", async () => {
    journey = await mountApp({
      url: "https://app.test/admin",
      fetch: async (input) => {
        if (String(input) === "/api/session") return apiError(401, "UNAUTHORIZED");
        if (String(input) === "/api/telemetry/pageview") return new Response(null, { status: 204 });
        throw new Error(`unexpected anonymous request: ${String(input)}`);
      },
    });
    await waitForApp(() => journey!.container.querySelector("[data-login-page]") !== null);
    expect(journey.container.querySelector("[data-shell-root]")).toBeNull();
  });

  it("uses current contributor server navigation and denies administration projection/direct access", async () => {
    const requests: string[] = [];
    journey = await mountAuthenticatedApp({
      url: "https://app.test/admin",
      role: "contributor",
      permissionMask: "0x100000",
      fetch: createMaturityRouteFetch({ routeId: "admin", state: "ready", role: "contributor", permissionMask: "0x100000", requests }),
    });
    await waitForServerNavigation(journey, requests);
    expect(journey.container.querySelector('[data-route-id="admin"]')).toBeNull();
    expect(journey.container.querySelector('main [data-page-state="forbidden"]')).not.toBeNull();
    expect(journey.container.textContent).not.toContain("Administration overview");
  });

  it("uses current admin server navigation and projects every permitted administration entry", async () => {
    const requests: string[] = [];
    journey = await mountAuthenticatedApp({
      url: "https://app.test/",
      role: "admin",
      permissionMask: "0x0",
      fetch: createMaturityRouteFetch({ routeId: "admin", state: "ready", role: "admin", permissionMask: "0x0", requests }),
    });
    await waitForServerNavigation(journey, requests);
    for (const routeId of ["admin", "admin-submissions", "admin-duplicates", "admin-assets", "admin-members", "admin-roles", "admin-menus", "admin-spaces", "admin-audit", "admin-analytics"]) {
      await ensureRouteEntry(journey, routeId);
      expect(journey.container.querySelector(`[data-route-id="${routeId}"]`), routeId).not.toBeNull();
    }
  });

  it("uses the revoked contributor projection and rejects the task direct route", async () => {
    const requests: string[] = [];
    journey = await mountAuthenticatedApp({
      url: "https://app.test/tasks",
      role: "contributor",
      permissionMask: "0x0",
      fetch: createMaturityRouteFetch({ routeId: "tasks", state: "ready", role: "contributor", permissionMask: "0x0", requests }),
    });
    await waitForServerNavigation(journey, requests);
    expect(journey.container.querySelector('[data-route-id="tasks"]')).toBeNull();
    expect(journey.container.querySelector('[data-route-id="boards"]')).toBeNull();
    expect(journey.container.querySelector('main [data-page-state="forbidden"]')).not.toBeNull();
  });

  it("removes every private thread, message, and target marker after context APIs deny access", async () => {
    const requests: string[] = [];
    journey = await mountAuthenticatedApp({
      url: "https://app.test/messages/thread-route-audit",
      role: "contributor",
      permissionMask: "0x0",
      fetch: createMaturityRouteFetch({ routeId: "message-thread", state: "ready", role: "contributor", permissionMask: "0x0", requests, discussionDenied: true }),
    });
    await waitForServerNavigation(journey, requests);
    await waitForApp(() => journey!.container.querySelector('main [role="alert"]') !== null);
    expect(requests).toContain("/api/discussions/thread-route-audit");
    expect(requests).toContain("/api/discussions/thread-route-audit/messages?limit=20");
    expect(journey.container.querySelector("#discussion-composer")).toBeNull();
    expect(journey.container.querySelector(`[data-message-id="${PRIVATE_THREAD_MARKERS.messageId}"]`)).toBeNull();
    expect(journey.container.querySelector("[data-thread-scroll]")).toBeNull();
    expect(journey.container.textContent).not.toContain(PRIVATE_THREAD_MARKERS.body);
    expect(journey.container.textContent).not.toContain(PRIVATE_THREAD_MARKERS.targetId);
    expect(journey.container.querySelector(`a[href="/tasks/${PRIVATE_THREAD_MARKERS.targetId}"]`)).toBeNull();
  });
});

async function waitForServerNavigation(journey: MountedApp, requests: readonly string[]): Promise<void> {
  await waitForApp(() => requests.includes("/api/navigation") && journey.container.querySelector('[data-navigation-source="server"]') !== null);
  expect(requests.filter((path) => path === "/api/navigation")).toHaveLength(1);
}

async function navigateFromOwningEntry(journey: MountedApp, routeId: MaturityRouteId, pathname: string): Promise<void> {
  if (routeId === "home") return;
  if (routeId === "settings") {
    await act(async () => (journey.container.querySelector("[data-account-trigger]") as HTMLElement).click());
    await waitForApp(() => journey.container.querySelector('[data-route-id="settings"]') !== null);
  }
  await ensureRouteEntry(journey, routeId);
  const entry = journey.container.querySelector(`[data-route-id="${routeId}"]`) as HTMLElement | null;
  expect(entry, routeId).not.toBeNull();
  await act(async () => entry!.click());
  await waitForApp(() => journey.browser.location.pathname === pathname);
  expect(journey.browser.location.pathname).toBe(pathname);
}

async function ensureRouteEntry(journey: MountedApp, routeId: string): Promise<void> {
  for (let pass = 0; pass < 4 && journey.container.querySelector(`[data-route-id="${routeId}"]`) === null; pass += 1) {
    const collapsedGroup = journey.container.querySelector('[data-shell-sidebar-scroll] button[aria-expanded="false"]') as HTMLElement | null;
    if (!collapsedGroup) break;
    await act(async () => collapsedGroup.click());
  }
  await waitForApp(() => journey.container.querySelector(`[data-route-id="${routeId}"]`) !== null);
}

async function triggerActionState(journey: MountedApp, routeId: "submit" | "agent" | "search"): Promise<void> {
  if (routeId === "submit") {
    await changeReactInput(journey, "#submission-title", "Route audit submission");
    await changeReactInput(journey, "#submission-content", "Route audit submission content");
  } else if (routeId === "agent") {
    await changeReactInput(journey, "#agent-question", "Route audit question");
  } else {
    await changeReactInput(journey, "#knowledge-search", "route audit");
  }
  const control = journey.container.querySelector("main form") as HTMLFormElement;
  await act(async () => control.dispatchEvent(new journey.browser.Event("submit", { bubbles: true, cancelable: true })));
}

async function changeReactInput(journey: MountedApp, selector: string, value: string): Promise<void> {
  const control = journey.container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  expect(control, selector).not.toBeNull();
  await act(async () => {
    control.value = value;
    const reactPropsKey = Object.keys(control).find((key) => key.startsWith("__reactProps$"));
    const reactProps = reactPropsKey ? (control as unknown as Record<string, { onChange?: (event: { currentTarget: typeof control }) => void }>)[reactPropsKey] : undefined;
    reactProps?.onChange?.({ currentTarget: control });
  });
}

async function assertSupportedState(journey: MountedApp, routeId: MaturityRouteId, state: MaturityProbeState): Promise<void> {
  if (state === "ready") {
    await waitForApp(() => readyObservablePresent(journey, routeId));
    expect(readyObservablePresent(journey, routeId)).toBe(true);
    return;
  }
  if (state === "loading") {
    const selector = routeId === "submit" ? 'main form[aria-busy="true"]'
      : routeId === "admin-submissions" || routeId === "admin-analytics" || routeId === "admin-audit" || routeId === "admin-submission-detail" ? 'main [aria-busy="true"]'
      : 'main [data-page-state="loading"]';
    await waitForApp(() => journey.container.querySelector(selector) !== null);
    expect(journey.container.querySelector(selector)).not.toBeNull();
    return;
  }
  if (state === "empty") {
    if (routeId === "home") {
      await waitForApp(() => journey.container.textContent?.includes("No recent knowledge yet.") === true);
      expect(journey.container.textContent).toContain("No recent knowledge yet.");
    } else if (routeId === "admin-analytics") {
      await waitForApp(() => journey.container.textContent?.includes("No activity recorded in this period.") === true);
      expect(journey.container.textContent).toContain("No activity recorded in this period.");
    } else {
      await waitForApp(() => journey.container.querySelector('main [data-page-state="empty"]') !== null);
      expect(journey.container.querySelector('main [data-page-state="empty"]')).not.toBeNull();
    }
    return;
  }
  await waitForApp(() => journey.container.querySelector('main [role="alert"]') !== null);
  expect(journey.container.querySelector('main [role="alert"]')).not.toBeNull();
  if (routeId === "submit") expect(journey.container.querySelector("main form button[type=submit]:not([disabled])")).not.toBeNull();
  else expect(journey.container.querySelector('main [role="alert"] button')).not.toBeNull();
}

async function assertExplicitGap(journey: MountedApp, routeId: MaturityRouteId, state: MaturityProbeState, reason: string): Promise<void> {
  expect(reason.length).toBeGreaterThan(20);
  if (routeId === "admin-audit" && (state === "empty" || state === "ready")) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(journey.container.querySelector('main [data-page-state="empty"]')).toBeNull();
    expect(readyObservablePresent(journey, routeId)).toBe(false);
    return;
  }
  if (state === "error" && !["home", "settings", "admin"].includes(routeId)) {
    await waitForApp(() => journey.container.querySelector('main [role="alert"]') !== null);
    expect(journey.container.querySelector('main [role="alert"] button')).toBeNull();
    return;
  }
  if (state === "empty" && (routeId === "knowledge-reader" || routeId === "admin-submission-detail")) {
    await waitForApp(() => journey.container.querySelector('main [role="alert"]') !== null);
    expect(journey.container.querySelector('main [data-page-state="empty"]')).toBeNull();
    return;
  }
  if (state === "empty" && routeId === "agent") {
    await waitForApp(() => journey.container.querySelector('main [data-page-state="loading"]') === null);
    expect(journey.container.querySelector('main [data-page-state="empty"]')).toBeNull();
    return;
  }
  await waitForApp(() => routeId === "home" || readyObservablePresent(journey, routeId));
  expect(journey.container.querySelector(`main [data-page-state="${state}"]`)).toBeNull();
}

function readyObservablePresent(journey: MountedApp, routeId: MaturityRouteId): boolean {
  const marker = READY_MARKER_BY_ROUTE[routeId];
  return isReadySelector(routeId)
    ? journey.container.querySelector(marker) !== null
    : journey.container.textContent?.includes(marker) === true;
}
