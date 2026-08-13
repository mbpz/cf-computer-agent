import type { Page, PageRequest } from "../pagination";
import type { SubmissionKind } from "../submissions/types";

export type AuditActorKind = "member" | "automation" | "system";

export interface AuditActionMap {
  "submission.created": {
    resourceType: "submission";
    metadata: { kind: SubmissionKind; requestedSpaceId: string; requestedCollectionId?: string };
  };
}

export type AuditAction = keyof AuditActionMap;
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

export function assertAuditEventInput(input: unknown): CreateAuditEvent {
  const fields = new Set(["id", "actorKind", "actorId", "action", "resourceType", "resourceId", "metadata", "createdAt"]);
  const event = readPlainDataObject(input, fields);
  if (event.action !== "submission.created" || event.resourceType !== "submission" || !isActorKind(event.actorKind) || (event.actorId !== null && !isNonEmptyString(event.actorId)) || (event.resourceId !== null && !isNonEmptyString(event.resourceId)) || !isNonEmptyString(event.id) || !isNonEmptyString(event.createdAt)) throw new TypeError("Audit action is invalid");
  const allowed = new Set(["kind", "requestedSpaceId", "requestedCollectionId"]);
  const metadata = readPlainDataObject(event.metadata, allowed);
  if (!isSubmissionKind(metadata.kind) || !isNonEmptyString(metadata.requestedSpaceId) || (metadata.requestedCollectionId !== undefined && !isNonEmptyString(metadata.requestedCollectionId))) {
    throw new TypeError("Audit metadata is invalid");
  }
  const sanitizedMetadata = Object.assign(Object.create(null), {
    kind: metadata.kind,
    requestedSpaceId: metadata.requestedSpaceId,
    ...(metadata.requestedCollectionId === undefined ? {} : { requestedCollectionId: metadata.requestedCollectionId }),
  }) as CreateAuditEvent["metadata"];
  return Object.assign(Object.create(null), {
    id: event.id, actorKind: event.actorKind, actorId: event.actorId, action: event.action,
    resourceType: event.resourceType, resourceId: event.resourceId, metadata: sanitizedMetadata, createdAt: event.createdAt,
  }) as CreateAuditEvent;
}

function isSubmissionKind(value: unknown): value is SubmissionKind { return value === "text" || value === "markdown" || value === "code"; }
function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function isActorKind(value: unknown): value is AuditActorKind { return value === "member" || value === "automation" || value === "system"; }
function isPlainRecord(value: unknown): value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function readPlainDataObject(input: unknown, allowed: ReadonlySet<string>): Record<string, unknown> {
  if (!isPlainRecord(input) || "toJSON" in input || Object.getOwnPropertySymbols(input).length > 0) throw new TypeError("Audit metadata is invalid");
  const values = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(input)) {
    if (!allowed.has(key)) throw new TypeError("Audit metadata is invalid");
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor)) throw new TypeError("Audit metadata is invalid");
    values[key] = descriptor.value;
  }
  return values;
}
