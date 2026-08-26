import { AppError } from "../http";
import type { ChatScope } from "../library/types";
import type { ChatConversation, ChatConversationRepository, ChatHistoryMessage } from "./conversation-service";

type ConversationRow = { id: string; owner_member_id: string; scope_json: string; created_at: string; updated_at: string };
type MessageRow = { role: "user" | "assistant"; question: string; answer: string; citation_ids_json: string };

export class ChatRepository implements ChatConversationRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: { id: string; ownerMemberId: string; scope: ChatScope; now: string }): Promise<ChatConversation> {
    await this.db.prepare(
      "INSERT INTO chat_conversations (id, owner_member_id, scope_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(input.id, input.ownerMemberId, JSON.stringify(input.scope), input.now, input.now).run();
    return { id: input.id, ownerMemberId: input.ownerMemberId, scope: input.scope, createdAt: input.now, updatedAt: input.now };
  }

  async find(ownerMemberId: string, id: string): Promise<ChatConversation | null> {
    const row = await this.db.prepare(
      "SELECT id, owner_member_id, scope_json, created_at, updated_at FROM chat_conversations WHERE id = ? AND owner_member_id = ? LIMIT 1",
    ).bind(id, ownerMemberId).first<ConversationRow>();
    if (!row) return null;
    try {
      const scope = JSON.parse(row.scope_json) as ChatScope;
      if (!validScope(scope)) throw new Error("invalid");
      return { id: row.id, ownerMemberId: row.owner_member_id, scope, createdAt: row.created_at, updatedAt: row.updated_at };
    } catch {
      throw new AppError("CHAT_CONVERSATION_CORRUPT", "Chat conversation is unavailable", 503, true);
    }
  }

  async updateScope(ownerMemberId: string, conversationId: string, scope: ChatScope, now: string): Promise<ChatConversation | null> {
    const result = await this.db.prepare(
      "UPDATE chat_conversations SET scope_json = ?, updated_at = ? WHERE id = ? AND owner_member_id = ?",
    ).bind(JSON.stringify(scope), now, conversationId, ownerMemberId).run();
    if (!result.meta.changes) return null;
    return this.find(ownerMemberId, conversationId);
  }

  async listMessages(ownerMemberId: string, conversationId: string): Promise<ChatHistoryMessage[]> {
    const rows = await this.db.prepare(
      `SELECT message.role, message.question, message.answer, message.citation_ids_json
       FROM chat_messages AS message
       JOIN chat_conversations AS conversation ON conversation.id = message.conversation_id
       WHERE message.conversation_id = ? AND conversation.owner_member_id = ?
       ORDER BY message.sequence DESC LIMIT 8`,
    ).bind(conversationId, ownerMemberId).all<MessageRow>();
    return rows.results.reverse().flatMap((row) => {
      try {
        const citationIds = JSON.parse(row.citation_ids_json) as unknown;
        if (!Array.isArray(citationIds) || !citationIds.every((value) => typeof value === "string")) return [];
        return [
          { role: "user" as const, content: row.question, citationIds: [] },
          { role: "assistant" as const, content: row.answer, citationIds: citationIds as string[] },
        ];
      } catch { return []; }
    }).slice(-8);
  }

  async append(input: { ownerMemberId: string; conversationId: string; question: string; answer: string; citationIds: string[]; now: string }): Promise<void> {
    const result = await this.db.prepare(
      `INSERT INTO chat_messages (id, conversation_id, sequence, role, question, answer, citation_ids_json, created_at)
       SELECT ?, conversation.id, COALESCE((SELECT MAX(sequence) FROM chat_messages WHERE conversation_id = conversation.id), 0) + 1,
              'turn', ?, ?, ?, ?
       FROM chat_conversations AS conversation
       WHERE conversation.id = ? AND conversation.owner_member_id = ?`,
    ).bind(crypto.randomUUID(), input.question, input.answer, JSON.stringify(input.citationIds), input.now, input.conversationId, input.ownerMemberId).run();
    if (!result.meta.changes) throw new AppError("CHAT_CONVERSATION_NOT_FOUND", "Chat conversation was not found", 404);
    await this.db.prepare("UPDATE chat_conversations SET updated_at = ? WHERE id = ? AND owner_member_id = ?").bind(input.now, input.conversationId, input.ownerMemberId).run();
  }
}

function validScope(value: unknown): value is ChatScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.kind === "all") return Object.keys(record).length === 1;
  if (record.kind === "space") return typeof record.spaceId === "string" && Object.keys(record).length === 2;
  if (record.kind === "collection") return typeof record.collectionId === "string" && Object.keys(record).length === 2;
  return record.kind === "items" && Array.isArray(record.knowledgeItemIds)
    && record.knowledgeItemIds.length > 0 && record.knowledgeItemIds.length <= 20
    && record.knowledgeItemIds.every((id) => typeof id === "string") && Object.keys(record).length === 2;
}
