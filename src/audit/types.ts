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
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Audit action is invalid");
  const event = input as Partial<CreateAuditEvent>;
  const fields = new Set(["id", "actorKind", "actorId", "action", "resourceType", "resourceId", "metadata", "createdAt"]);
  if (Object.keys(event).some((key) => !fields.has(key))) throw new TypeError("Audit metadata is invalid");
  if (event.action !== "submission.created" || event.resourceType !== "submission" || !isActorKind(event.actorKind) || (event.actorId !== null && !isNonEmptyString(event.actorId)) || (event.resourceId !== null && !isNonEmptyString(event.resourceId)) || !isNonEmptyString(event.id) || !isNonEmptyString(event.createdAt)) throw new TypeError("Audit action is invalid");
  const metadata = event.metadata as Record<string, unknown>;
  const allowed = new Set(["kind", "requestedSpaceId", "requestedCollectionId"]);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || Object.keys(metadata).some((key) => !allowed.has(key))) {
    throw new TypeError("Audit metadata is invalid");
  }
  if (!isSubmissionKind(metadata.kind) || !isNonEmptyString(metadata.requestedSpaceId) || (metadata.requestedCollectionId !== undefined && !isNonEmptyString(metadata.requestedCollectionId))) {
    throw new TypeError("Audit metadata is invalid");
  }
  return event as CreateAuditEvent;
}

function isSubmissionKind(value: unknown): value is SubmissionKind { return value === "text" || value === "markdown" || value === "code"; }
function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function isActorKind(value: unknown): value is AuditActorKind { return value === "member" || value === "automation" || value === "system"; }
