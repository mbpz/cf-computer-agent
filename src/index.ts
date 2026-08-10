import { DurableObject } from "cloudflare:workers";
import { getWorkspace, type DurableObjectStorageLike, withWorkspace } from "@cloudflare/computer";
import { createApp } from "./app";
import { APP_CONFIG } from "./config";
import { AppError } from "./http";
import { KnowledgeService } from "./knowledge/service";
import type { CreateNoteResult, NoteRecord, RpcResult, SerializableAppError } from "./knowledge/types";
import { type KnowledgeRepository, WorkspaceRepository } from "./knowledge/workspace-repository";

const JOURNAL_TABLE = "memory_garden_note_journal";

interface PendingNoteCommit {
  note: NoteRecord;
  content: string;
}

export class KnowledgeBase extends withWorkspace(
  class extends DurableObject<Env> {},
  (self) => ({
    storage: (self as unknown as { ctx: DurableObjectState }).ctx.storage as unknown as DurableObjectStorageLike,
  }),
) {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ${JOURNAL_TABLE} (
        workspace TEXT PRIMARY KEY,
        note_json TEXT NOT NULL,
        content TEXT NOT NULL
      )
    `);
  }

  async commitNote(input: unknown): Promise<RpcResult<CreateNoteResult>> {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        return await this.withLocalWorkspace(async (repository) => {
          await this.recoverPendingCommit(repository);
          const journaled = new JournaledWorkspaceRepository(repository, (note, content) => this.writeJournal(note, content), () => this.clearJournal());
          return { ok: true, value: await new KnowledgeService(journaled).createNoteWithOutcome(input) };
        });
      } catch (error) {
        if (error instanceof AppError) return { ok: false, error: serializeAppError(error) };
        throw error;
      }
    });
  }

  async recoverWorkspace(): Promise<RpcResult<null>> {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        await this.withLocalWorkspace((repository) => this.recoverPendingCommit(repository));
        return { ok: true, value: null };
      } catch (error) {
        if (error instanceof AppError) return { ok: false, error: serializeAppError(error) };
        throw error;
      }
    });
  }

  private async withLocalWorkspace<T>(operation: (repository: WorkspaceRepository) => Promise<T>): Promise<T> {
    const workspace = await getWorkspace(this);
    const repository = WorkspaceRepository.forLocalWorkspace(workspace);
    try {
      return await operation(repository);
    } finally {
      repository.dispose();
    }
  }

  private async recoverPendingCommit(repository: WorkspaceRepository): Promise<void> {
    const pending = this.readJournal();
    if (!pending) return;

    const index = await repository.list();
    const nextIndex = [pending.note, ...index.filter((note) => note.id !== pending.note.id)];
    await repository.save(pending.note, pending.content, nextIndex);
    this.clearJournal();
  }

  private writeJournal(note: NoteRecord, content: string): void {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO ${JOURNAL_TABLE} (workspace, note_json, content) VALUES (?, ?, ?)`,
      APP_CONFIG.workspaceName,
      JSON.stringify(note),
      content,
    );
  }

  private clearJournal(): void {
    this.ctx.storage.sql.exec(`DELETE FROM ${JOURNAL_TABLE} WHERE workspace = ?`, APP_CONFIG.workspaceName);
  }

  private readJournal(): PendingNoteCommit | undefined {
    const row = this.ctx.storage.sql
      .exec<{ note_json: string; content: string }>(
        `SELECT note_json, content FROM ${JOURNAL_TABLE} WHERE workspace = ?`,
        APP_CONFIG.workspaceName,
      )
      .toArray()[0];
    if (!row) return undefined;

    let note: unknown;
    try {
      note = JSON.parse(row.note_json) as unknown;
    } catch {
      throw new Error("Invalid pending note journal");
    }
    if (!isNoteRecord(note) || typeof row.content !== "string") throw new Error("Invalid pending note journal");
    return { note, content: row.content };
  }
}

class JournaledWorkspaceRepository implements KnowledgeRepository {
  constructor(
    private readonly workspace: WorkspaceRepository,
    private readonly writeJournal: (note: NoteRecord, content: string) => void,
    private readonly clearJournal: () => void,
  ) {}

  list(): Promise<NoteRecord[]> {
    return this.workspace.list();
  }

  read(note: NoteRecord): Promise<string | null> {
    return this.workspace.read(note);
  }

  async save(note: NoteRecord, content: string, nextIndex: NoteRecord[]): Promise<void> {
    this.workspace.validateSave(note, nextIndex);
    this.writeJournal(note, content);
    await this.workspace.save(note, content, nextIndex);
    this.clearJournal();
  }
}

function serializeAppError(error: AppError): SerializableAppError {
  return { code: error.code, message: error.message, status: error.status, retryable: error.retryable };
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

export default createApp();
