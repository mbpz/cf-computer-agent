import { AppError } from "../http";
import type { PrivateNote, PrivateNoteCitation, PrivateNoteRepositoryPort, PrivateNoteScope, PrivateNoteUpsert } from "./types";

type PrivateNoteRow = {
  id: string;
  owner_member_id: string;
  knowledge_item_id: string;
  title: string;
  body: string;
  citations_json: string;
  created_at: string;
  updated_at: string;
};

export class PrivateNotesRepository implements PrivateNoteRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async findOwned(scope: PrivateNoteScope, knowledgeItemId: string): Promise<PrivateNote | null> {
    return mapRow(await this.db.prepare(
      `SELECT id, owner_member_id, knowledge_item_id, title, body, citations_json, created_at, updated_at
       FROM private_notes WHERE owner_member_id = ? AND knowledge_item_id = ? LIMIT 1`,
    ).bind(scope.memberId, knowledgeItemId).first<PrivateNoteRow>());
  }

  async upsert(input: PrivateNoteUpsert): Promise<PrivateNote> {
    for (const citation of input.citations) await assertCitationReadable(this.db, input, citation);
    await this.db.prepare(
      `INSERT INTO private_notes (id, owner_member_id, knowledge_item_id, title, body, citations_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_member_id, knowledge_item_id) DO UPDATE SET
         title = excluded.title,
         body = excluded.body,
         citations_json = excluded.citations_json,
         updated_at = excluded.updated_at`,
    ).bind(
      input.id, input.ownerId, input.knowledgeItemId, input.title, input.body,
      JSON.stringify(input.citations), input.createdAt, input.updatedAt,
    ).run();
    const saved = await this.findOwned({ memberId: input.ownerId, role: input.role }, input.knowledgeItemId);
    if (!saved) throw new AppError("PRIVATE_NOTE_UNAVAILABLE", "Private note is unavailable", 503, true);
    return saved;
  }
}

async function assertCitationReadable(db: D1Database, input: PrivateNoteUpsert, citation: PrivateNoteCitation): Promise<void> {
  const row = await db.prepare(
    `SELECT 1 AS readable
     FROM chunks
     JOIN revisions ON revisions.id = chunks.revision_id
     JOIN knowledge_items ON knowledge_items.id = revisions.knowledge_item_id
     JOIN spaces ON spaces.id = knowledge_items.space_id
     LEFT JOIN collections ON collections.id = knowledge_items.collection_id
     WHERE chunks.id = ?
       AND revisions.id = ?
       AND knowledge_items.id = ?
       AND knowledge_items.status = 'active'
       AND spaces.status = 'active'
       AND (knowledge_items.collection_id IS NULL OR (collections.id = knowledge_items.collection_id AND collections.space_id = knowledge_items.space_id AND collections.status = 'active'))
       AND (revisions.visibility = 'shared' OR ? = 'admin')
     LIMIT 1`,
  ).bind(citation.chunkId, citation.revisionId, input.knowledgeItemId, input.role).first<{ readable: number }>();
  if (!row) throw new AppError("PRIVATE_NOTE_CITATION_FORBIDDEN", "Note citation is not readable", 404);
}

function mapRow(row: PrivateNoteRow | null): PrivateNote | null {
  if (!row) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(row.citations_json) as unknown; } catch { throw new AppError("PRIVATE_NOTE_CORRUPT", "Private note is unavailable", 503, true); }
  if (!Array.isArray(parsed) || !parsed.every(isCitation)) throw new AppError("PRIVATE_NOTE_CORRUPT", "Private note is unavailable", 503, true);
  return {
    id: row.id, ownerId: row.owner_member_id, knowledgeItemId: row.knowledge_item_id,
    title: row.title, body: row.body, visibility: "private", citations: parsed,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function isCitation(value: unknown): value is PrivateNoteCitation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.revisionId === "string" && typeof record.chunkId === "string"
    && Number.isSafeInteger(record.startLine) && Number.isSafeInteger(record.endLine)
    && (record.startLine as number) >= 1 && (record.endLine as number) >= (record.startLine as number);
}
