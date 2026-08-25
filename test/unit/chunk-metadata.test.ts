import { describe, expect, it } from "vitest";
import { buildChunkMetadata, metadataSearchText } from "../../src/sources/chunk-metadata";

describe("chunk metadata", () => {
  it("derives bounded deterministic keywords and question hints without changing body text", () => {
    const body = "Cloudflare Durable Objects coordinate stateful workers and durable storage.";
    const metadata = buildChunkMetadata(["Architecture", "Durable Objects"], body);
    expect(metadata.keywords).toEqual([
      "architecture", "durable", "objects", "cloudflare", "coordinate", "stateful", "workers", "storage",
    ]);
    expect(metadata.questionHints).toEqual([
      "What is architecture?", "What is durable?", "What is objects?", "What is cloudflare?",
    ]);
    expect(metadataSearchText(metadata)).toContain("keyword:durable");
    expect(metadataSearchText(metadata)).toContain("question:What is durable?");
    expect(body).toBe("Cloudflare Durable Objects coordinate stateful workers and durable storage.");
  });

  it("caps metadata and excludes stop words", () => {
    const metadata = buildChunkMetadata([], "the and for 的 了 " + Array.from({ length: 20 }, (_, i) => `term${i}`).join(" "));
    expect(metadata.keywords).toHaveLength(8);
    expect(metadata.keywords).not.toContain("the");
    expect(metadata.questionHints).toHaveLength(4);
  });
});
