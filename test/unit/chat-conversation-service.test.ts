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
  async updateScope(ownerMemberId: string, conversationId: string, scope: ChatScope, now: string) {
    const conversation = await this.find(ownerMemberId, conversationId);
    if (!conversation) return null;
    const updated = { ...conversation, scope, updatedAt: now };
    this.conversations.set(conversationId, updated);
    return updated;
  }
  active = new Set<string>();
  cancelled = new Set<string>();
  async startTurn(ownerMemberId: string, conversationId: string, turnId: string) { if (!(await this.find(ownerMemberId, conversationId))) return null; this.active.add(`${conversationId}:${turnId}`); return turnId; }
  async requestCancel(ownerMemberId: string, conversationId: string) { if (![...this.active].some((value) => value.startsWith(`${conversationId}:`))) return false; for (const value of this.active) if (value.startsWith(`${conversationId}:`)) this.cancelled.add(value); return true; }
  async isCancelled(ownerMemberId: string, conversationId: string, turnId: string) { return this.cancelled.has(`${conversationId}:${turnId}`); }
  async finishTurn(ownerMemberId: string, conversationId: string, turnId: string) { this.active.delete(`${conversationId}:${turnId}`); this.cancelled.delete(`${conversationId}:${turnId}`); }
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

  it("changes sources only through an explicit owner-scoped update", async () => {
    const repository = new FakeRepository();
    const service = new ChatConversationService(repository, { now: () => "2026-08-26T00:00:00.000Z", id: () => "conversation-1" });
    await service.ensure(member, undefined, scope);
    await expect(service.updateScope(member, "conversation-1", { kind: "items", knowledgeItemIds: ["knowledge-2"] })).resolves.toMatchObject({ scope: { kind: "items", knowledgeItemIds: ["knowledge-2"] } });
    await expect(service.ensure(member, "conversation-1", { kind: "items", knowledgeItemIds: ["knowledge-2"] })).resolves.toMatchObject({ scope: { kind: "items", knowledgeItemIds: ["knowledge-2"] } });
  });

  it("marks an active turn cancelled and prevents its completion", async () => {
    const repository = new FakeRepository();
    const service = new ChatConversationService(repository, { now: () => "2026-08-26T00:00:00.000Z", id: () => "conversation-1" });
    await service.ensure(member, undefined, scope);
    await expect(service.startTurn(member, "conversation-1", "turn-1")).resolves.toBe("turn-1");
    await expect(service.cancel(member, "conversation-1")).resolves.toBe(true);
    await expect(service.isCancelled(member, "conversation-1", "turn-1")).resolves.toBe(true);
  });
});
