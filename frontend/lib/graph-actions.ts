import { apiFetch, type Fetcher } from "./api";
import type { GraphNode } from "./graph-data";

export type GraphActionName = "create_task" | "create_action_item" | "start_focus" | "append_timeline";
export type GraphTimelineKind = "meeting" | "decision" | "action_item" | "milestone";

export interface GraphActionRequest {
  node: GraphNode;
  clientKey: string;
  timelineKind?: GraphTimelineKind;
}

export type GraphActionResult =
  | { status: "completed"; action: GraphActionName; clientKey: string; data: unknown }
  | { status: "deferred"; action: null; clientKey: string; reason: "unsupported" | "missing_context" };

export async function dispatchGraphAction(
  request: GraphActionRequest,
  requester: Fetcher = fetch,
): Promise<GraphActionResult> {
  const clientKey = requireClientKey(request?.clientKey);
  const node = request?.node;
  if (!node || typeof node !== "object") throw new Error("GRAPH_ACTION_NODE_REQUIRED");

  const id = graphObjectId(node.id);
  if (!id || typeof node.label !== "string" || !node.label.trim()) {
    return { status: "deferred", action: null, clientKey, reason: "missing_context" };
  }

  if (node.kind === "knowledge") {
    const data = await apiFetch<unknown>("/api/tasks", {
      requester,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: clientKey, title: node.label, notes: "", priority: "medium", dueAt: null, knowledgeItemId: id }),
    });
    return { status: "completed", action: "create_task", clientKey, data };
  }

  if (node.kind === "task") {
    const data = await apiFetch<unknown>("/api/focus", {
      requester,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: clientKey, clientKey, taskId: id, title: node.label, durationMinutes: 25 }),
    });
    return { status: "completed", action: "start_focus", clientKey, data };
  }

  if (node.kind === "project" || node.kind === "decision") {
    const projectId = node.kind === "project" ? id : projectIdFromHref(node.href);
    if (!projectId) return { status: "deferred", action: null, clientKey, reason: "missing_context" };
    const kind = node.kind === "decision" ? "action_item" : request.timelineKind ?? "milestone";
    const data = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(projectId)}/timeline`, {
      requester,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: clientKey, clientKey, kind, title: node.label, body: "", startsAt: null, dueAt: null }),
    });
    return { status: "completed", action: node.kind === "decision" ? "create_action_item" : "append_timeline", clientKey, data };
  }

  return { status: "deferred", action: null, clientKey, reason: "unsupported" };
}

function requireClientKey(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("GRAPH_ACTION_CLIENT_KEY_REQUIRED");
  return value;
}

function graphObjectId(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const separator = value.indexOf(":");
  return separator >= 0 ? value.slice(separator + 1) || null : value;
}

function projectIdFromHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\/projects\/([^/]+)(?:\/|$)/u.exec(value);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
