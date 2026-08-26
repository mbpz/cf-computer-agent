import type { MemberRole, MemberStatus } from "../members/types";
import type { Page, PageRequest } from "../pagination";
import type { RecordStatus } from "../spaces/types";
import type { SubmissionKind } from "../submissions/types";

export type AuditActorKind = "member" | "automation" | "system";

export interface AuditActionMap {
  "member.login": { resourceType: "member"; metadata: { role: MemberRole } };
  "member.identity_linked": { resourceType: "member"; metadata: { provider: "github" | "wechat" } };
  "member.status_updated": { resourceType: "member"; metadata: { previousStatus: MemberStatus; newStatus: MemberStatus } };
  "space.created": { resourceType: "space"; metadata: { status: RecordStatus } };
  "space.updated": { resourceType: "space"; metadata: { previousStatus: RecordStatus; newStatus: RecordStatus } };
  "collection.created": { resourceType: "collection"; metadata: { spaceId: string; status: RecordStatus } };
  "collection.updated": { resourceType: "collection"; metadata: { spaceId: string; previousStatus: RecordStatus; newStatus: RecordStatus } };
  "submission.created": { resourceType: "submission"; metadata: { kind: SubmissionKind; requestedSpaceId: string; requestedCollectionId?: string } };
  "submission.draft_saved": { resourceType: "submission"; metadata: { kind: SubmissionKind; requestedSpaceId: string; requestedCollectionId?: string } };
  "submission.rejected": { resourceType: "submission"; metadata: { reasonCode: "not_relevant" | "duplicate" | "unsafe" } };
  "submission.duplicate_decided": { resourceType: "submission"; metadata: { decision: "associate" | "keep_separate" | "reject" } };
  "submission.revision_requested": { resourceType: "submission"; metadata: { reasonCode: "needs_revision" } };
  "review.metadata_changed": { resourceType: "submission"; metadata: {
    requestedTitle: string; finalTitle: string;
    requestedSpaceId: string; finalSpaceId: string;
    requestedCollectionId?: string; finalCollectionId?: string;
    requestedVisibility: "shared" | "admin_only"; finalVisibility: "shared" | "admin_only";
  } };
  "review.visibility_expanded": { resourceType: "submission"; metadata: {
    requestedVisibility: "admin_only"; finalVisibility: "shared";
    reasonCode: "admin_visibility_expansion";
  } };
  "submission.resubmitted": { resourceType: "submission"; metadata: {
    supersedesSubmissionId: string; requestedSpaceId: string;
    requestedCollectionId?: string; requestedVisibility: "shared" | "admin_only";
  } };
  "knowledge.published": { resourceType: "knowledge"; metadata: { submissionId: string; revisionId: string; visibility: "shared" | "admin_only" } };
  "knowledge.downloaded": { resourceType: "knowledge"; metadata: { revisionId: string } };
  "knowledge.rolled_back": { resourceType: "knowledge"; metadata: { fromRevisionId: string; toRevisionId: string } };
  "knowledge.trashed": { resourceType: "knowledge"; metadata: { currentRevisionId: string } };
  "knowledge.restored": { resourceType: "knowledge"; metadata: { currentRevisionId: string } };
  "knowledge.purged": { resourceType: "knowledge"; metadata: { currentRevisionId: string; purgedRevisionCount: number } };
  "agent.tool_called": { resourceType: "agent_tool"; metadata: { tool: string; resourceIds: string[] } };
}

export type AuditAction = keyof AuditActionMap;
export const auditActions = Object.freeze<readonly AuditAction[]>([
  "member.login",
  "member.identity_linked",
  "member.status_updated",
  "space.created",
  "space.updated",
  "collection.created",
  "collection.updated",
  "submission.created",
  "submission.draft_saved",
  "submission.rejected",
  "submission.duplicate_decided",
  "submission.revision_requested",
  "review.metadata_changed",
  "review.visibility_expanded",
  "submission.resubmitted",
  "knowledge.published",
  "knowledge.downloaded",
  "knowledge.rolled_back",
  "knowledge.trashed",
  "knowledge.restored",
  "knowledge.purged",
  "agent.tool_called",
]);

export type CreateAuditEvent = {
  [Action in AuditAction]: {
    id: string;
    actorKind: AuditActorKind;
    actorId: string | null;
    action: Action;
    resourceType: AuditActionMap[Action]["resourceType"];
    resourceId: string | null;
    metadata: AuditActionMap[Action]["metadata"];
    createdAt: string;
  };
}[AuditAction];

export type AuditEvent = CreateAuditEvent;
export type AuditPage = Page<AuditEvent>;
export type AuditPageRequest = PageRequest;

