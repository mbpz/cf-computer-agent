import { describe, expect, it } from "vitest";
import { buildReparseCandidate } from "../../src/sources/reparse";

describe("source reparse candidate", () => {
  it("creates a new parser version and fingerprint without mutating the source version", async () => {
    const source = {
      id: "source-version-1",
      sourceId: "source-1",
      submissionId: "submission-1",
      ordinal: 1,
      content: "# Published\n\nBody\n",
      contentSha256: "a".repeat(64),
      parserVersion: "m1-v1" as const,
      parserSchemaVersion: "m1-v2" as const,
      sourceIdentitySha256: "b".repeat(64),
      codeMetadata: null,
      createdAt: "2026-08-26T00:00:00.000Z",
    };
    const snapshot = structuredClone(source);
    const candidate = await buildReparseCandidate(source, {
      id: "source-version-2",
      createdAt: "2026-08-26T01:00:00.000Z",
      kind: "markdown",
    });

    expect(candidate).toMatchObject({
      id: "source-version-2",
      sourceId: "source-1",
      submissionId: "submission-1",
      ordinal: 2,
      parserVersion: "m2-v1",
      parserSchemaVersion: "m2-v1",
      content: "# Published\n\nBody\n",
      createdAt: "2026-08-26T01:00:00.000Z",
    });
    expect(candidate.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(candidate.sourceFingerprint).not.toBe(source.sourceIdentitySha256);
    expect(source).toEqual(snapshot);
  });

  it("is deterministic for the same source and parser contract", async () => {
    const source = {
      id: "source-version-1", sourceId: "source-1", submissionId: "submission-1", ordinal: 3,
      content: "```typescript\nconst value = 1;\n```\n", contentSha256: "c".repeat(64), parserVersion: "m1-v1" as const,
      parserSchemaVersion: "m1-v2" as const, sourceIdentitySha256: "d".repeat(64),
      codeMetadata: { language: "typescript", fileLabel: "main.ts", lineBaseline: 4 },
      createdAt: "2026-08-26T00:00:00.000Z",
    };
    const options = { id: "source-version-4", createdAt: "2026-08-26T01:00:00.000Z", kind: "code" as const };
    const first = await buildReparseCandidate(source, options);
    const second = await buildReparseCandidate(source, options);
    expect(second).toEqual(first);
    expect(first.ordinal).toBe(4);
    expect(first.codeMetadata).toEqual(source.codeMetadata);
  });

  it("does not change the published revision identity", async () => {
    const source = {
      id: "source-version-9", sourceId: "source-9", submissionId: "submission-9", ordinal: 9,
      content: "Body\n", contentSha256: "e".repeat(64), parserVersion: "m1-v1" as const,
      parserSchemaVersion: "m1-v2" as const, sourceIdentitySha256: "f".repeat(64),
      codeMetadata: null, createdAt: "2026-08-26T00:00:00.000Z",
    };
    const published = { revisionId: "revision-current", sourceVersionId: source.id };
    const candidate = await buildReparseCandidate(source, { id: "source-version-10", createdAt: "2026-08-26T01:00:00.000Z", kind: "text" });
    expect(candidate.id).not.toBe(published.sourceVersionId);
    expect(published).toEqual({ revisionId: "revision-current", sourceVersionId: "source-version-9" });
  });
});
