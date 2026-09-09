import type { Page, PageRequest } from "../pagination";

export type InboxKind = "text" | "link" | "file_ref";
export type InboxStatus = "inbox" | "archived" | "promoted";

export const INBOX_KINDS: readonly InboxKind[] = ["text", "link", "file_ref"];
export const INBOX_STATUSES: readonly InboxStatus[] = ["inbox", "archived", "promoted"];

export interface InboxItem {
  id: string;
  memberId: string;
  clientKey: string;
  kind: InboxKind;
  content: string;
  sourceUrl: string | null;
  status: InboxStatus;
  promotedTaskId: string | null;
  promotedSubmissionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxCreate {
  id: string;
  memberId: string;
  clientKey: string;
  kind: InboxKind;
  content: string;
  sourceUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface InboxUpdate {
  status: InboxStatus;
  updatedAt: number;
}

export interface InboxListFilters {
  status?: InboxStatus;
}

export interface InboxListRequest extends PageRequest { filters: InboxListFilters; }

export type InboxPage = Page<InboxItem>;
