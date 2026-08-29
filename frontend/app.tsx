import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./components/shell/app-shell";
import { AdminDashboardPage } from "./pages/admin/admin-dashboard-page";
import { AdminAnalyticsPage } from "./pages/admin/analytics-page";
import { AdminRolesPage } from "./pages/admin/roles-page";
import { AdminMenusPage } from "./pages/admin/menus-page";
import { AdminForbiddenPage } from "./pages/admin/admin-forbidden-page";
import { ReviewQueuePage } from "./pages/admin/review-queue-page";
import { ReviewDetailRoute } from "./pages/admin/review-detail-route";
import { AssetQueuePage } from "./pages/admin/asset-queue-page";
import { MembersPage } from "./pages/admin/members-page";
import { SpacesPage } from "./pages/admin/spaces-page";
import { AuditPage } from "./pages/admin/audit-page";
import { DuplicateQueuePage } from "./pages/admin/duplicate-queue-page";
import { AgentPage } from "./pages/agent-page";
import { HomePage } from "./pages/home-page";
import { KnowledgePage } from "./pages/knowledge-page";
import { KnowledgeReaderPage } from "./pages/knowledge-reader-page";
import { SearchPage } from "./pages/search-page";
import { SubmitPage } from "./pages/submit-page";
import { MySubmissionsPage } from "./pages/my-submissions-page";
import { TasksPage } from "./pages/tasks/tasks-page";
import { LoginPage } from "./pages/login-page";
import { SettingsPage } from "./pages/settings-page";
import { createKnowledgeRequestController, loadFavoriteKnowledge, loadRecentKnowledge, loadRecentResearch, type FavoriteKnowledgeItem, type KnowledgePageResult, type RecentKnowledgeItem, type RecentResearchItem } from "./lib/knowledge-data";
import { createKnowledgeReaderRequestController, loadKnowledgeBacklinks, loadKnowledgeFavorite, loadKnowledgeRevisionDiff, loadRelatedKnowledge, setKnowledgeFavorite, type KnowledgeBacklinkItem, type KnowledgeRevision, type KnowledgeRevisionDiff, type RelatedKnowledgeItem } from "./lib/knowledge-reader-data";
import { renderSafeMarkdown } from "./lib/markdown-renderer";
import { createSearchRequestController, type SearchPageResult } from "./lib/search-data";
import { createSavedView, deleteSavedView, loadSavedViews, type SavedViewItem } from "./lib/saved-views-data";
import { createAgentRequestController, type AgentAnswer, type AgentScope } from "./lib/agent-data";
import { loadPrivateKnowledgeNotes, type PrivateKnowledgeNoteListItem } from "./lib/knowledge-note";
import { createSubmission, type SimilarSubmissionCandidate } from "./lib/submission-data";
import { clearOfflineSubmissionDraft, loadOfflineSubmissionDraft, saveOfflineSubmissionDraft } from "./lib/offline-submission-draft";
import { createMySubmissionsRequestController, type MySubmissionItem } from "./lib/my-submissions-data";
import { createTasksRequestController, deleteTask, setTaskStatus, type TaskFilters, type TaskPage } from "./lib/tasks-data";
import type { TaskFilterState, TaskStatus } from "./pages/tasks/task-types";
import { createReviewQueueRequestController, type ReviewQueuePageResult } from "./lib/admin-review-data";
import { loadAdminMembers, updateMemberStatus, type AdminMember, type AdminMembersPage, type LoadAdminMembersInput } from "./lib/admin-members-data";
import { createAdminSpace, loadAdminSpaces, type AdminSpace } from "./lib/admin-spaces-data";
import { createAdminAuditRequestController, type AdminAuditEvent } from "./lib/admin-audit-data";
import { loadWorkspaceActivity, type WorkspaceActivityItem } from "./lib/activity-data";
import { loadKnowledgeReview, type ReviewPeriod, type ReviewResult } from "./lib/review-data";
import { loadAdminAnalytics, type AdminAnalyticsOverview, type LoadAdminAnalyticsInput } from "./lib/admin-analytics-data";
import { createNumberedRequestController, parsePageSearch, writePageSearch, type SupportedPageSize } from "./lib/numbered-page";
import { assignAdminRoleMember, createAdminRole, loadAdminRoles, unassignAdminRoleMember, updateAdminRole, type AdminRole } from "./lib/admin-roles-data";
import { deleteAdminMenu, loadAdminMenus, updateAdminMenu, type AdminMenu } from "./lib/admin-menus-data";
import { createAdminAssetsRequestController, loadAdminAssetPreview, retryAdminAsset, type AdminAssetsPage, type AdminAssetStatus } from "./lib/admin-assets-data";
import { createAdminDuplicateRequestController, decideAdminDuplicate, type AdminDuplicatePageResult, type DuplicateDecision } from "./lib/admin-duplicates-data";
import type { AssetPreviewModel } from "./components/assets/asset-preview-model";
import { loadReviewDetail, submitReviewDecision, type ReviewDecision } from "./components/review/review-detail-data";
import type { SubmissionDraft } from "./components/submissions/submission-form-model";
import { postLogout } from "./lib/logout";
import { createLocaleRuntime, frontendText, type LocaleRuntime } from "./lib/i18n";
import { sessionSnapshot } from "./lib/session";
import { isAnonymousSessionError } from "./lib/session-state";
import { pageKindForPath } from "./app-routes";
import type { SessionSnapshot } from "./contracts/api";

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [session, setSession] = useState<Awaited<ReturnType<typeof sessionSnapshot>> | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [localeTick, setLocaleTick] = useState(0);
  const locale = useMemo(() => createLocaleRuntime({ navigatorLanguage: navigator.language, storage: window.localStorage }), []);
  useEffect(() => locale.subscribe(() => setLocaleTick((tick) => tick + 1)), [locale]);
  void localeTick;

  useEffect(() => {
    let active = true;
    sessionSnapshot().then((value) => {
      if (!active) return;
      setSession(value);
      setAnonymous(false);
    }).catch((error: unknown) => {
      if (!active) return;
      if (isAnonymousSessionError(error)) {
        setSession(null);
        setAnonymous(true);
        return;
      }
      setSessionError(error instanceof Error ? error.message : "SESSION_UNAVAILABLE");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session && !anonymous) return;
    void fetch("/api/telemetry/pageview", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => undefined);
  }, [anonymous, pathname, session]);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (sessionError) return <LoginPage locale={locale} error={frontendText(locale, "APP_SIGN_IN_DESCRIPTION")} />;
  if (anonymous) return <LoginPage locale={locale} />;
  if (!session) return <main aria-busy="true" className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">{frontendText(locale, "APP_LOADING_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "APP_LOADING_DESCRIPTION")}</p></main>;

  const navigate = (path: string) => { window.history.pushState({}, "", path); setPathname(path); };
  const logout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError(null);
    try {
      await postLogout(session.logoutUrl);
      // Do not present a local signed-out screen until the server confirms
      // that this browser no longer has an active session. This catches stale
      // cookies or an edge that failed to apply the Set-Cookie deletion.
      try {
        await sessionSnapshot();
        throw new Error("LOGOUT_NOT_CONFIRMED");
      } catch (error: unknown) {
        if (!isAnonymousSessionError(error)) throw error;
      }
      // Return to the anonymous shell. Starting OAuth here would immediately
      // sign the user back in when GitHub still has an active browser session.
      setSession(null);
      setAnonymous(true);
      setLogoutPending(false);
      window.history.replaceState({}, "", "/");
      setPathname("/");
    } catch {
      setLogoutError(frontendText(locale, "SHELL_LOGOUT_FAILED"));
      setLogoutPending(false);
    }
  };
  const kind = pageKindForPath(pathname);
  const page = renderPage(kind, pathname, locale, window.location.search, session);
  return <AppShell session={session} pathname={pathname} locale={locale} onNavigate={navigate} onLogout={logout} logoutPending={logoutPending} logoutError={logoutError}>{page}</AppShell>;
}

