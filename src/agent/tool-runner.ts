import { AppError } from "../http";
import type { CreateAuditEvent } from "../audit/types";
import type { Member } from "../members/types";
import type { MembersRepositoryPort } from "../members/repository";

export interface AgentToolContext {
  member: Member;
}

export interface AgentToolDefinition<Args, Result> {
  readonly name: string;
  parse(input: unknown): Args;
  execute(context: AgentToolContext, args: Args): Promise<Result> | Result;
}

const MAX_TOOL_ARGUMENT_BYTES = 16 * 1024;
export const MAX_AGENT_TOOL_STEPS = 8;
const MAX_TOOL_OUTPUT_BYTES = 32 * 1024;

export interface AgentToolCall {
  name: string;
  input: unknown;
}

export interface AgentToolSequenceResult {
  results: unknown[];
  steps: number;
  stopped: boolean;
}

export interface AgentToolModelOutput {
  untrusted: true;
  json: string;
  truncated: boolean;
}

export interface AgentToolAuditPort {
  writeAudit(input: CreateAuditEvent): Promise<unknown>;
}

export interface AgentToolRunnerOptions {
  audit?: AgentToolAuditPort;
  auditId?: () => string;
  now?: () => Date;
}

/**
 * The only entry point for agent tools. The member row is deliberately read
 * on every invocation instead of trusting the session/principal snapshot.
 * This closes the disabled-member window between two long-running turns.
 */
export class AgentToolRunner {
  private readonly tools: ReadonlyMap<string, AgentToolDefinition<unknown, unknown>>;

  constructor(
    private readonly members: Pick<MembersRepositoryPort, "findById">,
    definitions: readonly AgentToolDefinition<unknown, unknown>[],
    private readonly options: AgentToolRunnerOptions = {},
  ) {
    const map = new Map<string, AgentToolDefinition<unknown, unknown>>();
    for (const definition of definitions) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(definition.name) || map.has(definition.name)) {
        throw new TypeError("Agent tool names must be unique and allowlisted");
      }
      map.set(definition.name, definition);
    }
    this.tools = map;
  }

  async run(memberId: string, name: string, input: unknown): Promise<unknown> {
    const member = await this.members.findById(memberId);
    if (!member) throw new AppError("MEMBER_NOT_FOUND", "Member not found", 404);
    if (member.status !== "active") throw new AppError("MEMBER_DISABLED", "Member access is disabled", 403);

    const tool = this.tools.get(name);
    if (!tool) throw new AppError("AGENT_TOOL_NOT_FOUND", "Agent tool was not found", 404);

    try {
      if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_TOOL_ARGUMENT_BYTES) {
        throw new AppError("AGENT_TOOL_ARGUMENTS_INVALID", "Agent tool arguments are invalid", 400);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("AGENT_TOOL_ARGUMENTS_INVALID", "Agent tool arguments are invalid", 400);
    }

    let args: unknown;
    try {
      args = tool.parse(input);
    } catch {
      throw new AppError("AGENT_TOOL_ARGUMENTS_INVALID", "Agent tool arguments are invalid", 400);
    }
    if (this.options.audit) await this.options.audit.writeAudit(this.createToolAudit(member.id, name, args));
    return tool.execute({ member }, args);
  }

  private createToolAudit(memberId: string, tool: string, args: unknown): CreateAuditEvent {
    const resourceIds = extractResourceIds(args);
    return {
      id: this.options.auditId?.() ?? crypto.randomUUID(),
      actorKind: "member",
      actorId: memberId,
      action: "agent.tool_called",
      resourceType: "agent_tool",
      resourceId: resourceIds[0] ?? null,
      metadata: { tool, resourceIds },
      createdAt: (this.options.now?.() ?? new Date()).toISOString(),
    };
  }

  async runSequence(
    memberId: string,
    calls: readonly AgentToolCall[],
    options: { maxSteps?: number; onLimit?: (results: readonly unknown[]) => Promise<void> | void } = {},
  ): Promise<AgentToolSequenceResult> {
    const maxSteps = options.maxSteps ?? MAX_AGENT_TOOL_STEPS;
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_AGENT_TOOL_STEPS) {
      throw new AppError("AGENT_TOOL_ARGUMENTS_INVALID", "Agent tool arguments are invalid", 400);
    }
    const results: unknown[] = [];
    for (const call of calls.slice(0, maxSteps)) results.push(await this.run(memberId, call.name, call.input));
    const stopped = calls.length > maxSteps;
    if (stopped) await options.onLimit?.(results);
    return { results, steps: results.length, stopped };
  }

  async runForModel(memberId: string, name: string, input: unknown): Promise<AgentToolModelOutput> {
    return serializeAgentToolOutput(await this.run(memberId, name, input));
  }
}

const RESOURCE_ID_KEYS = new Set([
  "knowledgeItemId", "revisionId", "fromRevisionId", "toRevisionId", "sourceVersionId",
  "reportId", "researchRunId", "requestedSpaceId", "requestedCollectionId",
]);

function extractResourceIds(args: unknown): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  const record = args as Record<string, unknown>;
  const ids: string[] = [];
  for (const key of RESOURCE_ID_KEYS) {
    const value = record[key];
    if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value) && !ids.includes(value)) ids.push(value);
    if (ids.length === 8) break;
  }
  return ids;
}

export function serializeAgentToolOutput(value: unknown, maxBytes = MAX_TOOL_OUTPUT_BYTES): AgentToolModelOutput {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256 || maxBytes > MAX_TOOL_OUTPUT_BYTES) {
    throw new RangeError("Invalid tool output limit");
  }
  let json: string;
  try {
    json = JSON.stringify(value) ?? "null";
  } catch {
    json = JSON.stringify({ truncated: true, reason: "TOOL_OUTPUT_UNSERIALIZABLE" });
    return { untrusted: true, json, truncated: true };
  }
  if (new TextEncoder().encode(json).byteLength <= maxBytes) return { untrusted: true, json, truncated: false };
  return {
    untrusted: true,
    json: JSON.stringify({ truncated: true, reason: "TOOL_OUTPUT_LIMIT" }),
    truncated: true,
  };
}
