export interface NoteRecord {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  path: string;
}

export interface SearchDocument extends NoteRecord { content: string }
export interface SearchHit extends NoteRecord { excerpt: string; score: number }

const tokens = (text: string) =>
  text.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((word) => word.length > 1);

export function searchNotes(query: string, documents: SearchDocument[], limit = 8): SearchHit[] {
  const terms = [...new Set(tokens(query))];
  if (!terms.length) return [];
  return documents.map((doc) => {
    const title = doc.title.toLocaleLowerCase();
    const tags = doc.tags.join(" ").toLocaleLowerCase();
    const body = doc.content.toLocaleLowerCase();
    let score = 0;
    let first = -1;
    for (const term of terms) {
      if (title.includes(term)) score += 8;
      if (tags.includes(term)) score += 5;
      const index = body.indexOf(term);
      if (index >= 0) {
        score += 1 + Math.min(4, body.split(term).length - 1);
        if (first < 0 || index < first) first = index;
      }
    }
    const start = Math.max(0, first < 0 ? 0 : first - 90);
    const excerpt = doc.content.slice(start, start + 280).replace(/\s+/g, " ").trim();
    return { ...doc, excerpt, score };
  }).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

export function safeId(input: string): string {
  const id = input.toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64);
  return id || crypto.randomUUID();
}