function renderPage(kind: ReturnType<typeof pageKindForPath>, pathname: string, locale: LocaleRuntime, search = "", session?: SessionSnapshot) {
  switch (kind) {
    case "home": return <HomeRoute locale={locale} />;
    case "knowledge": return <KnowledgeRoute locale={locale} search={search} />;
    case "knowledge-reader": return <KnowledgeReaderRoute locale={locale} knowledgeItemId={decodeRouteId(pathname)} />;
    case "search": return <SearchRoute locale={locale} search={search} />;
    case "agent": return <AgentRoute locale={locale} search={search} />;
    case "submit": return <SubmitRoute locale={locale} />;
    case "my-submissions": return <MySubmissionsRoute locale={locale} search={search} />;
    case "tasks": return <TasksRoute locale={locale} search={search} />;
    case "settings": return session ? <SettingsPage locale={locale} email={session.member.email} role={session.member.role} /> : <NotFoundPage locale={locale} />;
    case "admin": return <AdminDashboardPage locale={locale} metrics={{ pending: 0, assets: 0, members: 0 }} />;
    case "admin-analytics": return <AdminAnalyticsRoute locale={locale} search={search} />;
    case "admin-roles": return <AdminRolesRoute locale={locale} />;
    case "admin-menus": return <AdminMenusRoute locale={locale} />;
    case "admin-submissions": return <ReviewQueueRoute locale={locale} search={search} />;
    case "admin-submission-detail": return <ReviewDetailRoute locale={locale} id={pathname.split("/").pop() || ""} />;
    case "admin-duplicates": return <AdminDuplicateRoute locale={locale} search={search} />;
    case "admin-assets": return <AdminAssetsRoute locale={locale} search={search} />;
    case "admin-members": return <AdminMembersRoute locale={locale} search={search} />;
    case "admin-spaces": return <AdminSpacesRoute locale={locale} />;
    case "admin-audit": return <AdminAuditRoute locale={locale} search={search} />;
    case "not-found": return <NotFoundPage locale={locale} />;
    default: return <AdminForbiddenPage />;
  }
}

function HomeRoute({ locale }: { locale: LocaleRuntime }) {
  const [recent, setRecent] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    let active = true;
    void loadRecentKnowledge().then((items) => { if (active) setRecent(items.map((item) => ({ id: item.id, title: item.title }))); }).catch(() => { if (active) setRecent([]); });
    return () => { active = false; };
  }, []);
  return <HomePage locale={locale} state={{ kind: "ready", total: 0, pending: 0, published: 0, recent }} />;
}

export function AdminAnalyticsRoute({ locale, search, load = loadAdminAnalytics }: { locale: LocaleRuntime; search: string; load?: (input: LoadAdminAnalyticsInput) => Promise<AdminAnalyticsOverview> }) {
  const initial = useMemo(() => analyticsUrlState(search), [search]);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminAnalyticsOverview } | { kind: "error" }>({ kind: "loading" });
  const [days, setDays] = useState(initial.days);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const controller = useMemo(() => createNumberedRequestController(
    (input: { days: number; page: number; pageSize: SupportedPageSize }, signal) => load({ ...input, signal }),
  ), [load]);

  useEffect(() => {
    const onPopState = () => {
      const next = analyticsUrlState(window.location.search);
      setDays(next.days);
      setPage(next.page);
      setPageSize(next.pageSize);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    setLocalError(false);
    setPending(true);
    setState((previous) => previous.kind === "ready" ? previous : { kind: "loading" });
    const request = controller.request({ days, page, pageSize });
    void request.promise.then((data) => {
      if (!controller.isCurrent(request.generation)) return;
      setState({ kind: "ready", data });
      setPending(false);
    }).catch(() => {
      if (!controller.isCurrent(request.generation)) return;
      setState((previous) => previous.kind === "ready" ? previous : { kind: "error" });
      setLocalError(true);
      setPending(false);
    });
  }, [controller, days, page, pageSize, refresh]);

  const navigateState = (next: { days: number; page: number; pageSize: SupportedPageSize }) => {
    const params = new URLSearchParams(writePageSearch(window.location.search, next));
    params.set("days", String(next.days));
    const nextSearch = params.toString();
    window.history.pushState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
    setDays(next.days);
    setPage(next.page);
    setPageSize(next.pageSize);
  };

  return <AdminAnalyticsPage locale={locale} state={state} days={days} pending={pending} localError={localError}
    onDaysChange={(nextDays) => navigateState({ days: nextDays, page: 1, pageSize })}
    onPageChange={(nextPage) => navigateState({ ...analyticsUrlState(window.location.search), page: nextPage })}
    onPageSizeChange={(nextPageSize) => navigateState({ days, page: 1, pageSize: nextPageSize })}
    onRefresh={() => setRefresh((value) => value + 1)} />;
}

