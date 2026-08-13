import { describe, expect, it } from "vitest";
import { assertAuditEventInput } from "../../src/audit/types";

describe("audit input validation", () => {
  const base = {
    id: "audit-1", actorKind: "member" as const, actorId: "member-1", action: "submission.created" as const,
    resourceType: "submission", resourceId: "submission-1", metadata: { kind: "code" as const, requestedSpaceId: "default" }, createdAt: "2026-08-13T00:00:00.000Z",
  };

  it("accepts only the discriminated allowlisted metadata for an action", () => {
    expect(assertAuditEventInput(base)).toEqual(base);
  });

  it.each([
    { ...base, metadata: { ...base.metadata, token: "secret" } },
    { ...base, metadata: { ...base.metadata, jwt: "header.payload.signature" } },
    { ...base, metadata: { ...base.metadata, content: "full submission" } },
    { ...base, metadata: { ...base.metadata, requestBody: "{}" } },
    { ...base, metadata: { requestedSpaceId: "default" } },
    { ...base, content: "full submission" },
  ])("rejects sensitive or arbitrary audit metadata", (input) => {
    expect(() => assertAuditEventInput(input)).toThrow(/audit metadata/i);
  });
});
