import { AppError } from "../http";
import type { ChatScope, LibraryScope } from "../library/types";

export interface ChatConversation {
  id: string;
  ownerMemberId: string;
  scope: ChatScope;
  createdAt: string;
  updatedAt: string;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
  citationIds: string[];
}

export interface ChatConversationRepository {
  create(input: { id: string; ownerMemberId: string; scope: ChatScope; now: string }): Promise<ChatConversation>;
  find(ownerMemberId: string, id: string): Promise<ChatConversation | null>;
  updateScope(ownerMemberId: string, conversationId: string, scope: ChatScope, now: string): Promise<ChatConversation | null>;
  startTurn(ownerMemberId: string, conversationId: string, turnId: string, now: string): Promise<string | "busy" | null>;
  requestCancel(ownerMemberId: string, conversationId: string, now: string): Promise<boolean>;
  isCancelled(ownerMemberId: string, conversationId: string, turnId: string): Promise<boolean>;
  finishTurn(ownerMemberId: string, conversationId: string, turnId: string, now: string): Promise<void>;
  listMessages(ownerMemberId: string, conversationId: string): Promise<ChatHistoryMessage[]>;
  append(input: { ownerMemberId: string; conversationId: string; turnId?: string; question: string; answer: string; citationIds: string[]; now: string }): Promise<void>;
}

export interface ChatConversationServiceOptions {
  now?: () => string;
  id?: () => string;
}

const MAX_HISTORY_MESSAGES = 8;

export class ChatConversationService {
  private readonly now: () => string;
  private readonly id: () => string;

  constructor(private readonly repository: ChatConversationRepository, options: ChatConversationServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  async ensure(scope: LibraryScope, conversationId: string | undefined, requestedScope: ChatScope): Promise<ChatConversation> {
    if (conversationId === undefined) {
      return this.repository.create({ id: this.id(), ownerMemberId: scope.memberId, scope: requestedScope, now: this.now() });
    }
    const conversation = await this.repository.find(scope.memberId, conversationId);
    if (!conversation) throw new AppError("CHAT_CONVERSATION_NOT_FOUND", "Chat conversation was not found", 404);
    if (!sameScope(conversation.scope, requestedScope)) {
      throw new AppError("CHAT_CONVERSATION_SCOPE_MISMATCH", "Chat conversation scope cannot be changed", 409);
    }
    return conversation;
  }

  async history(scope: LibraryScope, conversationId: string): Promise<ChatHistoryMessage[]> {
    const conversation = await this.repository.find(scope.memberId, conversationId);
    if (!conversation) throw new AppError("CHAT_CONVERSATION_NOT_FOUND", "Chat conversation was not found", 404);
    const messages = await this.repository.listMessages(scope.memberId, conversationId);
    return messages.slice(-MAX_HISTORY_MESSAGES);
  }

  async updateScope(scope: LibraryScope, conversationId: string, requestedScope: ChatScope): Promise<ChatConversation> {
    const updated = await this.repository.updateScope(scope.memberId, conversationId, requestedScope, this.now());
    if (!updated) throw new AppError("CHAT_CONVERSATION_NOT_FOUND", "Chat conversation was not found", 404);
    return updated;
  }

  async appendTurn(scope: LibraryScope, conversationId: string, input: { turnId?: string; question: string; answer: string; citationIds: string[] }): Promise<void> {
    const conversation = await this.repository.find(scope.memberId, conversationId);
    if (!conversation) throw new AppError("CHAT_CONVERSATION_NOT_FOUND", "Chat conversation was not found", 404);
    await this.repository.append({ ...input, ownerMemberId: scope.memberId, conversationId, now: this.now() });
  }

  async startTurn(scope: LibraryScope, conversationId: string, turnId: string): Promise<string> {
    const started = await this.repository.startTurn(scope.memberId, conversationId, turnId, this.now());
    if (!started) throw new AppError("CHAT_CONVERSATION_NOT_FOUND", "Chat conversation was not found", 404);
    if (started === "busy") throw new AppError("CHAT_GENERATION_IN_PROGRESS", "Chat generation is already running", 409, true);
    return started;
  }

  async cancel(scope: LibraryScope, conversationId: string): Promise<boolean> {
    return this.repository.requestCancel(scope.memberId, conversationId, this.now());
  }

  async isCancelled(scope: LibraryScope, conversationId: string, turnId: string): Promise<boolean> {
    return this.repository.isCancelled(scope.memberId, conversationId, turnId);
  }

  async finishTurn(scope: LibraryScope, conversationId: string, turnId: string): Promise<void> {
    await this.repository.finishTurn(scope.memberId, conversationId, turnId, this.now());
  }
}

export function sameScope(left: ChatScope, right: ChatScope): boolean {
  return scopeKey(left) === scopeKey(right);
}

function scopeKey(scope: ChatScope): string {
  if (scope.kind === "all") return "all";
  if (scope.kind === "space") return `space:${scope.spaceId}`;
  if (scope.kind === "collection") return `collection:${scope.collectionId}`;
  return `items:${[...scope.knowledgeItemIds].sort().join(",")}`;
}
