import { AppError } from "../http";
import type { LibraryService } from "../library/service";
import type { LibraryScope, SearchPage, SearchRequest } from "../library/types";
import type { AgentToolDefinition } from "./tool-runner";

const ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/u;

export function createSearchKnowledgeTool(
  library: LibraryService,
): AgentToolDefinition<unknown, SearchPage> {
  return {
    name: "searchKnowledge",
    parse: parseSearchKnowledgeInput,
    execute: async ({ member }, input) => {
      const request = input as SearchRequest;
      const scope: LibraryScope = { memberId: member.id, role: member.role };
      const page = await library.search(scope, request);
      return {
        items: page.items.slice(0, 8),
        degraded: page.degraded,
      };
    },
  };
}

function parseSearchKnowledgeInput(value: unknown): unknown {
  if (!isPlainRecord(value)) throw invalidToolInput();
  const allowed = new Set(["query", "spaceId", "collectionId"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw invalidToolInput();
  if (typeof value.query !== "string" || value.query.trim().length === 0 || [...value.query].length > 4_000 || /[\p{Cc}\p{Cf}]/u.test(value.query)) {
    throw invalidToolInput();
  }
  if (value.spaceId !== undefined && (typeof value.spaceId !== "string" || !ID.test(value.spaceId))) throw invalidToolInput();
  if (value.collectionId !== undefined && (typeof value.collectionId !== "string" || !ID.test(value.collectionId))) throw invalidToolInput();
  return {
    query: value.query,
    ...(value.spaceId === undefined ? {} : { spaceId: value.spaceId }),
    ...(value.collectionId === undefined ? {} : { collectionId: value.collectionId }),
    limit: 8,
  } satisfies SearchRequest;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidToolInput(): AppError {
  return new AppError("AGENT_TOOL_ARGUMENTS_INVALID", "Agent tool arguments are invalid", 400);
}
