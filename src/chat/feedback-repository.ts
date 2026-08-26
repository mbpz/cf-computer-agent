import type { ChatFeedbackRecord, ChatFeedbackRepository, ChatFeedbackRating } from "./feedback-service";

export class D1ChatFeedbackRepository implements ChatFeedbackRepository {
  constructor(private readonly db: D1Database) {}
  async save(input: { id: string; conversationId: string; memberId: string; rating: ChatFeedbackRating; citationIds: string[]; now: string }): Promise<ChatFeedbackRecord> {
    await this.db.prepare(
      `INSERT INTO chat_feedback (id, conversation_id, member_id, rating, citation_ids_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(conversation_id, member_id) DO UPDATE SET rating = excluded.rating, citation_ids_json = excluded.citation_ids_json, updated_at = excluded.updated_at`,
    ).bind(input.id, input.conversationId, input.memberId, input.rating, JSON.stringify(input.citationIds), input.now, input.now).run();
    return { id: input.id, conversationId: input.conversationId, memberId: input.memberId, rating: input.rating, citationIds: input.citationIds, createdAt: input.now };
  }
}
