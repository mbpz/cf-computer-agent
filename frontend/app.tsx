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
import { createReviewQueueRequestController, type ReviewQueueItem } from "./lib/admin-review-data";
import { createAdminMembersRequestController, loadAdminMembers, updateMemberStatus, type AdminMember } from "./lib/admin-members-data";
import { createAdminSpace, loadAdminSpaces, type AdminSpace } from "./lib/admin-spaces-data";
import { createAdminAuditRequestController, type AdminAuditEvent } from "./lib/admin-audit-data";
import { loadWorkspaceActivity, type WorkspaceActivityItem } from "./lib/activity-data";
import { loadKnowledgeReview, type ReviewPeriod, type ReviewResult } from "./lib/review-data";
import { loadAdminAnalytics, type AdminAnalyticsOverview, type LoadAdminAnalyticsInput } from "./lib/admin-analytics-data";
import { createNumberedRequestController, parsePageSearch, writePageSearch, type SupportedPageSize } from "./lib/numbered-page";
import { assignAdminRoleMember, createAdminRole, loadAdminRoles, unassignAdminRoleMember, updateAdminRole, type AdminRole } from "./lib/admin-roles-data";
import { deleteAdminMenu, loadAdminMenus, updateAdminMenu, type AdminMenu } from "./lib/admin-menus-data";
import { createAdminAssetsRequestController, loadAdminAssets, loadAdminAssetPreview, retryAdminAsset, type AdminAsset } from "./lib/admin-assets-data";
import { createAdminDuplicateRequestController, decideAdminDuplicate, type AdminDuplicateCandidate, type DuplicateDecision } from "./lib/admin-duplicates-data";
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
    case "knowledge": return <KnowledgeRoute locale={locale} />;
    case "knowledge-reader": return <KnowledgeReaderRoute locale={locale} knowledgeItemId={decodeRouteId(pathname)} />;
    case "search": return <SearchRoute locale={locale} />;
    case "agent": return <AgentRoute locale={locale} search={search} />;
    case "submit": return <SubmitRoute locale={locale} />;
    case "my-submissions": return <MySubmissionsRoute locale={locale} />;
    case "settings": return session ? <SettingsPage locale={locale} email={session.member.email} role={session.member.role} /> : <NotFoundPage locale={locale} />;
    case "admin": return <AdminDashboardPage locale={locale} metrics={{ pending: 0, assets: 0, members: 0 }} />;
    case "admin-analytics": return <AdminAnalyticsRoute locale={locale} search={search} />;
    case "admin-roles": return <AdminRolesRoute locale={locale} />;
    case "admin-menus": return <AdminMenusRoute locale={locale} />;
    case "admin-submissions": return <ReviewQueueRoute locale={locale} />;
    case "admin-submission-detail": return <ReviewDetailRoute locale={locale} id={pathname.split("/").pop() || ""} />;
    case "admin-duplicates": return <AdminDuplicateRoute locale={locale} />;
    case "admin-assets": return <AdminAssetsRoute locale={locale} />;
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

function KnowledgeRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: readonly { id: string; title?: string; summary?: string; publishedAt?: string; tags?: string[] }[]; nextCursor: string | null; pending?: boolean } | { kind: "error"; message: string }>({ kind: "loading" });
  const controllerRef = useRef<ReturnType<typeof createKnowledgeRequestController> | null>(null);
  const [recent, setRecent] = useState<RecentKnowledgeItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteKnowledgeItem[]>([]);
  const [recentResearch, setRecentResearch] = useState<RecentResearchItem[]>([]);
  const [notes, setNotes] = useState<PrivateKnowledgeNoteListItem[]>([]);
  const [activity, setActivity] = useState<WorkspaceActivityItem[]>([]);
  const [activityNextCursor, setActivityNextCursor] = useState<string | null>(null);
  const [reviewPeriod, setReviewPeriod] = useState<ReviewPeriod>("daily");
  const [review, setReview] = useState<{ kind: "loading" } | { kind: "ready"; data: ReviewResult } | { kind: "error" }>({ kind: "loading" });
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
  return <KnowledgePage locale={locale} state={state} onLoadMore={loadMore} recent={recent} favorites={favorites} recentResearch={recentResearch} notes={notes} activity={activity} activityNextCursor={activityNextCursor} onLoadMoreActivity={loadMoreActivity} review={review} reviewPeriod={reviewPeriod} onReviewPeriodChange={setReviewPeriod} />;
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

function AdminDuplicateRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: AdminDuplicateCandidate[]; nextCursor: string | null; pending?: boolean; error?: string } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const controllerRef = useRef<ReturnType<typeof createAdminDuplicateRequestController> | null>(null);
  useEffect(() => {
    const controller = createAdminDuplicateRequestController();
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
    void request.promise.then(({ generation, page }) => { if (controller.isCurrent(generation)) setState((previous) => previous.kind === "ready" ? { ...previous, items: [...previous.items, ...page.items], nextCursor: page.nextCursor, pending: false } : previous); }).catch(() => { if (controller.isCurrent(request.generation)) setState((previous) => previous.kind === "ready" ? { ...previous, pending: false, error: frontendText(locale, "COMMON_UNABLE_TO_LOAD") } : previous); });
  };
  const decide = async (id: string, decision: DuplicateDecision) => {
    if (pendingId) return;
    setPendingId(id);
    try {
      await decideAdminDuplicate(id, decision);
      setState((previous) => previous.kind === "ready" ? { ...previous, items: previous.items.filter((item) => item.submissionId !== id) } : previous);
    } catch {
      setState((previous) => previous.kind === "ready" ? { ...previous, error: frontendText(locale, "COMMON_UNABLE_TO_LOAD") } : previous);
    } finally { setPendingId(null); }
  };
  return <DuplicateQueuePage locale={locale} state={state} pendingId={pendingId} onDecision={(id, decision) => void decide(id, decision)} onLoadMore={loadMore} />;
}