function analyticsUrlState(search: string): { days: number; page: number; pageSize: SupportedPageSize } {
  const pagination = parsePageSearch(search);
  const rawDays = new URLSearchParams(search).get("days");
  const parsedDays = rawDays === null ? 7 : Number(rawDays);
  const days = Number.isSafeInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 31 ? parsedDays : 7;
  return { days, ...pagination };
}

function AdminRolesRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; roles: AdminRole[] } | { kind: "error"; message: string }>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void loadAdminRoles().then((roles) => { if (active) setState({ kind: "ready", roles }); }).catch(() => { if (active) setState({ kind: "error", message: frontendText(locale, "ADMIN_ROLES_UNAVAILABLE") }); });
    return () => { active = false; };
  }, [locale]);
  const save = async (role: AdminRole, allowBits: string) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateAdminRole(role.id, { allowBits });
      setState((previous) => previous.kind === "ready" ? { ...previous, roles: previous.roles.map((item) => item.id === updated.id ? updated : item) } : previous);
    } catch {
      setSaveError(frontendText(locale, "ADMIN_ROLES_SAVE_ERROR"));
    } finally { setSaving(false); }
  };
  const create = async (input: { key: string; name: string; allowBits: string }) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createAdminRole(input);
      setState((previous) => previous.kind === "ready" ? { ...previous, roles: [...previous.roles, created] } : previous);
    } catch { setSaveError(frontendText(locale, "ADMIN_ROLES_CREATE_ERROR")); } finally { setSaving(false); }
  };
  const assignMember = async (role: AdminRole, memberId: string) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await assignAdminRoleMember(role.id, memberId);
      setState((previous) => previous.kind === "ready" ? {
        ...previous,
        roles: previous.roles.map((item) => item.id === role.id && !item.assignedMemberIds.includes(memberId)
          ? { ...item, assignedMemberIds: [...item.assignedMemberIds, memberId], memberCount: item.memberCount + 1 }
          : item),
      } : previous);
    } catch { setSaveError(frontendText(locale, "ADMIN_ROLES_MEMBER_ASSIGN_ERROR")); } finally { setSaving(false); }
  };
  const unassignMember = async (role: AdminRole, memberId: string) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await unassignAdminRoleMember(role.id, memberId);
      setState((previous) => previous.kind === "ready" ? {
        ...previous,
        roles: previous.roles.map((item) => item.id === role.id
          ? { ...item, assignedMemberIds: item.assignedMemberIds.filter((id) => id !== memberId), memberCount: Math.max(0, item.memberCount - 1) }
          : item),
      } : previous);
    } catch { setSaveError(frontendText(locale, "ADMIN_ROLES_MEMBER_ASSIGN_ERROR")); } finally { setSaving(false); }
  };
  return <AdminRolesPage locale={locale} state={state} saving={saving} saveError={saveError} onSave={(role, allowBits) => void save(role, allowBits)} onCreate={(input) => void create(input)} onAssignMember={(role, memberId) => void assignMember(role, memberId)} onUnassignMember={(role, memberId) => void unassignMember(role, memberId)} />;
}

function AdminMenusRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; menus: AdminMenu[] } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void loadAdminMenus().then((menus) => { if (active) setState({ kind: "ready", menus }); }).catch(() => { if (active) setState({ kind: "error", message: frontendText(locale, "ADMIN_MENUS_UNAVAILABLE") }); });
    return () => { active = false; };
  }, [locale]);
  const update = async (menu: AdminMenu, input: { position?: number; status?: "active" | "disabled"; visible?: boolean }) => {
    if (pendingId) return;
    setPendingId(menu.id);
    setError(null);
    try {
      const updated = await updateAdminMenu(menu.id, input);
      setState((previous) => previous.kind === "ready" ? { ...previous, menus: replaceMenu(previous.menus, updated) } : previous);
    } catch { setError(frontendText(locale, "ADMIN_MENUS_SAVE_ERROR")); } finally { setPendingId(null); }
  };
  const remove = async (menu: AdminMenu) => {
    if (pendingId) return;
    setPendingId(menu.id);
    setError(null);
    try {
      await deleteAdminMenu(menu.id);
      setState((previous) => previous.kind === "ready" ? { ...previous, menus: removeMenu(previous.menus, menu.id) } : previous);
    } catch { setError(frontendText(locale, "ADMIN_MENUS_DELETE_ERROR")); } finally { setPendingId(null); }
  };
  return <AdminMenusPage locale={locale} state={state} pendingId={pendingId} error={error} onUpdate={(menu, input) => void update(menu, input)} onDelete={(menu) => void remove(menu)} />;
}

function replaceMenu(menus: readonly AdminMenu[], updated: AdminMenu): AdminMenu[] {
  return menus.map((menu) => menu.id === updated.id ? { ...updated, children: menu.children } : { ...menu, children: replaceMenu(menu.children, updated) });
}

