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

export interface SearchDocument extends NoteRecord {
  content: string;
}

export interface SearchHit extends NoteRecord {
  excerpt: string;
  score: number;
}
