import type { MemberRole, MemberStatus } from "../members/types";
import type { Page, PageRequest } from "../pagination";
import type { RecordStatus } from "../spaces/types";
import type { SubmissionKind } from "../submissions/types";

export type AuditActorKind = "member" | "automation" | "system";

export interface AuditActionMap {
  "member.login": { resourceType: "member"; metadata: { role: MemberRole } };
  "member.status_updated": { resourceType: "member"; metadata: { previousStatus: MemberStatus; newStatus: MemberStatus } };
  "space.created": { resourceType: "space"; metadata: { status: RecordStatus } };
  "space.updated": { resourceType: "space"; metadata: { previousStatus: RecordStatus; newStatus: RecordStatus } };
  "collection.created": { resourceType: "collection"; metadata: { spaceId: string; status: RecordStatus } };
  "collection.updated": { resourceType: "collection"; metadata: { spaceId: string; previousStatus: RecordStatus; newStatus: RecordStatus } };
  "submission.created": { resourceType: "submission"; metadata: { kind: SubmissionKind; requestedSpaceId: string; requestedCollectionId?: string } };
}

export type AuditAction = keyof AuditActionMap;
export const auditActions = Object.freeze<readonly AuditAction[]>([
  "member.login",
  "member.status_updated",
  "space.created",
  "space.updated",
  "collection.created",
  "collection.updated",
  "submission.created",
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
