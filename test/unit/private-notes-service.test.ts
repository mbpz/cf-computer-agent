// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PrivateNotesService } from "../../src/private-notes/service";
import type { PrivateNote, PrivateNoteRepositoryPort } from "../../src/private-notes/types";

function repository(initial: PrivateNote | null = null): PrivateNoteRepositoryPort {
  let value = initial;
  return {
    findOwned: async () => value,
    create: async (input) => {
      if (value) return false;
      value = { id: input.id, ownerId: input.ownerId, knowledgeItemId: input.knowledgeItemId, title: input.title, body: input.body, citations: input.citations, createdAt: input.createdAt, updatedAt: input.updatedAt, visibility: "private", access: "owner" };
      return true;
    },
    update: async (input) => {
      if (!value || value.id !== input.id || value.updatedAt !== input.expectedUpdatedAt) return null;
      value = { ...value, title: input.title, body: input.body, citations: input.citations, updatedAt: input.updatedAt };
      return value;
    },
  };
}

const note = (overrides: Partial<PrivateNote> = {}): PrivateNote => ({
  id: "note-1", ownerId: "member-1", knowledgeItemId: "knowledge-1", title: "Stored", body: "Stored body",
  visibility: "private", access: "owner", citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }],
  createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z",
  ...overrides,
});

describe("private note service", () => {
  it("creates a private note with bounded explicit citations", async () => {
    const service = new PrivateNotesService(repository(), { id: () => "note-1", now: () => new Date("2026-08-26T00:00:00.000Z") });
    const result = await service.save({ memberId: "member-1", role: "contributor" }, "knowledge-1", {
      title: "  Key idea ", body: "  Keep this separate  ", citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }],
    });
    expect(result).toMatchObject({ id: "note-1", ownerId: "member-1", knowledgeItemId: "knowledge-1", title: "Key idea", body: "Keep this separate", citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }], visibility: "private" });
  });

  it("rejects malformed note data and excessive citations", async () => {
    const service = new PrivateNotesService(repository());
    await expect(service.save({ memberId: "member-1", role: "contributor" }, "knowledge-1", { title: "", body: "", citations: [] })).rejects.toMatchObject({ code: "PRIVATE_NOTE_INVALID" });
    await expect(service.save({ memberId: "member-1", role: "contributor" }, "knowledge-1", { title: "ok", body: "ok", citations: Array.from({ length: 9 }, () => ({ revisionId: "r", chunkId: "c", startLine: 1, endLine: 1 })) })).rejects.toMatchObject({ code: "PRIVATE_NOTE_INVALID" });
  });

  it("compare-and-sets an update and rejects a stale expected version", async () => {
    const service = new PrivateNotesService(repository(note()), { now: () => new Date("2026-08-26T00:00:05.000Z") });
    const scope = { memberId: "member-1", role: "contributor" as const };
    await expect(service.save(scope, "knowledge-1", {
      id: "note-1", expectedUpdatedAt: "2026-08-26T00:00:00.000Z", title: "Next", body: "Next body",
      citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }],
    })).resolves.toMatchObject({ id: "note-1", title: "Next", body: "Next body" });
    await expect(service.save(scope, "knowledge-1", {
      id: "note-1", expectedUpdatedAt: "2026-08-24T00:00:00.000Z", title: "Stale", body: "Stale body",
      citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }],
    })).rejects.toMatchObject({ code: "PRIVATE_NOTE_VERSION_CONFLICT", status: 409 });
  });

  it("returns the stored note for a replayed save with no second write", async () => {
    const service = new PrivateNotesService(repository(note()), { now: () => new Date("2026-08-26T00:00:05.000Z") });
    await expect(service.save({ memberId: "member-1", role: "contributor" }, "knowledge-1", {
      id: "note-1", expectedUpdatedAt: "2026-08-26T00:00:00.000Z", title: "Stored", body: "Stored body",
      citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }],
    })).resolves.toMatchObject({ title: "Stored", updatedAt: "2026-08-26T00:00:00.000Z" });
  });

  it("uses a stable empty result for reads without leaking another owner", async () => {
    const service = new PrivateNotesService(repository(null));
    await expect(service.get({ memberId: "member-2", role: "contributor" }, "knowledge-1")).resolves.toBeNull();
  });
});
