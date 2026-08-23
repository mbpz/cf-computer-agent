export interface RouteGuard {
  begin(): number;
  capture(pathname: string): Readonly<{ generation: number; pathname: string }>;
  owner(routeGeneration: number, pathname: string): Readonly<{ generation: number; pathname: string }>;
  isCurrent(value: number): boolean;
  owns(owner: Readonly<{ generation: number; pathname: string }>, pathname: string): boolean;
}

export function configureWorkspaceI18n(
  translate: (key: string, values?: Readonly<Record<string, string | number>>) => string,
): void;

export function createRouteGuard(): RouteGuard;
export interface OperationGuard {
  begin(): number;
  isCurrent(value: number): boolean;
}
export function createOperationGuard(): OperationGuard;
export function createLocaleRefreshController(
  initialLocale: string,
  callbacks: {
    applyLocale(locale: string): void;
    refreshTranslations(): void;
  },
): Readonly<{ apply(locale: string): boolean }>;
export interface ReplaceableOwner {
  claim(): () => boolean;
}
export function createReplaceableOwner(owns: () => boolean): ReplaceableOwner;
export function runLatestOperation<T>(
  guard: OperationGuard,
  operation: () => Promise<T>,
  onSuccess: (value: T) => void,
  onError: (error: unknown) => void,
  owns?: () => boolean,
): Promise<void>;
export interface OwnedActionController {
  run(): boolean;
  invalidate(): void;
  canReturnFocus(): boolean;
}
export function createOwnedActionController(owns: () => boolean, action: () => void): OwnedActionController;
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
  label: string;
}>;
export function drawerStateForViewport(mobile: boolean, open: boolean): ReturnType<typeof drawerState>;
export function anonymousShellState(): Readonly<{
  statusMessage: "";
  drawer: ReturnType<typeof drawerState>;
}>;
export function shellControlsModel(): Readonly<{ placement: "topbar-right"; mobile: "topbar-right" }>;
export function shellPresentationModel(): Readonly<{
  theme: "ink-garden";
  density: "comfortable";
  navigation: "grouped";
  context: "secondary";
}>;
export function contentLayoutModel(contextVisible: boolean): Readonly<{
  className: "content-layout has-context" | "content-layout full-width";
}>;
export function contextualPanelModel(items: unknown): Readonly<{
  visible: boolean;
  items: ReadonlyArray<Readonly<{ label: string; value: string }>>;
}>;
export function compactChildren<T>(...children: Array<T | null | undefined | false>): T[];
export function displayValue(value: unknown, fallback?: string): string;
export function displayDate(value: unknown, locale?: string, fallback?: string): string;
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
export interface ReviewTagSelectorState {
  items: Array<Readonly<{ id: string; name: string; selected: boolean }>>;
  nextCursor?: string;
  pending: boolean;
  loaded: boolean;
  error: string;
}
export interface ReviewTagController {
  loadInitial(): Promise<void>;
  loadMore(): Promise<void>;
  select(tagId: string, selected: boolean): void;
  snapshot(): Readonly<ReviewTagSelectorState>;
}
export function createReviewTagController(options: {
  spaceId: string;
  owns: () => boolean;
  request: (path: string) => Promise<unknown>;
  onChange: (state: Readonly<ReviewTagSelectorState>) => void;
}): ReviewTagController;
export function reviewTagLoadMoreModel(value: unknown): Readonly<{
  visible: boolean;
  label: string;
  accessibleName: string;
  disabled: boolean;
}>;
export type OptionPageResource = "spaces" | "collections" | "tags";
export interface OptionPageItem { id: string; name: string }
export interface OptionPageState {
  items: Array<Readonly<OptionPageItem>>;
  nextCursor?: string;
  pending: boolean;
  loaded: boolean;
  error: string;
}
export interface OptionPageController {
  loadInitial(): Promise<void>;
  loadMore(): Promise<void>;
  snapshot(): Readonly<OptionPageState>;
}
export function createOptionPageController(options: {
  resource: OptionPageResource;
  spaceId?: string;
  writableOnly?: boolean;
  owns: () => boolean;
  request: (path: string) => Promise<unknown>;
  onChange: (state: Readonly<OptionPageState>) => void;
}): OptionPageController;
export interface AdminSpacePageItem {
  id: string;
  slug: string;
  name: string;
  kind: "shared" | "legacy";
  status: "active" | "disabled";
  readOnly: boolean;
}
export interface AdminCollectionPageItem {
  id: string;
  spaceId: string;
  name: string;
  status: "active" | "disabled";
}
export interface AdminCollectionPageState extends OptionPageState {
  spaceId: string;
  items: Array<Readonly<AdminCollectionPageItem>>;
}
export interface AdminSpacesRouteState {
  spaces: Array<Readonly<AdminSpacePageItem>>;
  collectionPages: Array<Readonly<AdminCollectionPageState>>;
  nextCursor?: string;
  pending: boolean;
  loaded: boolean;
  error: string;
}
export interface AdminSpacesRouteController {
  loadInitial(): Promise<void>;
  loadMoreSpaces(): Promise<void>;
  loadMoreCollections(spaceId: string): Promise<void>;
  snapshot(): Readonly<AdminSpacesRouteState>;
}
export function createAdminSpacesRouteController(options: {
  owns: () => boolean;
  request: (path: string) => Promise<unknown>;
  onChange: (state: Readonly<AdminSpacesRouteState>) => void;
}): AdminSpacesRouteController;
export function optionLoadMoreModel(value: unknown, label: string): Readonly<{
  visible: boolean;
  label: string;
  accessibleName: string;
  disabled: boolean;
}>;

