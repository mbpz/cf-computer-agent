import { AppError } from "../http";
import type { LibraryService } from "../library/service";
import type { LibraryScope, RevisionDetail, SearchPage, SearchRequest } from "../library/types";
import type { RevisionDiffResult } from "../library/revision-diff";
import type { AgentToolDefinition } from "./tool-runner";
import type { SourcesRepository } from "../sources/repository";
import type { SourceConflict } from "../sources/types";

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

export function createReadSourceTool(
  library: LibraryService,
): AgentToolDefinition<unknown, RevisionDetail> {
  return {
    name: "readSource",
    parse: parseReadSourceInput,
    execute: async ({ member }, input) => {
      const { knowledgeItemId, revisionId } = input as { knowledgeItemId: string; revisionId: string };
      return library.revision({ memberId: member.id, role: member.role }, knowledgeItemId, revisionId);
    },
  };
}

export function createCompareSourcesTool(
  library: LibraryService,
): AgentToolDefinition<unknown, RevisionDiffResult> {
  return {
    name: "compareSources",
    parse: parseCompareSourcesInput,
    execute: async ({ member }, input) => {
      const { knowledgeItemId, fromRevisionId, toRevisionId } = input as {
        knowledgeItemId: string;
        fromRevisionId: string;
        toRevisionId: string;
      };
      return library.diff(
        { memberId: member.id, role: member.role },
        knowledgeItemId,
        fromRevisionId,
        toRevisionId,
      );
    },
  };
}

export function createListSourceConflictsTool(
  sources: SourcesRepository,
): AgentToolDefinition<unknown, { items: SourceConflict[] }> {
  return {
    name: "listSourceConflicts",
    parse: parseSourceConflictInput,
    execute: async ({ member }, input) => {
      const { sourceVersionId } = input as { sourceVersionId: string };
      return { items: await sources.listConflicts(sourceVersionId, member.id, 8) };
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

function parseReadSourceInput(value: unknown): unknown {
  if (!isPlainRecord(value)
    || Object.keys(value).length !== 2
    || typeof value.knowledgeItemId !== "string"
    || typeof value.revisionId !== "string"
    || !ID.test(value.knowledgeItemId)
    || !ID.test(value.revisionId)) {
    throw invalidToolInput();
  }
  return { knowledgeItemId: value.knowledgeItemId, revisionId: value.revisionId };
}

function parseCompareSourcesInput(value: unknown): unknown {
  if (!isPlainRecord(value)
    || Object.keys(value).length !== 3
    || typeof value.knowledgeItemId !== "string"
    || typeof value.fromRevisionId !== "string"
    || typeof value.toRevisionId !== "string"
    || !ID.test(value.knowledgeItemId)
    || !ID.test(value.fromRevisionId)
    || !ID.test(value.toRevisionId)
    || value.fromRevisionId === value.toRevisionId) {
    throw invalidToolInput();
  }
  return {
    knowledgeItemId: value.knowledgeItemId,
    fromRevisionId: value.fromRevisionId,
    toRevisionId: value.toRevisionId,
  };
}

function parseSourceConflictInput(value: unknown): unknown {
  if (!isPlainRecord(value)
    || Object.keys(value).length !== 1
    || typeof value.sourceVersionId !== "string"
    || !ID.test(value.sourceVersionId)) {
    throw invalidToolInput();
  }
  return { sourceVersionId: value.sourceVersionId };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidToolInput(): AppError {
  return new AppError("AGENT_TOOL_ARGUMENTS_INVALID", "Agent tool arguments are invalid", 400);
}
