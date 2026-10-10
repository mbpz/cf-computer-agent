import { apiFetch, type Fetcher } from "./api";
import type { GraphNode } from "./graph-data";

export type GraphActionName = "create_task" | "create_action_item" | "start_focus" | "append_timeline";
export type GraphTimelineKind = "meeting" | "decision" | "action_item" | "milestone";

export interface GraphActionAvailability {
  action: GraphActionName;
  labelKey: "GRAPH_ACTION_CREATE_TASK" | "GRAPH_ACTION_CREATE_ACTION_ITEM" | "GRAPH_ACTION_START_FOCUS" | "GRAPH_ACTION_APPEND_TIMELINE";
}

export interface GraphActionRequest {
  node: GraphNode;
  clientKey: string;
  timelineKind?: GraphTimelineKind;
}

export type GraphActionResult =
  | { status: "completed"; action: GraphActionName; clientKey: string; data: unknown }
  | { status: "deferred"; action: null; clientKey: string; reason: "unsupported" | "missing_context" };

export function graphActionForNode(node: GraphNode | null | undefined): GraphActionAvailability | null {
  if (!node) return null;
  if (node.kind === "knowledge") return { action: "create_task", labelKey: "GRAPH_ACTION_CREATE_TASK" };
  if (node.kind === "decision") return { action: "create_action_item", labelKey: "GRAPH_ACTION_CREATE_ACTION_ITEM" };
  if (node.kind === "task") return { action: "start_focus", labelKey: "GRAPH_ACTION_START_FOCUS" };
  if (node.kind === "project") return { action: "append_timeline", labelKey: "GRAPH_ACTION_APPEND_TIMELINE" };
  return null;
}

export function createGraphActionClientKey(node: GraphNode): string {
  const normalized = node.id.trim().replace(/[^a-zA-Z0-9._:-]+/gu, "-");
  const uuid = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `graph-action:${normalized}:${uuid}`;
}

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
    requireReceipt(data, "task", { id: clientKey });
    requireReceipt(data, "link", { taskId: clientKey, knowledgeItemId: id });
    return { status: "completed", action: "create_task", clientKey, data };
  }

  if (node.kind === "task") {
    const data = await apiFetch<unknown>("/api/focus", {
      requester,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: clientKey, clientKey, taskId: id, title: node.label, durationMinutes: 25 }),
    });
    requireReceipt(data, "session", { id: clientKey, clientKey, taskId: id });
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
    requireReceipt(data, "item", { id: clientKey, clientKey, projectId });
    return { status: "completed", action: node.kind === "decision" ? "create_action_item" : "append_timeline", clientKey, data };
  }

  return { status: "deferred", action: null, clientKey, reason: "unsupported" };
}

// Resolve only the persisted operation's exact ID. Never scan a collection or
// infer success from the current active focus session, and never write on lookup.
export async function queryGraphAction(
  request: GraphActionRequest,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<GraphActionResult> {
  const clientKey = requireClientKey(request?.clientKey);
  const node = request?.node;
  const action = graphActionForNode(node)?.action;
  if (!action) return { status: "deferred", action: null, clientKey, reason: "unsupported" };
  const id = graphObjectId(node.id);
  if (!id) return { status: "deferred", action: null, clientKey, reason: "missing_context" };
  const get = (path: string) => apiFetch<unknown>(path, { requester, method: "GET", cache: "no-store", signal });
  const key = encodeURIComponent(clientKey);
  let data: unknown;
  if (node.kind === "knowledge") {
    data = await get(`/api/tasks/${key}`);
    const detail = record(data);
    requireIdentity(detail?.task, { id: clientKey });
    const links = detail?.links;
    if (!Array.isArray(links) || !links.some((value) => {
      const link = record(value);
      // A null title is the server's current-authorization projection. A past
      // relation alone is not proof of a currently readable knowledge target.
      return link?.taskId === clientKey && link.knowledgeItemId === id
        && typeof link.id === "string" && link.id.length > 0 && typeof link.knowledgeTitle === "string";
    })) throw new Error("GRAPH_ACTION_RECEIPT_UNKNOWN");
  } else if (node.kind === "task") {
    data = await get(`/api/focus/${key}`);
    requireIdentity(data, { id: clientKey, clientKey, taskId: id });
  } else {
    const projectId = node.kind === "project" ? id : projectIdFromHref(node.href);
    if (!projectId) return { status: "deferred", action: null, clientKey, reason: "missing_context" };
    data = await get(`/api/projects/${encodeURIComponent(projectId)}/timeline/${key}`);
    requireIdentity(data, { id: clientKey, clientKey, projectId });
  }
  return { status: "completed", action, clientKey, data };
}

function requireIdentity(value: unknown, identity: Record<string, string>): void {
  const entity = record(value);
  if (!entity || Object.entries(identity).some(([key, expected]) => entity[key] !== expected)) {
    throw new Error("GRAPH_ACTION_RECEIPT_UNKNOWN");
  }
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

// A successful transport is not proof that this operation completed. Only immutable
// identity is compared: a replay may return an entity edited after its creation.
function requireReceipt(value: unknown, field: "task" | "session" | "item" | "link", identity: Record<string, string>): void {
  const receipt = record(value);
  const entity = record(receipt?.[field]);
  if (!receipt || typeof receipt.created !== "boolean" || !entity
    || Object.entries(identity).some(([key, expected]) => entity[key] !== expected)) {
    throw new Error("GRAPH_ACTION_RECEIPT_UNKNOWN");
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
