import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./components/shell/app-shell";
import { AdminDashboardPage } from "./pages/admin/admin-dashboard-page";
import { AdminForbiddenPage } from "./pages/admin/admin-forbidden-page";
import { ReviewQueuePage } from "./pages/admin/review-queue-page";
import { ReviewDetailRoute } from "./pages/admin/review-detail-route";
import { AssetQueuePage } from "./pages/admin/asset-queue-page";
import { MembersPage } from "./pages/admin/members-page";
import { SpacesPage } from "./pages/admin/spaces-page";
import { AuditPage } from "./pages/admin/audit-page";
import { AgentPage } from "./pages/agent-page";
import { HomePage } from "./pages/home-page";
import { KnowledgePage } from "./pages/knowledge-page";
import { KnowledgeReaderPage } from "./pages/knowledge-reader-page";
import { SearchPage } from "./pages/search-page";
import { SubmitPage } from "./pages/submit-page";
import { MySubmissionsPage } from "./pages/my-submissions-page";
import { createKnowledgeRequestController, loadRecentKnowledge, type KnowledgePageResult, type RecentKnowledgeItem } from "./lib/knowledge-data";
import { createKnowledgeReaderRequestController, loadKnowledgeBacklinks, loadKnowledgeFavorite, loadKnowledgeRevisionDiff, loadRelatedKnowledge, setKnowledgeFavorite, type KnowledgeBacklinkItem, type KnowledgeRevision, type KnowledgeRevisionDiff, type RelatedKnowledgeItem } from "./lib/knowledge-reader-data";
import { renderSafeMarkdown } from "./lib/markdown-renderer";
import { createSearchRequestController, type SearchPageResult } from "./lib/search-data";
import { createSavedView, deleteSavedView, loadSavedViews, type SavedViewItem } from "./lib/saved-views-data";
import { createAgentRequestController, type AgentAnswer, type AgentScope } from "./lib/agent-data";
import { createSubmission } from "./lib/submission-data";
import { createMySubmissionsRequestController, type MySubmissionItem } from "./lib/my-submissions-data";
import { createReviewQueueRequestController, type ReviewQueueItem } from "./lib/admin-review-data";
import { createAdminMembersRequestController, updateMemberStatus, type AdminMember } from "./lib/admin-members-data";
import { createAdminSpace, loadAdminSpaces, type AdminSpace } from "./lib/admin-spaces-data";
import { createAdminAuditRequestController, type AdminAuditEvent } from "./lib/admin-audit-data";
import { createAdminAssetsRequestController, loadAdminAssets, loadAdminAssetPreview, retryAdminAsset, type AdminAsset } from "./lib/admin-assets-data";
import type { AssetPreviewModel } from "./components/assets/asset-preview-model";
import { loadReviewDetail, submitReviewDecision, type ReviewDecision } from "./components/review/review-detail-data";
import type { SubmissionDraft } from "./components/submissions/submission-form-model";
import { postLogout } from "./lib/logout";
import { createLocaleRuntime, frontendText, type LocaleRuntime } from "./lib/i18n";
import { sessionSnapshot } from "./lib/session";
import { pageKindForPath } from "./app-routes";

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [session, setSession] = useState<Awaited<ReturnType<typeof sessionSnapshot>> | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [localeTick, setLocaleTick] = useState(0);
  const locale = useMemo(() => createLocaleRuntime({ navigatorLanguage: navigator.language, storage: window.localStorage }), []);
  useEffect(() => locale.subscribe(() => setLocaleTick((tick) => tick + 1)), [locale]);
  void localeTick;

  useEffect(() => {
    let active = true;
    sessionSnapshot().then((value) => { if (active) setSession(value); }).catch((error: unknown) => { if (active) setSessionError(error instanceof Error ? error.message : "SESSION_UNAVAILABLE"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (sessionError) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">{frontendText(locale, "APP_SIGN_IN_REQUIRED")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "APP_SIGN_IN_DESCRIPTION")}</p><a className="mt-6 inline-flex text-sm font-medium text-primary hover:underline" href="/auth/github">{frontendText(locale, "APP_SIGN_IN_GITHUB")}</a></main>;
  if (!session) return <main aria-busy="true" className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">{frontendText(locale, "APP_LOADING_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "APP_LOADING_DESCRIPTION")}</p></main>;

  const navigate = (path: string) => { window.history.pushState({}, "", path); setPathname(path); };
  const logout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError(null);
    try {
      await postLogout(session.logoutUrl);
      // Return to the anonymous shell. Starting OAuth here would immediately
      // sign the user back in when GitHub still has an active browser session.
      window.location.href = "/";
    } catch {
      setLogoutError(frontendText(locale, "SHELL_LOGOUT_FAILED"));
      setLogoutPending(false);
    }
  };
  const kind = pageKindForPath(pathname);
  const page = renderPage(kind, pathname, locale, window.location.search);
  return <AppShell session={session} pathname={pathname} locale={locale} onNavigate={navigate} onLogout={logout} logoutPending={logoutPending} logoutError={logoutError}>{page}</AppShell>;
}

function renderPage(kind: ReturnType<typeof pageKindForPath>, pathname: string, locale: LocaleRuntime, search = "") {
  switch (kind) {
    case "home": return <HomePage locale={locale} state={{ kind: "ready", total: 0, pending: 0, published: 0 }} />;
    case "knowledge": return <KnowledgeRoute locale={locale} />;
    case "knowledge-reader": return <KnowledgeReaderRoute locale={locale} knowledgeItemId={decodeRouteId(pathname)} />;
    case "search": return <SearchRoute locale={locale} />;
    case "agent": return <AgentRoute locale={locale} search={search} />;
    case "submit": return <SubmitRoute locale={locale} />;
    case "my-submissions": return <MySubmissionsRoute locale={locale} />;
    case "admin": return <AdminDashboardPage locale={locale} metrics={{ pending: 0, assets: 0, members: 0 }} />;
    case "admin-submissions": return <ReviewQueueRoute locale={locale} />;
    case "admin-submission-detail": return <ReviewDetailRoute locale={locale} id={pathname.split("/").pop() || ""} />;
    case "admin-assets": return <AdminAssetsRoute locale={locale} />;
    case "admin-members": return <AdminMembersRoute locale={locale} />;
    case "admin-spaces": return <AdminSpacesRoute locale={locale} />;
    case "admin-audit": return <AdminAuditRoute locale={locale} />;
    case "not-found": return <NotFoundPage locale={locale} />;
    default: return <AdminForbiddenPage />;
  }
}

function decodeRouteId(pathname: string): string {
  const value = pathname.split("/").pop() || "";
  try { return decodeURIComponent(value); } catch { return ""; }
}

function KnowledgeReaderRoute({ locale, knowledgeItemId }: { locale: LocaleRuntime; knowledgeItemId: string }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; revision: KnowledgeRevision } | { kind: "error"; message: string }>({ kind: "loading" });
  const [diffState, setDiffState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "ready"; diff: KnowledgeRevisionDiff } | { kind: "error" }>({ kind: "idle" });
  const [relatedState, setRelatedState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "ready"; items: readonly RelatedKnowledgeItem[] } | { kind: "error" }>({ kind: "idle" });
  const [backlinkState, setBacklinkState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "ready"; items: readonly KnowledgeBacklinkItem[] } | { kind: "error" }>({ kind: "idle" });
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [retry, setRetry] = useState(0);
  const diffGeneration = useRef(0);
  useEffect(() => {
    const controller = createKnowledgeReaderRequestController();
    const routeGeneration = ++diffGeneration.current;
    const request = controller.request(knowledgeItemId);
    setState({ kind: "loading" });
    setDiffState({ kind: "idle" });
    setRelatedState({ kind: "idle" });
    setBacklinkState({ kind: "idle" });
    setFavorite(null);
    void request.promise.then(({ generation, revision }) => {
      if (controller.isCurrent(generation)) {
        setState({ kind: "ready", revision });
        setRelatedState({ kind: "loading" });
        setBacklinkState({ kind: "loading" });
        void loadKnowledgeFavorite(knowledgeItemId).then((value) => {
          if (diffGeneration.current === routeGeneration && controller.isCurrent(generation)) setFavorite(value);
        }).catch(() => {
          if (diffGeneration.current === routeGeneration && controller.isCurrent(generation)) setFavorite(false);
        });
        void loadRelatedKnowledge(knowledgeItemId).then((items) => {
          if (diffGeneration.current === routeGeneration && controller.isCurrent(generation)) setRelatedState({ kind: "ready", items });
        }).catch(() => {
          if (diffGeneration.current === routeGeneration && controller.isCurrent(generation)) setRelatedState({ kind: "error" });
        });
        void loadKnowledgeBacklinks(knowledgeItemId).then((items) => {
          if (diffGeneration.current === routeGeneration && controller.isCurrent(generation)) setBacklinkState({ kind: "ready", items });
        }).catch(() => {
          if (diffGeneration.current === routeGeneration && controller.isCurrent(generation)) setBacklinkState({ kind: "error" });
        });
      }
    }).catch((error: unknown) => {
      if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) {
        setState({ kind: "error", message: frontendText(locale, "KNOWLEDGE_READER_ERROR") });
      }
    });
    return () => { controller.cancel(); if (diffGeneration.current === routeGeneration) diffGeneration.current += 1; };
  }, [knowledgeItemId, locale, retry]);
  const showDiff = async () => {
    if (state.kind !== "ready" || !state.revision.previousRevisionId || diffState.kind === "loading") return;
    const generation = diffGeneration.current;
    setDiffState({ kind: "loading" });
    try {
      const diff = await loadKnowledgeRevisionDiff(knowledgeItemId, state.revision.previousRevisionId, state.revision.id);
      if (diffGeneration.current === generation) setDiffState({ kind: "ready", diff });
    } catch {
      if (diffGeneration.current === generation) setDiffState({ kind: "error" });
    }
  };
  if (state.kind !== "ready") {
      return <KnowledgeReaderPage locale={locale} state={state.kind === "loading" ? state : { kind: "error", message: state.message }} revision={{ id: "", knowledgeItemId: "", markdown: "", isCurrent: false, previousRevisionId: null, sourceVersionId: "", sourceVersionOrdinal: null, parserSchemaVersion: null, indexStatus: "pending", chunks: [] }} renderMarkdown={renderSafeMarkdown} onRetry={() => setRetry((value) => value + 1)} />;
  }
  const toggleFavorite = async () => {
    if (favorite === null) return;
    const next = !favorite;
    setFavorite(next);
    try { await setKnowledgeFavorite(knowledgeItemId, next); } catch { setFavorite(!next); }
  };
  return <KnowledgeReaderPage locale={locale} state={{ kind: "ready" }} revision={state.revision} renderMarkdown={renderSafeMarkdown} diffState={diffState} onCompare={showDiff} relatedState={relatedState} backlinkState={backlinkState} favorite={favorite} onToggleFavorite={toggleFavorite} />;
}

