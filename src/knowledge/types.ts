export interface NoteRecord {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  path: string;
}

export interface CreateNoteResult {
  note: NoteRecord;
  created: boolean;
}

export interface SerializableAppError {
  code: string;
  message: string;
  status: number;
  retryable: boolean;
}

export type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SerializableAppError };

export interface CommitPublishedContentInput {
  spaceId: string;
  knowledgeItemId: string;
  revisionId: string;
  contentSha256: string;
  markdown: string;
}

export interface PublishedContentReceipt {
  path: string;
  contentSha256: string;
  bytes: number;
}

export interface PublishedContentReader {
  read(path: string, expectedSha256: string): Promise<string>;
}

export interface SearchDocument extends NoteRecord {
  content: string;
}

export interface SearchHit extends NoteRecord {
  excerpt: string;
  score: number;
}
