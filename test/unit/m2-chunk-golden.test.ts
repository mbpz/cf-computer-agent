import { describe, expect, it } from "vitest";
import { chunkDocument } from "../../src/sources/chunker";
import { parseSource } from "../../src/sources/parser";
import { M2_CHUNK_GOLDEN_CASES } from "../fixtures/m2-chunk-golden";

describe("M2 chunk golden set", () => {
  it.each(M2_CHUNK_GOLDEN_CASES)("preserves the $id contract", async ({ input, expected }) => {
    const parsed = await parseSource(input);
    const chunks = chunkDocument({
      normalizedMarkdown: parsed.normalizedMarkdown,
      kind: input.kind,
      ...(parsed.codeMetadata ? { lineBaseline: parsed.codeMetadata.lineBaseline } : {}),
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toEqual(expect.objectContaining(expected));
  });
});
