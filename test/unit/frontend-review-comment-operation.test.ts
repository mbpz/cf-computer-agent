import { describe, expect, it } from "vitest";
import { readReviewCommentOperation, writeReviewCommentOperation } from "../../frontend/components/review/review-comments-data";
const operationId = "11111111-1111-4111-8111-111111111111";
const comment = { id: "comment-1", submissionId: "sub-1", authorRole: "admin", authorId: "member-admin", body: "Note", createdAt: "2026-10-02T00:00:00Z" };
const operation = { version: 1, operationId, submissionId: "sub-1", comment };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
describe("comment operation client protocol", () => {
  it("uses a dedicated PUT and checks the frozen request receipt", async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const result = await writeReviewCommentOperation("sub-1", operationId, " Note ", async (path, init) => {
      calls.push({ path: String(path), init }); return response({ operation });
    });
    expect(calls[0]!.path).toBe(`/api/admin/submissions/sub-1/comments/requests/${operationId}`);
    expect(calls[0]!.init).toMatchObject({ method: "PUT", credentials: "same-origin", body: JSON.stringify({ body: " Note " }) });
    expect(result).toEqual(comment);
  });
  it("accepts absence only for an exact versioned lookup", async () => {
    expect(await readReviewCommentOperation("sub-1", operationId, "Note", async () => response({ operation: { ...operation, comment: null } }))).toBeNull();
    await expect(writeReviewCommentOperation("sub-1", operationId, "Note", async () => response({ operation: { ...operation, comment: null } }))).rejects.toThrow();
  });
  it.each([
    { ...operation, version: 2 }, { ...operation, operationId: "another-operation" },
    { ...operation, submissionId: "sub-2" }, { ...operation, comment: { ...comment, submissionId: "sub-2" } },
    { ...operation, comment: { ...comment, body: "wrong" } }, { ...operation, comment: { ...comment, supersedesCommentId: 123 } },
    { ...operation, comment: { ...comment, supersedesCommentId: "old" } }, { ...operation, comment: { ...comment, createdAt: "" } },
    { ...operation, comment: undefined },
  ])("rejects mismatched or malformed operation %#", async bad => {
    await expect(readReviewCommentOperation("sub-1", operationId, "Note", async () => response({ operation: bad }))).rejects.toThrow();
  });
  it.each([201, 202, 204])("does not treat status %s as a committed receipt", async status => {
    await expect(readReviewCommentOperation("sub-1", operationId, "Note", async () => status === 204 ? new Response(null, { status }) : response({ operation }, status))).rejects.toThrow();
  });
});
