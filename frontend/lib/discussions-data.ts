import { apiFetch, type Fetcher } from "./api";

export const DISCUSSION_CONTEXT_KINDS = ["task", "knowledge"] as const;
export type DiscussionContextKind = (typeof DISCUSSION_CONTEXT_KINDS)[number];
export interface DiscussionContext { kind: DiscussionContextKind; id: string; }

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

export interface DiscussionCursorRequest { limit: 20 | 50; cursor?: string; }
export interface DiscussionCursorPage<T> { items: T[]; nextCursor?: string; }
export interface DiscussionSendInput {
  context: DiscussionContext;
  body: string;
  clientKey: string;
  replyToMessageId?: string;
  mentionMemberIds?: readonly string[];
}
export interface DiscussionSendResult { thread: DiscussionThread; message: DiscussionMessage; created: boolean; }
export interface DiscussionThreadResult { thread: DiscussionThread; created: boolean; }

export async function loadDiscussionThreads(
  request: DiscussionCursorRequest,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<DiscussionCursorPage<DiscussionThread>> {
  return normalizeCursorPage(await apiFetch<unknown>(cursorPath("/api/discussions", request), { requester, signal }), normalizeThread, request);
}

export async function loadDiscussionThread(
  threadId: string,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<DiscussionThread> {
  assertId(threadId, "DISCUSSION_ID_INVALID");
  const thread = normalizeThread(await apiFetch<unknown>(`/api/discussions/${encodeURIComponent(threadId)}`, { requester, signal }));
  if (thread.id !== threadId) invalidResponse();
  return thread;
}

export async function loadContextDiscussionThread(
  context: DiscussionContext,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<DiscussionThread> {
  assertContext(context);
  const params = new URLSearchParams({ kind: context.kind, id: context.id });
  const thread = normalizeThread(await apiFetch<unknown>(`/api/discussions/context?${params.toString()}`, { requester, signal }));
  assertThreadContext(thread, context);
  return thread;
}

export async function ensureDiscussionThread(
  context: DiscussionContext,
  requester: Fetcher = fetch,
): Promise<DiscussionThreadResult> {
  assertContext(context);
  const result = normalizeThreadResult(await apiFetch<unknown>("/api/discussions/context", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(context),
  }));
  assertThreadContext(result.thread, context);
  return result;
}

export async function loadDiscussionMessages(
  threadId: string,
  request: DiscussionCursorRequest,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<DiscussionCursorPage<DiscussionMessage>> {
  assertId(threadId, "DISCUSSION_ID_INVALID");
  const page = normalizeCursorPage(
    await apiFetch<unknown>(cursorPath(`/api/discussions/${encodeURIComponent(threadId)}/messages`, request), { requester, signal }),
    normalizeMessage,
    request,
  );
  if (page.items.some((message, index) => message.threadId !== threadId
    || (index > 0 && message.sequence >= page.items[index - 1]!.sequence))) invalidResponse();
  return page;
}

export async function sendDiscussionMessage(
  input: DiscussionSendInput,
  requester: Fetcher = fetch,
): Promise<DiscussionSendResult> {
  const payload = snapshotDiscussionInput(input);
  const result = normalizeSendResult(await apiFetch<unknown>("/api/discussions/messages", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
  assertMessageReceipt(result, payload);
  return result;
}

export async function loadDiscussionMessageResult(
  input: DiscussionSendInput,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<DiscussionSendResult | null> {
  const frozen = snapshotDiscussionInput(input);
  const params = new URLSearchParams({ kind: frozen.context.kind, id: frozen.context.id, clientKey: frozen.clientKey.trim() });
  const response = await apiFetch<unknown>(`/api/discussions/messages/requests?${params.toString()}`, { requester, method: "GET", signal, cache: "no-store" });
  if (!isRecord(response) || Object.keys(response).join("\0") !== "result") invalidResponse();
  if (response.result === null) return null;
  const result = normalizeSendResult(response.result);
  if (result.created) invalidResponse();
  assertMessageReceipt(result, frozen);
  return result;
}

function snapshotDiscussionInput(input: DiscussionSendInput): DiscussionSendInput {
  assertContext(input.context);
  const body = input.body.trim();
  if (!body || [...body].length > 5_000 || !isClientKey(input.clientKey)) throw new Error("DISCUSSION_MESSAGE_INVALID");
  if (input.replyToMessageId !== undefined) assertId(input.replyToMessageId, "DISCUSSION_MESSAGE_INVALID");
  const mentions = input.mentionMemberIds === undefined ? undefined : normalizeMentionIds(input.mentionMemberIds);
  return {
    context: { ...input.context },
    body,
    clientKey: input.clientKey,
    ...(input.replyToMessageId !== undefined ? { replyToMessageId: input.replyToMessageId } : {}),
    ...(mentions !== undefined ? { mentionMemberIds: mentions } : {}),
  };
}

function assertMessageReceipt(result: DiscussionSendResult, input: DiscussionSendInput): void {
  assertThreadContext(result.thread, input.context);
  if (result.message.clientKey !== input.clientKey.trim()) invalidResponse();
  // Both retry and read-only lookup must prove this frozen intent, not another payload.
  if (result.message.body !== input.body.trim()
    || result.message.replyToMessageId !== (input.replyToMessageId ?? null)
    || JSON.stringify(result.message.mentionMemberIds) !== JSON.stringify((input.mentionMemberIds ?? []).filter((id) => id !== result.message.authorMemberId))) invalidResponse();
}

export function createDiscussionRequestController<TInput, TResult>(
  requester: (input: TInput, signal: AbortSignal) => Promise<TResult>,
) {
  let active: AbortController | null = null;
  let generation = 0;
  let disposed = false;
  return {
    request(input: TInput) {
      if (disposed) throw new Error("DISCUSSION_REQUEST_CONTROLLER_DISPOSED");
      active?.abort();
      active = new AbortController();
      generation += 1;
      return { generation, promise: requester(input, active.signal) };
    },
    isCurrent(candidate: number) { return !disposed && candidate === generation; },
    dispose() { disposed = true; generation += 1; active?.abort(); active = null; },
  };
}

function cursorPath(path: string, request: DiscussionCursorRequest): string {
  if ((request.limit !== 20 && request.limit !== 50) || (request.cursor !== undefined && !isCursor(request.cursor))) {
    throw new Error("DISCUSSION_PAGE_INVALID");
  }
  const params = new URLSearchParams({ limit: String(request.limit) });
  if (request.cursor !== undefined) params.set("cursor", request.cursor);
  return `${path}?${params.toString()}`;
}

function normalizeCursorPage<T extends { id: string }>(value: unknown, normalizeItem: (value: unknown) => T, request: DiscussionCursorRequest): DiscussionCursorPage<T> {
  if (!isRecord(value) || !Array.isArray(value.items)
    || Object.keys(value).some((key) => key !== "items" && key !== "nextCursor")
    || (value.nextCursor !== undefined && !isCursor(value.nextCursor))) invalidResponse();
  let items: T[];
  try { items = value.items.map(normalizeItem); } catch { invalidResponse(); }
  if (items!.length > request.limit || new Set(items!.map((item) => item.id)).size !== items!.length
    || (value.nextCursor !== undefined && (!items!.length || value.nextCursor === request.cursor))) invalidResponse();
  return { items: items!, ...(value.nextCursor !== undefined ? { nextCursor: value.nextCursor } : {}) };
}

function normalizeThread(value: unknown): DiscussionThread {
  const keys = ["contextId", "contextKind", "createdAt", "creatorMemberId", "id", "lastSequence", "updatedAt"];
  if (!isRecord(value) || Object.keys(value).sort().join("\0") !== keys.join("\0")
    || !isId(value.id) || !DISCUSSION_CONTEXT_KINDS.includes(value.contextKind as DiscussionContextKind)
    || !isId(value.contextId) || !isId(value.creatorMemberId)
    || typeof value.lastSequence !== "number" || !Number.isSafeInteger(value.lastSequence) || value.lastSequence < 0
    || !isCanonicalDate(value.createdAt) || !isCanonicalDate(value.updatedAt)) invalidResponse();
  return value as unknown as DiscussionThread;
}

function normalizeMessage(value: unknown): DiscussionMessage {
  const keys = ["authorMemberId", "body", "clientKey", "createdAt", "id", "mentionMemberIds", "replyToMessageId", "sequence", "threadId"];
  if (!isRecord(value) || Object.keys(value).sort().join("\0") !== keys.join("\0")
    || !isId(value.id) || !isId(value.threadId) || !isId(value.authorMemberId)
    || typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || typeof value.body !== "string" || !value.body || [...value.body].length > 5_000
    || (value.replyToMessageId !== null && !isId(value.replyToMessageId))
    || !Array.isArray(value.mentionMemberIds) || value.mentionMemberIds.length > 20
    || !value.mentionMemberIds.every(isId) || new Set(value.mentionMemberIds).size !== value.mentionMemberIds.length
    || !isClientKey(value.clientKey) || !isCanonicalDate(value.createdAt)) invalidResponse();
  return { ...value, mentionMemberIds: [...value.mentionMemberIds] } as unknown as DiscussionMessage;
}

function normalizeThreadResult(value: unknown): DiscussionThreadResult {
  if (!isRecord(value) || Object.keys(value).sort().join("\0") !== "created\0thread" || typeof value.created !== "boolean") invalidResponse();
  return { thread: normalizeThread(value.thread), created: value.created };
}

function normalizeSendResult(value: unknown): DiscussionSendResult {
  if (!isRecord(value) || Object.keys(value).sort().join("\0") !== "created\0message\0thread" || typeof value.created !== "boolean") invalidResponse();
  const thread = normalizeThread(value.thread);
  const message = normalizeMessage(value.message);
  if (message.threadId !== thread.id || message.sequence > thread.lastSequence) invalidResponse();
  return { thread, message, created: value.created };
}

function normalizeMentionIds(value: readonly string[]): string[] {
  if (!Array.isArray(value) || value.length > 20 || !value.every(isId) || new Set(value).size !== value.length) {
    throw new Error("DISCUSSION_MESSAGE_INVALID");
  }
  return [...value];
}

function assertThreadContext(thread: DiscussionThread, context: DiscussionContext): void {
  if (thread.contextKind !== context.kind || thread.contextId !== context.id) invalidResponse();
}

function assertContext(value: DiscussionContext): void {
  if (!value || !DISCUSSION_CONTEXT_KINDS.includes(value.kind) || !isId(value.id)) throw new Error("DISCUSSION_CONTEXT_INVALID");
}
function assertId(value: unknown, code: string): asserts value is string { if (!isId(value)) throw new Error(code); }
function isId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value); }
function isClientKey(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value); }
function isCursor(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512 && /^[A-Za-z0-9_-]+$/u.test(value); }
function isCanonicalDate(value: unknown): value is string { if (typeof value !== "string") return false; const parsed = Date.parse(value); return Number.isFinite(parsed) && new Date(parsed).toISOString() === value; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function invalidResponse(): never { throw new Error("DISCUSSION_RESPONSE_INVALID"); }
