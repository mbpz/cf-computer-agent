export interface NoteRecord {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  path: string;
}

export interface SearchDocument extends NoteRecord {
  content: string;
}

export interface SearchHit extends NoteRecord {
  excerpt: string;
  score: number;
}
