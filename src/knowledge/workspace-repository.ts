import { getWorkspace, type WorkspaceClient } from "@cloudflare/computer";
import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import type { CreateNoteResult, NoteRecord, RpcResult, SearchDocument } from "./types";

const INDEX_DIRECTORY = APP_CONFIG.indexPath.slice(0, APP_CONFIG.indexPath.lastIndexOf("/"));
const WORKSPACE_ROOT = APP_CONFIG.notesRoot.slice(0, APP_CONFIG.notesRoot.lastIndexOf("/"));

export interface KnowledgeRepository {
  list(): Promise<NoteRecord[]>;
  read(note: NoteRecord): Promise<string | null>;
  save(note: NoteRecord, content: string, nextIndex: NoteRecord[]): Promise<void>;
}

export class WorkspaceRepository implements KnowledgeRepository {
  private readonly namespace: Env["KNOWLEDGE"] | undefined;
  private readonly name: string | undefined;
  private workspace: WorkspaceClient | undefined;

  constructor(
    namespace?: Env["KNOWLEDGE"],
    name?: string,
    workspace?: WorkspaceClient,
  ) {
    this.namespace = namespace;
    this.name = name;
    this.workspace = workspace;
  }

  static forLocalWorkspace(workspace: WorkspaceClient): WorkspaceRepository {
    return new WorkspaceRepository(undefined, undefined, workspace);
  }

  async commitNote(input: unknown): Promise<CreateNoteResult> {
    const result = await this.getStub().commitNote(input);
    return unwrapRpcResult(result);
  }

  async list(): Promise<NoteRecord[]> {
    return this.withWorkspace(async (workspace) => {
      await ensureWorkspaceDirectories(workspace);
      if (!(await hasEntry(workspace, INDEX_DIRECTORY, fileName(APP_CONFIG.indexPath)))) return [];
      return parseIndex(await workspace.fs.readFile(APP_CONFIG.indexPath, "utf8"));
    });
  }

  async read(note: NoteRecord): Promise<string | null> {
    assertSafePath(note);
    return this.withWorkspace(async (workspace) => {
      await ensureWorkspaceDirectories(workspace);
      if (!(await hasEntry(workspace, APP_CONFIG.notesRoot, fileName(note.path)))) return null;
      return workspace.fs.readFile(note.path, "utf8");
    });
  }

  async save(note: NoteRecord, content: string, nextIndex: NoteRecord[]): Promise<void> {
    assertSafePath(note);
    nextIndex.forEach(assertSafePath);
    await this.withWorkspace(async (workspace) => {
      await ensureWorkspaceDirectories(workspace);
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
    return operation(await this.getWorkspace());
  }

  dispose(): void {
    const disposeSymbol = (Symbol as typeof Symbol & { dispose?: symbol }).dispose;
    const disposable = this.workspace as (Record<symbol, unknown> | undefined);
    const dispose = disposeSymbol ? disposable?.[disposeSymbol] : undefined;
    if (typeof dispose === "function") dispose.call(this.workspace);
    this.workspace = undefined;
  }

  private async getWorkspace(): Promise<WorkspaceClient> {
    if (!this.workspace) {
      const stub = this.getStub();
      unwrapRpcResult(await stub.recoverWorkspace());
      this.workspace = await getWorkspace(toWorkspaceHandle(stub));
    }
    return this.workspace;
  }

  private getStub(): ReturnType<Env["KNOWLEDGE"]["get"]> {
    if (!this.namespace || !this.name) throw new Error("A Durable Object workspace is required");
    return this.namespace.get(this.namespace.idFromName(this.name));
  }
}

function unwrapRpcResult<T>(result: RpcResult<T>): T {
  if (result.ok) return result.value;
  throw new AppError(result.error.code, result.error.message, result.error.status, result.error.retryable);
}

function toWorkspaceHandle(stub: ReturnType<Env["KNOWLEDGE"]["get"]>): Parameters<typeof getWorkspace>[0] {
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

export async function ensureDirectory(
  workspace: WorkspaceClient,
  parent: string,
  path: string,
): Promise<void> {
  if (await hasEntry(workspace, parent, fileName(path))) return;
  try {
    await workspace.fs.mkdir(path);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
}

async function ensureWorkspaceDirectories(workspace: WorkspaceClient): Promise<void> {
  await ensureDirectory(workspace, "/", WORKSPACE_ROOT);
  await ensureDirectory(workspace, WORKSPACE_ROOT, APP_CONFIG.notesRoot);
  await ensureDirectory(workspace, WORKSPACE_ROOT, INDEX_DIRECTORY);
}

async function hasEntry(workspace: WorkspaceClient, directory: string, name: string): Promise<boolean> {
  return (await workspace.fs.readdir(directory)).some((entry) => entry.name === name);
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function isAlreadyExists(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate?.code === "EEXIST"
    || (typeof candidate?.message === "string"
      && (candidate.message.includes("EEXIST") || candidate.message.includes("WorkspaceFsError: path exists:")));
}
