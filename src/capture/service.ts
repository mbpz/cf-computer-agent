import { AppError } from "../http";
import type { InboxService } from "../inbox/service";
import type { CaptureRepositoryPort } from "./repository";
import type { CaptureClassification, CaptureSuggestionKind } from "./types";

export class CaptureClassificationService {
  constructor(private readonly repository: CaptureRepositoryPort, private readonly inbox: InboxService, private readonly now: () => Date = () => new Date(), private readonly id: () => string = () => crypto.randomUUID()) {}
  async classify(memberId: string, inboxId: string): Promise<CaptureClassification> {
    const item = await this.inbox.get(memberId, inboxId);
    const existing = await this.repository.find(memberId, inboxId);
    if (existing && existing.status === "suggested") return existing;
    const content = `${item.content}\n${item.sourceUrl || ""}`.toLowerCase();
    const suggestedKind: CaptureSuggestionKind = /todo|task|截止|完成|修复|implement|fix/u.test(content) ? "task" : /http:\/\/|https:\/\/|参考|文档|article|guide/u.test(content) ? "knowledge" : "note";
    const confidence = suggestedKind === "note" ? 55 : 82;
    const rationale = suggestedKind === "task" ? "Contains action-oriented language" : suggestedKind === "knowledge" ? "Contains a source or reference signal" : "No strong promotion signal";
    const now = this.now().getTime();
    return this.repository.upsert({ id: existing?.id || `capture:${memberId}:${inboxId}`, memberId, inboxId, suggestedKind, confidence, rationale, status: "suggested", createdAt: existing ? Date.parse(existing.createdAt) : now, updatedAt: now });
  }
  async dismiss(memberId: string, inboxId: string): Promise<CaptureClassification> { const current = await this.classify(memberId, inboxId); return this.repository.upsert({ id: current.id, memberId, inboxId, suggestedKind: current.suggestedKind, confidence: current.confidence, rationale: current.rationale, status: "dismissed", createdAt: Date.parse(current.createdAt), updatedAt: this.now().getTime() }); }
}