export interface KnowledgeListViewItem {
  id: string;
  title: string;
  href: string;
  revisionId: string;
  visibility: "shared" | "admin_only";
  visibilityLabel: string;
  searchStatus: "pending" | "indexed" | "search_degraded" | "failed";
  tagIds: string[];
  publishedAt: string;
  updatedAt: string;
}
export interface KnowledgeListViewModel {
  items: KnowledgeListViewItem[];
  nextCursor?: string;
}
export function knowledgeListModel(value: unknown): Readonly<KnowledgeListViewModel>;
export interface ChatItemPageState {
  items: KnowledgeListViewItem[];
  nextCursor?: string;
  pending: boolean;
  loaded: boolean;
  error: string;
}
export function createChatItemPageController(options: {
  owns: () => boolean;
  request: (path: string) => Promise<unknown>;
  onChange: (state: Readonly<ChatItemPageState>) => void;
}): Readonly<{
  loadInitial: () => Promise<unknown>;
  loadMore: () => Promise<unknown>;
  snapshot: () => Readonly<ChatItemPageState>;
}>;
export function chatScopeSummaryModel(scopeLabel: string, complete: boolean): string;

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
  matchedFields: Array<"title" | "summary" | "tags" | "body" | "code">;
  matchedFieldLabels: string[];
  highlights: Array<Readonly<{ start: number; end: number }>>;
  highlightSegments: Array<Readonly<{ text: string; highlighted: boolean }>>;
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
  requestedVisibility: "shared" | "admin_only";
  kind: string;
  title: string;
  rawInput: string;
  normalizedMarkdown: string;
  parserVersion: string;
  chunks: Array<Readonly<{
    heading: string;
    startLine: number;
    endLine: number;
    lineLabel: string;
    excerpt: string;
  }>>;
  warnings: string[];
}
export function reviewPreviewModel(value: unknown): Readonly<ReviewPreviewViewModel>;
export interface ReviewTargetViewModel {
  spaceId: string;
  spaceLabel: string;
  collectionId: string | null;
  collectionLabel: string;
  tagSpaceId: string;
  available: boolean;
}
export function reviewTargetModel(value: unknown): Readonly<ReviewTargetViewModel>;

export interface KnowledgeReaderViewModel {
  knowledgeItemId: string;
  title: string;
  visibility: "shared" | "admin_only";
  visibilityLabel: "Shared" | "Admin only";
  revisionId: string;
  isCurrent: boolean;
  revisionLabel: string;
  sourceVersionId: string;
  reviewerId: string;
  sourceVersionOrdinal: number | null;
  parserSchemaVersion: "m1-v1" | "m1-v2" | null;
  codeMetadata: Readonly<{ language: string; fileLabel: string; lineBaseline: number }> | null;
  indexStatus: "pending" | "indexed" | "search_degraded" | "failed";
  searchStatus: "pending" | "indexed" | "search_degraded" | "failed";
  downloadHref: string;
  publishedAt: string;
  markdown: string;
  tagIds: string[];
  focusedChunkId: string;
  outline: Array<Readonly<{ id: string; label: string; lineLabel: string; focused: boolean; href: string }>>;
  sources: Array<Readonly<{ id: string; citationId: string; label: string; href: string }>>;
}
export function knowledgeReaderModel(value: unknown, location?: unknown): Readonly<KnowledgeReaderViewModel>;
export function knowledgeReaderRequest(knowledgeItemId: string, revisionId?: string): Readonly<{
  path: string;
  responseKey: "knowledge" | "revision";
}>;
export function knowledgeDownloadRequest(knowledgeItemId: string, revisionId: string): string;

export interface CitedAnswerViewModel {
  answer: string;
  sources: Array<KnowledgeSearchViewItem & Readonly<{ number: number; accessibleName: string; href: string }>>;
  evidenceConfidence: number;
  messageKey: "" | "KNOWLEDGE_EVIDENCE_INSUFFICIENT";
  suggestedActionKeys: Array<"KNOWLEDGE_CHAT_REWRITE_QUESTION" | "KNOWLEDGE_CHAT_EXPAND_SCOPE">;
}
export function citedAnswerModel(value: unknown): Readonly<CitedAnswerViewModel>;
export function chatScopeControlsModel(value: unknown): Readonly<{
  selectedKind: "all" | "space" | "collection" | "items";
  maxSelectedItems: 8;
  options: ReadonlyArray<Readonly<{
    kind: "all" | "space" | "collection" | "items";
    labelKey:
      | "KNOWLEDGE_CHAT_SCOPE_ALL"
      | "KNOWLEDGE_CHAT_SCOPE_SPACE"
      | "KNOWLEDGE_CHAT_SCOPE_COLLECTION"
      | "KNOWLEDGE_CHAT_SCOPE_ITEMS";
  }>>;
}>;
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
export function resubmissionRequest(priorSubmissionId: string, value: unknown, idempotencyKey: string): Readonly<BrowserApiRequest>;
export function publishRequest(submissionId: string, value: unknown): Readonly<BrowserApiRequest>;
export function chatRequest(value: unknown): Readonly<BrowserApiRequest>;
export function knowledgeQuery(path: "/api/knowledge" | "/api/knowledge/search" | string, value: unknown): string;
