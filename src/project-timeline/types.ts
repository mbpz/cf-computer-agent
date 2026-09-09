import type { Page, PageRequest } from "../pagination";

export type ProjectTimelineKind = "meeting" | "decision" | "action_item" | "milestone";
export type ProjectTimelineStatus = "open" | "done" | "archived";

export interface ProjectTimelineItem {
  id: string;
  memberId: string;
  projectId: string;
  clientKey: string;
  kind: ProjectTimelineKind;
  title: string;
  body: string;
  status: ProjectTimelineStatus;
  startsAt: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTimelineCreate {
  id: string;
  memberId: string;
  projectId: string;
  clientKey: string;
  kind: ProjectTimelineKind;
  title: string;
  body: string;
  startsAt: number | null;
  dueAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectTimelineListRequest extends PageRequest {
  projectId: string;
}

export type ProjectTimelinePage = Page<ProjectTimelineItem>;