export function AdminMembersRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = parsePageSearch(search);
  const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [status, setStatus] = useState<"active" | "disabled" | undefined>(() => memberStatusSearch(search));
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: import("./lib/admin-members-data").AdminMembersPage } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createAdminMembersRequestController> | null>(null);
  useEffect(() => { const onPop = () => { const next = parsePageSearch(window.location.search); setPage(next.page); setPageSize(next.pageSize); setStatus(memberStatusSearch(window.location.search)); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => { const controller = createAdminMembersRequestController(); controllerRef.current = controller; setPending(true); setLocalError(undefined); const request = controller.request({ page, pageSize, status }); void request.promise.then(({ generation, page: data }) => { if (controller.isCurrent(generation)) { setState({ kind: "ready", data }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); } }); return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [locale, page, pageSize, status]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { const nextSearch = writePageSearch(window.location.search, next); window.history.pushState({}, "", `${window.location.pathname}${nextSearch}`); setPage(next.page); setPageSize(next.pageSize); };
  const changeStatus = async (id: string, nextStatus: "active" | "disabled") => { if (pendingIds.includes(id)) return; setPendingIds((ids) => [...ids, id]); setActionError(undefined); try { const member = await updateMemberStatus(id, nextStatus); if (state.kind === "ready") { const refreshed = await loadAdminMembers({ page, pageSize, status }); if (refreshed.items.length === 0 && refreshed.pagination.total > 0 && page > 1) { navigate({ page: page - 1, pageSize }); } else setState({ kind: "ready", data: { ...refreshed, items: refreshed.items.map((item) => item.id === id ? member : item) } }); } } catch { setActionError(frontendText(locale, "ADMIN_MEMBER_STATUS_ERROR")); } finally { setPendingIds((ids) => ids.filter((item) => item !== id)); } };
  const changeFilter = (nextStatus: "" | "active" | "disabled") => { const params = new URLSearchParams(writePageSearch(window.location.search, { page: 1, pageSize })); if (nextStatus) params.set("status", nextStatus); else params.delete("status"); const nextSearch = params.toString(); window.history.pushState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`); setStatus(nextStatus || undefined); setPage(1); };
  return <MembersPage locale={locale} status={status || ""} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} localError={localError} members={state.kind === "ready" ? state.data.items : []} pagination={state.kind === "ready" ? state.data.pagination : undefined} pending={pending} pendingIds={pendingIds} actionError={actionError} onStatusFilterChange={changeFilter} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} onStatusChange={changeStatus} />;
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

function AdminAssetsRoute({ locale }: { locale: LocaleRuntime }) {
  const [assets, setAssets] = useState<AdminAsset[]>([]); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState<string | undefined>(); const [pending, setPending] = useState<string[]>([]); const [retryError, setRetryError] = useState<string | undefined>(); const [preview, setPreview] = useState<AssetPreviewModel | null>(null); const [previewLoading, setPreviewLoading] = useState(false); const [previewError, setPreviewError] = useState<string | undefined>(); const previewAbort = useRef<AbortController | null>(null);
  useEffect(() => { const controller = createAdminAssetsRequestController(); const request = controller.request(); void request.promise.then(({ generation, items }) => { if (controller.isCurrent(generation)) { setAssets(items); setLoadError(undefined); setLoading(false); } }).catch(() => { if (controller.isCurrent(request.generation)) { setLoadError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setLoading(false); } }); return () => controller.cancel(); }, [locale]);
  const retry = async (id: string) => { if (pending.includes(id)) return; setPending((ids) => [...ids, id]); setRetryError(undefined); try { await retryAdminAsset(id); const refreshed = await loadAdminAssets(); setAssets(refreshed); } catch { setRetryError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); } finally { setPending((ids) => ids.filter((item) => item !== id)); } };
  const showPreview = async (id: string) => { previewAbort.current?.abort(); const abort = new AbortController(); previewAbort.current = abort; setPreview(null); setPreviewError(undefined); setPreviewLoading(true); try { setPreview(await loadAdminAssetPreview(id, fetch, abort.signal)); } catch (error: unknown) { if (!(error instanceof DOMException && error.name === "AbortError")) setPreviewError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); } finally { if (previewAbort.current === abort) { previewAbort.current = null; setPreviewLoading(false); } } };
  useEffect(() => () => previewAbort.current?.abort(), []);
  return <AssetQueuePage locale={locale} loading={loading} error={loadError} assets={assets.map((asset) => ({ ...asset, warnings: asset.warnings }))} preview={preview} previewLoading={previewLoading} previewError={previewError} retryError={retryError} onRetry={(id) => void retry(id)} onPreview={(id) => void showPreview(id)} />;
}
