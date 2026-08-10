import type { SearchDocument, SearchHit } from "./types";
import { APP_CONFIG } from "../config";

const tokens = (text: string) =>
  text.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((word) => word.length > 1);

export function searchNotes(query: string, documents: SearchDocument[], limit = 8): SearchHit[] {
  const terms = [...new Set(tokens(query))];
  if (!terms.length || limit <= 0) return [];

  return documents.map((document) => {
    const title = document.title.toLocaleLowerCase();
    const tags = document.tags.join(" ").toLocaleLowerCase();
    const body = document.content.toLocaleLowerCase();
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
    const excerpt = document.content.slice(start, start + 280).replace(/\s+/g, " ").trim();
    return { ...document, excerpt, score };
  }).filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export function safeId(input: string, createId: () => string = () => crypto.randomUUID()): string {
  const normalized = input.toLocaleLowerCase().normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  let id = "";
  for (const character of normalized) {
    if ([...id].length >= 64) break;
    const candidate = id + character;
    if (new TextEncoder().encode(candidate).byteLength > APP_CONFIG.maxNoteIdBytes) break;
    id = candidate;
  }
  id = id.replace(/-$/u, "");
  return id || createId();
}