function removeMenu(menus: readonly AdminMenu[], id: string): AdminMenu[] {
  return menus.filter((menu) => menu.id !== id).map((menu) => ({ ...menu, children: removeMenu(menu.children, id) }));
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

export function KnowledgeRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = useMemo(() => parsePageSearch(search), [search]);
  const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [retryVersion, setRetryVersion] = useState(0);
  const [urlVersion, setUrlVersion] = useState(0);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: KnowledgePageResult["items"]; pagination: KnowledgePageResult["pagination"] } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createKnowledgeRequestController> | null>(null);
  const [recent, setRecent] = useState<RecentKnowledgeItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteKnowledgeItem[]>([]);
  const [recentResearch, setRecentResearch] = useState<RecentResearchItem[]>([]);
  const [notes, setNotes] = useState<PrivateKnowledgeNoteListItem[]>([]);
  const [activity, setActivity] = useState<WorkspaceActivityItem[]>([]);
  const [activityNextCursor, setActivityNextCursor] = useState<string | null>(null);
  const [reviewPeriod, setReviewPeriod] = useState<ReviewPeriod>("daily");
  const [review, setReview] = useState<{ kind: "loading" } | { kind: "ready"; data: ReviewResult } | { kind: "error" }>({ kind: "loading" });
  const queryRef = useRef({ page, pageSize });
  useEffect(() => {
    let active = true;
    void loadRecentKnowledge().then((items) => { if (active) setRecent(items); }).catch(() => { if (active) setRecent([]); });
    void loadFavoriteKnowledge().then((items) => { if (active) setFavorites(items); }).catch(() => { if (active) setFavorites([]); });
    void loadRecentResearch().then((items) => { if (active) setRecentResearch(items); }).catch(() => { if (active) setRecentResearch([]); });
    void loadPrivateKnowledgeNotes().then((items) => { if (active) setNotes(items); }).catch(() => { if (active) setNotes([]); });
    void loadWorkspaceActivity().then((page) => { if (active) { setActivity(page.items); setActivityNextCursor(page.nextCursor); } }).catch(() => { if (active) { setActivity([]); setActivityNextCursor(null); } });
    void loadKnowledgeReview("daily").then((data) => { if (active) setReview({ kind: "ready", data }); }).catch(() => { if (active) setReview({ kind: "error" }); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (reviewPeriod === "daily") return;
    let active = true;
    setReview({ kind: "loading" });
    void loadKnowledgeReview(reviewPeriod).then((data) => { if (active) setReview({ kind: "ready", data }); }).catch(() => { if (active) setReview({ kind: "error" }); });
    return () => { active = false; };
  }, [reviewPeriod]);
  const loadMoreActivity = () => {
    if (!activityNextCursor) return;
    const cursor = activityNextCursor;
    setActivityNextCursor(null);
    void loadWorkspaceActivity({ cursor }).then((page) => {
      setActivity((items) => [...items, ...page.items]);
      setActivityNextCursor(page.nextCursor);
    }).catch(() => setActivityNextCursor(cursor));
  };
  useEffect(() => { const onPop = () => { const next = parsePageSearch(window.location.search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); setUrlVersion((value) => value + 1); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => {
    const controller = createKnowledgeRequestController(); controllerRef.current = controller;
    const snapshot = { page, pageSize }; queryRef.current = snapshot; setPending(true); setLocalError(undefined);
    const request = controller.request({ ...snapshot, ...knowledgeFilters(window.location.search) });
    void request.promise.then((result) => { if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current)) { setState({ kind: "ready", items: result.items, pagination: result.pagination }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "KNOWLEDGE_ERROR") }); setLocalError(frontendText(locale, "KNOWLEDGE_ERROR")); setPending(false); } });
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale, page, pageSize, retryVersion, urlVersion]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = next; window.history.pushState({}, "", `${window.location.pathname}${writePageSearch(window.location.search, next)}`); setPage(next.page); setPageSize(next.pageSize); };
  return <KnowledgePage locale={locale} state={state} pending={pending} localError={localError} onRetry={() => setRetryVersion((value) => value + 1)} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} recent={recent} favorites={favorites} recentResearch={recentResearch} notes={notes} activity={activity} activityNextCursor={activityNextCursor} onLoadMoreActivity={loadMoreActivity} review={review} reviewPeriod={reviewPeriod} onReviewPeriodChange={setReviewPeriod} />;
}

export function SearchRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initialPage = useMemo(() => parsePageSearch(search), [search]);
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [activeQuery, setActiveQuery] = useState(query);
  const [page, setPage] = useState(initialPage.page); const [pageSize, setPageSize] = useState(initialPage.pageSize);
  const [retryVersion, setRetryVersion] = useState(0);
  const [urlVersion, setUrlVersion] = useState(0);
  const [state, setState] = useState<{
    kind: "loading";
  } | {
    kind: "ready";
    query: string;
    degraded: boolean;
    results: SearchPageResult["items"];
    pagination: SearchPageResult["pagination"];
  } | {
    kind: "error";
    message: string;
  }>(() => activeQuery.trim() ? { kind: "loading" } : { kind: "ready", query: "", degraded: false, results: [], pagination: { page: 1, pageSize: initialPage.pageSize, total: 0, totalPages: 0 } });
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createSearchRequestController> | null>(null);
  const queryRef = useRef({ query: activeQuery, page, pageSize });
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
      const pagination = parsePageSearch(window.location.search);
      setQuery(next);
      setActiveQuery(next);
      queryRef.current = { query: next, ...pagination }; setPage(pagination.page); setPageSize(pagination.pageSize); setUrlVersion((value) => value + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const controller = createSearchRequestController();
    controllerRef.current = controller;
    const normalized = activeQuery.trim();
    if (!normalized) {
      setState({ kind: "ready", query: "", degraded: false, results: [], pagination: { page: 1, pageSize, total: 0, totalPages: 0 } }); setPending(false);
      return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
    }
    const snapshot = { query: normalized, page, pageSize }; queryRef.current = snapshot; setPending(true); setLocalError(undefined);
    const request = controller.request({ ...snapshot, ...searchFilters(window.location.search) });
    void request.promise.then((result) => {
      if (controller.isCurrent(request.generation) && sameSearchQuery(snapshot, queryRef.current)) { setState({ kind: "ready", query: normalized, degraded: result.degraded, results: result.items, pagination: result.pagination }); setPending(false); }
    }).catch((error: unknown) => {
      if (controller.isCurrent(request.generation) && sameSearchQuery(snapshot, queryRef.current) && !isAbort(error)) {
        setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_SEARCH_UNAVAILABLE") }); setLocalError(frontendText(locale, "COMMON_SEARCH_UNAVAILABLE")); setPending(false);
      }
    });
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [activeQuery, locale, page, pageSize, retryVersion, urlVersion]);

  const submit = () => {
    const normalized = query.trim();
    const params = new URLSearchParams(window.location.search); if (normalized) params.set("q", normalized); else params.delete("q"); params.delete("page");
    const nextUrl = params.size ? `/search?${params.toString()}` : "/search";
    window.history.pushState({}, "", nextUrl);
    setActiveQuery(normalized);
    setPage(1); queryRef.current = { query: normalized, page: 1, pageSize };
  };
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = { query: activeQuery, ...next }; window.history.pushState({}, "", `${window.location.pathname}${writePageSearch(window.location.search, next)}`); setPage(next.page); setPageSize(next.pageSize); };
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
    setPage(1); queryRef.current = { query: normalized, page: 1, pageSize };
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
  return <SearchPage locale={locale} query={query} state={state} pending={pending} localError={localError} onQueryChange={setQuery} onSubmit={submit} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} onRetry={() => setRetryVersion((value) => value + 1)} savedViews={savedViews} savedViewPending={savedViewPending} savedViewError={savedViewError} onSaveView={(name) => { void saveView(name); }} onApplyView={applyView} onDeleteView={(id) => { void removeView(id); }} />;
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
  const [draft, setDraft] = useState<SubmissionDraft>(() => loadOfflineSubmissionDraft() ?? { mode: "markdown", title: "", content: "" });
  const [state, setState] = useState<{ kind: "idle" } | { kind: "pending" } | { kind: "validation"; message: string } | { kind: "error"; message: string } | { kind: "success"; message: string; similarCandidates: SimilarSubmissionCandidate[] }>({ kind: "idle" });
  const submit = async (nextDraft: SubmissionDraft) => {
    if (state.kind === "pending") return;
    setState({ kind: "pending" });
    try {
      const result = await createSubmission(nextDraft);
      clearOfflineSubmissionDraft();
      setDraft({ mode: nextDraft.mode, title: "", content: "" });
      setState({ kind: "success", message: frontendText(locale, "SUBMIT_SUCCESS"), similarCandidates: result.similarCandidates });
    } catch (error: unknown) {
      setState({ kind: error instanceof Error && error.message === "SUBMISSION_DRAFT_INVALID" ? "validation" : "error", message: frontendText(locale, error instanceof Error && error.message === "SUBMISSION_DRAFT_INVALID" ? "SUBMIT_VALIDATION_ERROR" : "SUBMIT_ERROR") });
    }
  };
  useEffect(() => { saveOfflineSubmissionDraft(draft); }, [draft]);
  return <SubmitPage locale={locale} draft={draft} state={state} onDraftChange={setDraft} onSubmit={submit} />;
}

