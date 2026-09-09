import { describe, expect, it } from "vitest";
import { InboxService } from "../../src/inbox/service";
import type { InboxItem, InboxPage } from "../../src/inbox/types";
import type { InboxRepositoryPort } from "../../src/inbox/repository";

const NOW = new Date("2026-09-09T00:00:00.000Z");

describe("InboxService", () => {
  it("keeps create replay idempotent and owner scoped", async () => {
    const repository = new FakeInboxRepository();
    const service = new InboxService(repository, { now: () => NOW, id: () => "inbox-1" });

    const first = await service.create("member-a", {
      id: "inbox-1", clientKey: "capture-1", kind: "text", content: "Alpha",
    });
    const replay = await service.create("member-a", {
      id: "inbox-ignored", clientKey: "capture-1", kind: "text", content: "Different",
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.item.id).toBe("inbox-1");
    await expect(service.get("member-b", "inbox-1")).rejects.toMatchObject({ code: "INBOX_NOT_FOUND", status: 404 });
  });

  it("rejects invalid cursor limits before repository access", async () => {
    const repository = new FakeInboxRepository();
    const service = new InboxService(repository);
    await expect(service.list("member-a", {}, { limit: 51 })).rejects.toMatchObject({ code: "INBOX_PAGE_INVALID", status: 400 });
    expect(repository.listCalls).toHaveLength(0);
  });

  it("allows archive to be reversed before promotion and rejects changing a promoted item", async () => {
    const repository = new FakeInboxRepository();
    const service = new InboxService(repository, { promoteTask: async () => ({ taskId: "task-1" }) });
    await service.create("member-a", { id: "inbox-1", clientKey: "capture-1", kind: "text", content: "Alpha" });
    await expect(service.updateStatus("member-a", "inbox-1", "archived")).resolves.toMatchObject({ status: "archived" });
    await expect(service.updateStatus("member-a", "inbox-1", "inbox")).resolves.toMatchObject({ status: "inbox" });
    await service.promoteTask("member-a", "inbox-1");
    await expect(service.updateStatus("member-a", "inbox-1", "archived")).rejects.toMatchObject({ code: "INBOX_TRANSITION_INVALID", status: 422 });
  });

  it("makes task promotion retry safe", async () => {
    const repository = new FakeInboxRepository();
    let calls = 0;
    const service = new InboxService(repository, {
      promoteTask: async () => { calls += 1; return { taskId: "task-1" }; },
    });
    await service.create("member-a", { id: "inbox-1", clientKey: "capture-1", kind: "text", content: "Alpha" });
    const first = await service.promoteTask("member-a", "inbox-1");
    const replay = await service.promoteTask("member-a", "inbox-1");
    expect(first).toMatchObject({ promoted: true, taskId: "task-1" });
    expect(replay).toMatchObject({ promoted: false, taskId: "task-1" });
    expect(calls).toBe(1);
  });
});

class FakeInboxRepository implements InboxRepositoryPort {
  readonly items: InboxItem[] = [];
  readonly listCalls: Array<{ memberId: string; request: unknown }> = [];

  async insert(input: Parameters<InboxRepositoryPort["insert"]>[0]): Promise<boolean> {
    if (this.items.some((item) => item.memberId === input.memberId && item.clientKey === input.clientKey)) return false;
    this.items.push({
      id: input.id, memberId: input.memberId, clientKey: input.clientKey, kind: input.kind,
      content: input.content, sourceUrl: input.sourceUrl, status: "inbox",
      promotedTaskId: null, promotedSubmissionId: null,
      createdAt: new Date(input.createdAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString(),
    });
    return true;
  }
  async findOwned(memberId: string, id: string) { return this.items.find((item) => item.memberId === memberId && item.id === id) ?? null; }
  async findByClientKey(memberId: string, clientKey: string) { return this.items.find((item) => item.memberId === memberId && item.clientKey === clientKey) ?? null; }
  async listOwned(memberId: string, request: Parameters<InboxRepositoryPort["listOwned"]>[1]): Promise<InboxPage> {
    this.listCalls.push({ memberId, request });
    return { items: this.items.filter((item) => item.memberId === memberId), nextCursor: undefined };
  }
  async updateStatus(memberId: string, id: string, status: "inbox" | "archived", updatedAt: number) {
    const item = await this.findOwned(memberId, id);
    if (!item) return null;
    item.status = status; item.updatedAt = new Date(updatedAt).toISOString();
    return item;
  }
  async promote(memberId: string, id: string, promotion: { taskId?: string; submissionId?: string; updatedAt: number }) {
    const item = await this.findOwned(memberId, id);
    if (!item) return null;
    item.status = "promoted";
    item.promotedTaskId = promotion.taskId ?? item.promotedTaskId;
    item.promotedSubmissionId = promotion.submissionId ?? item.promotedSubmissionId;
    item.updatedAt = new Date(promotion.updatedAt).toISOString();
    return item;
  }
}
