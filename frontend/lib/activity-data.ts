import { apiFetch, type Fetcher } from "./api";

export type WorkspaceActivityAction =
  | "submission.created"
  | "submission.draft_saved"
  | "submission.rejected"
  | "submission.revision_requested"
  | "submission.resubmitted"
  | "knowledge.published"
  | "knowledge.rolled_back"
  | "knowledge.restored"
  | "knowledge.downloaded";

export interface WorkspaceActivityItem {
  id: string;
  action: WorkspaceActivityAction;
  resourceType: "submission" | "knowledge";
  resourceId: string;
  createdAt: string;
}

export interface WorkspaceActivityPage {
  items: WorkspaceActivityItem[];
  nextCursor: string | null;
}

const ACTIONS = new Set<WorkspaceActivityAction>([
  "submission.created", "submission.draft_saved", "submission.rejected", "submission.revision_requested", "submission.resubmitted",
  "knowledge.published", "knowledge.rolled_back", "knowledge.restored", "knowledge.downloaded",
]);

export async function loadWorkspaceActivity({ cursor, requester = fetch, signal }: { cursor?: string | null; requester?: Fetcher; signal?: AbortSignal } = {}): Promise<WorkspaceActivityPage> {
  const params = new URLSearchParams({ limit: "12" });
  if (cursor) params.set("cursor", cursor);
  const data = await apiFetch<{ items?: unknown; nextCursor?: unknown }>(`/api/activity?${params.toString()}`, { requester, signal });
  if (!Array.isArray(data?.items)) throw new Error("ACTIVITY_RESPONSE_INVALID");
  const items = data.items.map(value => {
    const item = normalizeActivity(value);
    if (!item) throw new Error("ACTIVITY_RESPONSE_INVALID");
    return item;
  });
  return { items, nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null };
}

function normalizeActivity(value: unknown): WorkspaceActivityItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id || typeof record.action !== "string" || !ACTIONS.has(record.action as WorkspaceActivityAction)
    || (record.resourceType !== "submission" && record.resourceType !== "knowledge")
    || typeof record.resourceId !== "string" || !record.resourceId || typeof record.createdAt !== "string" || !record.createdAt) return null;
  return { id: record.id, action: record.action as WorkspaceActivityAction, resourceType: record.resourceType, resourceId: record.resourceId, createdAt: record.createdAt };
}
