import { DurableObject } from "cloudflare:workers";

export interface AgentSessionCreateInput {
  sessionId: string;
  memberId: string;
  now: string;
}

export interface AgentSessionRecord {
  id: string;
  memberId: string;
  createdAt: string;
  lastSeenAt: string;
}

export type AgentMessageRole = "user" | "assistant";

export interface AgentMessageRecord {
  id: string;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
}

export interface AgentMessagePage {
  items: AgentMessageRecord[];
  truncated: boolean;
}

export type AgentSessionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: "AGENT_SESSION_INVALID" | "AGENT_SESSION_NOT_FOUND"; status: 400 | 404; retryable: false } };

interface AgentSessionRow {
  [key: string]: string;
  session_id: string;
  member_id: string;
  created_at: string;
  last_seen_at: string;
}

interface AgentMessageRow {
  [key: string]: string;
  id: string;
  role: AgentMessageRole;
  content: string;
  created_at: string;
}

const SESSION_ID = /^[A-Za-z0-9_-]{21,128}$/u;
const MEMBER_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export class AgentSession extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS agent_session (
        session_id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS agent_session_messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS agent_session_messages_page ON agent_session_messages(created_at DESC, id DESC)");
  }

  async create(input: unknown): Promise<AgentSessionResult<AgentSessionRecord>> {
    if (!isCreateInput(input)) return invalid();
    const current = this.row();
    if (current) {
      if (current.member_id !== input.memberId || current.session_id !== input.sessionId) return notFound();
      return success(toRecord(current));
    }
    this.ctx.storage.sql.exec(
      "INSERT INTO agent_session (session_id, member_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
      input.sessionId,
      input.memberId,
      input.now,
      input.now,
    );
    return success({ id: input.sessionId, memberId: input.memberId, createdAt: input.now, lastSeenAt: input.now });
  }

  async read(memberId: string): Promise<AgentSessionResult<AgentSessionRecord>> {
    if (!MEMBER_ID.test(memberId)) return invalid();
    const current = this.row();
    if (!current || current.member_id !== memberId) return notFound();
    const lastSeenAt = new Date().toISOString();
    this.ctx.storage.sql.exec("UPDATE agent_session SET last_seen_at = ?", lastSeenAt);
    return success({ ...toRecord(current), lastSeenAt });
  }

  async appendMessage(memberId: string, input: unknown): Promise<AgentSessionResult<AgentMessageRecord>> {
    if (!MEMBER_ID.test(memberId) || !isMessageInput(input)) return invalid();
    if (!this.row() || this.row()?.member_id !== memberId) return notFound();
    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO agent_session_messages (id, role, content, created_at) VALUES (?, ?, ?, ?)",
      id,
      input.role,
      input.content,
      createdAt,
    );
    return success({ id, role: input.role, content: input.content, createdAt });
  }

  async listMessages(memberId: string, input: unknown): Promise<AgentSessionResult<AgentMessagePage>> {
    if (!MEMBER_ID.test(memberId) || !isPageInput(input)) return invalid();
    if (!this.row() || this.row()?.member_id !== memberId) return notFound();
    const limit = input.limit ?? 20;
    const rows = this.ctx.storage.sql.exec<AgentMessageRow>(
      "SELECT id, role, content, created_at FROM agent_session_messages ORDER BY created_at DESC, rowid DESC LIMIT ?",
      limit + 1,
    ).toArray();
    const truncated = rows.length > limit;
    return success({
      items: rows.slice(0, limit).map((row) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at })),
      truncated,
    });
  }

  private row(): AgentSessionRow | undefined {
    return this.ctx.storage.sql.exec<AgentSessionRow>(
      "SELECT session_id, member_id, created_at, last_seen_at FROM agent_session LIMIT 1",
    ).toArray()[0];
  }
}

function isCreateInput(value: unknown): value is AgentSessionCreateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return typeof input.sessionId === "string"
    && SESSION_ID.test(input.sessionId)
    && typeof input.memberId === "string"
    && MEMBER_ID.test(input.memberId)
    && typeof input.now === "string"
    && Number.isFinite(Date.parse(input.now));
}

function isMessageInput(value: unknown): value is { role: AgentMessageRole; content: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (input.role === "user" || input.role === "assistant")
    && typeof input.content === "string"
    && input.content.trim().length > 0
    && input.content.length <= 16_384
    && !/[\p{Cc}\p{Cf}]/u.test(input.content);
}

function isPageInput(value: unknown): value is { limit?: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const limit = (value as Record<string, unknown>).limit;
  return limit === undefined || (typeof limit === "number" && Number.isSafeInteger(limit) && limit >= 1 && limit <= 50);
}

function success<T>(value: T): AgentSessionResult<T> {
  return { ok: true, value };
}

function invalid(): AgentSessionResult<never> {
  return { ok: false, error: { code: "AGENT_SESSION_INVALID", status: 400, retryable: false } };
}

function notFound(): AgentSessionResult<never> {
  return { ok: false, error: { code: "AGENT_SESSION_NOT_FOUND", status: 404, retryable: false } };
}

function toRecord(row: AgentSessionRow): AgentSessionRecord {
  return { id: row.session_id, memberId: row.member_id, createdAt: row.created_at, lastSeenAt: row.last_seen_at };
}
