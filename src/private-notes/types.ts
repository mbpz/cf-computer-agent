export interface PrivateNoteScope {
  memberId: string;
  role: "admin" | "contributor";
}

export interface PrivateNoteCitation {
  revisionId: string;
  chunkId: string;
  startLine: number;
  endLine: number;
}

export interface PrivateNote {
  id: string;
  ownerId: string;
  knowledgeItemId: string;
  title: string;
  body: string;
  visibility: "private";
  access: "owner" | "shared";
  citations: readonly PrivateNoteCitation[];
  createdAt: string;
  updatedAt: string;
}

export interface PrivateNoteShare {
  noteId: string;
  recipientMemberId: string;
  createdAt: string;
  revokedAt: string | null;
}

export type PrivateNoteListItem = Omit<PrivateNote, "ownerId">;
export interface PrivateNotePage { items: PrivateNoteListItem[]; nextCursor?: string }

export interface PrivateNoteInput {
  id?: unknown;
  expectedUpdatedAt?: unknown;
  title: unknown;
  body: unknown;
  citations: unknown;
}

export interface PrivateNoteUpsert {
  id: string;
  ownerId: string;
  role: "admin" | "contributor";
  knowledgeItemId: string;
  title: string;
  body: string;
  citations: readonly PrivateNoteCitation[];
  createdAt: string;
  updatedAt: string;
}

export interface PrivateNoteUpdate {
  ownerId: string;
  role: "admin" | "contributor";
  knowledgeItemId: string;
  id: string;
  title: string;
  body: string;
  citations: readonly PrivateNoteCitation[];
  expectedUpdatedAt: string;
  updatedAt: string;
}

export interface PrivateNoteRepositoryPort {
  findOwned(scope: PrivateNoteScope, knowledgeItemId: string): Promise<PrivateNote | null>;
  findVisible?(scope: PrivateNoteScope, knowledgeItemId: string): Promise<PrivateNote | null>;
  listOwned?: (scope: PrivateNoteScope, request: import("../pagination").PageRequest) => Promise<PrivateNotePage>;
  listVisible?: (scope: PrivateNoteScope, request: import("../pagination").PageRequest) => Promise<PrivateNotePage>;
  share?(scope: PrivateNoteScope, knowledgeItemId: string, recipientMemberId: string, createdAt: string): Promise<PrivateNoteShare>;
  /** Convergent: returns the stable revoked state, including for a repeated revoke. */
  revokeShare?(scope: PrivateNoteScope, knowledgeItemId: string, recipientMemberId: string, revokedAt: string): Promise<PrivateNoteShare>;
  listShares?(scope: PrivateNoteScope, knowledgeItemId: string): Promise<PrivateNoteShare[]>;
  /** `false` when a concurrent request already owns (owner, knowledge item). */
  create(input: PrivateNoteUpsert): Promise<boolean>;
  /** Compare-and-set on the authoritative `updated_at` (and note identity). */
  update(input: PrivateNoteUpdate): Promise<PrivateNote | null>;
}