export function MySubmissionsRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = useMemo(() => parsePageSearch(search), [search]);
  const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [retryVersion, setRetryVersion] = useState(0);
  const [urlVersion, setUrlVersion] = useState(0);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: MySubmissionItem[]; pagination: { page: number; pageSize: SupportedPageSize; total: number; totalPages: number } } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createMySubmissionsRequestController> | null>(null);
  const queryRef = useRef({ page, pageSize });
  useEffect(() => { const onPop = () => { const next = parsePageSearch(window.location.search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); setUrlVersion((value) => value + 1); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => {
    const controller = createMySubmissionsRequestController();
    controllerRef.current = controller;
    const snapshot = { page, pageSize }; queryRef.current = snapshot; setPending(true); setLocalError(undefined);
    const status = new URLSearchParams(window.location.search).get("status") ?? undefined;
    const request = controller.request({ ...snapshot, ...(status ? { status } : {}) });
    void request.promise.then((result) => {
      if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current)) { setState({ kind: "ready", items: result.items, pagination: result.pagination }); setPending(false); }
    }).catch((error: unknown) => {
      if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); }
    });
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale, page, pageSize, retryVersion, urlVersion]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = next; window.history.pushState({}, "", `${window.location.pathname}${writePageSearch(window.location.search, next)}`); setPage(next.page); setPageSize(next.pageSize); };
  return <MySubmissionsPage locale={locale} state={state} pending={pending} localError={localError} onRetry={() => setRetryVersion((value) => value + 1)} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} />;
}

export function TasksRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initialPage = useMemo(() => parsePageSearch(search), [search]);
  const initialFilters = useMemo(() => taskFiltersFromSearch(search), [search]);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState(initialPage.pageSize);
  const [filters, setFilters] = useState<TaskFilterState>(initialFilters);
  const [draftFilters, setDraftFilters] = useState<TaskFilterState>(initialFilters);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: TaskPage }>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [localLoadError, setLocalLoadError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const actionPendingRef = useRef(false);
  const textFilterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<ReturnType<typeof createTasksRequestController> | null>(null);
  const queryRef = useRef({ page, pageSize, filters });
  const sameQuery = (value: { page: number; pageSize: SupportedPageSize; filters: TaskFilterState }) =>
    value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize
      && JSON.stringify(value.filters) === JSON.stringify(queryRef.current.filters);

  useEffect(() => {
    const onPopState = () => {
      const pagination = parsePageSearch(window.location.search);
      const nextFilters = taskFiltersFromSearch(window.location.search);
      if (textFilterTimerRef.current) { clearTimeout(textFilterTimerRef.current); textFilterTimerRef.current = null; }
      queryRef.current = { ...pagination, filters: nextFilters };
      setPage(pagination.page); setPageSize(pagination.pageSize); setFilters(nextFilters); setDraftFilters(nextFilters); setRetryVersion((value) => value + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => () => { if (textFilterTimerRef.current) clearTimeout(textFilterTimerRef.current); }, []);

  useEffect(() => {
    const controller = createTasksRequestController(); controllerRef.current = controller;
    const snapshot = { page, pageSize, filters }; queryRef.current = snapshot; setPending(true); setLocalLoadError(undefined);
    const request = controller.request({ page, pageSize, filters: filters as TaskFilters });
    void request.promise.then((data) => {
      if (controller.isCurrent(request.generation) && sameQuery(snapshot)) { setState({ kind: "ready", data }); setPending(false); }
    }).catch((error: unknown) => {
      if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !isAbort(error)) {
        setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        setLocalLoadError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false);
      }
    });
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [filters, locale, page, pageSize, retryVersion]);

  const navigate = (next: { page: number; pageSize: SupportedPageSize; filters: TaskFilterState }, replace = false) => {
    if (textFilterTimerRef.current) { clearTimeout(textFilterTimerRef.current); textFilterTimerRef.current = null; }
    queryRef.current = next;
    const url = taskSearch(next);
    window.history[replace ? "replaceState" : "pushState"]({}, "", `/tasks${url}`);
    setPage(next.page); setPageSize(next.pageSize); setFilters(next.filters); setDraftFilters(next.filters);
  };
  const changeTextFilters = (nextFilters: TaskFilterState) => {
    setDraftFilters(nextFilters);
    if (textFilterTimerRef.current) clearTimeout(textFilterTimerRef.current);
    textFilterTimerRef.current = setTimeout(() => {
      textFilterTimerRef.current = null;
      navigate({ page: 1, pageSize: queryRef.current.pageSize, filters: nextFilters }, true);
    }, 300);
  };
  const mutate = async (id: string, mutation: () => Promise<unknown>) => {
    if (actionPendingRef.current) return;
    const snapshot = { ...queryRef.current, filters: { ...queryRef.current.filters } };
    actionPendingRef.current = true; setActionPendingId(id); setActionError(undefined); setLocalLoadError(undefined);
    try { await mutation(); }
    catch (error: unknown) {
      if (sameQuery(snapshot) && !isAbort(error)) setActionError(frontendText(locale, "TASKS_ACTION_FAILED"));
      actionPendingRef.current = false; setActionPendingId(null);
      return;
    }
    try {
      if (!sameQuery(snapshot)) return;
      const controller = controllerRef.current; if (!controller) return;
      setPending(true); const request = controller.request({ page: snapshot.page, pageSize: snapshot.pageSize, filters: snapshot.filters as TaskFilters });
      const data = await request.promise;
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
      if (data.items.length === 0 && snapshot.page > 1) navigate({ ...snapshot, page: snapshot.page - 1 }, true);
      else { setState({ kind: "ready", data }); setPending(false); }
    } catch (error: unknown) {
      if (sameQuery(snapshot) && !isAbort(error)) { setLocalLoadError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); }
    } finally { actionPendingRef.current = false; setActionPendingId(null); }
  };
  const ready = state.kind === "ready" ? { kind: "ready" as const, items: state.data.items, pagination: state.data.pagination } : state;
  return <TasksPage locale={locale} state={ready} filters={draftFilters} pending={pending} localLoadError={localLoadError} actionError={actionError} actionPendingId={actionPendingId} onRetry={() => setRetryVersion((value) => value + 1)} onFilterChange={(next) => navigate({ page: 1, pageSize, filters: next })} onTextFilterChange={changeTextFilters} onPageChange={(next) => navigate({ page: next, pageSize, filters })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next, filters })} onStatusChange={(id, status: TaskStatus) => void mutate(id, () => setTaskStatus(id, status))} onDelete={(id) => void mutate(id, () => deleteTask(id))} />;
}

