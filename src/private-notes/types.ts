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
  citations: readonly PrivateNoteCitation[];
  createdAt: string;
  updatedAt: string;
}

export interface PrivateNoteInput {
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

export interface PrivateNoteRepositoryPort {
  findOwned(scope: PrivateNoteScope, knowledgeItemId: string): Promise<PrivateNote | null>;
  upsert(input: PrivateNoteUpsert): Promise<PrivateNote>;
}
