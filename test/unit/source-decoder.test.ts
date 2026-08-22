import { describe, expect, it } from "vitest";
import { decodeSourceBytes } from "../../src/sources/decoder";
import { m1ParserCases } from "../fixtures/m1-parser-cases";

describe("decodeSourceBytes", () => {
  it.each(m1ParserCases.filter((fixture) => fixture.expected.ok))(
    "decodes valid independent fixture $id without replacement text",
    (fixture) => {
      expect(decodeSourceBytes(fixture.bytes.slice().buffer as ArrayBuffer)).not.toContain("\ufffd");
    },
  );

  it.each(m1ParserCases.filter((fixture) => !fixture.expected.ok && fixture.expected.code === "SOURCE_ENCODING_INVALID"))(
    "rejects malformed UTF-8 fixture $id",
    (fixture) => {
      expect(() => decodeSourceBytes(fixture.bytes.slice().buffer as ArrayBuffer)).toThrow(expect.objectContaining({ code: "SOURCE_ENCODING_INVALID", status: 400 }));
    },
  );
});