export function ReviewQueueRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = parsePageSearch(search); const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: ReviewQueuePageResult } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [actionError, setActionError] = useState<string | undefined>(); const [localError, setLocalError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createReviewQueueRequestController> | null>(null);
  const queryRef = useRef({ page, pageSize }); const sameQuery = (value: { page: number; pageSize: SupportedPageSize }) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize;
  useEffect(() => { const onPop = () => { const next = parsePageSearch(window.location.search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => { const controller = createReviewQueueRequestController(); controllerRef.current = controller; const snapshot = { page, pageSize }; queryRef.current = snapshot; setPending(true); setLocalError(undefined); const request = controller.request(snapshot); void request.promise.then((data) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot)) { setState({ kind: "ready", data }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); } }); return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [locale, page, pageSize]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }, replace = false) => { queryRef.current = next; const url = `${window.location.pathname}${writePageSearch(window.location.search, next)}`; window.history[replace ? "replaceState" : "pushState"]({}, "", url); setPage(next.page); setPageSize(next.pageSize); };
  const review = async (id: string, action: ReviewDecision) => {
    if (pendingId) return;
    const actionQuery = { ...queryRef.current };
    setPendingId(id);
    setActionError(undefined);
    try {
      try {
        const publish = action === "publish"
          ? (await loadReviewDetail(id)).publish
          : { title: "", visibility: "shared" as const, spaceId: "default", collectionId: null, tagIds: [] };
        await submitReviewDecision(id, action, publish);
      } catch {
        if (sameQuery(actionQuery)) setActionError(frontendText(locale, "ADMIN_REVIEW_ACTION_ERROR"));
        return;
      }
      if (!sameQuery(actionQuery)) return;
      const snapshot = actionQuery; const controller = controllerRef.current; if (!controller) return;
      setPending(true); setLocalError(undefined); const request = controller.request(snapshot);
      try {
        const refreshed = await request.promise;
        if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
        if (refreshed.items.length === 0 && snapshot.page > 1) navigate({ page: snapshot.page - 1, pageSize: snapshot.pageSize }, true);
        else { setState({ kind: "ready", data: refreshed }); setPending(false); }
      } catch (error: unknown) {
        if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !isAbort(error)) { setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); }
      }
    } finally {
      setPendingId(null);
    }
  };
  return <ReviewQueuePage locale={locale} state={state} pendingId={pendingId} actionError={actionError} localError={localError} pending={pending} onReview={(id, action) => void review(id, action)} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} />;
}

export function AdminDuplicateRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = parsePageSearch(search); const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminDuplicatePageResult } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createAdminDuplicateRequestController> | null>(null);
  const queryRef = useRef({ page, pageSize }); const sameQuery = (value: { page: number; pageSize: SupportedPageSize }) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize;
  useEffect(() => { const onPop = () => { const next = parsePageSearch(window.location.search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => { const controller = createAdminDuplicateRequestController(); controllerRef.current = controller; const snapshot = { page, pageSize }; queryRef.current = snapshot; setPending(true); setLocalError(undefined); const request = controller.request(snapshot); void request.promise.then((data) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot)) { setState({ kind: "ready", data }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); } }); return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [locale, page, pageSize]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }, replace = false) => { queryRef.current = next; const url = `${window.location.pathname}${writePageSearch(window.location.search, next)}`; window.history[replace ? "replaceState" : "pushState"]({}, "", url); setPage(next.page); setPageSize(next.pageSize); };
  const decide = async (id: string, decision: DuplicateDecision) => {
    if (pendingId) return;
    const actionQuery = { ...queryRef.current };
    setPendingId(id);
    try {
      await decideAdminDuplicate(id, decision);
      if (!sameQuery(actionQuery)) return; const snapshot = actionQuery; const controller = controllerRef.current; if (!controller) return; setPending(true); const request = controller.request(snapshot); const refreshed = await request.promise; if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return; if (refreshed.items.length === 0 && snapshot.page > 1) navigate({ page: snapshot.page - 1, pageSize: snapshot.pageSize }, true); else { setState({ kind: "ready", data: refreshed }); setPending(false); }
    } catch {
      if (sameQuery(actionQuery)) { setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); }
    } finally { setPendingId(null); }
  };
  return <DuplicateQueuePage locale={locale} state={state} pendingId={pendingId} pending={pending} localError={localError} onDecision={(id, decision) => void decide(id, decision)} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} />;
}

