import { describe, expect, it } from "vitest";
import { assertAuditEventInput } from "../../src/audit/types";

describe("audit input validation", () => {
  const base = {
    id: "audit-1", actorKind: "member" as const, actorId: "member-1", action: "submission.created" as const,
    resourceType: "submission", resourceId: "submission-1", metadata: { kind: "code" as const, requestedSpaceId: "default" }, createdAt: "2026-08-13T00:00:00.000Z",
  };

  it("accepts only the discriminated allowlisted metadata for an action", () => {
    const event = assertAuditEventInput(base);
    expect(event).toEqual(base);
    expect(event).not.toBe(base);
    expect(event.metadata).not.toBe(base.metadata);
    expect(Object.getPrototypeOf(event.metadata)).toBeNull();
  });

  it.each([
    ["member.login", "member", { role: "contributor" }],
    ["member.identity_linked", "member", { provider: "github" }],
    ["member.status_updated", "member", { previousStatus: "active", newStatus: "disabled" }],
    ["space.created", "space", { status: "active" }],
    ["space.updated", "space", { previousStatus: "active", newStatus: "disabled" }],
    ["collection.created", "collection", { spaceId: "space-1", status: "active" }],
    ["collection.updated", "collection", { spaceId: "space-1", previousStatus: "active", newStatus: "disabled" }],
    ["submission.rejected", "submission", { reasonCode: "unsafe" }],
    ["submission.revision_requested", "submission", { reasonCode: "needs_revision" }],
    ["review.metadata_changed", "submission", {
      requestedTitle: "Requested title", finalTitle: "Final title",
      requestedSpaceId: "space-1", finalSpaceId: "space-2",
      requestedCollectionId: "collection-1", finalCollectionId: "collection-2",
      requestedVisibility: "shared", finalVisibility: "admin_only",
    }],
    ["review.visibility_expanded", "submission", {
      requestedVisibility: "admin_only", finalVisibility: "shared",
      reasonCode: "admin_visibility_expansion",
    }],
    ["submission.resubmitted", "submission", {
      supersedesSubmissionId: "submission-old", requestedSpaceId: "space-1",
      requestedVisibility: "admin_only",
    }],
    ["knowledge.published", "knowledge", { submissionId: "submission-1", revisionId: "revision-1", visibility: "admin_only" }],
  ])("accepts and safely rebuilds %s", (action, resourceType, metadata) => {
    const input = {
      id: `audit-${action}`,
      actorKind: "member",
      actorId: "member-1",
      action,
      resourceType,
      resourceId: `${resourceType}-1`,
      metadata,
      createdAt: "2026-08-13T00:00:00.000Z",
    };

    const event = assertAuditEventInput(input);
    expect(event).toEqual(input);
    expect(event).not.toBe(input);
    expect(event.metadata).not.toBe(metadata);
    expect(Object.getPrototypeOf(event.metadata)).toBeNull();
  });

  it.each([
    ["member.login", "member", { role: "contributor", email: "secret@example.test" }],
    ["member.identity_linked", "member", { provider: "github", subject: "github:123" }],
    ["member.identity_linked", "member", { provider: "github", githubUserId: "123" }],
    ["member.identity_linked", "member", { provider: "github", email: "secret@example.test" }],
    ["member.status_updated", "member", { previousStatus: "active", newStatus: "disabled", sub: "secret-sub" }],
    ["space.created", "space", { status: "active", title: "Secret title" }],
    ["space.updated", "space", { previousStatus: "active", newStatus: "disabled", token: "secret" }],
    ["collection.created", "collection", { spaceId: "space-1", status: "active", content: "secret" }],
    ["collection.updated", "collection", { spaceId: "space-1", previousStatus: "active", newStatus: "disabled", jwt: "secret" }],
    ["submission.rejected", "submission", { reasonCode: "unsafe", note: "private review note" }],
    ["submission.revision_requested", "submission", { reasonCode: "needs_revision", title: "private title" }],
    ["review.metadata_changed", "submission", {
      requestedTitle: "Requested title", finalTitle: "Final title", requestedSpaceId: "space-1",
      finalSpaceId: "space-2", requestedVisibility: "shared", finalVisibility: "admin_only",
      note: "private review note",
    }],
    ["review.visibility_expanded", "submission", {
      requestedVisibility: "admin_only", finalVisibility: "shared",
      reasonCode: "admin_visibility_expansion", provider: "secret",
    }],
    ["submission.resubmitted", "submission", {
      supersedesSubmissionId: "submission-old", requestedSpaceId: "space-1",
      requestedVisibility: "shared", contentSha256: "secret-hash",
    }],
    ["knowledge.published", "knowledge", { submissionId: "submission-1", revisionId: "revision-1", visibility: "shared", tags: ["private"] }],
    ["knowledge.published", "knowledge", { submissionId: "submission-1", revisionId: "revision-1", visibility: "shared", content: "private markdown" }],
  ])("rejects extra sensitive metadata for %s", (action, resourceType, metadata) => {
    expect(() => assertAuditEventInput({
      id: "audit-sensitive",
      actorKind: "member",
      actorId: "member-1",
      action,
      resourceType,
      resourceId: `${resourceType}-1`,
      metadata,
      createdAt: "2026-08-13T00:00:00.000Z",
    })).toThrow(/audit metadata/i);
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

  it("rejects prototype and own toJSON tricks without invoking them", () => {
    const inherited = Object.create({ toJSON: () => { throw new Error("inherited marker"); } }) as Record<string, unknown>;
    inherited.kind = "code";
    inherited.requestedSpaceId = "default";
    const own = { kind: "code", requestedSpaceId: "default", toJSON: () => { throw new Error("own marker"); } };

    expect(() => assertAuditEventInput({ ...base, metadata: inherited })).toThrow(/audit metadata/i);
    expect(() => assertAuditEventInput({ ...base, metadata: own })).toThrow(/audit metadata/i);
  });

  it("rejects nested sensitive values before an audit payload can serialize them", () => {
    const marker = "nested-sensitive-marker";
    let serialized = "";

    expect(() => { serialized = JSON.stringify(assertAuditEventInput({
      ...base, metadata: { kind: "code", requestedSpaceId: { content: marker } },
    })); }).toThrow(/audit metadata/i);
    expect(serialized).not.toContain(marker);
  });

  it.each([
    ["review.metadata_changed", {
      requestedTitle: "x".repeat(513), finalTitle: "Final", requestedSpaceId: "space-1",
      finalSpaceId: "space-2", requestedVisibility: "shared", finalVisibility: "shared",
    }],
    ["review.visibility_expanded", {
      requestedVisibility: "admin_only", finalVisibility: "shared", reasonCode: "because_admin_said_so",
    }],
    ["submission.resubmitted", {
      supersedesSubmissionId: "submission-old", requestedSpaceId: "space-1",
      requestedVisibility: "public",
    }],
  ])("rejects out-of-contract bounded metadata for %s", (action, metadata) => {
    expect(() => assertAuditEventInput({
      id: "audit-bounds", actorKind: "member", actorId: "member-1", action,
      resourceType: "submission", resourceId: "submission-1", metadata,
      createdAt: "2026-08-13T00:00:00.000Z",
    })).toThrow(/audit metadata/i);
  });
});
