import { describe, expect, it } from "vitest";
import { AnswerService } from "../../src/ai/answer-service";
import { LibraryService } from "../../src/library/service";
import { SubmissionsService } from "../../src/submissions/service";

const scope = { memberId: "member-1", role: "contributor" as const };

describe("M6 AI degraded-mode boundaries", () => {
  it("keeps submission and library reads available when the AI provider is unavailable", async () => {
    const ai = { run: async () => { throw Object.assign(new Error("quota"), { code: "AI_QUOTA_EXHAUSTED" }); } };
    const answer = new AnswerService(ai);
    await expect(answer.answer("依据是什么？", [{
      id: "source-1", title: "Source", excerpt: "evidence", score: 1,
    }] as never)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });

    const submissions = new SubmissionsService({
      createDraft: async (submission: unknown) => submission,
    } as never, { id: () => "draft-1", now: () => new Date("2026-08-26T00:00:00.000Z") });
    await expect(submissions.createDraft("member-1", {
      requestedSpaceId: "space-1", kind: "markdown", title: "Offline note", content: "Saved without AI",
    })).resolves.toMatchObject({ id: "draft-1", status: "draft" });

    const library = new LibraryService({
      authorizeScope: async () => true,
      list: async () => ({ items: [{ id: "knowledge-1" }], degraded: false }),
    } as never, { read: async () => "" } as never);
    await expect(library.list(scope)).resolves.toMatchObject({ items: [{ id: "knowledge-1" }] });
  });
});
