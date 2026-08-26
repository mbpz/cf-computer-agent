import { describe, expect, it } from "vitest";
import { TimelineService, type TimelineAi } from "../../src/ai/timeline-service";
import type { CitationSource, LibraryScope } from "../../src/library/types";

const scope: LibraryScope = { memberId: "member-1", role: "contributor" };
const source: CitationSource = {
  citationId: "citation-1", knowledgeItemId: "knowledge-1", revisionId: "revision-1", chunkId: "chunk-1",
  title: "History", headingPath: ["Events"], startLine: 1, endLine: 3,
  body: "2024-01-02 Launch.\n2024-02-03 Growth.", publishedAt: "2026-08-01T00:00:00.000Z",
};
function ai(response: unknown): TimelineAi { return { run: async () => ({ response: JSON.stringify(response) }) }; }

describe("TimelineService", () => {
  it("sorts dated events and keeps a citation on every event", async () => {
    const service = new TimelineService(ai({ events: [
      { date: "2024-02-03", title: "Growth", description: "Growth phase", citationIds: ["citation-1"] },
      { date: "2024-01-02", title: "Launch", description: "Launch phase", citationIds: ["citation-1"] },
    ], insufficientEvidence: false }));
    await expect(service.generate(scope, "knowledge-1", [source])).resolves.toEqual({
      events: [
        expect.objectContaining({ date: "2024-01-02", title: "Launch", citations: [expect.objectContaining({ citationId: "citation-1" })] }),
        expect.objectContaining({ date: "2024-02-03", title: "Growth" }),
      ],
      sortStatus: "sorted",
    });
  });

  it("preserves order and marks the timeline unsorted when a date is not comparable", async () => {
    const service = new TimelineService(ai({ events: [
      { date: "unknown", title: "Undated", description: "No date", citationIds: ["citation-1"] },
      { date: "2024-01-02", title: "Launch", description: "Launch", citationIds: ["citation-1"] },
    ], insufficientEvidence: false }));
    await expect(service.generate(scope, "knowledge-1", [source])).resolves.toMatchObject({
      sortStatus: "unsorted",
      messageKey: "TIMELINE_DATES_UNSORTED",
      events: [expect.objectContaining({ title: "Undated" }), expect.objectContaining({ title: "Launch" })],
    });
  });

  it("rejects events without valid selected citations and maps AI failures", async () => {
    const forged = new TimelineService(ai({ events: [{ date: "2024-01-01", title: "X", description: "Y", citationIds: [] }], insufficientEvidence: false }));
    await expect(forged.generate(scope, "knowledge-1", [source])).rejects.toMatchObject({ code: "TIMELINE_UNGROUNDED", status: 422 });
    const failure = new TimelineService({ run: async () => { throw new Error("provider down"); } });
    await expect(failure.generate(scope, "knowledge-1", [source])).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503, retryable: true });
  });
});