export function AdminMembersRoute({ locale, search, load = loadAdminMembers, update = updateMemberStatus }: { locale: LocaleRuntime; search: string; load?: typeof loadAdminMembers; update?: typeof updateMemberStatus }) {
  const initial = parsePageSearch(search);
  const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [status, setStatus] = useState<"active" | "disabled" | undefined>(() => memberStatusSearch(search));
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: import("./lib/admin-members-data").AdminMembersPage } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createNumberedRequestController<Omit<LoadAdminMembersInput, "signal">, AdminMembersPage>> | null>(null);
  const queryRef = useRef({ page, pageSize, status });
  const sameQuery = (candidate: { page: number; pageSize: SupportedPageSize; status?: "active" | "disabled" }) => candidate.page === queryRef.current.page && candidate.pageSize === queryRef.current.pageSize && candidate.status === queryRef.current.status;
  useEffect(() => { const onPop = () => { const next = parsePageSearch(window.location.search); const nextStatus = memberStatusSearch(window.location.search); queryRef.current = { ...next, status: nextStatus }; setPage(next.page); setPageSize(next.pageSize); setStatus(nextStatus); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => { const controller = createNumberedRequestController((input: Omit<LoadAdminMembersInput, "signal">, signal) => load({ ...input, signal })); controllerRef.current = controller; const snapshot = { page, pageSize, status }; queryRef.current = snapshot; setPending(true); setLocalError(undefined); const request = controller.request(snapshot); void request.promise.then((data) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot)) { setState({ kind: "ready", data }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !(error instanceof DOMException && error.name === "AbortError")) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); } }); return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [load, locale, page, pageSize, status]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = { ...next, status }; const nextSearch = writePageSearch(window.location.search, next); window.history.pushState({}, "", `${window.location.pathname}${nextSearch}`); setPage(next.page); setPageSize(next.pageSize); };
  const replaceNavigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = { ...next, status }; const nextSearch = writePageSearch(window.location.search, next); window.history.replaceState({}, "", `${window.location.pathname}${nextSearch}`); setPage(next.page); setPageSize(next.pageSize); };
  const changeStatus = async (id: string, nextStatus: "active" | "disabled") => {
    if (pendingIds.includes(id)) return;
    setPendingIds((ids) => [...ids, id]); setActionError(undefined);
    try { await update(id, nextStatus); } catch { setActionError(frontendText(locale, "ADMIN_MEMBER_STATUS_ERROR")); setPendingIds((ids) => ids.filter((item) => item !== id)); return; }
    const snapshot = { ...queryRef.current }; const controller = controllerRef.current;
    if (!controller) { setPendingIds((ids) => ids.filter((item) => item !== id)); return; }
    setPending(true); setLocalError(undefined); const request = controller.request(snapshot);
    try {
      const refreshed = await request.promise;
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
      if (refreshed.items.length === 0 && snapshot.page > 1) replaceNavigate({ page: snapshot.page - 1, pageSize: snapshot.pageSize });
      else { setState({ kind: "ready", data: refreshed }); setPending(false); }
    } catch (error: unknown) {
      if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !(error instanceof DOMException && error.name === "AbortError")) { setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); }
    } finally { setPendingIds((ids) => ids.filter((item) => item !== id)); }
  };
  const changeFilter = (nextStatus: "" | "active" | "disabled") => { const normalized = nextStatus || undefined; queryRef.current = { page: 1, pageSize, status: normalized }; const params = new URLSearchParams(writePageSearch(window.location.search, { page: 1, pageSize })); if (nextStatus) params.set("status", nextStatus); else params.delete("status"); const nextSearch = params.toString(); window.history.pushState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`); setStatus(normalized); setPage(1); };
  return <MembersPage locale={locale} status={status || ""} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} pageError={localError} members={state.kind === "ready" ? state.data.items : []} pagination={state.kind === "ready" ? state.data.pagination : undefined} pending={pending} pendingIds={pendingIds} actionError={actionError} onStatusFilterChange={changeFilter} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} onStatusChange={changeStatus} />;
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

export function AdminAuditRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = parsePageSearch(search); const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [action, setAction] = useState(() => new URLSearchParams(search).get("action") || undefined);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; page: import("./lib/admin-audit-data").AdminAuditPage } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createAdminAuditRequestController> | null>(null);
  useEffect(() => { const onPop = () => { const next = parsePageSearch(window.location.search); setPage(next.page); setPageSize(next.pageSize); setAction(new URLSearchParams(window.location.search).get("action") || undefined); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => { const controller = createAdminAuditRequestController(); controllerRef.current = controller; setPending(true); setLocalError(undefined); const request = controller.request({ page, pageSize, action }); void request.promise.then(({ generation, page: data }) => { if (controller.isCurrent(generation)) { setState({ kind: "ready", page: data }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "ADMIN_AUDIT_UNAVAILABLE") }); setLocalError(frontendText(locale, "ADMIN_AUDIT_UNAVAILABLE")); setPending(false); } }); return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [action, locale, page, pageSize]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { const nextSearch = writePageSearch(window.location.search, next); window.history.pushState({}, "", `${window.location.pathname}${nextSearch}`); setPage(next.page); setPageSize(next.pageSize); };
  const changeFilter = (nextAction: string) => { const params = new URLSearchParams(writePageSearch(window.location.search, { page: 1, pageSize })); if (nextAction) params.set("action", nextAction); else params.delete("action"); const nextSearch = params.toString(); window.history.pushState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`); setAction(nextAction || undefined); setPage(1); };
  return <AuditPage locale={locale} state={state} action={action || ""} pending={pending} localError={localError} onActionChange={changeFilter} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} />;
}

function memberStatusSearch(search: string): "active" | "disabled" | undefined { const value = new URLSearchParams(search).get("status"); return value === "active" || value === "disabled" ? value : undefined; }

