import type { Page, PageRequest } from "../pagination";

export const DISCUSSION_CONTEXT_KINDS = ["task", "knowledge"] as const;
export type DiscussionContextKind = typeof DISCUSSION_CONTEXT_KINDS[number];

export interface DiscussionContext {
  kind: DiscussionContextKind;
  id: string;
}

export interface DiscussionThread {
  id: string;
  contextKind: DiscussionContextKind;
  contextId: string;
  creatorMemberId: string;
  lastSequence: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiscussionMessage {
  id: string;
  threadId: string;
  sequence: number;
  authorMemberId: string;
  body: string;
  replyToMessageId: string | null;
  mentionMemberIds: string[];
  clientKey: string;
  createdAt: string;
}

export interface DiscussionThreadCreate {
  id: string;
  context: DiscussionContext;
  creatorMemberId: string;
  createdAt: number;
}

export interface DiscussionMessageInsert {
  id: string;
  threadId: string;
  authorMemberId: string;
  body: string;
  replyToMessageId: string | null;
  mentionMemberIds: readonly string[];
  clientKey: string;
  createdAt: number;
}

export interface SendDiscussionMessageInput {
  context: unknown;
  body: unknown;
  clientKey: unknown;
  replyToMessageId?: unknown;
  mentionMemberIds?: unknown;
}

export interface SendDiscussionMessageResult {
  thread: DiscussionThread;
  message: DiscussionMessage;
  created: boolean;
}

export interface DiscussionThreadPage extends Page<DiscussionThread> {}
export interface DiscussionMessagePage extends Page<DiscussionMessage> {}
export interface DiscussionThreadPageRequest extends PageRequest {}
export interface DiscussionMessagePageRequest extends PageRequest {}