export type ActivityAction =
  | "submission.created"
  | "submission.draft_saved"
  | "submission.rejected"
  | "submission.revision_requested"
  | "submission.resubmitted"
  | "knowledge.published"
  | "knowledge.rolled_back"
  | "knowledge.restored"
  | "knowledge.downloaded";

export interface ActivityItem {
  id: string;
  action: ActivityAction;
  resourceType: "submission" | "knowledge";
  resourceId: string;
  createdAt: string;
}

export type ActivityPage = Page<ActivityItem>;

export function assertAuditEventInput(input: unknown): CreateAuditEvent {
  const event = readPlainDataObject(input, new Set([
    "id", "actorKind", "actorId", "action", "resourceType", "resourceId", "metadata", "createdAt",
  ]));
  if (!isNonEmptyString(event.id) || !isActorKind(event.actorKind)
    || (event.actorId !== null && !isNonEmptyString(event.actorId))
    || (event.resourceId !== null && !isNonEmptyString(event.resourceId))
    || !isNonEmptyString(event.createdAt)) {
    throw new TypeError("Audit action is invalid");
  }

  const action = event.action;
  const metadata = validateMetadata(action, event.resourceType, event.metadata);
  return Object.assign(Object.create(null), {
    id: event.id,
    actorKind: event.actorKind,
    actorId: event.actorId,
    action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    metadata,
    createdAt: event.createdAt,
  }) as CreateAuditEvent;
}

