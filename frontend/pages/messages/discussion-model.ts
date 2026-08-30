import type { DiscussionContext, DiscussionCursorRequest, DiscussionSendInput } from "../../lib/discussions-data";

export interface DiscussionSearch extends DiscussionCursorRequest {
  page: number;
  context?: DiscussionContext;
}

export function parseDiscussionSearch(search: string): DiscussionSearch {
  const params = new URLSearchParams(search);
  const page = positiveSingle(params, "page") ?? 1;
  const limit = positiveSingle(params, "limit") === 50 ? 50 : 20;
  const cursorValue = single(params, "cursor");
  const cursor = cursorValue !== null && isCursor(cursorValue) ? cursorValue : undefined;
  const kind = single(params, "contextKind");
  const id = single(params, "contextId");
  const context = (kind === "task" || kind === "knowledge") && id !== null && isId(id)
    ? { kind, id } satisfies DiscussionContext
    : undefined;
  const invalidPage = params.getAll("page").length > 1;
  const stablePage = !invalidPage && Number.isSafeInteger(page) && page >= 1
    && ((page === 1 && cursor === undefined) || (page > 1 && cursor !== undefined));
  return {
    page: stablePage ? page : 1,
    limit,
    ...(stablePage && cursor ? { cursor } : {}),
    ...(context ? { context } : {}),
  };
}

export function writeDiscussionSearch(search: string, next: DiscussionSearch): string {
  assertSearch(next);
  const params = new URLSearchParams(search);
  for (const key of ["page", "limit", "cursor", "contextKind", "contextId"]) params.delete(key);
  if (next.page !== 1) params.set("page", String(next.page));
  if (next.limit !== 20) params.set("limit", String(next.limit));
  if (next.cursor) params.set("cursor", next.cursor);
  if (next.context) {
    params.set("contextKind", next.context.kind);
    params.set("contextId", next.context.id);
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function contextDiscussionHref(context: DiscussionContext): string {
  assertContext(context);
  return `/messages${writeDiscussionSearch("", { page: 1, limit: 20, context })}`;
}

export function threadDiscussionHref(threadId: string): string {
  if (!isId(threadId)) throw new Error("DISCUSSION_ID_INVALID");
  return `/messages/${encodeURIComponent(threadId)}`;
}

export function discussionContextHref(context: DiscussionContext): string {
  assertContext(context);
  return context.kind === "knowledge" ? `/knowledge/${encodeURIComponent(context.id)}` : "/tasks";
}

export function mentionIdsFromBody(body: string): string[] {
  const mentions: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(/(?:^|\s)@([A-Za-z0-9][A-Za-z0-9_-]{0,127})(?=$|[\s.,!?;:])/gu)) {
    const id = match[1]!;
    if (!seen.has(id)) { seen.add(id); mentions.push(id); }
    if (mentions.length === 20) break;
  }
  return mentions;
}

export function createDiscussionSubmitController(keyFactory: () => string = () => crypto.randomUUID()) {
  let pending = false;
  let attempt: { fingerprint: string; clientKey: string } | null = null;
  return {
    observe(input: Omit<DiscussionSendInput, "clientKey"> | null): void {
      const fingerprint = input ? discussionSendFingerprint(input) : null;
      if (attempt && attempt.fingerprint !== fingerprint) attempt = null;
    },
    async submit(
      input: Omit<DiscussionSendInput, "clientKey">,
      sender: (input: DiscussionSendInput) => Promise<unknown>,
    ): Promise<boolean> {
      if (pending) return false;
      const fingerprint = discussionSendFingerprint(input);
      if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, clientKey: keyFactory() };
      const currentAttempt = attempt;
      pending = true;
      try {
        await sender({ ...input, clientKey: currentAttempt.clientKey });
        if (attempt !== currentAttempt) return false;
        attempt = null;
        return true;
      } finally {
        pending = false;
      }
    },
  };
}

export function discussionSendFingerprint(input: Omit<DiscussionSendInput, "clientKey">): string {
  return JSON.stringify([
    input.context.kind,
    input.context.id,
    input.body.trim(),
    input.replyToMessageId ?? null,
    [...(input.mentionMemberIds ?? [])],
  ]);
}

function positiveSingle(params: URLSearchParams, key: string): number | null {
  const value = single(params, key);
  if (value === null || !/^[1-9]\d*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function single(params: URLSearchParams, key: string): string | null { const values = params.getAll(key); return values.length === 1 ? values[0]! : null; }
function isId(value: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value); }
function isCursor(value: string): boolean { return value.length <= 512 && /^[A-Za-z0-9_-]+$/u.test(value); }
function assertContext(context: DiscussionContext): void { if ((context.kind !== "task" && context.kind !== "knowledge") || !isId(context.id)) throw new Error("DISCUSSION_CONTEXT_INVALID"); }
function assertSearch(search: DiscussionSearch): void {
  if (!Number.isSafeInteger(search.page) || search.page < 1 || (search.limit !== 20 && search.limit !== 50)
    || (search.cursor !== undefined && !isCursor(search.cursor))
    || (search.page === 1) !== (search.cursor === undefined)) throw new Error("DISCUSSION_SEARCH_INVALID");
  if (search.context) assertContext(search.context);
}