export function AdminAssetsRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = parsePageSearch(search); const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize); const [status, setStatus] = useState<AdminAssetStatus | undefined>(() => assetStatusSearch(search));
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminAssetsPage } | { kind: "error"; message: string }>({ kind: "loading" }); const [pendingIds, setPendingIds] = useState<string[]>([]); const [requestPending, setRequestPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>(); const [retryError, setRetryError] = useState<string | undefined>(); const [preview, setPreview] = useState<AssetPreviewModel | null>(null); const [previewLoading, setPreviewLoading] = useState(false); const [previewError, setPreviewError] = useState<string | undefined>(); const previewAbort = useRef<AbortController | null>(null);
  const controllerRef = useRef<ReturnType<typeof createAdminAssetsRequestController> | null>(null); const queryRef = useRef({ page, pageSize, status }); const sameQuery = (value: { page: number; pageSize: SupportedPageSize; status?: AdminAssetStatus }) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize && value.status === queryRef.current.status;
  useEffect(() => { const onPop = () => { const next = parsePageSearch(window.location.search); const nextStatus = assetStatusSearch(window.location.search); queryRef.current = { ...next, status: nextStatus }; setPage(next.page); setPageSize(next.pageSize); setStatus(nextStatus); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => { const controller = createAdminAssetsRequestController(); controllerRef.current = controller; const snapshot = { page, pageSize, status }; queryRef.current = snapshot; setRequestPending(true); setLocalError(undefined); const request = controller.request(snapshot); void request.promise.then((data) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot)) { setState({ kind: "ready", data }); setRequestPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setRequestPending(false); } }); return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [locale, page, pageSize, status]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize; status?: AdminAssetStatus }, replace = false) => { queryRef.current = next; const params = new URLSearchParams(writePageSearch(window.location.search, next)); if (next.status) params.set("status", next.status); else params.delete("status"); const serialized = params.toString(); window.history[replace ? "replaceState" : "pushState"]({}, "", `${window.location.pathname}${serialized ? `?${serialized}` : ""}`); setPage(next.page); setPageSize(next.pageSize); setStatus(next.status); };
  const retry = async (id: string) => { if (pendingIds.includes(id)) return; const actionQuery = { ...queryRef.current }; setPendingIds((ids) => [...ids, id]); setRetryError(undefined); try { await retryAdminAsset(id); if (!sameQuery(actionQuery)) return; const snapshot = actionQuery; const controller = controllerRef.current; if (!controller) return; setRequestPending(true); const request = controller.request(snapshot); const refreshed = await request.promise; if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return; if (refreshed.items.length === 0 && snapshot.page > 1) navigate({ ...snapshot, page: snapshot.page - 1 }, true); else { setState({ kind: "ready", data: refreshed }); setRequestPending(false); } } catch { if (sameQuery(actionQuery)) { setRetryError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setRequestPending(false); } } finally { setPendingIds((ids) => ids.filter((item) => item !== id)); } };
  const showPreview = async (id: string) => { previewAbort.current?.abort(); const abort = new AbortController(); previewAbort.current = abort; setPreview(null); setPreviewError(undefined); setPreviewLoading(true); try { setPreview(await loadAdminAssetPreview(id, fetch, abort.signal)); } catch (error: unknown) { if (!(error instanceof DOMException && error.name === "AbortError")) setPreviewError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); } finally { if (previewAbort.current === abort) { previewAbort.current = null; setPreviewLoading(false); } } };
  useEffect(() => () => previewAbort.current?.abort(), []);
  return <AssetQueuePage locale={locale} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} data={state.kind === "ready" ? state.data : undefined} localError={localError} pending={requestPending} pendingIds={pendingIds} status={status || ""} preview={preview} previewLoading={previewLoading} previewError={previewError} retryError={retryError} onRetry={(id) => void retry(id)} onPreview={(id) => void showPreview(id)} onStatusChange={(next) => navigate({ page: 1, pageSize, status: next || undefined })} onPageChange={(next) => navigate({ page: next, pageSize, status })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next, status })} />;
}

function assetStatusSearch(search: string): AdminAssetStatus | undefined { const value = new URLSearchParams(search).get("status"); return value === "queued" || value === "processing" || value === "succeeded" || value === "failed_retryable" || value === "failed_terminal" ? value : undefined; }
function samePageQuery(left: { page: number; pageSize: SupportedPageSize }, right: { page: number; pageSize: SupportedPageSize }): boolean { return left.page === right.page && left.pageSize === right.pageSize; }
function sameSearchQuery(left: { query: string; page: number; pageSize: SupportedPageSize }, right: { query: string; page: number; pageSize: SupportedPageSize }): boolean { return left.query === right.query && samePageQuery(left, right); }
function knowledgeFilters(search: string) {
  const params = new URLSearchParams(search); const value = (key: string) => params.get(key) || undefined;
  const kind = value("kind");
  return { spaceId: value("spaceId"), collectionId: value("collectionId"), tagId: value("tagId"), ...(kind === "text" || kind === "markdown" || kind === "code" ? { kind } : {}), authorId: value("authorId"), publishedFrom: value("publishedFrom"), publishedTo: value("publishedTo") };
}
function searchFilters(search: string) {
  const params = new URLSearchParams(search); const value = (key: string) => params.get(key) || undefined; const { tagId: _tagId, ...base } = knowledgeFilters(search); const tagIds = params.getAll("tagId"); const tagMode = value("tagMode");
  return { ...base, tagIds, ...(tagMode === "and" || tagMode === "or" ? { tagMode } : {}) };
}
function taskFiltersFromSearch(search: string): TaskFilterState {
  const params = new URLSearchParams(search);
  const status = params.get("status"); const priority = params.get("priority"); const due = params.get("due");
  return {
    ...(status === "todo" || status === "doing" || status === "blocked" || status === "done" || status === "canceled" ? { status } : {}),
    ...(priority === "low" || priority === "medium" || priority === "high" ? { priority } : {}),
    ...(due === "today" || due === "overdue" || due === "none" ? { due } : {}),
    ...(params.get("tag") ? { tag: params.get("tag")! } : {}),
    ...(params.get("q") ? { q: params.get("q")! } : {}),
  };
}
function taskSearch(input: { page: number; pageSize: SupportedPageSize; filters: TaskFilterState }): string {
  const params = new URLSearchParams();
  for (const key of ["status", "priority", "tag", "due", "q"] as const) {
    const value = input.filters[key]; if (value) params.set(key, value);
  }
  const pagination = new URLSearchParams(writePageSearch("", { page: input.page, pageSize: input.pageSize }));
  for (const [key, value] of pagination) params.set(key, value);
  return params.size ? `?${params}` : "";
}
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === "AbortError"; }
