export interface RouteGuard {
  begin(): number;
  capture(pathname: string): Readonly<{ generation: number; pathname: string }>;
  owner(routeGeneration: number, pathname: string): Readonly<{ generation: number; pathname: string }>;
  isCurrent(value: number): boolean;
  owns(owner: Readonly<{ generation: number; pathname: string }>, pathname: string): boolean;
}

export function createRouteGuard(): RouteGuard;
export interface OperationGuard {
  begin(): number;
  isCurrent(value: number): boolean;
}
export function createOperationGuard(): OperationGuard;
export function runLatestOperation<T>(
  guard: OperationGuard,
  operation: () => Promise<T>,
  onSuccess: (value: T) => void,
  onError: (error: unknown) => void,
): Promise<void>;
export interface LogoutController {
  run(): Promise<void>;
  invalidate(): void;
}
export function createLogoutController(
  request: (path: string, init: RequestInit) => Promise<Response>,
  callbacks: {
    onPendingChange(pending: boolean): void;
    onSuccess(): void;
    onError(error: unknown): void;
  },
): LogoutController;
export function drawerState(open: boolean): Readonly<{
  open: boolean;
  ariaExpanded: "true" | "false";
  ariaHidden: "true" | "false";
  inert: boolean;
  label: "Open navigation" | "Close navigation";
}>;
export function drawerStateForViewport(mobile: boolean, open: boolean): ReturnType<typeof drawerState>;
export function anonymousShellState(): Readonly<{
  statusMessage: "";
  drawer: ReturnType<typeof drawerState>;
}>;
export function sessionBootstrapState(
  status: number,
  session?: BrowserSession,
): Readonly<{ kind: "anonymous" } | { kind: "authenticated"; session: BrowserSession } | { kind: "error" }>;
export function postLogout(
  request: (path: string, init: RequestInit) => Promise<Response>,
): Promise<Readonly<{ kind: "anonymous" }>>;

export type RouteStateKind = "loading" | "empty" | "error" | "forbidden" | "degraded";
export function routeState(kind: RouteStateKind | string, value: unknown): Readonly<{ kind: string; message: string }>;
export function appendPage<T>(current: readonly T[], incoming: readonly T[], key: (item: T) => string): T[];
export interface MutationController {
  run<T>(
    operation: () => Promise<T> | T,
    onSuccess: (value: T) => void,
    onError: (error: unknown) => void,
  ): Promise<void>;
}
export function createMutationController(
  owns: () => boolean,
  onPendingChange: (pending: boolean) => void,
): MutationController;

export interface KnowledgeListViewItem {
  id: string;
  title: string;
  href: string;
  revisionId: string;
  visibility: "shared" | "admin_only";
  visibilityLabel: "Shared" | "Admin only";
  searchStatus: "pending" | "indexed" | "search_degraded";
  tagIds: string[];
  publishedAt: string;
  updatedAt: string;
}
export interface KnowledgeListViewModel {
  items: KnowledgeListViewItem[];
  nextCursor?: string;
}
export function knowledgeListModel(value: unknown): Readonly<KnowledgeListViewModel>;

export interface KnowledgeSearchViewItem {
  citationId: string;
  knowledgeItemId: string;
  revisionId: string;
  chunkId: string;
  title: string;
  headingPath: string[];
  startLine: number;
  endLine: number;
  location: string;
  excerpt: string;
  publishedAt: string;
  citationHref: string;
}
export interface KnowledgeSearchViewModel {
  items: KnowledgeSearchViewItem[];
  degraded: boolean;
  nextCursor?: string;
}
export function knowledgeSearchModel(value: unknown): Readonly<KnowledgeSearchViewModel>;
export function renderKnowledgeSearch(value: unknown): string;

export interface ReviewPreviewViewModel {
  submissionId: string;
  status: string;
  requestedSpaceId: string;
  requestedCollectionId: string | null;
  kind: string;
  title: string;
  rawInput: string;
  normalizedMarkdown: string;
  parserVersion: string;
  locations: Array<Readonly<{ heading: string; startLine: number }>>;
  warnings: string[];
}
export function reviewPreviewModel(value: unknown): Readonly<ReviewPreviewViewModel>;

export interface KnowledgeReaderViewModel {
  knowledgeItemId: string;
  title: string;
  visibility: "shared" | "admin_only";
  visibilityLabel: "Shared" | "Admin only";
  revisionId: string;
  revisionLabel: string;
  publishedAt: string;
  markdown: string;
  tagIds: string[];
  focusedChunkId: string;
  outline: Array<Readonly<{ id: string; label: string; lineLabel: string; focused: boolean; href: string }>>;
  sources: Array<Readonly<{ id: string; citationId: string; label: string; href: string }>>;
}
export function knowledgeReaderModel(value: unknown, location?: unknown): Readonly<KnowledgeReaderViewModel>;

export interface CitedAnswerViewModel {
  answer: string;
  sources: Array<KnowledgeSearchViewItem & Readonly<{ number: number; accessibleName: string; href: string }>>;
}
export function citedAnswerModel(value: unknown): Readonly<CitedAnswerViewModel>;
export function submissionResultModel(value: unknown): Readonly<{
  kind: "created" | "duplicate";
  message: string;
  submissionId: string;
}>;

export interface BrowserApiRequest {
  path: string;
  init: Readonly<{ method: "POST"; headers?: Readonly<Record<string, string>>; body: string }>;
}
export function submissionRequest(value: unknown, idempotencyKey: string): Readonly<BrowserApiRequest>;
export function publishRequest(submissionId: string, value: unknown): Readonly<BrowserApiRequest>;
export function chatRequest(value: unknown): Readonly<BrowserApiRequest>;
export function knowledgeQuery(path: "/api/knowledge" | "/api/knowledge/search" | string, value: unknown): string;
