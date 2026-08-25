import { describe, expect, it } from "vitest";
import { chunkDocument } from "../../src/sources/chunker";

describe("M2 chunk overlap policy", () => {
  it("keeps bounded overlap without empty or surrogate-split chunks", () => {
    const chunks = chunkDocument({
      kind: "markdown",
      normalizedMarkdown: "第一段😀内容abcdefghij\n第二段内容klmnopqrst\n第三段内容uvwxyz\n",
    }, { maxCodePoints: 12, overlapCodePoints: 3 });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.body.trim().length > 0)).toBe(true);
    expect(chunks.every((chunk) => !/[\ud800-\udfff]/u.test(chunk.body))).toBe(true);
    for (let index = 1; index < chunks.length; index += 1) {
      const previous = [...chunks[index - 1]!.body];
      const current = [...chunks[index]!.body];
      const overlap = Math.min(3, previous.length, current.length);
      expect(current.slice(0, overlap).join("")).toBe(previous.slice(-overlap).join(""));
    }
  });
});