function validateMetadata(action: unknown, resourceType: unknown, input: unknown): CreateAuditEvent["metadata"] {
  switch (action) {
    case "member.login": {
      assertResourceType(resourceType, "member");
      const metadata = readPlainDataObject(input, new Set(["role"]));
      if (!isMemberRole(metadata.role)) throw invalidMetadata();
      return safeMetadata({ role: metadata.role });
    }
    case "member.identity_linked": {
      assertResourceType(resourceType, "member");
      const metadata = readPlainDataObject(input, new Set(["provider"]));
      if (metadata.provider !== "github" && metadata.provider !== "wechat") throw invalidMetadata();
      return safeMetadata({ provider: metadata.provider });
    }
    case "member.status_updated": {
      assertResourceType(resourceType, "member");
      const metadata = readPlainDataObject(input, new Set(["previousStatus", "newStatus"]));
      if (!isRecordStatus(metadata.previousStatus) || !isRecordStatus(metadata.newStatus)) throw invalidMetadata();
      return safeMetadata({ previousStatus: metadata.previousStatus, newStatus: metadata.newStatus });
    }
    case "space.created": {
      assertResourceType(resourceType, "space");
      const metadata = readPlainDataObject(input, new Set(["status"]));
      if (!isRecordStatus(metadata.status)) throw invalidMetadata();
      return safeMetadata({ status: metadata.status });
    }
    case "space.updated": {
      assertResourceType(resourceType, "space");
      const metadata = readPlainDataObject(input, new Set(["previousStatus", "newStatus"]));
      if (!isRecordStatus(metadata.previousStatus) || !isRecordStatus(metadata.newStatus)) throw invalidMetadata();
      return safeMetadata({ previousStatus: metadata.previousStatus, newStatus: metadata.newStatus });
    }
    case "collection.created": {
      assertResourceType(resourceType, "collection");
      const metadata = readPlainDataObject(input, new Set(["spaceId", "status"]));
      if (!isNonEmptyString(metadata.spaceId) || !isRecordStatus(metadata.status)) throw invalidMetadata();
      return safeMetadata({ spaceId: metadata.spaceId, status: metadata.status });
    }
    case "collection.updated": {
      assertResourceType(resourceType, "collection");
      const metadata = readPlainDataObject(input, new Set(["spaceId", "previousStatus", "newStatus"]));
      if (!isNonEmptyString(metadata.spaceId) || !isRecordStatus(metadata.previousStatus) || !isRecordStatus(metadata.newStatus)) throw invalidMetadata();
      return safeMetadata({ spaceId: metadata.spaceId, previousStatus: metadata.previousStatus, newStatus: metadata.newStatus });
    }
    case "submission.created": {
      assertResourceType(resourceType, "submission");
      const metadata = readPlainDataObject(input, new Set(["kind", "requestedSpaceId", "requestedCollectionId"]));
      if (!isSubmissionKind(metadata.kind) || !isNonEmptyString(metadata.requestedSpaceId)
        || (metadata.requestedCollectionId !== undefined && !isNonEmptyString(metadata.requestedCollectionId))) {
        throw invalidMetadata();
      }
      return safeMetadata({
        kind: metadata.kind,
        requestedSpaceId: metadata.requestedSpaceId,
        ...(metadata.requestedCollectionId === undefined ? {} : { requestedCollectionId: metadata.requestedCollectionId }),
      });
    }
    case "submission.draft_saved": {
      assertResourceType(resourceType, "submission");
      const metadata = readPlainDataObject(input, new Set(["kind", "requestedSpaceId", "requestedCollectionId"]));
      if (!isSubmissionKind(metadata.kind) || !isNonEmptyString(metadata.requestedSpaceId)
        || (metadata.requestedCollectionId !== undefined && !isNonEmptyString(metadata.requestedCollectionId))) {
        throw invalidMetadata();
      }
      return safeMetadata({
        kind: metadata.kind,
        requestedSpaceId: metadata.requestedSpaceId,
        ...(metadata.requestedCollectionId === undefined ? {} : { requestedCollectionId: metadata.requestedCollectionId }),
      });
    }
    case "submission.rejected": {
      assertResourceType(resourceType, "submission");
      const metadata = readPlainDataObject(input, new Set(["reasonCode"]));
      if (metadata.reasonCode !== "not_relevant" && metadata.reasonCode !== "duplicate" && metadata.reasonCode !== "unsafe") {
        throw invalidMetadata();
      }
      return safeMetadata({ reasonCode: metadata.reasonCode });
    }
    case "submission.duplicate_decided": {
      assertResourceType(resourceType, "submission");
      const metadata = readPlainDataObject(input, new Set(["decision"]));
      if (metadata.decision !== "associate" && metadata.decision !== "keep_separate" && metadata.decision !== "reject") {
        throw invalidMetadata();
      }
      return safeMetadata({ decision: metadata.decision });
    }
    case "submission.revision_requested": {
      assertResourceType(resourceType, "submission");
      const metadata = readPlainDataObject(input, new Set(["reasonCode"]));
      if (metadata.reasonCode !== "needs_revision") throw invalidMetadata();
      return safeMetadata({ reasonCode: "needs_revision" });
    }
    case "review.metadata_changed": {
      assertResourceType(resourceType, "submission");
      const metadata = readPlainDataObject(input, new Set([
        "requestedTitle", "finalTitle", "requestedSpaceId", "finalSpaceId",
        "requestedCollectionId", "finalCollectionId", "requestedVisibility", "finalVisibility",
      ]));
      if (!isBoundedTitle(metadata.requestedTitle) || !isBoundedTitle(metadata.finalTitle)
        || !isBoundedId(metadata.requestedSpaceId) || !isBoundedId(metadata.finalSpaceId)
        || (metadata.requestedCollectionId !== undefined && !isBoundedId(metadata.requestedCollectionId))
        || (metadata.finalCollectionId !== undefined && !isBoundedId(metadata.finalCollectionId))
        || !isVisibility(metadata.requestedVisibility) || !isVisibility(metadata.finalVisibility)) {
        throw invalidMetadata();
      }
      return safeMetadata({
        requestedTitle: metadata.requestedTitle, finalTitle: metadata.finalTitle,
        requestedSpaceId: metadata.requestedSpaceId, finalSpaceId: metadata.finalSpaceId,
        ...(metadata.requestedCollectionId === undefined ? {} : { requestedCollectionId: metadata.requestedCollectionId }),
        ...(metadata.finalCollectionId === undefined ? {} : { finalCollectionId: metadata.finalCollectionId }),
        requestedVisibility: metadata.requestedVisibility, finalVisibility: metadata.finalVisibility,
      });
    }
    case "review.visibility_expanded": {
      assertResourceType(resourceType, "submission");
      const metadata = readPlainDataObject(input, new Set([
        "requestedVisibility", "finalVisibility", "reasonCode",
      ]));
      if (metadata.requestedVisibility !== "admin_only" || metadata.finalVisibility !== "shared"
        || metadata.reasonCode !== "admin_visibility_expansion") throw invalidMetadata();
      return safeMetadata({
        requestedVisibility: "admin_only", finalVisibility: "shared",
        reasonCode: "admin_visibility_expansion",
      });
    }
    case "submission.resubmitted": {
      assertResourceType(resourceType, "submission");
      const metadata = readPlainDataObject(input, new Set([
        "supersedesSubmissionId", "requestedSpaceId", "requestedCollectionId", "requestedVisibility",
      ]));
      if (!isBoundedId(metadata.supersedesSubmissionId) || !isBoundedId(metadata.requestedSpaceId)
        || (metadata.requestedCollectionId !== undefined && !isBoundedId(metadata.requestedCollectionId))
        || !isVisibility(metadata.requestedVisibility)) throw invalidMetadata();
      return safeMetadata({
        supersedesSubmissionId: metadata.supersedesSubmissionId,
        requestedSpaceId: metadata.requestedSpaceId,
        ...(metadata.requestedCollectionId === undefined ? {} : { requestedCollectionId: metadata.requestedCollectionId }),
        requestedVisibility: metadata.requestedVisibility,
      });
    }
    case "knowledge.published": {
      assertResourceType(resourceType, "knowledge");
      const metadata = readPlainDataObject(input, new Set(["submissionId", "revisionId", "visibility"]));
      if (!isNonEmptyString(metadata.submissionId) || !isNonEmptyString(metadata.revisionId)
        || (metadata.visibility !== "shared" && metadata.visibility !== "admin_only")) {
        throw invalidMetadata();
      }
      return safeMetadata({
        submissionId: metadata.submissionId,
        revisionId: metadata.revisionId,
        visibility: metadata.visibility,
      });
    }
    case "knowledge.downloaded": {
      assertResourceType(resourceType, "knowledge");
      const metadata = readPlainDataObject(input, new Set(["revisionId"]));
      if (!isBoundedId(metadata.revisionId)) throw invalidMetadata();
      return safeMetadata({ revisionId: metadata.revisionId });
    }
    case "knowledge.rolled_back": {
      assertResourceType(resourceType, "knowledge");
      const metadata = readPlainDataObject(input, new Set(["fromRevisionId", "toRevisionId"]));
      if (!isBoundedId(metadata.fromRevisionId) || !isBoundedId(metadata.toRevisionId)
        || metadata.fromRevisionId === metadata.toRevisionId) throw invalidMetadata();
      return safeMetadata({ fromRevisionId: metadata.fromRevisionId, toRevisionId: metadata.toRevisionId });
    }
    case "knowledge.trashed":
    case "knowledge.restored": {
      assertResourceType(resourceType, "knowledge");
      const metadata = readPlainDataObject(input, new Set(["currentRevisionId"]));
      if (!isBoundedId(metadata.currentRevisionId)) throw invalidMetadata();
      return safeMetadata({ currentRevisionId: metadata.currentRevisionId });
    }
    case "knowledge.purged": {
      assertResourceType(resourceType, "knowledge");
      const metadata = readPlainDataObject(input, new Set(["currentRevisionId", "purgedRevisionCount"]));
      if (!isBoundedId(metadata.currentRevisionId)
        || typeof metadata.purgedRevisionCount !== "number"
        || !Number.isSafeInteger(metadata.purgedRevisionCount)
        || metadata.purgedRevisionCount < 1 || metadata.purgedRevisionCount > 1_000) {
        throw invalidMetadata();
      }
      return safeMetadata({
        currentRevisionId: metadata.currentRevisionId,
        purgedRevisionCount: metadata.purgedRevisionCount,
      });
    }
    case "agent.tool_called": {
      assertResourceType(resourceType, "agent_tool");
      const metadata = readPlainDataObject(input, new Set(["tool", "resourceIds"]));
      if (!isBoundedToolName(metadata.tool) || !Array.isArray(metadata.resourceIds)
        || metadata.resourceIds.length > 8
        || !metadata.resourceIds.every(isBoundedId)
        || new Set(metadata.resourceIds).size !== metadata.resourceIds.length) {
        throw invalidMetadata();
      }
      return safeMetadata({ tool: metadata.tool, resourceIds: [...metadata.resourceIds] });
    }
    default:
      throw new TypeError("Audit action is invalid");
  }
}

