import { apiFetch, type Fetcher } from "./api";

export const GRAPH_SUGGESTION_KINDS = ["meeting_to_decision", "decision_to_action_item", "task_to_knowledge"] as const;
export type GraphSuggestionKind = typeof GRAPH_SUGGESTION_KINDS[number];

export interface GraphSuggestion {
  id: string;
  kind: GraphSuggestionKind;
  title: string;
  rationale: string;
  sourceNodeIds: string[];
  targetNodeIds: string[];
  citationIds: string[];
  evidenceGap: boolean;
  promotionRequired: true;
}

export interface GraphSuggestionResult {
  suggestions: GraphSuggestion[];
  messageKey?: "GRAPH_SUGGESTIONS_EVIDENCE_INSUFFICIENT";
}

export async function loadGraphSuggestions(requester: Fetcher = fetch, signal?: AbortSignal): Promise<GraphSuggestionResult> {
  const value = await apiFetch<unknown>("/api/graph/suggestions", { requester, signal });
  if (!isRecord(value) || !Array.isArray(value.suggestions)) throw new Error("GRAPH_SUGGESTIONS_INVALID");
  return {
    suggestions: value.suggestions.map(normalizeSuggestion),
    ...(value.messageKey === "GRAPH_SUGGESTIONS_EVIDENCE_INSUFFICIENT" ? { messageKey: value.messageKey } : {}),
  };
}

function normalizeSuggestion(value: unknown): GraphSuggestion {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id
    || !isSuggestionKind(value.kind)
    || typeof value.title !== "string" || !value.title
    || typeof value.rationale !== "string" || !value.rationale
    || !arrayOfStrings(value.sourceNodeIds) || !arrayOfStrings(value.targetNodeIds)
    || !arrayOfStrings(value.citationIds) || typeof value.evidenceGap !== "boolean"
    || value.promotionRequired !== true) throw new Error("GRAPH_SUGGESTIONS_INVALID");
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    rationale: value.rationale,
    sourceNodeIds: [...new Set(value.sourceNodeIds)],
    targetNodeIds: [...new Set(value.targetNodeIds)],
    citationIds: [...new Set(value.citationIds)],
    evidenceGap: value.evidenceGap,
    promotionRequired: true,
  };
}

function isSuggestionKind(value: unknown): value is GraphSuggestionKind { return typeof value === "string" && (GRAPH_SUGGESTION_KINDS as readonly string[]).includes(value); }
function arrayOfStrings(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
