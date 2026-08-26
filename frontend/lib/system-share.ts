const KNOWLEDGE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export interface ShareNavigator {
  share?: (data: { title: string; url: string }) => Promise<void>;
}

export function knowledgeShareUrl(id: string, origin: string): string {
  if (!KNOWLEDGE_ID.test(id)) throw new Error("SHARE_TARGET_INVALID");
  const base = new URL(origin);
  return new URL(`/knowledge/${encodeURIComponent(id)}`, base).toString();
}

export async function shareKnowledgeItem(input: { id: string; title: string; origin: string; navigator: ShareNavigator; confirm: () => boolean }): Promise<"shared" | "cancelled"> {
  const url = knowledgeShareUrl(input.id, input.origin);
  if (!input.confirm()) return "cancelled";
  if (typeof input.navigator.share !== "function") throw new Error("SHARE_UNAVAILABLE");
  try {
    await input.navigator.share({ title: input.title.trim().slice(0, 200) || "Memory Garden", url });
    return "shared";
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw new Error("SHARE_FAILED");
  }
}
