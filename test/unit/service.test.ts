import { describe, expect, it } from "vitest";
import type { NoteRecord } from "../../src/knowledge/types";
import type { KnowledgeRepository } from "../../src/knowledge/workspace-repository";
import { KnowledgeService } from "../../src/knowledge/service";

class MemoryRepository implements KnowledgeRepository {
  notes: NoteRecord[] = [];
  readonly content = new Map<string, string>();

  async list(): Promise<NoteRecord[]> {
    return this.notes;
  }

  async read(note: NoteRecord): Promise<string | null> {
    return this.content.get(note.path) ?? null;
  }

  async save(note: NoteRecord, content: string, nextIndex: NoteRecord[]): Promise<void> {
    this.content.set(note.path, content);
    this.notes = nextIndex;
  }
}

const clock = () => "2026-01-02T00:00:00.000Z";

describe("KnowledgeService.createNote", () => {
  it.each([null, 42])("rejects a non-object request container (%s)", async (input) => {
    const service = new KnowledgeService(new MemoryRepository(), { now: clock, createId: () => "generated" });

    await expect(service.createNote(input)).rejects.toMatchObject({ code: "NOTE_INVALID", status: 400 });
  });

  it("rejects a title that contains only whitespace", async () => {
    const service = new KnowledgeService(new MemoryRepository(), { now: clock, createId: () => "generated" });

    await expect(service.createNote({ title: " ", tags: [], content: "body" }))
      .rejects.toMatchObject({ code: "NOTE_INVALID" });
  });

  it("persists only a safe note path when a supplied id contains traversal characters", async () => {
    const repository = new MemoryRepository();
    const service = new KnowledgeService(repository, { now: clock, createId: () => "generated" });

    const saved = await service.createNote({ id: "../private/plan", title: "Plan", tags: ["work"], content: "body" });

    expect(saved).toMatchObject({ id: "private-plan", path: "/workspace/notes/private-plan.md" });
    expect(repository.content.get("/workspace/notes/private-plan.md")).toBe("body");
  });

  it("rejects a non-text supplied id instead of passing it to path generation", async () => {
    const service = new KnowledgeService(new MemoryRepository(), { now: clock, createId: () => "generated" });

    await expect(service.createNote({ id: 42 as unknown as string, title: "Plan", tags: [], content: "body" }))
      .rejects.toMatchObject({ code: "NOTE_INVALID" });
  });

  it("preserves createdAt when updating an existing id", async () => {
    const repository = new MemoryRepository();
    repository.notes = [{
      id: "one",
      title: "Original",
      tags: [],
      path: "/workspace/notes/one.md",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }];
    const service = new KnowledgeService(repository, { now: clock, createId: () => "generated" });

    const saved = await service.createNote({ id: "one", title: "Updated", tags: [], content: "body" });

    expect(saved).toMatchObject({
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      title: "Updated",
    });
  });

  it("rejects content larger than 128 KiB", async () => {
    const service = new KnowledgeService(new MemoryRepository(), { now: clock, createId: () => "generated" });

    await expect(service.createNote({ title: "Large", tags: [], content: "x".repeat(128 * 1024 + 1) }))
      .rejects.toMatchObject({ code: "NOTE_TOO_LARGE" });
  });
});

describe("KnowledgeService.search", () => {
  it("returns deterministic keyword-ranked notes with their stored content", async () => {
    const repository = new MemoryRepository();
    repository.notes = [
      { id: "later", title: "Launch notes", tags: [], path: "/workspace/notes/later.md", createdAt: "2026-01-01", updatedAt: "2026-01-03" },
      { id: "earlier", title: "Launch", tags: [], path: "/workspace/notes/earlier.md", createdAt: "2026-01-01", updatedAt: "2026-01-02" },
    ];
    repository.content.set("/workspace/notes/later.md", "Body");
    repository.content.set("/workspace/notes/earlier.md", "Body");
    const service = new KnowledgeService(repository, { now: clock, createId: () => "generated" });

    const hits = await service.search("launch");

    expect(hits.map(({ id, score }) => ({ id, score }))).toEqual([
      { id: "later", score: 8 },
      { id: "earlier", score: 8 },
    ]);
  });
});
