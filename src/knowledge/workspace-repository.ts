import { getWorkspace, type WorkspaceClient } from "@cloudflare/computer";
import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import type { NoteRecord, SearchDocument } from "./types";

const INDEX_DIRECTORY = APP_CONFIG.indexPath.slice(0, APP_CONFIG.indexPath.lastIndexOf("/"));

export interface KnowledgeRepository {
  list(): Promise<NoteRecord[]>;
  read(note: NoteRecord): Promise<string | null>;
  save(note: NoteRecord, content: string, nextIndex: NoteRecord[]): Promise<void>;
}

export class WorkspaceRepository implements KnowledgeRepository {
  constructor(
    private readonly namespace: Env["KNOWLEDGE"],
    private readonly name: string,
  ) {}

  async list(): Promise<NoteRecord[]> {
    return this.withWorkspace(async (workspace) => {
      try {
        const raw = await workspace.fs.readFile(APP_CONFIG.indexPath, "utf8");
        return parseIndex(raw);
      } catch (error) {
        if (isNotFound(error)) return [];
        throw error;
      }
    });
  }

  async read(note: NoteRecord): Promise<string | null> {
    assertSafePath(note);
    return this.withWorkspace(async (workspace) => {
      try {
        return await workspace.fs.readFile(note.path, "utf8");
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    });
  }

  async save(note: NoteRecord, content: string, nextIndex: NoteRecord[]): Promise<void> {
    assertSafePath(note);
    nextIndex.forEach(assertSafePath);
    await this.withWorkspace(async (workspace) => {
      await workspace.fs.mkdir(APP_CONFIG.notesRoot, { recursive: true });
      await workspace.fs.mkdir(INDEX_DIRECTORY, { recursive: true });
      await workspace.fs.writeFile(note.path, content);
      await workspace.fs.writeFile(APP_CONFIG.indexPath, JSON.stringify(nextIndex));
    });
  }

  async searchDocuments(): Promise<SearchDocument[]> {
    const notes = await this.list();
    const documents: SearchDocument[] = [];
    for (const note of notes) {
      const content = await this.read(note);
      if (content !== null) documents.push({ ...note, content });
    }
    return documents;
  }

  private async withWorkspace<T>(operation: (workspace: WorkspaceClient) => Promise<T>): Promise<T> {
    using workspace = await getWorkspace(toWorkspaceHandle(this.namespace, this.name));
    return operation(workspace);
  }
}

function toWorkspaceHandle(namespace: Env["KNOWLEDGE"], name: string): Parameters<typeof getWorkspace>[0] {
  const stub = namespace.get(namespace.idFromName(name));
  // @cloudflare/computer currently expects its internal WorkspaceStubHost while
  // a generated DurableObjectNamespace exposes a structurally incompatible stub.
  return stub as unknown as Parameters<typeof getWorkspace>[0];
}

function parseIndex(raw: string): NoteRecord[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || !value.every(isNoteRecord)) throw new Error("Invalid note index");
    value.forEach(assertSafePath);
    return value;
  } catch {
    throw new AppError("INDEX_CORRUPT", "Knowledge index is corrupt", 500);
  }
}

function isNoteRecord(value: unknown): value is NoteRecord {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === "string"
    && typeof note.title === "string"
    && Array.isArray(note.tags) && note.tags.every((tag) => typeof tag === "string")
    && typeof note.createdAt === "string"
    && typeof note.updatedAt === "string"
    && typeof note.path === "string";
}

function assertSafePath(note: NoteRecord): void {
  const expected = `${APP_CONFIG.notesRoot}/${note.id}.md`;
  if (!note.id || note.path !== expected || !note.id.match(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u)) {
    throw new AppError("INDEX_CORRUPT", "Knowledge index is corrupt", 500);
  }
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "ENOENT";
}
