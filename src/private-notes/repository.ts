import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, type PageRequest } from "../pagination";
import type { PrivateNote, PrivateNoteCitation, PrivateNoteListItem, PrivateNotePage, PrivateNoteRepositoryPort, PrivateNoteScope, PrivateNoteShare, PrivateNoteUpsert } from "./types";

type PrivateNoteRow = {
  id: string;
  owner_member_id: string;
  knowledge_item_id: string;
  title: string;
  body: string;
  citations_json: string;
  created_at: string;
  updated_at: string;
  access?: string;
};
type NoteCursor = { v: 1; updatedAt: string; id: string };

export class PrivateNotesRepository implements PrivateNoteRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async findOwned(scope: PrivateNoteScope, knowledgeItemId: string): Promise<PrivateNote | null> {
    return mapRow(await this.db.prepare(
      `SELECT id, owner_member_id, knowledge_item_id, title, body, citations_json, created_at, updated_at
       FROM private_notes WHERE owner_member_id = ? AND knowledge_item_id = ? LIMIT 1`,
    ).bind(scope.memberId, knowledgeItemId).first<PrivateNoteRow>());
  }

  async findVisible(scope: PrivateNoteScope, knowledgeItemId: string): Promise<PrivateNote | null> {
    return mapRow(await this.db.prepare(
      `SELECT n.id, n.owner_member_id, n.knowledge_item_id, n.title, n.body, n.citations_json, n.created_at, n.updated_at,
              CASE WHEN n.owner_member_id = ? THEN 'owner' ELSE 'shared' END AS access
       FROM private_notes AS n
       WHERE n.knowledge_item_id = ?
         AND (n.owner_member_id = ? OR EXISTS (
           SELECT 1 FROM private_note_shares AS sh
           INNER JOIN members AS recipient ON recipient.id = sh.recipient_member_id
           WHERE sh.note_id = n.id AND sh.recipient_member_id = ?
             AND sh.revoked_at IS NULL AND recipient.status = 'active'
         ))
       LIMIT 1`,
    ).bind(scope.memberId, knowledgeItemId, scope.memberId, scope.memberId).first<PrivateNoteRow>());
  }

  async listOwned(scope: PrivateNoteScope, request: PageRequest): Promise<PrivateNotePage> {
    const cursor = request.cursor === undefined ? undefined : decodeNoteCursor(request.cursor);
    const cursorSql = cursor ? "AND (updated_at < ? OR (updated_at = ? AND id < ?))" : "";
    const rows = await this.db.prepare(
      `SELECT id, owner_member_id, knowledge_item_id, title, body, citations_json, created_at, updated_at
       FROM private_notes
       WHERE owner_member_id = ? ${cursorSql}
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
    ).bind(
      scope.memberId,
      ...(cursor ? [cursor.updatedAt, cursor.updatedAt, cursor.id] : []),
      request.limit + 1,
    ).all<PrivateNoteRow>();
    const items = rows.results.slice(0, request.limit).map((row) => toListItem(mapRow(row)!));
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last ? { nextCursor: encodeOpaqueCursor({ v: 1, updatedAt: last.updatedAt, id: last.id }) } : {}),
    };
  }

  async listVisible(scope: PrivateNoteScope, request: PageRequest): Promise<PrivateNotePage> {
    const cursor = request.cursor === undefined ? undefined : decodeNoteCursor(request.cursor);
    const cursorSql = cursor ? "AND (n.updated_at < ? OR (n.updated_at = ? AND n.id < ?))" : "";
    const rows = await this.db.prepare(
      `SELECT n.id, n.owner_member_id, n.knowledge_item_id, n.title, n.body, n.citations_json, n.created_at, n.updated_at,
              CASE WHEN n.owner_member_id = ? THEN 'owner' ELSE 'shared' END AS access
       FROM private_notes AS n
       WHERE (n.owner_member_id = ? OR EXISTS (
         SELECT 1 FROM private_note_shares AS sh
         INNER JOIN members AS recipient ON recipient.id = sh.recipient_member_id
         WHERE sh.note_id = n.id AND sh.recipient_member_id = ?
           AND sh.revoked_at IS NULL AND recipient.status = 'active'
       )) ${cursorSql}
       ORDER BY n.updated_at DESC, n.id DESC
       LIMIT ?`,
    ).bind(
      scope.memberId, scope.memberId, scope.memberId,
      ...(cursor ? [cursor.updatedAt, cursor.updatedAt, cursor.id] : []),
      request.limit + 1,
    ).all<PrivateNoteRow>();
    const items = rows.results.slice(0, request.limit).map((row) => toListItem(mapRow(row)!));
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last ? { nextCursor: encodeOpaqueCursor({ v: 1, updatedAt: last.updatedAt, id: last.id }) } : {}),
    };
  }

  async share(scope: PrivateNoteScope, knowledgeItemId: string, recipientMemberId: string, createdAt: string): Promise<PrivateNoteShare> {
    const result = await this.db.prepare(
      `INSERT INTO private_note_shares (note_id, recipient_member_id, created_at, revoked_at)
       SELECT n.id, recipient.id, ?, NULL
       FROM private_notes AS n
       INNER JOIN members AS recipient ON recipient.id = ? AND recipient.status = 'active'
       WHERE n.owner_member_id = ? AND n.knowledge_item_id = ? AND recipient.id <> n.owner_member_id
       ON CONFLICT(note_id, recipient_member_id) DO UPDATE SET created_at = excluded.created_at, revoked_at = NULL`,
    ).bind(createdAt, recipientMemberId, scope.memberId, knowledgeItemId).run();
    if (result.meta.changes !== 1) throw new AppError("PRIVATE_NOTE_SHARE_TARGET_INVALID", "The note or recipient is unavailable", 404);
    const share = await this.db.prepare(
      `SELECT note_id, recipient_member_id, created_at, revoked_at
       FROM private_note_shares WHERE note_id = (SELECT id FROM private_notes WHERE owner_member_id = ? AND knowledge_item_id = ?)
         AND recipient_member_id = ? LIMIT 1`,
    ).bind(scope.memberId, knowledgeItemId, recipientMemberId).first<PrivateNoteShareRow>();
    if (!share) throw new AppError("PRIVATE_NOTE_SHARE_UNAVAILABLE", "Note share is unavailable", 503, true);
    return mapShare(share);
  }

  async revokeShare(scope: PrivateNoteScope, knowledgeItemId: string, recipientMemberId: string, revokedAt: string): Promise<void> {
    const result = await this.db.prepare(
      `UPDATE private_note_shares
       SET revoked_at = ?
       WHERE note_id = (SELECT id FROM private_notes WHERE owner_member_id = ? AND knowledge_item_id = ?)
         AND recipient_member_id = ? AND revoked_at IS NULL`,
    ).bind(revokedAt, scope.memberId, knowledgeItemId, recipientMemberId).run();
    if (result.meta.changes !== 1) throw new AppError("PRIVATE_NOTE_SHARE_NOT_FOUND", "Note share was not found", 404);
  }

  async listShares(scope: PrivateNoteScope, knowledgeItemId: string): Promise<PrivateNoteShare[]> {
    const note = await this.db.prepare("SELECT id FROM private_notes WHERE owner_member_id = ? AND knowledge_item_id = ? LIMIT 1")
      .bind(scope.memberId, knowledgeItemId).first<{ id: string }>();
    if (!note) throw new AppError("PRIVATE_NOTE_NOT_FOUND", "Private note was not found", 404);
    const rows = await this.db.prepare(
      `SELECT note_id, recipient_member_id, created_at, revoked_at
       FROM private_note_shares WHERE note_id = ? ORDER BY created_at DESC, recipient_member_id ASC`,
    ).bind(note.id).all<PrivateNoteShareRow>();
    return rows.results.map(mapShare);
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

function toListItem(note: PrivateNote): PrivateNoteListItem {
  const { ownerId: _ownerId, ...item } = note;
  return item;
}

function decodeNoteCursor(value: string): NoteCursor {
  try {
    const decoded = decodeOpaqueCursor(value);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 3 || record.v !== 1 || typeof record.updatedAt !== "string" || !isIsoTimestamp(record.updatedAt)
      || typeof record.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(record.id)) throw new Error();
    return { v: 1, updatedAt: record.updatedAt, id: record.id };
  } catch { throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400); }
}

function isIsoTimestamp(value: string): boolean { return value.length === 24 && !Number.isNaN(Date.parse(value)) && value.endsWith("Z"); }

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
  const access = row.access === "shared" ? "shared" : "owner";
  return {
    id: row.id, ownerId: row.owner_member_id, knowledgeItemId: row.knowledge_item_id,
    title: row.title, body: row.body, visibility: "private", access, citations: parsed,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

type PrivateNoteShareRow = {
  note_id: string;
  recipient_member_id: string;
  created_at: string;
  revoked_at: string | null;
};

function mapShare(row: PrivateNoteShareRow): PrivateNoteShare {
  return { noteId: row.note_id, recipientMemberId: row.recipient_member_id, createdAt: row.created_at, revokedAt: row.revoked_at };
}

function isCitation(value: unknown): value is PrivateNoteCitation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.revisionId === "string" && typeof record.chunkId === "string"
    && Number.isSafeInteger(record.startLine) && Number.isSafeInteger(record.endLine)
    && (record.startLine as number) >= 1 && (record.endLine as number) >= (record.startLine as number);
}
