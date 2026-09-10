import type { EnvironmentCreateResult, EnvironmentDeleteResult, EnvironmentLifecycleEvent, EnvironmentMetadata, EnvironmentOperation, EnvironmentReportResult, EnvironmentType } from "../../shared/environments";
import { AppError } from "../http";
import type { NumberedPage, NumberedPageRequest } from "../pagination";
import type { EnvironmentListQuery, EnvironmentsRepository } from "./repository";

export class EnvironmentsService {
  constructor(private readonly repository: EnvironmentsRepository) {}

  async create(memberId: string, body: unknown): Promise<EnvironmentCreateResult> {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalidInput();
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["operationId", "name", "type", "taskId"].includes(key))) throw invalidInput();
    const operationId = boundedId(input.operationId);
    const name = normalizedName(input.name);
    const type = parseEnvironmentType(input.type);
    const taskId = input.taskId === null || input.taskId === undefined ? null : boundedId(input.taskId);
    const requestHash = await hashRequest({ kind: "environment.create", memberId, name, type, taskId });
    const now = new Date().toISOString();
    return this.repository.create({
      operationId, requestHash,
      environment: { id: crypto.randomUUID(), memberId, name, type, taskId, version: 1, createdAt: now, updatedAt: now },
    });
  }

  async get(memberId: string, id: string): Promise<EnvironmentMetadata> {
    const environment = await this.repository.findOwned(memberId, id);
    if (!environment) throw new AppError("ENVIRONMENT_NOT_FOUND", "Environment not found", 404);
    return environment;
  }

  async update(memberId: string, id: string, body: unknown): Promise<EnvironmentCreateResult> {
    const input = mutationInput(body, ["name", "taskId"]);
    if (!("name" in input) && !("taskId" in input)) throw invalidInput();
    const fields = {
      ...("name" in input ? { name: normalizedName(input.name) } : {}),
      ...("taskId" in input ? { taskId: input.taskId === null ? null : boundedId(input.taskId) } : {}),
    };
    const operationId = boundedId(input.operationId);
    const version = expectedVersion(input.version);
    return this.repository.update({
      memberId, id, operationId, version, ...fields, now: new Date().toISOString(),
      requestHash: await hashRequest({ kind: "environment.update", memberId, id, version, ...fields }),
    });
  }

  async delete(memberId: string, id: string, body: unknown): Promise<EnvironmentDeleteResult> {
    const input = mutationInput(body, []);
    const operationId = boundedId(input.operationId);
    const version = expectedVersion(input.version);
    return this.repository.delete({
      memberId, id, operationId, version, now: new Date().toISOString(),
      requestHash: await hashRequest({ kind: "environment.delete", memberId, id, version }),
    });
  }

  operations(memberId: string, id: string, page: NumberedPageRequest): Promise<NumberedPage<EnvironmentOperation>> {
    return this.repository.operations(memberId, id, page);
  }

  async report(memberId: string, id: string, body: unknown): Promise<EnvironmentReportResult> {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalidInput();
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["eventId", "runtimeId", "generation", "eventIndex", "event"].includes(key))) throw invalidInput();
    if (typeof input.event !== "string" || !["started", "restored", "paused", "resumed", "checkpoint_saved", "stopped", "failed"].includes(input.event)) throw invalidInput();
    const fields = {
      eventId: boundedId(input.eventId), runtimeId: boundedId(input.runtimeId),
      generation: expectedVersion(input.generation), eventIndex: expectedVersion(input.eventIndex), event: input.event as EnvironmentLifecycleEvent,
    };
    return this.repository.report({ memberId,
      requestHash: await hashRequest({ kind: "environment.lifecycle", memberId, id, ...fields }),
      event: { ...fields, environmentId: id, receivedAt: new Date().toISOString() },
    });
  }

  tombstones(memberId: string, page: NumberedPageRequest) {
    return this.repository.tombstones(memberId, page);
  }

  list(memberId: string, query: EnvironmentListQuery): Promise<NumberedPage<EnvironmentMetadata>> {
    return this.repository.list(memberId, query);
  }
}

export function parseEnvironmentType(value: unknown): EnvironmentType {
  if (value !== "personal" && value !== "temporary") throw invalidInput();
  return value;
}

function boundedId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) throw invalidInput();
  return value;
}

function invalidInput(): AppError {
  return new AppError("ENVIRONMENT_INPUT_INVALID", "Environment input is invalid", 400);
}

function mutationInput(body: unknown, fields: string[]): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalidInput();
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["operationId", "version", ...fields].includes(key))) throw invalidInput();
  return input;
}

function normalizedName(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) throw invalidInput();
  const name = value.trim();
  if (!name || Array.from(name).length > 120 || /[\u0000-\u001f\u007f]/u.test(name)) throw invalidInput();
  return name;
}

function expectedVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) throw invalidInput();
  return value;
}

async function hashRequest(value: Record<string, unknown>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
