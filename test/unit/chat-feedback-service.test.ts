import { describe, expect, it } from "vitest";
import { ChatFeedbackService, type ChatFeedbackRepository } from "../../src/chat/feedback-service";
import type { ChatConversationRepository } from "../../src/chat/conversation-service";
import type { ChatScope, LibraryScope } from "../../src/library/types";

const member: LibraryScope = { memberId: "member-1", role: "contributor" };
const conversation = { id: "conversation-1", ownerMemberId: "member-1", scope: { kind: "all" } as ChatScope, createdAt: "now", updatedAt: "now" };

describe("ChatFeedbackService", () => {
  it("stores only an allowlisted rating and citation ids", async () => {
    const conversations: ChatConversationRepository = { find: async () => conversation } as unknown as ChatConversationRepository;
    const writes: unknown[] = [];
    const repository: ChatFeedbackRepository = { save: async (input) => { writes.push(input); return { ...input, createdAt: "now" }; } };
    const service = new ChatFeedbackService(conversations, repository, { id: () => "feedback-1", now: () => "now" });
    await expect(service.save(member, "conversation-1", { rating: "citation_error", citationIds: ["citation-1"] })).resolves.toMatchObject({ id: "feedback-1", rating: "citation_error" });
    expect(writes).toEqual([expect.objectContaining({ conversationId: "conversation-1", rating: "citation_error", citationIds: ["citation-1"] })]);
    await expect(service.save(member, "conversation-1", { rating: "secret-body" as never, citationIds: [] })).rejects.toMatchObject({ code: "CHAT_FEEDBACK_INVALID", status: 400 });
  });
});
