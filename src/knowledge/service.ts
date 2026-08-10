import { AppError } from "../http";
import { APP_CONFIG } from "../config";
import { safeId, searchNotes } from "./search";
import type { NoteRecord, SearchDocument, SearchHit } from "./types";
import type { KnowledgeRepository } from "./workspace-repository";

export interface CreateNoteInput {
  id?: string;
  title: string;
  tags: string[];
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
    const nextIndex = [note, ...index.filter((item) => item.id !== id)];
    await this.repository.save(note, content, nextIndex);
    return note;
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
  return value.trim().slice(0, 160);
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
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new AppError("NOTE_INVALID", "Tags must be text", 400);
  }
  return value.map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
}

function validateId(value: unknown, fallback: string): string {
  if (value === undefined || value === "") return fallback;
  if (typeof value !== "string") throw new AppError("NOTE_INVALID", "Note id must be text", 400);
  return value;
}

function isCreateNoteContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
