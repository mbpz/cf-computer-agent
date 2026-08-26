import { describe, expect, it } from "vitest";
import { ChatConversationService, type ChatConversationRepository } from "../../src/chat/conversation-service";
import type { ChatScope, LibraryScope } from "../../src/library/types";

const member: LibraryScope = { memberId: "member-1", role: "contributor" };
const scope: ChatScope = { kind: "space", spaceId: "space-1" };

class FakeRepository implements ChatConversationRepository {
  conversations = new Map<string, { id: string; ownerMemberId: string; scope: ChatScope; createdAt: string; updatedAt: string }>();
  messages: Array<{ conversationId: string; question: string; answer: string; citationIds: string[]; now: string }> = [];

  async create(input: { id: string; ownerMemberId: string; scope: ChatScope; now: string }) {
    const row = { id: input.id, ownerMemberId: input.ownerMemberId, scope: input.scope, createdAt: input.now, updatedAt: input.now };
    this.conversations.set(row.id, row);
    return row;
  }
  async find(ownerMemberId: string, id: string) {
    const row = this.conversations.get(id);
    return row?.ownerMemberId === ownerMemberId ? row : null;
  }
  async listMessages(ownerMemberId: string, conversationId: string) {
    const conversation = await this.find(ownerMemberId, conversationId);
    if (!conversation) return [];
    return this.messages.filter((message) => message.conversationId === conversationId).slice(-8).map((message) => ({ role: "user" as const, content: message.question, citationIds: [] as string[] }));
  }
  async append(input: { ownerMemberId: string; conversationId: string; question: string; answer: string; citationIds: string[]; now: string }) {
    if (!(await this.find(input.ownerMemberId, input.conversationId))) throw new Error("missing");
    this.messages.push(input);
  }
}

describe("ChatConversationService", () => {
  it("creates an owner-bound conversation and keeps history bounded", async () => {
    const repository = new FakeRepository();
    const service = new ChatConversationService(repository, { now: () => "2026-08-26T00:00:00.000Z", id: () => "conversation-1" });
    const conversation = await service.ensure(member, undefined, scope);
    expect(conversation.scope).toEqual(scope);
    for (let index = 0; index < 10; index += 1) {
      await service.appendTurn(member, conversation.id, { question: `q-${index}`, answer: `a-${index}`, citationIds: [`c-${index}`] });
    }
    await expect(service.history(member, conversation.id)).resolves.toHaveLength(8);
    await expect(service.ensure(member, conversation.id, scope)).resolves.toEqual(conversation);
    await expect(service.ensure(member, conversation.id, { kind: "all" })).rejects.toMatchObject({ code: "CHAT_CONVERSATION_SCOPE_MISMATCH", status: 409 });
  });

  it("does not resolve another member's conversation", async () => {
    const repository = new FakeRepository();
    const service = new ChatConversationService(repository, { now: () => "2026-08-26T00:00:00.000Z", id: () => "conversation-1" });
    await service.ensure(member, undefined, scope);
    await expect(service.history({ memberId: "member-2", role: "contributor" }, "conversation-1")).rejects.toMatchObject({ code: "CHAT_CONVERSATION_NOT_FOUND", status: 404 });
  });
});