function NotFoundPage({ locale }: { locale: LocaleRuntime }) {
  return <section className="mx-auto max-w-xl py-16"><h1 className="text-2xl font-semibold">{frontendText(locale, "PAGE_NOT_FOUND_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "PAGE_NOT_FOUND_DESCRIPTION")}</p><a className="mt-6 inline-flex text-sm font-medium text-primary hover:underline" href="/">{frontendText(locale, "PAGE_RETURN_HOME")}</a></section>;
}

function KnowledgeRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: readonly { id: string; title?: string; summary?: string; publishedAt?: string; tags?: string[] }[]; nextCursor: string | null; pending?: boolean } | { kind: "error"; message: string }>({ kind: "loading" });
  const controllerRef = useRef<ReturnType<typeof createKnowledgeRequestController> | null>(null);
  const [recent, setRecent] = useState<RecentKnowledgeItem[]>([]);
  const mergePage = useCallback((page: KnowledgePageResult, append: boolean) => {
    setState((previous) => ({
      kind: "ready",
      items: append && previous.kind === "ready" ? [...previous.items, ...page.items] : page.items,
      nextCursor: page.nextCursor,
      pending: false,
    }));
  }, []);
  useEffect(() => {
    let active = true;
    void loadRecentKnowledge().then((items) => { if (active) setRecent(items); }).catch(() => { if (active) setRecent([]); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const controller = createKnowledgeRequestController();
    controllerRef.current = controller;
    const first = controller.request(null);
    void first.promise.then(({ generation, page }) => {
      if (controller.isCurrent(generation)) mergePage(page, false);
    }).catch((error: unknown) => {
      if (controller.isCurrent(first.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState({ kind: "error", message: frontendText(locale, "KNOWLEDGE_ERROR") });
    });
    return () => { controller.cancel(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale, mergePage]);
  const loadMore = () => {
    if (state.kind !== "ready" || state.pending || !state.nextCursor || !controllerRef.current) return;
    const controller = controllerRef.current;
    const next = controller.request(state.nextCursor);
    setState((previous) => previous.kind === "ready" ? { ...previous, pending: true } : previous);
    void next.promise.then(({ generation, page }) => {
      if (controller.isCurrent(generation)) mergePage(page, true);
    }).catch((error: unknown) => {
      if (controller.isCurrent(next.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState((previous) => previous.kind === "ready" ? { ...previous, pending: false } : previous);
    });
  };
  return <KnowledgePage locale={locale} state={state} onLoadMore={loadMore} recent={recent} />;
}

function SearchRoute({ locale }: { locale: LocaleRuntime }) {
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [activeQuery, setActiveQuery] = useState(query);
  const [submitVersion, setSubmitVersion] = useState(0);
  const [state, setState] = useState<{
    kind: "loading";
  } | {
    kind: "ready";
    query: string;
    degraded: boolean;
    results: SearchPageResult["items"];
    nextCursor: string | null;
    pending?: boolean;
  } | {
    kind: "error";
    message: string;
  }>(() => activeQuery.trim() ? { kind: "loading" } : { kind: "ready", query: "", degraded: false, results: [], nextCursor: null });
  const controllerRef = useRef<ReturnType<typeof createSearchRequestController> | null>(null);
  const [savedViews, setSavedViews] = useState<SavedViewItem[]>([]);
  const [savedViewPending, setSavedViewPending] = useState(false);
  const [savedViewError, setSavedViewError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    void loadSavedViews().then((items) => { if (active) setSavedViews(items); }).catch(() => { if (active) setSavedViews([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = new URLSearchParams(window.location.search).get("q") ?? "";
      setQuery(next);
      setActiveQuery(next);
      setSubmitVersion((version) => version + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const controller = createSearchRequestController();
    controllerRef.current = controller;
    const normalized = activeQuery.trim();
    if (!normalized) {
      setState({ kind: "ready", query: "", degraded: false, results: [], nextCursor: null });
      return () => { controller.cancel(); if (controllerRef.current === controller) controllerRef.current = null; };
    }
    setState({ kind: "loading" });
    const request = controller.request(normalized);
    void request.promise.then(({ generation, page }) => {
      if (controller.isCurrent(generation)) setState({ kind: "ready", query: normalized, degraded: page.degraded, results: page.items, nextCursor: page.nextCursor });
    }).catch((error: unknown) => {
      if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) {
        setState({ kind: "error", message: frontendText(locale, "COMMON_SEARCH_UNAVAILABLE") });
      }
    });
    return () => { controller.cancel(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [activeQuery, locale, submitVersion]);

  const submit = () => {
    const normalized = query.trim();
    const nextUrl = normalized ? `/search?q=${encodeURIComponent(normalized)}` : "/search";
    window.history.pushState({}, "", nextUrl);
    setActiveQuery(normalized);
    setSubmitVersion((version) => version + 1);
  };
  const loadMore = () => {
    if (state.kind !== "ready" || state.pending || !state.nextCursor || !controllerRef.current) return;
    const controller = controllerRef.current;
    const request = controller.request(activeQuery, state.nextCursor);
    setState((previous) => previous.kind === "ready" ? { ...previous, pending: true } : previous);
    void request.promise.then(({ generation, page }) => {
      if (controller.isCurrent(generation)) setState((previous) => previous.kind === "ready" ? {
        ...previous,
        degraded: previous.degraded || page.degraded,
        results: [...previous.results, ...page.items],
        nextCursor: page.nextCursor,
        pending: false,
      } : previous);
    }).catch((error: unknown) => {
      if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) {
        setState((previous) => previous.kind === "ready" ? { ...previous, pending: false } : previous);
      }
    });
  };
  const saveView = async (name: string) => {
    if (savedViewPending) return;
    setSavedViewPending(true);
    setSavedViewError(undefined);
    try {
      const created = await createSavedView(name, { q: activeQuery });
      setSavedViews((views) => [created, ...views.filter((view) => view.id !== created.id)]);
    } catch {
      setSavedViewError(frontendText(locale, "SEARCH_SAVED_VIEW_ERROR"));
    } finally {
      setSavedViewPending(false);
    }
  };
  const applyView = (view: SavedViewItem) => {
    const normalized = view.filters.q.trim();
    setQuery(normalized);
    const nextUrl = normalized ? `/search?q=${encodeURIComponent(normalized)}` : "/search";
    window.history.pushState({}, "", nextUrl);
    setActiveQuery(normalized);
    setSubmitVersion((version) => version + 1);
  };
  const removeView = async (id: string) => {
    if (savedViewPending) return;
    setSavedViewPending(true);
    setSavedViewError(undefined);
    try {
      await deleteSavedView(id);
      setSavedViews((views) => views.filter((view) => view.id !== id));
    } catch {
      setSavedViewError(frontendText(locale, "SEARCH_SAVED_VIEW_ERROR"));
    } finally {
      setSavedViewPending(false);
    }
  };
  return <SearchPage locale={locale} query={query} state={state} onQueryChange={setQuery} onSubmit={submit} onLoadMore={loadMore} onRetry={() => setSubmitVersion((version) => version + 1)} savedViews={savedViews} savedViewPending={savedViewPending} savedViewError={savedViewError} onSaveView={(name) => { void saveView(name); }} onApplyView={applyView} onDeleteView={(id) => { void removeView(id); }} />;
}

function AgentRoute({ locale, search }: { locale: LocaleRuntime; search?: string }) {
  const scope = agentScopeFromSearch(search ?? "");
  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [state, setState] = useState<{ kind: "loading" } | ({ kind: "ready" } & AgentAnswer) | { kind: "error"; message: string }>({ kind: "ready", answer: frontendText(locale, "AGENT_DEFAULT_ANSWER"), confidence: "low", citations: [], conflicts: [] });
  const controllerRef = useRef<ReturnType<typeof createAgentRequestController> | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  if (!controllerRef.current) controllerRef.current = createAgentRequestController();
  useEffect(() => () => { controllerRef.current?.cancel(conversationIdRef.current); }, []);
  const submit = (nextQuestion = question) => {
    const normalized = nextQuestion.trim();
    if (!normalized || !controllerRef.current) return;
    setQuestion(normalized);
    setLastQuestion(normalized);
    setState({ kind: "loading" });
    const request = controllerRef.current.request(normalized, scope, conversationIdRef.current);
    void request.promise.then(({ generation, answer }) => {
      if (controllerRef.current?.isCurrent(generation)) {
        conversationIdRef.current = answer.conversationId;
        setState({ kind: "ready", ...answer });
      }
    }).catch((error: unknown) => {
      if (controllerRef.current?.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) {
        setState({ kind: "error", message: frontendText(locale, "COMMON_ANSWER_UNAVAILABLE") });
      }
    });
  };
  return <AgentPage locale={locale} scope={scope} state={state} question={question} onQuestionChange={setQuestion} onSubmit={() => submit()} onCancel={() => controllerRef.current?.cancel(conversationIdRef.current)} onRetry={() => submit(lastQuestion)} />;
}

function agentScopeFromSearch(search: string): AgentScope {
  const params = new URLSearchParams(search);
  if (params.get("scope") !== "items") return { kind: "all" };
  const knowledgeItemId = params.get("knowledgeItemId");
  return knowledgeItemId !== null && /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/u.test(knowledgeItemId)
    ? { kind: "items", knowledgeItemIds: [knowledgeItemId] }
    : { kind: "all" };
}

function SubmitRoute({ locale }: { locale: LocaleRuntime }) {
  const [draft, setDraft] = useState<SubmissionDraft>({ mode: "markdown", title: "", content: "" });
  const [state, setState] = useState<{ kind: "idle" } | { kind: "pending" } | { kind: "validation"; message: string } | { kind: "error"; message: string } | { kind: "success"; message: string }>({ kind: "idle" });
  const submit = async (nextDraft: SubmissionDraft) => {
    if (state.kind === "pending") return;
    setState({ kind: "pending" });
    try {
      await createSubmission(nextDraft);
      setDraft({ mode: nextDraft.mode, title: "", content: "" });
      setState({ kind: "success", message: frontendText(locale, "SUBMIT_SUCCESS") });
    } catch (error: unknown) {
      setState({ kind: error instanceof Error && error.message === "SUBMISSION_DRAFT_INVALID" ? "validation" : "error", message: frontendText(locale, error instanceof Error && error.message === "SUBMISSION_DRAFT_INVALID" ? "SUBMIT_VALIDATION_ERROR" : "SUBMIT_ERROR") });
    }
  };
  return <SubmitPage locale={locale} draft={draft} state={state} onDraftChange={setDraft} onSubmit={submit} />;
}

function MySubmissionsRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: MySubmissionItem[]; nextCursor: string | null; pending?: boolean } | { kind: "error"; message: string }>({ kind: "loading" });
  const controllerRef = useRef<ReturnType<typeof createMySubmissionsRequestController> | null>(null);
  useEffect(() => {
    const controller = createMySubmissionsRequestController();
    controllerRef.current = controller;
    const request = controller.request();
    void request.promise.then(({ generation, page }) => {
      if (controller.isCurrent(generation)) setState({ kind: "ready", items: page.items, nextCursor: page.nextCursor });
    }).catch((error: unknown) => {
      if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
    });
    return () => { controller.cancel(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale]);
  const loadMore = () => {
    if (state.kind !== "ready" || state.pending || !state.nextCursor || !controllerRef.current) return;
    const controller = controllerRef.current;
    const request = controller.request(state.nextCursor);
    setState((previous) => previous.kind === "ready" ? { ...previous, pending: true } : previous);
    void request.promise.then(({ generation, page }) => {
      if (controller.isCurrent(generation)) setState((previous) => previous.kind === "ready" ? { ...previous, items: [...previous.items, ...page.items], nextCursor: page.nextCursor, pending: false } : previous);
    }).catch((error: unknown) => {
      if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState((previous) => previous.kind === "ready" ? { ...previous, pending: false } : previous);
    });
  };
  return <MySubmissionsPage locale={locale} state={state} onLoadMore={loadMore} />;
}

function ReviewQueueRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: ReviewQueueItem[]; nextCursor: string | null; pending?: boolean } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createReviewQueueRequestController> | null>(null);
  useEffect(() => {
    const controller = createReviewQueueRequestController();
    controllerRef.current = controller;
    const request = controller.request();
    void request.promise.then(({ generation, page }) => { if (controller.isCurrent(generation)) setState({ kind: "ready", items: page.items, nextCursor: page.nextCursor }); }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); });
    return () => { controller.cancel(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale]);
  const loadMore = () => {
    if (state.kind !== "ready" || state.pending || !state.nextCursor || !controllerRef.current) return;
    const controller = controllerRef.current;
    const request = controller.request(state.nextCursor);
    setState((previous) => previous.kind === "ready" ? { ...previous, pending: true } : previous);
    void request.promise.then(({ generation, page }) => { if (controller.isCurrent(generation)) setState((previous) => previous.kind === "ready" ? { ...previous, items: [...previous.items, ...page.items], nextCursor: page.nextCursor, pending: false } : previous); }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState((previous) => previous.kind === "ready" ? { ...previous, pending: false } : previous); });
  };
  const review = async (id: string, action: ReviewDecision) => {
    if (pendingId) return;
    setPendingId(id);
    setActionError(undefined);
    try {
      const publish = action === "publish"
        ? (await loadReviewDetail(id)).publish
        : { title: "", visibility: "shared" as const, spaceId: "default", collectionId: null, tagIds: [] };
      await submitReviewDecision(id, action, publish);
      setState((previous) => previous.kind === "ready" ? { ...previous, items: previous.items.filter((item) => item.id !== id) } : previous);
    } catch {
      setActionError(frontendText(locale, "ADMIN_REVIEW_ACTION_ERROR"));
    } finally {
      setPendingId(null);
    }
  };
  return <ReviewQueuePage locale={locale} state={state} pendingId={pendingId} actionError={actionError} onReview={(id, action) => void review(id, action)} onLoadMore={loadMore} />;
}

function AdminMembersRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; members: AdminMember[]; nextCursor: string | null } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [loadMoreError, setLoadMoreError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createAdminMembersRequestController> | null>(null);
  useEffect(() => { const controller = createAdminMembersRequestController(); controllerRef.current = controller; const request = controller.request(); void request.promise.then(({ generation, page }) => { if (controller.isCurrent(generation)) setState({ kind: "ready", members: page.items, nextCursor: page.nextCursor }); }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); }); return () => { controller.cancel(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [locale]);
  const loadMore = () => { if (state.kind !== "ready" || !state.nextCursor || !controllerRef.current) return; const controller = controllerRef.current; const request = controller.request(state.nextCursor); setLoadMoreError(undefined); void request.promise.then(({ generation, page }) => { if (controller.isCurrent(generation)) setState((previous) => previous.kind === "ready" ? { ...previous, members: [...previous.members, ...page.items], nextCursor: page.nextCursor } : previous); }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) setLoadMoreError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); }); };
  const changeStatus = async (id: string, status: "active" | "disabled") => { if (pendingIds.includes(id)) return; setPendingIds((ids) => [...ids, id]); setActionError(undefined); try { const member = await updateMemberStatus(id, status); setState((previous) => previous.kind === "ready" ? { ...previous, members: previous.members.map((item) => item.id === id ? member : item) } : previous); } catch { setActionError(frontendText(locale, "ADMIN_MEMBER_STATUS_ERROR")); } finally { setPendingIds((ids) => ids.filter((item) => item !== id)); } };
  return <MembersPage locale={locale} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} loadMoreError={loadMoreError} members={state.kind === "ready" ? state.members : []} nextCursor={state.kind === "ready" ? state.nextCursor : null} pendingIds={pendingIds} actionError={actionError} onLoadMore={loadMore} onStatusChange={changeStatus} />;
}

function AdminSpacesRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; spaces: AdminSpace[] } | { kind: "error"; message: string }>({ kind: "loading" });
  useEffect(() => { let active = true; loadAdminSpaces().then((spaces) => { if (active) setState({ kind: "ready", spaces }); }).catch(() => { if (active) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); }); return () => { active = false; }; }, [locale]);
  const create = async (input: { slug: string; name: string }) => {
    const space = await createAdminSpace(input);
    setState((previous) => previous.kind === "ready" ? { ...previous, spaces: [...previous.spaces, space] } : { kind: "ready", spaces: [space] });
  };
  return <SpacesPage locale={locale} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} spaces={state.kind === "ready" ? state.spaces : []} onCreate={create} />;
}

function AdminAuditRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; events: AdminAuditEvent[]; nextCursor: string | null } | { kind: "error"; message: string }>({ kind: "loading" });
  const controllerRef = useRef<ReturnType<typeof createAdminAuditRequestController> | null>(null);
  useEffect(() => { const controller = createAdminAuditRequestController(); controllerRef.current = controller; const request = controller.request(); void request.promise.then(({ generation, page }) => { if (controller.isCurrent(generation)) setState({ kind: "ready", events: page.events, nextCursor: page.nextCursor }); }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState({ kind: "error", message: frontendText(locale, "ADMIN_AUDIT_UNAVAILABLE") }); }); return () => { controller.cancel(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [locale]);
  const loadMore = () => { if (state.kind !== "ready" || !state.nextCursor || !controllerRef.current) return; const controller = controllerRef.current; const request = controller.request(state.nextCursor); void request.promise.then(({ generation, page }) => { if (controller.isCurrent(generation)) setState((previous) => previous.kind === "ready" ? { ...previous, events: [...previous.events, ...page.events], nextCursor: page.nextCursor } : previous); }); };
  return <AuditPage locale={locale} state={state} onLoadMore={loadMore} />;
}

function AdminAssetsRoute({ locale }: { locale: LocaleRuntime }) {
  const [assets, setAssets] = useState<AdminAsset[]>([]); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState<string | undefined>(); const [pending, setPending] = useState<string[]>([]); const [retryError, setRetryError] = useState<string | undefined>(); const [preview, setPreview] = useState<AssetPreviewModel | null>(null); const [previewLoading, setPreviewLoading] = useState(false); const [previewError, setPreviewError] = useState<string | undefined>(); const previewAbort = useRef<AbortController | null>(null);
  useEffect(() => { const controller = createAdminAssetsRequestController(); const request = controller.request(); void request.promise.then(({ generation, items }) => { if (controller.isCurrent(generation)) { setAssets(items); setLoadError(undefined); setLoading(false); } }).catch(() => { if (controller.isCurrent(request.generation)) { setLoadError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setLoading(false); } }); return () => controller.cancel(); }, [locale]);
  const retry = async (id: string) => { if (pending.includes(id)) return; setPending((ids) => [...ids, id]); setRetryError(undefined); try { await retryAdminAsset(id); const refreshed = await loadAdminAssets(); setAssets(refreshed); } catch { setRetryError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); } finally { setPending((ids) => ids.filter((item) => item !== id)); } };
  const showPreview = async (id: string) => { previewAbort.current?.abort(); const abort = new AbortController(); previewAbort.current = abort; setPreview(null); setPreviewError(undefined); setPreviewLoading(true); try { setPreview(await loadAdminAssetPreview(id, fetch, abort.signal)); } catch (error: unknown) { if (!(error instanceof DOMException && error.name === "AbortError")) setPreviewError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); } finally { if (previewAbort.current === abort) { previewAbort.current = null; setPreviewLoading(false); } } };
  useEffect(() => () => previewAbort.current?.abort(), []);
  return <AssetQueuePage locale={locale} loading={loading} error={loadError} assets={assets.map((asset) => ({ ...asset, warnings: asset.warnings }))} preview={preview} previewLoading={previewLoading} previewError={previewError} retryError={retryError} onRetry={(id) => void retry(id)} onPreview={(id) => void showPreview(id)} />;
}
