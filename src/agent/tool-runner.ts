import { AppError } from "../http";
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
    return tool.execute({ member }, args);
  }
}
