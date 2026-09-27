import { apiFetch, type Fetcher } from "./api";
import { normalizeNumberedPage, writePageSearch, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";
import { normalizeProjectSummary } from "./projects-data";
export type ProjectRelationKind = "goals" | "tasks";
export interface ProjectRelation { id: string; title: string; linked: boolean; }
export interface ProjectRelationPage extends FrontendNumberedPage<ProjectRelation> { projectId: string; kind: ProjectRelationKind; }

export async function loadProjectRelations(projectId: string, kind: ProjectRelationKind, request: FrontendPageRequest, requester: Fetcher = fetch, signal?: AbortSignal): Promise<ProjectRelationPage> {
  writePageSearch("", request); // Validate the bounded page before making a request.
  const params = new URLSearchParams({ page: String(request.page), pageSize: String(request.pageSize) });
  const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(projectId)}/${kind}?${params}`, { requester, signal });
  const record = value as Partial<ProjectRelationPage> | null;
  if (!record || record.projectId !== projectId || record.kind !== kind) throw new Error("PROJECT_RELATIONS_INVALID");
  const page = normalizeNumberedPage(value, (item): ProjectRelation => {
    const row = item as Partial<ProjectRelation> | null;
    if (!row || typeof row.id !== "string" || !row.id || typeof row.title !== "string" || !row.title.trim() || typeof row.linked !== "boolean") throw new Error("PROJECT_RELATIONS_INVALID");
    return { id: row.id, title: row.title, linked: row.linked };
  });
  if (page.pagination.page !== request.page || page.pagination.pageSize !== request.pageSize || new Set(page.items.map(row => row.id)).size !== page.items.length) throw new Error("PROJECT_RELATIONS_INVALID");
  return { projectId, kind, ...page };
}

export async function setProjectRelation(projectId: string, kind: "goals" | "tasks", id: string, linked: boolean, requester: Fetcher = fetch): Promise<void> {
  if (linked) {
    const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(projectId)}/${kind}`, {
      requester, method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ [kind === "goals" ? "goalId" : "taskId"]: id }),
    });
    const record = value as { linked?: unknown; project?: unknown } | null;
    if (!record || typeof record.linked !== "boolean") throw new Error("PROJECT_RELATION_RECEIPT_INVALID");
    normalizeProjectSummary(record.project);
  } else {
    const value = await apiFetch<unknown>(`/api/projects/${encodeURIComponent(projectId)}/${kind}/${encodeURIComponent(id)}`, { requester, method: "DELETE" });
    normalizeProjectSummary(value);
  }
}
