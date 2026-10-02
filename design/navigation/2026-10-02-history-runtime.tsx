import React from "react";
import { seedHistoryFixture } from "./history-fixture-start.mjs";
import { createRoot } from "react-dom/client";
import { App } from "../../frontend/app";
import "../../frontend/styles/globals.css";
import { readWorkspaceLocation, subscribeWorkspaceLocation, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { currentNavigationFixture } from "../../test/helpers/workbench-maturity-route-fixtures";

// Development-only fixture. No request is forwarded to any backend.
const documentId = crypto.randomUUID();
const arrivalType = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming)?.type;
const evidence = document.getElementById("evidence")!;
let writes = 0, inboxReads = 0, publications = 0, logoutRequests = 0, mode = "success";
// Synthetic identities are isolated to this local fixture, never real sessions.
const identityKey = "history-fixture-identity";
let identity = sessionStorage.getItem(identityKey) ?? "native-fixture";
const privateReads: Array<{ identity: string; path: string }> = [];
document.getElementById("member-b")!.onclick = () => {
  sessionStorage.setItem(identityKey, "native-fixture-b");
  location.assign("/tasks");
};
for (const next of ["pending", "unknown", "success"]) document.getElementById(next)!.onclick = () => {
  mode = next; document.getElementById("mode")!.textContent = mode;
};
function show() { evidence.textContent = JSON.stringify({ documentId, arrivalType, historyLength: history.length, identity, logoutRequests, privateReads, accepted: readWorkspaceLocation(), raw: location.pathname + location.search, publications, writes, inboxReads, nativeNavigation: "navigation" in window, userAgent: navigator.userAgent }, null, 2); }
const task = { id: "task-native", title: identity === "native-fixture-b" ? "Member B private task" : "Native fixture task", notes: "", status: "todo", progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("/api/telemetry/")) return new Response(null, { status: 204 });
  if (url === "/auth/logout" && init?.method === "POST") {
    logoutRequests++; identity = "anonymous"; sessionStorage.setItem(identityKey, identity); show();
    return new Response(null, { status: 204 });
  }
  if (url === "/api/session" && identity === "anonymous") return Response.json({ error: { code: "AUTH_REQUIRED", message: "Fixture signed out", retryable: false } }, { status: 401 });
  if (url === "/api/session") return Response.json({ member: { id: identity, email: `${identity}@example.test`, role: "contributor" }, capabilities: ["tasks:use"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
  if (url === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
  if (url === "/api/notifications/summary") return Response.json({ unread: 0 });
  if (url.startsWith("/api/tasks?") || url.startsWith("/api/inbox?")) {
    privateReads.push({ identity, path: url });
    if (url.startsWith("/api/inbox?")) inboxReads++;
    show(); return Response.json({ items: url.startsWith("/api/tasks?") ? [task] : [], pagination: { page: 1, pageSize: 20, total: url.startsWith("/api/tasks?") ? 1 : 0, totalPages: url.startsWith("/api/tasks?") ? 1 : 0 } });
  }
  if (url === "/api/tasks" && init?.method === "POST") {
    writes++; show();
    if (mode === "pending") return new Promise<Response>(() => {});
    if (mode === "unknown") throw new TypeError("Fixture unknown write outcome");
    return Response.json({ task: { ...task, ...JSON.parse(String(init.body)) }, created: true });
  }
  return Response.json({ error: { code: "UNEXPECTED_FIXTURE_REQUEST" } }, { status: 404 });
};
seedHistoryFixture(window, writeWorkspaceHistory, arrivalType ?? "unknown");
subscribeWorkspaceLocation(() => { publications++; show(); });
window.addEventListener("popstate", show); show();
createRoot(document.getElementById("root")!).render(<App />);
