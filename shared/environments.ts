/** Metadata only: a server record is never evidence of a currently running VM. */
export type EnvironmentType = "personal" | "temporary";

export interface EnvironmentMetadata {
  id: string;
  memberId: string;
  name: string;
  type: EnvironmentType;
  taskId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentCreateResult {
  environment: EnvironmentMetadata;
}

export interface EnvironmentDeleteResult {
  tombstone: EnvironmentTombstone;
}

export interface EnvironmentTombstone { environmentId: string; version: number; deletedAt: string; }

export type EnvironmentLifecycleEvent = "started" | "restored" | "paused" | "resumed" | "checkpoint_saved" | "stopped" | "failed";
export interface EnvironmentLifecyclePosition {
  runtimeId: string;
  generation: number;
  eventIndex: number;
  event: EnvironmentLifecycleEvent;
}
export interface EnvironmentReportedEvent extends EnvironmentLifecyclePosition {
  eventId: string;
  environmentId: string;
  receivedAt: string;
}
export interface EnvironmentReportResult { event: EnvironmentReportedEvent; }

/** Server-accepted metadata facts, never terminal content or runtime truth. */
export interface EnvironmentOperation {
  sequence: number;
  operationId: string;
  kind: "environment.create" | "environment.update" | "environment.delete" | "environment.lifecycle";
  environmentId: string;
  createdAt: string;
  source?: "browser_report";
  lifecycle?: EnvironmentLifecyclePosition;
}
