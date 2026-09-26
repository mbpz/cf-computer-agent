import { AppError } from "../http";
import type { ChatScope } from "../library/types";
import type { CitedAnswerResult } from "../ai/cited-answer-service";

export type ChatTurnResponse = CitedAnswerResult & { conversationId: string; idempotencyKey: string };
interface ReceiptRow {
  id: string;
  request_hash: string;
  status: "pending" | "completed" | "failed";
  response_json: string | null;
  authorization_citations_json: string | null;
}
export type TurnClaim = { kind: "claimed"; id: string } | { kind: "replay"; response: ChatTurnResponse; authorizationCitations: string[] };

/** A claim is durable, not a lease. Uncertain requests must never run AI again. */
export class ChatTurnReceipts {
  constructor(private readonly db: D1Database) {}

  async claim(memberId: string, key: string, input: { question: string; scope: ChatScope; conversationId?: string }): Promise<TurnClaim> {
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(key)) throw new AppError("CHAT_IDEMPOTENCY_KEY_INVALID", "Invalid idempotency key", 400);
    const scope = input.scope.kind === "items"
      ? { kind: "items", knowledgeItemIds: [...new Set(input.scope.knowledgeItemIds)].sort() }
      : input.scope;
    const bytes = new TextEncoder().encode(JSON.stringify({ question: input.question, scope, conversationId: input.conversationId ?? null }));
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
    const id = crypto.randomUUID();
    const result = await this.db.prepare(
      "INSERT INTO chat_turn_requests (id, member_id, idempotency_key, request_hash, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?) ON CONFLICT (member_id, idempotency_key) DO NOTHING",
    ).bind(id, memberId, key, hash, new Date().toISOString()).run();
    if (result.meta.changes) return { kind: "claimed", id };
    const receipt = await this.db.prepare("SELECT id, request_hash, status, response_json, authorization_citations_json FROM chat_turn_requests WHERE member_id = ? AND idempotency_key = ?").bind(memberId, key).first<ReceiptRow>();
    if (!receipt) throw new AppError("CHAT_TURN_UNKNOWN", "Chat result is unknown; retry this same intent explicitly", 409);
    if (receipt.request_hash !== hash) throw new AppError("CHAT_IDEMPOTENCY_CONFLICT", "This key belongs to a different question intent", 409);
    if (receipt.status === "pending") throw new AppError("CHAT_TURN_PENDING", "Chat is pending or its result is unknown; no new generation was started", 409);
    if (receipt.status === "failed") throw new AppError("CHAT_TURN_FAILED", "This chat intent failed and will not be generated again", 409);
    return { kind: "replay", response: JSON.parse(receipt.response_json!) as ChatTurnResponse, authorizationCitations: JSON.parse(receipt.authorization_citations_json!) as string[] };
  }

  async fail(memberId: string, id: string): Promise<void> {
    await this.db.prepare("UPDATE chat_turn_requests SET status = 'failed' WHERE id = ? AND member_id = ? AND status = 'pending'").bind(id, memberId).run();
  }

  /** The message and receipt commit together, guarded by the live turn and owner. */
  async complete(input: { memberId: string; id: string; question: string; response: ChatTurnResponse; authorizationCitations: string[] }): Promise<void> {
    const { memberId, id, response } = input;
    const now = new Date().toISOString();
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO chat_messages (id, conversation_id, sequence, role, question, answer, citation_ids_json, created_at)
        SELECT ?, conversation.id, COALESCE((SELECT MAX(sequence) FROM chat_messages WHERE conversation_id = conversation.id), 0) + 1,
          'turn', ?, ?, ?, ? FROM chat_conversations AS conversation
        WHERE conversation.id = ? AND conversation.owner_member_id = ? AND conversation.active_turn_id = ? AND conversation.cancel_requested_at IS NULL
          AND EXISTS (SELECT 1 FROM chat_turn_requests WHERE id = ? AND member_id = ? AND status = 'pending')`)
        .bind(id, input.question, response.answer, JSON.stringify(response.citations), now, response.conversationId, memberId, id, id, memberId),
      this.db.prepare(`UPDATE chat_turn_requests SET status = 'completed', response_json = ?, authorization_citations_json = ?, completed_at = ?
        WHERE id = ? AND member_id = ? AND status = 'pending'
          AND EXISTS (SELECT 1 FROM chat_messages WHERE id = ? AND conversation_id = ?)`)
        .bind(JSON.stringify(response), JSON.stringify(input.authorizationCitations), now, id, memberId, id, response.conversationId),
      this.db.prepare(`UPDATE chat_conversations SET updated_at = ? WHERE id = ? AND owner_member_id = ?
        AND EXISTS (SELECT 1 FROM chat_messages WHERE id = ? AND conversation_id = ?)`)
        .bind(now, response.conversationId, memberId, id, response.conversationId),
    ]);
    if (!results[0]?.meta.changes || !results[1]?.meta.changes) throw new AppError("CHAT_CANCELLED", "Chat generation was cancelled", 409);
  }
}
