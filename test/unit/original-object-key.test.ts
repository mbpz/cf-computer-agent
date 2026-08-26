import { describe, expect, it } from "vitest";
import { originalObjectKey, parsedObjectKey, validateOriginalObjectKey } from "../../src/assets/object-key";

describe("immutable original object keys", () => {
  it("derives the original key only from SourceVersion identity", () => {
    expect(originalObjectKey("source-version-1")).toBe("originals/source-version-1");
    expect(originalObjectKey("source-version-1")).toBe(originalObjectKey("source-version-1"));
    expect(parsedObjectKey("asset-1")).toBe("parsed/asset-1.md");
    expect(validateOriginalObjectKey("originals/source-version-1", "source-version-1")).toBe(true);
  });

  it("rejects path traversal, staging keys and mismatched identities", () => {
    expect(() => originalObjectKey("../owner@example.com/file.pdf")).toThrow(/object key/i);
    expect(validateOriginalObjectKey("staging/asset-1", "source-version-1")).toBe(false);
    expect(validateOriginalObjectKey("originals/source-version-2", "source-version-1")).toBe(false);
  });
});
