export type CaptureSuggestionKind = "task" | "knowledge" | "note";
export type CaptureSuggestionStatus = "suggested" | "accepted" | "dismissed";
export interface CaptureClassification { id: string; memberId: string; inboxId: string; suggestedKind: CaptureSuggestionKind; confidence: number; rationale: string; status: CaptureSuggestionStatus; createdAt: string; updatedAt: string; }
