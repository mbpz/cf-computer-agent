import { AppError } from "../http";
import { APP_CONFIG } from "../config";
import { safeId, searchNotes } from "./search";
import type { CreateNoteResult, NoteRecord, SearchDocument, SearchHit } from "./types";
import type { KnowledgeRepository } from "./workspace-repository";

export type { CreateNoteResult } from "./types";

export interface CreateNoteInput {
  id?: string;
  title: string;
  tags?: string[];
  content: string;
}

export interface KnowledgeServiceOptions {
  now?: () => string;
  createId?: () => string;
}

export class KnowledgeService {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(
    private readonly repository: KnowledgeRepository,
    options: KnowledgeServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  async createNote(input: unknown): Promise<NoteRecord> {
    return (await this.createNoteWithOutcome(input)).note;
  }

  async createNoteWithOutcome(input: unknown): Promise<CreateNoteResult> {
    if (!isCreateNoteContainer(input)) {
      throw new AppError("NOTE_INVALID", "Note must be an object", 400);
    }
    const title = validateTitle(input.title);
    const content = validateContent(input.content);
    const tags = validateTags(input.tags);
    const id = safeId(validateId(input.id, title), this.createId);
    const index = await this.repository.list();
    const existing = index.find((note) => note.id === id);
    const now = this.now();
    const note: NoteRecord = {
      id,
      title,
      tags,
      path: `${APP_CONFIG.notesRoot}/${id}.md`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    validateStoredMetadata(note);
    const nextIndex = [note, ...index.filter((item) => item.id !== id)];
    await this.repository.save(note, content, nextIndex);
    return { note, created: !existing };
  }

  listNotes(): Promise<NoteRecord[]> {
    return this.repository.list();
  }

  async search(query: string, limit = 8): Promise<SearchHit[]> {
    if (typeof query !== "string") throw new AppError("NOTE_INVALID", "Search query must be text", 400);
    const documents = await this.searchDocuments();
    return searchNotes(query, documents, limit);
  }

  private async searchDocuments(): Promise<SearchDocument[]> {
    const notes = await this.repository.list();
    const documents: SearchDocument[] = [];
    for (const note of notes) {
      const content = await this.repository.read(note);
      if (content !== null) documents.push({ ...note, content });
    }
    return documents;
  }
}

function validateTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("NOTE_INVALID", "Title is required", 400);
  }
  const title = value.trim().slice(0, 160);
  assertUtf8Limit(title, APP_CONFIG.maxNoteTitleBytes, "Title is too long");
  return title;
}

function validateContent(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("NOTE_INVALID", "Content is required", 400);
  }
  if (new TextEncoder().encode(value).byteLength > APP_CONFIG.maxNoteBytes) {
    throw new AppError("NOTE_TOO_LARGE", "Note exceeds 128 KiB", 413);
  }
  return value;
}

function validateTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags = value.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, APP_CONFIG.maxNoteTags);
  tags.forEach((tag) => assertUtf8Limit(tag, APP_CONFIG.maxNoteTagBytes, "Tag is too long"));
  return tags;
}

function validateId(value: unknown, fallback: string): string {
  if (value === undefined || value === "") return fallback;
  if (typeof value !== "string") throw new AppError("NOTE_INVALID", "Note id must be text", 400);
  assertUtf8Limit(value, APP_CONFIG.maxNoteIdBytes, "Note id is too long");
  return value;
}

function validateStoredMetadata(note: NoteRecord): void {
  assertUtf8Limit(note.id, APP_CONFIG.maxNoteIdBytes, "Note id is too long");
  if (utf8ByteLength(JSON.stringify(note)) > APP_CONFIG.maxNoteMetadataBytes) {
    throw new AppError("NOTE_INVALID", "Note metadata is too large", 400);
  }
}

function assertUtf8Limit(value: string, limit: number, message: string): void {
  if (utf8ByteLength(value) > limit) throw new AppError("NOTE_INVALID", message, 400);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isCreateNoteContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