function assertResourceType(actual: unknown, expected: CreateAuditEvent["resourceType"]): void {
  if (actual !== expected) throw new TypeError("Audit action is invalid");
}

function safeMetadata<T extends CreateAuditEvent["metadata"]>(metadata: T): T {
  return Object.assign(Object.create(null), metadata) as T;
}

function invalidMetadata(): TypeError { return new TypeError("Audit metadata is invalid"); }
function isSubmissionKind(value: unknown): value is SubmissionKind { return value === "text" || value === "markdown" || value === "code"; }
function isMemberRole(value: unknown): value is MemberRole { return value === "admin" || value === "contributor"; }
function isRecordStatus(value: unknown): value is RecordStatus { return value === "active" || value === "disabled"; }
function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function isBoundedToolName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(value);
}
function isBoundedTitle(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && [...value].length <= 200
    && new TextEncoder().encode(value).byteLength <= 512
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function isVisibility(value: unknown): value is "shared" | "admin_only" {
  return value === "shared" || value === "admin_only";
}
function isActorKind(value: unknown): value is AuditActorKind { return value === "member" || value === "automation" || value === "system"; }
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readPlainDataObject(input: unknown, allowed: ReadonlySet<string>): Record<string, unknown> {
  if (!isPlainRecord(input) || "toJSON" in input || Object.getOwnPropertySymbols(input).length > 0) throw invalidMetadata();
  const values = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(input)) {
    if (!allowed.has(key)) throw invalidMetadata();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor)) throw invalidMetadata();
    values[key] = descriptor.value;
  }
  return values;
}
