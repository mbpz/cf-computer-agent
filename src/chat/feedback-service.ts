import { AppError } from "../http";
import type { ChatConversationRepository } from "./conversation-service";
import type { LibraryScope } from "../library/types";

export type ChatFeedbackRating = "useful" | "not_useful" | "citation_error";
export interface ChatFeedbackRecord { id: string; conversationId: string; memberId: string; rating: ChatFeedbackRating; citationIds: string[]; createdAt: string; }
export interface ChatFeedbackRepository {
  save(input: { id: string; conversationId: string; memberId: string; rating: ChatFeedbackRating; citationIds: string[]; now: string }): Promise<ChatFeedbackRecord>;
}

export class ChatFeedbackService {
  constructor(private readonly conversations: ChatConversationRepository, private readonly repository: ChatFeedbackRepository, private readonly options: { id?: () => string; now?: () => string } = {}) {}

  async save(scope: LibraryScope, conversationId: string, input: { rating: unknown; citationIds: unknown }): Promise<ChatFeedbackRecord> {
    const conversation = await this.conversations.find(scope.memberId, conversationId);
    if (!conversation) throw new AppError("CHAT_CONVERSATION_NOT_FOUND", "Chat conversation was not found", 404);
    if (input.rating !== "useful" && input.rating !== "not_useful" && input.rating !== "citation_error") throw new AppError("CHAT_FEEDBACK_INVALID", "Feedback is invalid", 400);
    if (!Array.isArray(input.citationIds) || input.citationIds.length > 8 || !input.citationIds.every((id) => typeof id === "string" && /^[A-Za-z0-9:_-]{1,256}$/u.test(id))) throw new AppError("CHAT_FEEDBACK_INVALID", "Feedback is invalid", 400);
    return this.repository.save({ id: this.options.id?.() ?? crypto.randomUUID(), conversationId, memberId: scope.memberId, rating: input.rating, citationIds: input.citationIds, now: this.options.now?.() ?? new Date().toISOString() });
  }
}
