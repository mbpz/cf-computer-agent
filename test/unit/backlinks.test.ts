import { describe, expect, it } from "vitest";
import { hasExplicitKnowledgeLink } from "../../src/library/backlinks";

describe("explicit knowledge link detection", () => {
  it("recognizes supported Markdown and wiki link forms after parser escaping", () => {
    expect(hasExplicitKnowledgeLink("[[knowledge-1]]", "knowledge-1")).toBe(true);
    expect(hasExplicitKnowledgeLink("[Guide](/knowledge/knowledge-1#section)", "knowledge-1")).toBe(true);
    expect(hasExplicitKnowledgeLink("[Guide](knowledge://knowledge-1)", "knowledge-1")).toBe(true);
    expect(hasExplicitKnowledgeLink("\\[Guide\\]\\(\\/knowledge\\/knowledge\\-1\\)", "knowledge-1")).toBe(true);
  });

  it("rejects prefix collisions, plain mentions, and links to another item", () => {
    expect(hasExplicitKnowledgeLink("knowledge-10 is mentioned", "knowledge-1")).toBe(false);
    expect(hasExplicitKnowledgeLink("[Guide](/knowledge/knowledge-10)", "knowledge-1")).toBe(false);
    expect(hasExplicitKnowledgeLink("[[knowledge-10]]", "knowledge-1")).toBe(false);
    expect(hasExplicitKnowledgeLink("[Guide](/knowledge/knowledge-2)", "knowledge-1")).toBe(false);
  });
});
