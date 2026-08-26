import { describe, expect, it } from "vitest";
import { RecentVisitsService } from "../../src/recent-visits/service";
import type { RecentVisitPage, RecentVisitScope, RecentVisitsRepositoryPort } from "../../src/recent-visits/types";

describe("RecentVisitsService", () => {
  it("records bounded member-owned visits with a server timestamp", async () => {
    const repository = new FakeRecentVisitsRepository();
    const service = new RecentVisitsService(repository, () => new Date("2026-08-26T00:00:00.000Z"));
    await service.record({ memberId: "member-a", role: "contributor" }, "knowledge-1");
    expect(repository.records).toEqual([{ memberId: "member-a", knowledgeItemId: "knowledge-1", at: "2026-08-26T00:00:00.000Z" }]);
    await expect(service.list({ memberId: "member-a", role: "contributor" }, { limit: 8 })).resolves.toEqual({ items: [] });
  });

  it("rejects malformed identifiers before touching storage", async () => {
    const repository = new FakeRecentVisitsRepository();
    const service = new RecentVisitsService(repository);
    await expect(service.record({ memberId: "member-a", role: "contributor" }, "../secret")).rejects.toMatchObject({ code: "RECENT_VISIT_INVALID", status: 400 });
    expect(repository.records).toEqual([]);
  });
});

class FakeRecentVisitsRepository implements RecentVisitsRepositoryPort {
  records: Array<{ memberId: string; knowledgeItemId: string; at: string }> = [];
  async record(scope: RecentVisitScope, knowledgeItemId: string, visitedAt: string): Promise<void> { this.records.push({ memberId: scope.memberId, knowledgeItemId, at: visitedAt }); }
  async list(): Promise<RecentVisitPage> { return { items: [] }; }
}

