import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { PrivateNote, PrivateNoteCitation, PrivateNoteInput, PrivateNotePage, PrivateNoteRepositoryPort, PrivateNoteScope } from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_TITLE_BYTES = 1024;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_CITATIONS = 8;

export interface PrivateNotesServiceOptions {
  id?: () => string;
  now?: () => Date;
}

export class PrivateNotesService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: PrivateNoteRepositoryPort, options: PrivateNotesServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async get(scope: PrivateNoteScope, knowledgeItemId: string): Promise<PrivateNote | null> {
    assertId(knowledgeItemId);
    return this.repository.findOwned(scope, knowledgeItemId);
  }

  async list(scope: PrivateNoteScope, request?: PageRequest): Promise<PrivateNotePage> {
    if (!this.repository.listOwned) throw new AppError("PRIVATE_NOTE_UNAVAILABLE", "Private notes are unavailable", 503, true);
    return this.repository.listOwned(scope, parsePageRequest(request?.limit, request?.cursor));
  }

  async save(scope: PrivateNoteScope, knowledgeItemId: string, input: PrivateNoteInput): Promise<PrivateNote> {
    assertId(knowledgeItemId);
    const normalized = normalizeInput(input);
    const timestamp = this.now().toISOString();
    return this.repository.upsert({
      id: this.id(), ownerId: scope.memberId, role: scope.role, knowledgeItemId,
      title: normalized.title, body: normalized.body, citations: normalized.citations,
      createdAt: timestamp, updatedAt: timestamp,
    });
  }
}

function normalizeInput(input: PrivateNoteInput): { title: string; body: string; citations: PrivateNoteCitation[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid();
  if (typeof input.title !== "string" || typeof input.body !== "string" || !Array.isArray(input.citations)) throw invalid();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body || utf8Bytes(title) > MAX_TITLE_BYTES || utf8Bytes(body) > MAX_BODY_BYTES) throw invalid();
  if (input.citations.length < 1 || input.citations.length > MAX_CITATIONS) throw invalid();
  const citations = input.citations.map(normalizeCitation);
  if (new Set(citations.map((citation) => `${citation.revisionId}:${citation.chunkId}:${citation.startLine}:${citation.endLine}`)).size !== citations.length) throw invalid();
  return { title, body, citations };
}

function normalizeCitation(value: unknown): PrivateNoteCitation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, ["revisionId", "chunkId", "startLine", "endLine"])
    || !validId(record.revisionId) || !validId(record.chunkId)
    || !Number.isSafeInteger(record.startLine) || !Number.isSafeInteger(record.endLine)
    || (record.startLine as number) < 1 || (record.endLine as number) < (record.startLine as number)
    || (record.endLine as number) - (record.startLine as number) > 240) throw invalid();
  return { revisionId: record.revisionId, chunkId: record.chunkId, startLine: record.startLine as number, endLine: record.endLine as number };
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(record).length === expected.size && Object.keys(record).every((key) => expected.has(key));
}

function validId(value: unknown): value is string { return typeof value === "string" && ID_PATTERN.test(value); }
function assertId(value: string): void { if (!validId(value)) throw invalid(); }
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function invalid(): AppError { return new AppError("PRIVATE_NOTE_INVALID", "Private note fields are invalid", 400); }
