import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AppShell } from "./components/shell/app-shell";
import { AdminDashboardRoute } from "./pages/admin/admin-dashboard-route";
import { AdminAnalyticsPage, type AdminAnalyticsState } from "./pages/admin/analytics-page";
import { AdminRolesPage } from "./pages/admin/roles-page";
import { AdminMenusPage } from "./pages/admin/menus-page";
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
import { InboxPage, type InboxPageState } from "./pages/inbox-page";
import { GoalsPage, type GoalsPageState } from "./pages/goals-page";
import { ProjectsPage, type ProjectsPageState } from "./pages/projects-page";
import { ProjectTimelinePage, type ProjectTimelinePageState } from "./pages/project-timeline-page";
import { CalendarPage, type CalendarPageState } from "./pages/calendar-page";
import { TodayPage, type TodayPageState } from "./pages/today-page";
import { FocusPage, type FocusPageState } from "./pages/focus-page";
import { WorkbenchReviewPage, type WorkbenchReviewPageState } from "./pages/workbench-review-page";
import { BoardsPage } from "./pages/boards/boards-page";
import { NotificationsPage, type NotificationsPageState } from "./pages/notifications/notifications-page";
import { MessagesPage, type MessagesPageState } from "./pages/messages/messages-page";
import { ThreadPage, type ThreadPageState } from "./pages/messages/thread-page";
import { LoginPage } from "./pages/login-page";
import { PublicWorkbenchPage } from "./pages/workbench-landing/public-workbench-page";
import { SettingsPage } from "./pages/settings-page";
import { GraphRoute } from "./pages/graph-page";
import { ComingSoonPage } from "./pages/coming-soon-page";
import { createKnowledgeRequestController, loadFavoriteKnowledge, loadRecentKnowledge, loadRecentResearch, type FavoriteKnowledgeItem, type KnowledgePageResult, type RecentKnowledgeItem, type RecentResearchItem } from "./lib/knowledge-data";
import { createKnowledgeReaderRequestController, loadKnowledgeBacklinks, loadKnowledgeFavorite, loadKnowledgeRevisionDiff, loadRelatedKnowledge, setKnowledgeFavorite, type KnowledgeBacklinkItem, type KnowledgeRevision, type KnowledgeRevisionDiff, type RelatedKnowledgeItem } from "./lib/knowledge-reader-data";
import { renderSafeMarkdown } from "./lib/markdown-renderer";
import { createSearchRequestController, type SearchPageResult } from "./lib/search-data";
import { createSavedView, deleteSavedView, loadSavedViews, type SavedViewItem } from "./lib/saved-views-data";
import { createAgentRequestController, type AgentAnswer, type AgentScope } from "./lib/agent-data";
import { loadPrivateKnowledgeNotes, type PrivateKnowledgeNoteListItem } from "./lib/knowledge-note";
import { createSubmission, type SimilarSubmissionCandidate } from "./lib/submission-data";
import { clearSubmissionIntent, createSubmissionIntent, loadSubmissionIntent, saveSubmissionIntent, type SubmissionIntent } from "./lib/submission-intent";
import { clearOfflineSubmissionDraft, loadOfflineSubmissionDraft, saveOfflineSubmissionDraft } from "./lib/offline-submission-draft";
import { createMySubmissionsRequestController, type MySubmissionItem } from "./lib/my-submissions-data";
import { createTasksRequestController, deleteTask, loadTaskSummary, setTaskStatus, type TaskFilters, type TaskItem, type TaskPage } from "./lib/tasks-data";
import { createInbox, loadInbox, promoteInboxTask, updateInboxStatus, type InboxItem } from "./lib/inbox-data";
import { createGoal, loadGoals, setGoalProgress, setGoalStatus, type Goal } from "./lib/goals-data";
import { createProject, createProjectTimeline, loadProject, loadProjectSummary, loadProjectTimeline, loadProjects, setProjectStatus, setProjectTimelineStatus, type Project, type ProjectSummary, type ProjectTimelineItem, type ProjectTimelineKind, type ProjectTimelineStatus } from "./lib/projects-data";
import { cancelCalendarEvent, createCalendarEvent, loadCalendar, type CalendarEvent } from "./lib/calendar-data";
import { loadToday } from "./lib/today-data";
import { loadCurrentFocus, startFocus, transitionFocus } from "./lib/focus-data";
import { loadWorkbenchReview } from "./lib/workbench-review-data";
import { buildWorkbenchSummary, type WorkbenchSummary } from "./lib/workbench-data";
import type { TaskFilterState, TaskStatus } from "./pages/tasks/task-types";
import { BOARD_STATUSES, parseBoardSearch, writeBoardColumnSearch, type BoardColumnStates, type BoardPagination, type BoardStatus, type BoardTargetStatus } from "./pages/boards/board-model";
import { createNotificationsRequestController, markNotificationRead, markVisibleNotificationsRead, type NotificationFilters, type NotificationSummary } from "./lib/notifications-data";
import { notificationTargetHref, parseNotificationSearch, writeNotificationSearch, type NotificationQuery } from "./pages/notifications/notification-model";
import { createDiscussionRequestController, ensureDiscussionThread, loadDiscussionMessages, loadDiscussionThread, loadDiscussionThreads, sendDiscussionMessage } from "./lib/discussions-data";
import { parseDiscussionSearch, writeDiscussionSearch, type DiscussionSearch } from "./pages/messages/discussion-model";
import { createReviewQueueRequestController, type ReviewQueuePageResult } from "./lib/admin-review-data";
import { loadAdminMembers, updateMemberStatus, type AdminMember, type AdminMembersPage, type LoadAdminMembersInput } from "./lib/admin-members-data";
import { createAdminSpace, loadAdminSpaces, type AdminSpace } from "./lib/admin-spaces-data";
import { createAdminAuditRequestController, type AdminAuditEvent } from "./lib/admin-audit-data";
import { loadWorkspaceActivity, type WorkspaceActivityItem } from "./lib/activity-data";
import { loadKnowledgeReview, type ReviewPeriod, type ReviewResult } from "./lib/review-data";
import { loadAdminAnalytics, type AdminAnalyticsOverview, type LoadAdminAnalyticsInput } from "./lib/admin-analytics-data";
import { ApiRequestError } from "./lib/api";
import { createNumberedRequestController, parsePageSearch, writePageSearch, type SupportedPageSize } from "./lib/numbered-page";
import { assignAdminRoleMember, createAdminRole, loadAdminRoles, unassignAdminRoleMember, updateAdminRole, type AdminRole } from "./lib/admin-roles-data";
import { deleteAdminMenu, loadAdminMenus, updateAdminMenu, type AdminMenu } from "./lib/admin-menus-data";
import { createAdminAssetsRequestController, loadAdminAssetPreview, retryAdminAsset, type AdminAssetsPage, type AdminAssetStatus } from "./lib/admin-assets-data";
import { createAdminDuplicateRequestController, decideAdminDuplicate, type AdminDuplicatePageResult, type DuplicateDecision } from "./lib/admin-duplicates-data";
import type { AssetPreviewModel } from "./components/assets/asset-preview-model";
import { loadReviewDetail, prepareReviewDecision, sendReviewDecision, reviewRecovery, type ReviewDecision, type ReviewOperation, type ReviewNoteInput } from "./components/review/review-detail-data";
import type { ReviewDecisionState } from "./components/review/review-decision-controls";
import type { SubmissionDraft } from "./components/submissions/submission-form-model";
import { postLogout } from "./lib/logout";
import { createLocaleRuntime, frontendText, type LocaleRuntime } from "./lib/i18n";
import { sessionSnapshot } from "./lib/session";
import { isAnonymousSessionError } from "./lib/session-state";
import { pageKindForPath } from "./app-routes";
import type { SessionSnapshot } from "./contracts/api";
import { canonicalWorkspaceLocationKey, readWorkspaceLocation, subscribeWorkspaceLocation, writeWorkspaceHistory } from "./lib/workspace-location";

export function App() {
  const [location, setLocation] = useState(readWorkspaceLocation);
  const pathname = location.pathname;
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
    const updateLocation = () => setLocation(readWorkspaceLocation());
    return subscribeWorkspaceLocation(updateLocation);
  }, []);

  if (sessionError) return <LoginPage locale={locale} error={frontendText(locale, "APP_SIGN_IN_DESCRIPTION")} />;
  if (anonymous && pathname === "/") return <PublicWorkbenchPage locale={locale} />;
  if (anonymous) return <LoginPage locale={locale} />;
  if (!session) return <main aria-busy="true" className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">{frontendText(locale, "APP_LOADING_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "APP_LOADING_DESCRIPTION")}</p></main>;

  const navigate = (path: string) => writeWorkspaceHistory("push", path);
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
      writeWorkspaceHistory("replace", "/");
    } catch {
      setLogoutError(frontendText(locale, "SHELL_LOGOUT_FAILED"));
      setLogoutPending(false);
    }
  };
  const kind = pageKindForPath(pathname);
  const page = renderPage(kind, pathname, locale, location.search, session);
  return <AppShell session={session} pathname={pathname} contentScrollKey={canonicalWorkspaceLocationKey(location)} locale={locale} onNavigate={navigate} onLogout={logout} logoutPending={logoutPending} logoutError={logoutError}>{page}</AppShell>;
}

function renderPage(kind: ReturnType<typeof pageKindForPath>, pathname: string, locale: LocaleRuntime, search = "", session?: SessionSnapshot) {
  switch (kind) {
    case "home": return <HomeRoute locale={locale} />;
    case "knowledge": return <KnowledgeRoute locale={locale} search={search} />;
    case "knowledge-reader": return <KnowledgeReaderRoute locale={locale} knowledgeItemId={decodeRouteId(pathname)} />;
    case "search": return <SearchRoute locale={locale} search={search} />;
    case "agent": return <AgentRoute locale={locale} search={search} />;
    case "submit": return <SubmitRoute locale={locale} memberId={session.member.id} />;
    case "my-submissions": return <MySubmissionsRoute locale={locale} search={search} />;
    case "graph": return <GraphRoute locale={locale} />;
    case "tasks": return <TasksRoute locale={locale} search={search} />;
    case "inbox": return <InboxRoute locale={locale} />;
    case "goals": return <GoalsRoute locale={locale} />;
    case "projects": return <ProjectsRoute locale={locale} />;
    case "project-timeline": return <ProjectTimelineRoute locale={locale} projectId={pathname.split("/")[2] || ""} />;
    case "calendar": return <CalendarRoute locale={locale} />;
    case "today": return <TodayRoute locale={locale} />;
    case "focus": return <FocusRoute locale={locale} />;
    case "review": return <WorkbenchReviewRoute locale={locale} />;
    case "boards": return <BoardsRoute locale={locale} search={search} />;
    case "notifications": return <NotificationsRoute locale={locale} search={search} isAdmin={session?.member.role === "admin"} />;
    case "messages": return <MessagesRoute locale={locale} search={search} />;
    case "message-thread": return <DiscussionThreadRoute locale={locale} threadId={decodeRouteId(pathname)} search={search} />;
    case "settings": return session ? <SettingsPage locale={locale} email={session.member.email} role={session.member.role} /> : <NotFoundPage locale={locale} />;
    case "coming-soon": return <ComingSoonPage locale={locale} />;
    case "admin": return session ? <AdminDashboardRoute locale={locale} session={session} /> : <NotFoundPage locale={locale} />;
    case "admin-analytics": return <AdminAnalyticsRoute key={JSON.stringify([session?.member.id, session?.permissionMask, session?.capabilities])} locale={locale} search={search} />;
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
    default: return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace page kind: ${String(value)}`);
}

function HomeRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; summary: WorkbenchSummary } | { kind: "error"; message: string }>({ kind: "loading" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.allSettled([loadTaskSummary(), loadRecentKnowledge(), loadWorkspaceActivity()]).then(([taskResult, knowledgeResult, activityResult]) => {
      if (!active) return;
      const taskSummary = taskResult.status === "fulfilled" ? taskResult.value : undefined;
      const knowledge = knowledgeResult.status === "fulfilled" ? knowledgeResult.value : [];
      const activity = activityResult.status === "fulfilled" ? activityResult.value.items : [];
      if (taskResult.status === "rejected" && knowledgeResult.status === "rejected" && activityResult.status === "rejected") {
        setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        return;
      }
      const summary = buildWorkbenchSummary({ taskSummary, knowledge, activity });
      setState({ kind: "ready", summary });
    });
    return () => { active = false; };
  }, [locale, retry]);
  return <HomePage locale={locale} state={state} onRetry={() => { setState({ kind: "loading" }); setRetry((value) => value + 1); }} />;
}

export function AdminAnalyticsRoute({ locale, search, load = loadAdminAnalytics }: { locale: LocaleRuntime; search: string; load?: (input: LoadAdminAnalyticsInput) => Promise<AdminAnalyticsOverview> }) {
  const initial = useMemo(() => analyticsUrlState(search), [search]);
  const [state, setState] = useState<AdminAnalyticsState>({ kind: "loading" });
  const [days, setDays] = useState(initial.days);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const pendingRef = useRef(true);
  const queryRef = useRef(initial);
  const sameQuery = (a: typeof initial, b: typeof initial) => a.days === b.days && a.page === b.page && a.pageSize === b.pageSize;

  useEffect(() => {
    const onPopState = () => {
      const next = analyticsUrlState(window.location.search);
      queryRef.current = next;
      setDays(next.days);
      setPage(next.page);
      setPageSize(next.pageSize);
    };
    return subscribeWorkspaceLocation(onPopState);
  }, []);

  useEffect(() => {
    queryRef.current = initial;
    setDays(initial.days); setPage(initial.page); setPageSize(initial.pageSize);
  }, [initial]);

  useEffect(() => {
    const snapshot = { days, page, pageSize };
    queryRef.current = snapshot;
    const controller = createNumberedRequestController(
      (input: typeof snapshot, signal) => load({ ...input, signal }),
    );
    setLocalError(false);
    pendingRef.current = true;
    setPending(true);
    setState((previous) => previous.kind === "ready" && previous.data.range.days === days ? previous : { kind: "loading" });
    const request = controller.request(snapshot);
    void request.promise.then((data) => {
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot, queryRef.current)) return;
      setState({ kind: "ready", data });
      pendingRef.current = false;
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot, queryRef.current)) return;
      const denied = error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
      setState((previous) => denied ? { kind: "forbidden" } : previous.kind === "ready" && previous.data.range.days === days ? previous : { kind: "error" });
      setLocalError(true);
      pendingRef.current = false;
      setPending(false);
    });
    return () => controller.dispose();
  }, [load, days, page, pageSize, refresh]);

  const navigateState = (next: { days: number; page: number; pageSize: SupportedPageSize }) => {
    queryRef.current = next;
    const params = new URLSearchParams(writePageSearch(window.location.search, next));
    params.set("days", String(next.days));
    const nextSearch = params.toString();
    writeWorkspaceHistory("push", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
    setDays(next.days);
    setPage(next.page);
    setPageSize(next.pageSize);
  };

  return <AdminAnalyticsPage locale={locale} state={state} days={days} pending={pending} localError={localError}
    onDaysChange={(nextDays) => navigateState({ days: nextDays, page: 1, pageSize })}
    onPageChange={(nextPage) => navigateState({ ...analyticsUrlState(window.location.search), page: nextPage })}
    onPageSizeChange={(nextPageSize) => navigateState({ days, page: 1, pageSize: nextPageSize })}
    onRefresh={() => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setRefresh((value) => value + 1);
    }} />;
}

function analyticsUrlState(search: string): { days: number; page: number; pageSize: SupportedPageSize } {
  const pagination = parsePageSearch(search);
  const dayValues = new URLSearchParams(search).getAll("days");
  const rawDays = dayValues.length === 1 ? dayValues[0]! : "7";
  const parsedDays = /^[1-9]\d*$/u.test(rawDays) ? Number(rawDays) : 7;
  const days = Number.isSafeInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 31 ? parsedDays : 7;
  return { days, ...pagination };
}

// Initial read recovery is distinct from replaying a mutation.
function useInitialReadRetry(kind: string, start: () => void) {
  const [version, setVersion] = useState(0);
  const pending = useRef(false);
  useEffect(() => { if (kind !== "loading") pending.current = false; }, [kind]);
  const retry = () => {
    if (kind !== "error" || pending.current) return;
    pending.current = true;
    start();
    setVersion((value) => value + 1);
  };
  return { retryVersion: version, retryRead: retry };
}

function AdminRolesRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; roles: AdminRole[] } | { kind: "error"; message: string }>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { retryVersion, retryRead } = useInitialReadRetry(state.kind, () => setState({ kind: "loading" }));
  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void loadAdminRoles().then((roles) => { if (active) setState({ kind: "ready", roles }); }).catch(() => { if (active) setState({ kind: "error", message: frontendText(locale, "ADMIN_ROLES_UNAVAILABLE") }); });
    return () => { active = false; };
  }, [locale, retryVersion]);
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
  return <AdminRolesPage onLoadRetry={retryRead} locale={locale} state={state} saving={saving} saveError={saveError} onSave={(role, allowBits) => void save(role, allowBits)} onCreate={(input) => void create(input)} onAssignMember={(role, memberId) => void assignMember(role, memberId)} onUnassignMember={(role, memberId) => void unassignMember(role, memberId)} />;
}

function AdminMenusRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; menus: AdminMenu[] } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { retryVersion, retryRead } = useInitialReadRetry(state.kind, () => setState({ kind: "loading" }));
  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void loadAdminMenus().then((menus) => { if (active) setState({ kind: "ready", menus }); }).catch(() => { if (active) setState({ kind: "error", message: frontendText(locale, "ADMIN_MENUS_UNAVAILABLE") }); });
    return () => { active = false; };
  }, [locale, retryVersion]);
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
  return <AdminMenusPage onLoadRetry={retryRead} locale={locale} state={state} pendingId={pendingId} error={error} onUpdate={(menu, input) => void update(menu, input)} onDelete={(menu) => void remove(menu)} />;
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
  useEffect(() => subscribeWorkspaceLocation(() => { const next = parsePageSearch(window.location.search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); setUrlVersion((value) => value + 1); }), []);
  useEffect(() => {
    const controller = createKnowledgeRequestController(); controllerRef.current = controller;
    const snapshot = { page, pageSize }; queryRef.current = snapshot; setPending(true); setLocalError(undefined);
    const request = controller.request({ ...snapshot, ...knowledgeFilters(window.location.search) });
    void request.promise.then((result) => { if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current)) { setState({ kind: "ready", items: result.items, pagination: result.pagination }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "KNOWLEDGE_ERROR") }); setLocalError(frontendText(locale, "KNOWLEDGE_ERROR")); setPending(false); } });
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale, page, pageSize, retryVersion, urlVersion]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = next; writeWorkspaceHistory("push", `${window.location.pathname}${writePageSearch(window.location.search, next)}`); setPage(next.page); setPageSize(next.pageSize); };
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
    return subscribeWorkspaceLocation(onPopState);
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
    writeWorkspaceHistory("push", nextUrl);
    setActiveQuery(normalized);
    setPage(1); queryRef.current = { query: normalized, page: 1, pageSize };
  };
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = { query: activeQuery, ...next }; writeWorkspaceHistory("push", `${window.location.pathname}${writePageSearch(window.location.search, next)}`); setPage(next.page); setPageSize(next.pageSize); };
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
    writeWorkspaceHistory("push", nextUrl);
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

export function SubmitRoute({ locale, memberId }: { locale: LocaleRuntime; memberId: string }) {
  return <MemberSubmitForm key={memberId} locale={locale} memberId={memberId} />;
}

function MemberSubmitForm({ locale, memberId }: { locale: LocaleRuntime; memberId: string }) {
  const [restored] = useState(() => loadSubmissionIntent(memberId));
  const [intent, setIntent] = useState<SubmissionIntent | null>(() => restored.kind === "ready" ? restored.intent : null);
  const intentRef = useRef(intent);
  const [storageUnavailable, setStorageUnavailable] = useState(restored.kind === "unavailable");
  const [invalidIntent, setInvalidIntent] = useState(restored.kind === "invalid");
  const [draft, setDraft] = useState<SubmissionDraft>(() => loadOfflineSubmissionDraft(memberId) ?? { mode: "markdown", title: "", content: "" });
  const [state, setState] = useState<{ kind: "idle" } | { kind: "pending" } | { kind: "validation"; message: string } | { kind: "error"; message: string } | { kind: "success"; message: string; similarCandidates: SimilarSubmissionCandidate[] }>({ kind: "idle" });
  const draftRef = useRef(draft);
  const requestRef = useRef<AbortController | null>(null);
  const changeDraft = (nextDraft: SubmissionDraft) => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };
  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);
  const submit = async (nextDraft: SubmissionDraft) => {
    if (requestRef.current || invalidIntent) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const draftAtStart = draftRef.current;
    setState({ kind: "pending" });
    try {
      let active = intentRef.current;
      if (!active) {
        const stored = loadSubmissionIntent(memberId);
        if (stored.kind === "invalid") { setInvalidIntent(true); setState({ kind: "idle" }); return; }
        if (stored.kind === "ready") {
          intentRef.current = stored.intent; setIntent(stored.intent); setState({ kind: "idle" }); return;
        }
        active = createSubmissionIntent(nextDraft);
      }
      if (!saveSubmissionIntent(memberId, active)) {
        const stored = loadSubmissionIntent(memberId);
        if (stored.kind === "invalid") { setInvalidIntent(true); setState({ kind: "idle" }); return; }
        if (stored.kind === "ready" && JSON.stringify(stored.intent) !== JSON.stringify(active)) {
          intentRef.current = stored.intent; setIntent(stored.intent); setState({ kind: "idle" }); return;
        }
        setStorageUnavailable(true);
      }
      intentRef.current = active;
      setIntent(active);
      const result = await createSubmission(active.draft, active.key, fetch, controller.signal);
      if (controller.signal.aborted || requestRef.current !== controller) return;
      if (!clearSubmissionIntent(memberId, active.key)) setStorageUnavailable(true);
      intentRef.current = null;
      setIntent(null);
      // A successful older submission must not erase edits made while it was pending.
      if (draftRef.current === draftAtStart && draftAtStart.mode === active.draft.mode && draftAtStart.title.trim() === active.draft.title && draftAtStart.content === active.draft.content) {
        clearOfflineSubmissionDraft(memberId);
        changeDraft({ mode: nextDraft.mode, title: "", content: "" });
      }
      setState({ kind: "success", message: frontendText(locale, "SUBMIT_SUCCESS"), similarCandidates: result.similarCandidates });
    } catch (error: unknown) {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      const validation = error instanceof Error && error.message === "SUBMISSION_DRAFT_INVALID";
      const conflict = error !== null && typeof error === "object" && "code" in error && error.code === "IDEMPOTENCY_CONFLICT";
      const identityError = error instanceof Error && error.message === "SUBMISSION_RANDOM_UNAVAILABLE";
      setState({ kind: validation ? "validation" : "error", message: frontendText(locale, validation ? "SUBMIT_VALIDATION_ERROR" : conflict ? "SUBMIT_CONFLICT" : identityError ? "SUBMIT_IDENTITY_ERROR" : "SUBMIT_ERROR") });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  };
  useEffect(() => { saveOfflineSubmissionDraft(memberId, draft); }, [memberId, draft]);
  return <SubmitPage locale={locale} draft={draft} state={state} onDraftChange={changeDraft} onSubmit={submit} recovery={{ title: intent?.draft.title, storageUnavailable, invalid: invalidIntent, onRetry: () => { if (intentRef.current) void submit(intentRef.current.draft); } }} />;
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
  useEffect(() => subscribeWorkspaceLocation(() => { const next = parsePageSearch(window.location.search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); setUrlVersion((value) => value + 1); }), []);
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
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = next; writeWorkspaceHistory("push", `${window.location.pathname}${writePageSearch(window.location.search, next)}`); setPage(next.page); setPageSize(next.pageSize); };
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
      setActionError(undefined);
      const pagination = parsePageSearch(window.location.search);
      const nextFilters = taskFiltersFromSearch(window.location.search);
      if (textFilterTimerRef.current) { clearTimeout(textFilterTimerRef.current); textFilterTimerRef.current = null; }
      queryRef.current = { ...pagination, filters: nextFilters };
      setPage(pagination.page); setPageSize(pagination.pageSize); setFilters(nextFilters); setDraftFilters(nextFilters); setRetryVersion((value) => value + 1);
    };
    return subscribeWorkspaceLocation(onPopState);
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
    setActionError(undefined);
    if (textFilterTimerRef.current) { clearTimeout(textFilterTimerRef.current); textFilterTimerRef.current = null; }
    queryRef.current = next;
    const url = taskSearch(next);
    writeWorkspaceHistory(replace ? "replace" : "push", `/tasks${url}`);
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

export function InboxRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<InboxPageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true);
  const stateRef = useRef<InboxPageState>({ kind: "loading" });
  stateRef.current = state;

  const refresh = useCallback(async (append = false) => {
    const currentState = stateRef.current;
    const cursor = append && currentState.kind === "ready" ? currentState.nextCursor : undefined;
    setPending(true); setActionError(undefined);
    try {
      const page = await loadInbox({ limit: 20, ...(cursor ? { cursor } : {}) });
      if (!activeRef.current) return;
      setState((current) => append && current.kind === "ready"
        ? { kind: "ready", items: [...current.items, ...page.items], nextCursor: page.nextCursor }
        : { kind: "ready", items: page.items, nextCursor: page.nextCursor });
    } catch (error: unknown) {
      if (!activeRef.current || isAbort(error)) return;
      setState((current) => current.kind === "ready" ? current : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setActionError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
    } finally { if (activeRef.current) setPending(false); }
  }, [locale]);

  useEffect(() => { activeRef.current = true; void refresh(); return () => { activeRef.current = false; }; }, [refresh, retryVersion]);

  const mutate = async (operation: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true); setActionError(undefined);
    try { await operation(); await refresh(); }
    catch (error: unknown) { if (!isAbort(error)) setActionError(frontendText(locale, "INBOX_ACTION_FAILED")); setPending(false); }
  };

  return <InboxPage locale={locale} state={state} pending={pending} actionError={actionError}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onCreate={(input) => void mutate(async () => { await createInbox(input); })}
    onStatusChange={(item) => void mutate(() => updateInboxStatus(item.id, item.status === "archived" ? "inbox" : "archived"))}
    onPromoteTask={(item) => void mutate(() => promoteInboxTask(item.id))}
    onLoadMore={() => void refresh(true)} />;
}

export function GoalsRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<GoalsPageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true);
  const stateRef = useRef<GoalsPageState>({ kind: "loading" });
  stateRef.current = state;

  const refresh = useCallback(async (append = false) => {
    const currentState = stateRef.current;
    const cursor = append && currentState.kind === "ready" ? currentState.nextCursor : undefined;
    setPending(true); setActionError(undefined);
    try {
      const page = await loadGoals({ limit: 20, ...(cursor ? { cursor } : {}) });
      if (!activeRef.current) return;
      setState((current) => append && current.kind === "ready"
        ? { kind: "ready", items: [...current.items, ...page.items], nextCursor: page.nextCursor }
        : { kind: "ready", items: page.items, nextCursor: page.nextCursor });
    } catch (error: unknown) {
      if (!activeRef.current || isAbort(error)) return;
      setState((current) => current.kind === "ready" ? current : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setActionError(frontendText(locale, "GOALS_ACTION_FAILED"));
    } finally { if (activeRef.current) setPending(false); }
  }, [locale]);

  useEffect(() => { activeRef.current = true; void refresh(); return () => { activeRef.current = false; }; }, [refresh, retryVersion]);

  const mutate = async (operation: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true); setActionError(undefined);
    try { await operation(); await refresh(); }
    catch (error: unknown) { if (!isAbort(error)) setActionError(frontendText(locale, "GOALS_ACTION_FAILED")); setPending(false); }
  };

  return <GoalsPage locale={locale} state={state} pending={pending} actionError={actionError}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onCreate={(input) => void mutate(() => createGoal(input))}
    onStatusChange={(goal: Goal, status) => void mutate(() => setGoalStatus(goal.id, status))}
    onProgressChange={(goal: Goal, progress) => void mutate(() => setGoalProgress(goal.id, progress))}
    onLoadMore={() => void refresh(true)} />;
}

export function ProjectsRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<ProjectsPageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true);
  const stateRef = useRef<ProjectsPageState>({ kind: "loading" });
  stateRef.current = state;

  const refresh = useCallback(async (append = false) => {
    const currentState = stateRef.current;
    const cursor = append && currentState.kind === "ready" ? currentState.nextCursor : undefined;
    setPending(true); setActionError(undefined);
    try {
      const page = await loadProjects({ limit: 20, ...(cursor ? { cursor } : {}) });
      const entries = await Promise.all(page.items.map(async (project) => [project.id, await loadProjectSummary(project.id)] as const));
      if (!activeRef.current) return;
      const summaries = Object.fromEntries(entries) as Record<string, ProjectSummary>;
      setState((current) => append && current.kind === "ready"
        ? { kind: "ready", items: [...current.items, ...page.items], summaries: { ...current.summaries, ...summaries }, nextCursor: page.nextCursor }
        : { kind: "ready", items: page.items, summaries, nextCursor: page.nextCursor });
    } catch (error: unknown) {
      if (!activeRef.current || isAbort(error)) return;
      setState((current) => current.kind === "ready" ? current : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setActionError(frontendText(locale, "PROJECTS_ACTION_FAILED"));
    } finally { if (activeRef.current) setPending(false); }
  }, [locale]);

  useEffect(() => { activeRef.current = true; void refresh(); return () => { activeRef.current = false; }; }, [refresh, retryVersion]);

  const mutate = async (operation: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true); setActionError(undefined);
    try { await operation(); await refresh(); }
    catch (error: unknown) { if (!isAbort(error)) setActionError(frontendText(locale, "PROJECTS_ACTION_FAILED")); setPending(false); }
  };

  return <ProjectsPage locale={locale} state={state} pending={pending} actionError={actionError}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onCreate={(input) => void mutate(() => createProject(input))}
    onStatusChange={(project: Project, status) => void mutate(() => setProjectStatus(project.id, status))}
    onOpenTimeline={(project) => writeWorkspaceHistory("push", `/projects/${encodeURIComponent(project.id)}/timeline`)}
    onLoadMore={() => void refresh(true)} />;
}

export function ProjectTimelineRoute({ locale, projectId }: { locale: LocaleRuntime; projectId: string }) {
  const [state, setState] = useState<ProjectTimelinePageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true);
  const stateRef = useRef<ProjectTimelinePageState>({ kind: "loading" });
  stateRef.current = state;

  const refresh = useCallback(async (append = false) => {
    const current = stateRef.current;
    const cursor = append && current.kind === "ready" ? current.nextCursor : undefined;
    setPending(true); setActionError(undefined);
    try {
      const [project, page] = await Promise.all([loadProject(projectId), loadProjectTimeline(projectId, { limit: 20, ...(cursor ? { cursor } : {}) })]);
      if (!activeRef.current) return;
      setState((previous) => append && previous.kind === "ready" ? { kind: "ready", project, items: [...previous.items, ...page.items], nextCursor: page.nextCursor } : { kind: "ready", project, items: page.items, nextCursor: page.nextCursor });
    } catch (error: unknown) {
      if (!activeRef.current || isAbort(error)) return;
      setState((currentState) => currentState.kind === "ready" ? currentState : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setActionError(frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED"));
    } finally { if (activeRef.current) setPending(false); }
  }, [locale, projectId]);

  useEffect(() => { activeRef.current = true; void refresh(); return () => { activeRef.current = false; }; }, [refresh, retryVersion]);
  const mutate = async (operation: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true); setActionError(undefined);
    try { await operation(); await refresh(); }
    catch (error: unknown) { if (!isAbort(error)) setActionError(frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED")); setPending(false); }
  };
  return <ProjectTimelinePage locale={locale} state={state} pending={pending} actionError={actionError}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onBack={() => writeWorkspaceHistory("push", "/projects")}
    onCreate={(input) => void mutate(() => createProjectTimeline(projectId, input))}
    onStatusChange={(item: ProjectTimelineItem, status: ProjectTimelineStatus) => void mutate(() => setProjectTimelineStatus(projectId, item.id, status))}
    onLoadMore={() => void refresh(true)} />;
}

export function CalendarRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<CalendarPageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true);
  const stateRef = useRef<CalendarPageState>({ kind: "loading" });
  stateRef.current = state;
  const range = useMemo(() => {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 14);
    return { from, to };
  }, [retryVersion]);
  const refresh = useCallback(async (append = false) => {
    const current = stateRef.current;
    const cursor = append && current.kind === "ready" ? current.nextCursor : undefined;
    setPending(true); setActionError(undefined);
    try {
      const page = await loadCalendar({ ...range, limit: 50, ...(cursor ? { cursor } : {}) });
      if (!activeRef.current) return;
      setState((previous) => append && previous.kind === "ready" ? { kind: "ready", items: [...previous.items, ...page.items], nextCursor: page.nextCursor } : { kind: "ready", items: page.items, nextCursor: page.nextCursor });
    } catch (error: unknown) {
      if (!activeRef.current || isAbort(error)) return;
      setState((currentState) => currentState.kind === "ready" ? currentState : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setActionError(frontendText(locale, "CALENDAR_ACTION_FAILED"));
    } finally { if (activeRef.current) setPending(false); }
  }, [locale, range]);
  useEffect(() => { activeRef.current = true; void refresh(); return () => { activeRef.current = false; }; }, [refresh]);
  const mutate = async (operation: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true); setActionError(undefined);
    try { await operation(); await refresh(); } catch (error: unknown) { if (!isAbort(error)) setActionError(frontendText(locale, "CALENDAR_ACTION_FAILED")); setPending(false); }
  };
  return <CalendarPage locale={locale} state={state} pending={pending} actionError={actionError}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onCreate={(input) => void mutate(() => createCalendarEvent(input))}
    onCancel={(event: CalendarEvent) => void mutate(() => cancelCalendarEvent(event.id))}
    onLoadMore={() => void refresh(true)} />;
}

export function TodayRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<TodayPageState>({ kind: "loading" });
  const [retryVersion, setRetryVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    void loadToday().then((snapshot) => { if (active) setState({ kind: "ready", snapshot }); }).catch((error: unknown) => { if (active && !isAbort(error)) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); });
    return () => { active = false; };
  }, [locale, retryVersion]);
  return <TodayPage locale={locale} state={state} onRetry={() => setRetryVersion((value) => value + 1)} />;
}

export function FocusRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<FocusPageState>({ kind: "loading" });
  const [retryVersion, setRetryVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const refresh = useCallback(() => {
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    return loadCurrentFocus().then((session) => setState({ kind: "ready", session })).catch((error: unknown) => { if (!isAbort(error)) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); });
  }, [locale]);
  useEffect(() => { void refresh(); }, [refresh, retryVersion]);
  const mutate = async (operation: () => Promise<unknown>) => { if (pending) return; setPending(true); setActionError(undefined); try { await operation(); await refresh(); } catch (error: unknown) { if (!isAbort(error)) setActionError(frontendText(locale, "FOCUS_ACTION_FAILED")); } finally { setPending(false); } };
  return <FocusPage locale={locale} state={state} pending={pending} actionError={actionError} onRetry={() => setRetryVersion((value) => value + 1)} onStart={(input) => void mutate(() => startFocus(input))} onTransition={(action) => { if (state.kind === "ready" && state.session) void mutate(() => transitionFocus(state.session!.id, action)); }} />;
}

export function WorkbenchReviewRoute({ locale }: { locale: LocaleRuntime }) {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [state, setState] = useState<WorkbenchReviewPageState>({ kind: "loading" });
  const [retryVersion, setRetryVersion] = useState(0);
  useEffect(() => { let active = true; setState((current) => current.kind === "ready" ? current : { kind: "loading" }); void loadWorkbenchReview(period).then((snapshot) => { if (active) setState({ kind: "ready", snapshot }); }).catch((error: unknown) => { if (active && !isAbort(error)) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); }); return () => { active = false; }; }, [locale, period, retryVersion]);
  return <WorkbenchReviewPage locale={locale} period={period} state={state} onPeriodChange={setPeriod} onRetry={() => setRetryVersion((value) => value + 1)} />;
}

export function NotificationsRoute({ locale, search, isAdmin = false }: { locale: LocaleRuntime; search: string; isAdmin?: boolean }) {
  const initial = useMemo(() => parseNotificationSearch(search), [search]);
  const [query, setQuery] = useState<NotificationQuery>(initial);
  const [state, setState] = useState<NotificationsPageState>({ kind: "loading" });
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const queryRef = useRef(query);
  queryRef.current = query;
  const controllerRef = useRef<ReturnType<typeof createNotificationsRequestController> | null>(null);
  const actionPendingRef = useRef(false);
  const activeRef = useRef(true);
  const locationEpochRef = useRef(0);

  const clearRestrictedState = () => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setSummary(null);
    setPending(false);
    setActionError(undefined);
    setState({ kind: "forbidden" });
  };

  useEffect(() => {
    const controller = controllerRef.current ?? createNotificationsRequestController();
    controllerRef.current = controller;
    setPending(true);
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    const snapshot = query;
    const request = controller.request(snapshot);
    void request.promise.then(({ page, summary: nextSummary }) => {
      if (!controller.isCurrent(request.generation) || !sameNotificationQuery(queryRef.current, snapshot)) return;
      const lastPage = Math.max(1, page.pagination.totalPages);
      if (snapshot.page > lastPage) {
        const next = { ...snapshot, page: lastPage };
        writeWorkspaceHistory("replace", `/notifications${writeNotificationSearch(window.location.search, next)}`);
        queryRef.current = next; setQuery(next);
        return;
      }
      setState({ kind: "ready", items: page.items, pagination: page.pagination });
      setSummary(nextSummary);
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || !sameNotificationQuery(queryRef.current, snapshot) || isAbort(error)) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        clearRestrictedState(); return;
      }
      setState({ kind: "error" }); setPending(false);
    });
  }, [query, retryVersion]);

  useEffect(() => {
    const onPopState = () => {
      locationEpochRef.current += 1;
      const next = parseNotificationSearch(window.location.search);
      setActionError(undefined);
      queryRef.current = next; setQuery(next);
    };
    return subscribeWorkspaceLocation(onPopState);
  }, []);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      locationEpochRef.current += 1;
      actionPendingRef.current = false;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  const navigate = (next: NotificationQuery, replace = false) => {
    setActionError(undefined);
    writeWorkspaceHistory(replace ? "replace" : "push", `/notifications${writeNotificationSearch(window.location.search, next)}`);
    queryRef.current = next; setQuery(next);
  };

  const mutate = async (operation: () => Promise<unknown>, openEpoch?: number) => {
    if (actionPendingRef.current) return;
    const actionEpoch = locationEpochRef.current;
    actionPendingRef.current = true;
    setActionPending(true); setActionError(undefined);
    try {
      await operation();
      if (activeRef.current && (openEpoch === undefined || openEpoch === locationEpochRef.current)) setRetryVersion((value) => value + 1);
    } catch (error: unknown) {
      if (activeRef.current && !isAbort(error)) {
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) clearRestrictedState();
        else if (actionEpoch === locationEpochRef.current) setActionError(frontendText(locale, "NOTIFICATIONS_ACTION_FAILED"));
      }
    } finally {
      actionPendingRef.current = false;
      if (activeRef.current) setActionPending(false);
    }
  };

  return <NotificationsPage
    locale={locale}
    state={state}
    summary={summary}
    filters={query.filters}
    pending={pending}
    actionPending={actionPending}
    actionError={actionError}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onFilterChange={(filters: NotificationFilters) => navigate({ page: 1, pageSize: query.pageSize, filters })}
    onPageChange={(page) => navigate({ ...query, page })}
    onPageSizeChange={(pageSize) => navigate({ page: 1, pageSize, filters: query.filters })}
    onMarkRead={(id) => void mutate(() => markNotificationRead(id))}
    onMarkVisibleRead={(ids) => void mutate(() => markVisibleNotificationsRead(ids))}
    onOpen={(id) => {
      const epoch = locationEpochRef.current;
      void mutate(async () => {
        const current = await markNotificationRead(id);
        if (!activeRef.current || epoch !== locationEpochRef.current) return;
        const href = notificationTargetHref(current, isAdmin);
        if (href) writeWorkspaceHistory("push", href);
        else setActionError(frontendText(locale, "NOTIFICATIONS_TARGET_UNAVAILABLE"));
      }, epoch);
    }}
  />;
}

export function MessagesRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = useMemo(() => parseDiscussionSearch(search), [search]);
  const [query, setQuery] = useState<DiscussionSearch>(initial);
  const [state, setState] = useState<MessagesPageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const controllerRef = useRef<ReturnType<typeof createDiscussionRequestController<DiscussionSearch, Awaited<ReturnType<typeof loadDiscussionThreads>>>> | null>(null);

  useEffect(() => {
    if (query.context) {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      let active = true;
      setPending(true); setState({ kind: "loading" });
      void ensureDiscussionThread(query.context).then(({ thread }) => {
        if (!active) return;
        writeWorkspaceHistory("replace", `/messages/${encodeURIComponent(thread.id)}`);
      }).catch(() => { if (active) { setState({ kind: "error" }); setPending(false); } });
      return () => { active = false; };
    }
    const controller = controllerRef.current ?? createDiscussionRequestController((input: DiscussionSearch, signal) =>
      loadDiscussionThreads({ limit: input.limit, ...(input.cursor ? { cursor: input.cursor } : {}) }, fetch, signal));
    controllerRef.current = controller;
    setPending(true);
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    const snapshot = query;
    const request = controller.request(snapshot);
    void request.promise.then((page) => {
      if (!controller.isCurrent(request.generation) || !sameDiscussionSearch(queryRef.current, snapshot)) return;
      setState({ kind: "ready", items: page.items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) });
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || !sameDiscussionSearch(queryRef.current, snapshot) || isAbort(error)) return;
      setState({ kind: "error" }); setPending(false);
    });
  }, [query, retryVersion]);

  useEffect(() => {
    const onLocationChange = () => {
      if (window.location.pathname !== "/messages") return;
      const next = parseDiscussionSearch(window.location.search);
      if (sameDiscussionSearch(queryRef.current, next)) return;
      queryRef.current = next;
      setQuery(next);
    };
    return subscribeWorkspaceLocation(onLocationChange);
  }, []);
  useEffect(() => () => { controllerRef.current?.dispose(); controllerRef.current = null; }, []);

  const navigate = (next: DiscussionSearch) => {
    writeWorkspaceHistory("push", `/messages${writeDiscussionSearch(window.location.search, next)}`);
    queryRef.current = next; setQuery(next);
  };
  return <MessagesPage locale={locale} state={state} page={query.page} limit={query.limit} pending={pending}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onNext={(cursor) => navigate({ page: query.page + 1, limit: query.limit, cursor })}
    onPrevious={() => window.history.back()}
    onLimitChange={(limit) => navigate({ page: 1, limit })} />;
}

export function DiscussionThreadRoute({ locale, threadId, search }: { locale: LocaleRuntime; threadId: string; search: string }) {
  const initial = useMemo(() => parseDiscussionSearch(search), [search]);
  const [query, setQuery] = useState<DiscussionSearch>(initial);
  const [state, setState] = useState<ThreadPageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const activeRef = useRef(true);
  const currentThreadIdRef = useRef(threadId);
  currentThreadIdRef.current = threadId;
  const controllerRef = useRef<ReturnType<typeof createDiscussionRequestController<DiscussionSearch, { thread: Awaited<ReturnType<typeof loadDiscussionThread>>; messages: Awaited<ReturnType<typeof loadDiscussionMessages>> }>> | null>(null);

  useEffect(() => {
    controllerRef.current?.dispose();
    const controller = createDiscussionRequestController(async (input: DiscussionSearch, signal) => {
      const [thread, messages] = await Promise.all([
        loadDiscussionThread(threadId, fetch, signal),
        loadDiscussionMessages(threadId, { limit: input.limit, ...(input.cursor ? { cursor: input.cursor } : {}) }, fetch, signal),
      ]);
      return { thread, messages };
    });
    controllerRef.current = controller;
    setPending(true);
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    const snapshot = query;
    const request = controller.request(snapshot);
    void request.promise.then(({ thread, messages }) => {
      if (!controller.isCurrent(request.generation) || !sameDiscussionSearch(queryRef.current, snapshot)) return;
      setState({ kind: "ready", thread, messages: messages.items, ...(messages.nextCursor ? { nextCursor: messages.nextCursor } : {}) });
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || !sameDiscussionSearch(queryRef.current, snapshot) || isAbort(error)) return;
      setState({ kind: "error" }); setPending(false);
    });
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [query, retryVersion, threadId]);

  useEffect(() => {
    activeRef.current = true;
    const onPopState = () => { const next = parseDiscussionSearch(window.location.search); queryRef.current = next; setQuery(next); };
    const unsubscribe = subscribeWorkspaceLocation(onPopState);
    return () => { activeRef.current = false; unsubscribe(); controllerRef.current?.dispose(); controllerRef.current = null; };
  }, []);

  const navigate = (next: DiscussionSearch, replace = false) => {
    writeWorkspaceHistory(replace ? "replace" : "push", `/messages/${encodeURIComponent(threadId)}${writeDiscussionSearch(window.location.search, next)}`);
    queryRef.current = next; setQuery(next);
  };
  const send = async (input: Parameters<typeof sendDiscussionMessage>[0]) => {
    const sendingThreadId = threadId;
    await sendDiscussionMessage(input);
    if (!activeRef.current || currentThreadIdRef.current !== sendingThreadId) return;
    if (queryRef.current.page !== 1 || queryRef.current.cursor) navigate({ page: 1, limit: queryRef.current.limit }, true);
    else setRetryVersion((value) => value + 1);
  };
  const visibleState: ThreadPageState = state.kind === "ready" && state.thread.id !== threadId ? { kind: "loading" } : state;
  return <ThreadPage key={threadId} locale={locale} state={visibleState} page={query.page} limit={query.limit} pending={pending}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onRefresh={() => setRetryVersion((value) => value + 1)}
    onNext={(cursor) => navigate({ page: query.page + 1, limit: query.limit, cursor })}
    onPrevious={() => window.history.back()}
    onLimitChange={(limit) => navigate({ page: 1, limit })}
    onSend={send} />;
}

function sameDiscussionSearch(left: DiscussionSearch, right: DiscussionSearch): boolean {
  return left.page === right.page && left.limit === right.limit && left.cursor === right.cursor
    && left.context?.kind === right.context?.kind && left.context?.id === right.context?.id;
}

function sameNotificationQuery(left: NotificationQuery, right: NotificationQuery): boolean {
  return left.page === right.page && left.pageSize === right.pageSize
    && left.filters.read === right.filters.read && left.filters.eventType === right.filters.eventType;
}

export function BoardsRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = useMemo(() => parseBoardSearch(search), [search]);
  const [queries, setQueries] = useState<BoardPagination>(initial);
  const [columns, setColumns] = useState<BoardColumnStates>(initialBoardColumns);
  const [retryVersions, setRetryVersions] = useState<Record<BoardStatus, number>>(() => ({ todo: 0, doing: 0, blocked: 0, done: 0 }));
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | undefined>();
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const queriesRef = useRef(queries);
  queriesRef.current = queries;
  const requestStatesRef = useRef<Record<BoardStatus, BoardRequestState>>(initialBoardRequestStates());
  const mutationOwnersRef = useRef<Record<BoardStatus, number | null>>({ todo: null, doing: null, blocked: null, done: null });
  const actionPendingRef = useRef(false);
  const actionGenerationRef = useRef(0);
  const activeRef = useRef(true);

  useBoardColumnRequest("todo", queries.todo, retryVersions.todo, queriesRef, requestStatesRef, mutationOwnersRef, setQueries, setColumns);
  useBoardColumnRequest("doing", queries.doing, retryVersions.doing, queriesRef, requestStatesRef, mutationOwnersRef, setQueries, setColumns);
  useBoardColumnRequest("blocked", queries.blocked, retryVersions.blocked, queriesRef, requestStatesRef, mutationOwnersRef, setQueries, setColumns);
  useBoardColumnRequest("done", queries.done, retryVersions.done, queriesRef, requestStatesRef, mutationOwnersRef, setQueries, setColumns);

  useEffect(() => {
    const onPopState = () => {
      const next = parseBoardSearch(window.location.search);
      queriesRef.current = next; setActionError(undefined); setQueries(next);
    };
    return subscribeWorkspaceLocation(onPopState);
  }, []);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; actionGenerationRef.current += 1; };
  }, []);

  const navigate = (status: BoardStatus, next: { page: number; pageSize: SupportedPageSize }) => {
    setActionError(undefined);
    writeWorkspaceHistory("push", `/boards${writeBoardColumnSearch(window.location.search, status, next)}`);
    const nextQueries = { ...queriesRef.current, [status]: next };
    queriesRef.current = nextQueries; setQueries(nextQueries);
  };

  const move = async (task: TaskItem, target: BoardTargetStatus) => {
    if (actionPendingRef.current || task.status === target || !BOARD_STATUSES.includes(task.status as BoardStatus)) return;
    const source = task.status as BoardStatus;
    const before = columnsRef.current;
    const optimistic = moveTaskBetweenColumns(before, task, source, target);
    if (optimistic === before) return;
    const sourceQuery = { ...queriesRef.current[source] };
    const targetQuery = isBoardStatus(target) ? { ...queriesRef.current[target] } : undefined;
    const targetChanged = isBoardStatus(target) && optimistic[target] !== before[target];
    const targetBefore = isBoardStatus(target) ? before[target] : undefined;
    const targetEvicted = targetChanged && targetBefore?.kind === "ready" && targetBefore.pagination.page === 1
      && targetBefore.items.length === targetBefore.pagination.pageSize ? targetBefore.items.at(-1) : undefined;
    const targetEvictedIndex = targetEvicted && targetBefore?.kind === "ready" ? targetBefore.items.length - 1 : undefined;
    actionPendingRef.current = true;
    actionGenerationRef.current += 1;
    const generation = actionGenerationRef.current;
    mutationOwnersRef.current[source] = generation;
    if (targetChanged) mutationOwnersRef.current[target] = generation;
    const delta: BoardMutationDelta = {
      task, source, sourceQuery, owner: generation,
      sourceRequestRevision: requestStatesRef.current[source].revision,
      sourceIndex: before[source].kind === "ready" ? before[source].items.findIndex((item) => item.id === task.id) : -1,
      ...(isBoardStatus(target) ? {
        target, targetQuery: targetQuery!, targetChanged,
        targetRequestRevision: requestStatesRef.current[target].revision,
        ...(targetEvicted ? { targetEvicted, targetEvictedIndex } : {}),
      } : {}),
    };
    setActionPendingId(task.id); setActionError(undefined); setColumns(optimistic); columnsRef.current = optimistic;
    try {
      await setTaskStatus(task.id, target);
      if (!activeRef.current || generation !== actionGenerationRef.current) return;
      setRetryVersions((current) => ({ ...current, [source]: current[source] + 1, ...(isBoardStatus(target) ? { [target]: current[target] + 1 } : {}) }));
    } catch (error: unknown) {
      if (activeRef.current && generation === actionGenerationRef.current && !isAbort(error)) {
        const sourceMatches = sameBoardQuery(queriesRef.current[source], delta.sourceQuery)
          && requestStatesRef.current[source].revision === delta.sourceRequestRevision
          && mutationOwnersRef.current[source] === delta.owner;
        const targetMatches = delta.target !== undefined && delta.targetChanged
          && sameBoardQuery(queriesRef.current[delta.target], delta.targetQuery!)
          && requestStatesRef.current[delta.target].revision === delta.targetRequestRevision
          && mutationOwnersRef.current[delta.target] === delta.owner;
        if (sourceMatches) mutationOwnersRef.current[source] = null;
        if (targetMatches && delta.target) mutationOwnersRef.current[delta.target] = null;
        setColumns((current) => rollbackBoardMove(current, delta, sourceMatches, targetMatches));
        setRetryVersions((current) => {
          const next = { ...current };
          if (!sourceMatches && needsBoardReplacement(source, delta.sourceQuery, queriesRef, requestStatesRef, columnsRef)) next[source] += 1;
          if (delta.target && delta.targetChanged && !targetMatches
            && needsBoardReplacement(delta.target, delta.targetQuery!, queriesRef, requestStatesRef, columnsRef)) next[delta.target] += 1;
          if (sourceMatches && (requestStatesRef.current[source].pending || requestStatesRef.current[source].superseded)) next[source] += 1;
          if (delta.target && targetMatches && (requestStatesRef.current[delta.target].pending || requestStatesRef.current[delta.target].superseded)) next[delta.target] += 1;
          return next;
        });
        setActionError(frontendText(locale, "BOARDS_ACTION_FAILED"));
      }
    } finally {
      if (activeRef.current && generation === actionGenerationRef.current) {
        actionPendingRef.current = false; setActionPendingId(null);
      }
    }
  };

  return <BoardsPage locale={locale} columns={columns} actionError={actionError} actionPendingId={actionPendingId}
    onRetry={(status) => setRetryVersions((current) => ({ ...current, [status]: current[status] + 1 }))}
    onPageChange={(status, page) => navigate(status, { page, pageSize: queries[status].pageSize })}
    onPageSizeChange={(status, pageSize) => navigate(status, { page: 1, pageSize })}
    onStatusChange={(task, status) => void move(task, status)} />;
}

function useBoardColumnRequest(
  status: BoardStatus,
  query: { page: number; pageSize: SupportedPageSize },
  retryVersion: number,
  queriesRef: { current: BoardPagination },
  requestStatesRef: { current: Record<BoardStatus, BoardRequestState> },
  mutationOwnersRef: { current: Record<BoardStatus, number | null> },
  setQueries: Dispatch<SetStateAction<BoardPagination>>,
  setColumns: Dispatch<SetStateAction<BoardColumnStates>>,
) {
  useEffect(() => {
    const controller = createTasksRequestController();
    const querySnapshot = { ...query };
    const revision = requestStatesRef.current[status].revision + 1;
    const owner = mutationOwnersRef.current[status];
    requestStatesRef.current[status] = { revision, pending: true, superseded: false };
    setColumns((current) => ({ ...current, [status]: current[status].kind === "ready" ? { ...current[status], pending: true, loadError: false } : { kind: "loading" } }));
    const request = controller.request({ page: query.page, pageSize: query.pageSize, filters: { status } });
    void request.promise.then((data) => {
      if (!controller.isCurrent(request.generation) || requestStatesRef.current[status].revision !== revision) return;
      if (!sameBoardQuery(queriesRef.current[status], querySnapshot) || mutationOwnersRef.current[status] !== owner) {
        requestStatesRef.current[status] = { revision, pending: false, superseded: true }; return;
      }
      requestStatesRef.current[status] = { revision, pending: false, superseded: false };
      mutationOwnersRef.current[status] = null;
      const lastPage = Math.max(1, data.pagination.totalPages);
      if (querySnapshot.page > lastPage) {
        const nextQuery = { page: lastPage, pageSize: querySnapshot.pageSize };
        const nextQueries = { ...queriesRef.current, [status]: nextQuery };
        writeWorkspaceHistory("replace", `/boards${writeBoardColumnSearch(window.location.search, status, nextQuery)}`);
        queriesRef.current = nextQueries; setQueries(nextQueries);
        return;
      }
      setColumns((current) => ({ ...current, [status]: { kind: "ready", items: data.items, pagination: data.pagination, pending: false } }));
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || requestStatesRef.current[status].revision !== revision || isAbort(error)) return;
      if (!sameBoardQuery(queriesRef.current[status], querySnapshot) || mutationOwnersRef.current[status] !== owner) {
        requestStatesRef.current[status] = { revision, pending: false, superseded: true }; return;
      }
      requestStatesRef.current[status] = { revision, pending: false, superseded: false };
      setColumns((current) => ({ ...current, [status]: current[status].kind === "ready" ? { ...current[status], pending: false, loadError: true } : { kind: "error" } }));
    });
    return () => controller.dispose();
  }, [query.page, query.pageSize, retryVersion, setColumns, setQueries, status]);
}

function initialBoardColumns(): BoardColumnStates {
  return { todo: { kind: "loading" }, doing: { kind: "loading" }, blocked: { kind: "loading" }, done: { kind: "loading" } };
}

interface BoardRequestState { revision: number; pending: boolean; superseded: boolean }

function initialBoardRequestStates(): Record<BoardStatus, BoardRequestState> {
  return {
    todo: { revision: 0, pending: false, superseded: false },
    doing: { revision: 0, pending: false, superseded: false },
    blocked: { revision: 0, pending: false, superseded: false },
    done: { revision: 0, pending: false, superseded: false },
  };
}

interface BoardMutationDelta {
  task: TaskItem;
  owner: number;
  source: BoardStatus;
  sourceQuery: { page: number; pageSize: SupportedPageSize };
  sourceRequestRevision: number;
  sourceIndex: number;
  target?: BoardStatus;
  targetQuery?: { page: number; pageSize: SupportedPageSize };
  targetChanged?: boolean;
  targetRequestRevision?: number;
  targetEvicted?: TaskItem;
  targetEvictedIndex?: number;
}

function moveTaskBetweenColumns(columns: BoardColumnStates, task: TaskItem, source: BoardStatus, target: BoardTargetStatus): BoardColumnStates {
  const sourceColumn = columns[source];
  if (sourceColumn.kind !== "ready" || !sourceColumn.items.some((item) => item.id === task.id)) return columns;
  const moved = { ...task, status: target };
  const sourceTotal = Math.max(0, sourceColumn.pagination.total - 1);
  const withoutSource = {
    ...columns,
    [source]: {
      ...sourceColumn,
      items: sourceColumn.items.filter((item) => item.id !== task.id),
      pagination: { ...sourceColumn.pagination, total: sourceTotal, totalPages: sourceTotal === 0 ? 0 : Math.ceil(sourceTotal / sourceColumn.pagination.pageSize) },
    },
  };
  if (!isBoardStatus(target)) return withoutSource;
  const targetColumn = columns[target];
  if (targetColumn.kind !== "ready") return withoutSource;
  const targetTotal = targetColumn.pagination.total + 1;
  return {
    ...withoutSource,
    [target]: {
      ...targetColumn,
      items: targetColumn.pagination.page === 1 ? [moved, ...targetColumn.items].slice(0, targetColumn.pagination.pageSize) : targetColumn.items,
      pagination: { ...targetColumn.pagination, total: targetTotal, totalPages: Math.ceil(targetTotal / targetColumn.pagination.pageSize) },
    },
  };
}

function isBoardStatus(status: BoardTargetStatus): status is BoardStatus {
  return BOARD_STATUSES.includes(status as BoardStatus);
}

function rollbackBoardMove(columns: BoardColumnStates, delta: BoardMutationDelta, restoreSource: boolean, restoreTarget: boolean): BoardColumnStates {
  let next = columns;
  const sourceColumn = next[delta.source];
  if (restoreSource && sourceColumn.kind === "ready" && !sourceColumn.items.some((item) => item.id === delta.task.id)) {
    const items = [...sourceColumn.items]; items.splice(Math.min(Math.max(delta.sourceIndex, 0), items.length), 0, delta.task);
    const total = sourceColumn.pagination.total + 1;
    next = { ...next, [delta.source]: { ...sourceColumn, items, pagination: { ...sourceColumn.pagination, total, totalPages: Math.ceil(total / sourceColumn.pagination.pageSize) } } };
  }
  if (restoreTarget && delta.target) {
    const targetColumn = next[delta.target];
    if (targetColumn.kind === "ready") {
      const items = targetColumn.items.filter((item) => item.id !== delta.task.id);
      if (delta.targetEvicted && !items.some((item) => item.id === delta.targetEvicted!.id)) {
        items.splice(Math.min(delta.targetEvictedIndex ?? items.length, items.length), 0, delta.targetEvicted);
      }
      const total = Math.max(0, targetColumn.pagination.total - 1);
      next = { ...next, [delta.target]: { ...targetColumn, items, pagination: { ...targetColumn.pagination, total, totalPages: total === 0 ? 0 : Math.ceil(total / targetColumn.pagination.pageSize) } } };
    }
  }
  return next;
}

function sameBoardQuery(left: { page: number; pageSize: SupportedPageSize }, right: { page: number; pageSize: SupportedPageSize }): boolean {
  return left.page === right.page && left.pageSize === right.pageSize;
}

function needsBoardReplacement(
  status: BoardStatus,
  mutationQuery: { page: number; pageSize: SupportedPageSize },
  queriesRef: { current: BoardPagination },
  requestStatesRef: { current: Record<BoardStatus, BoardRequestState> },
  columnsRef: { current: BoardColumnStates },
): boolean {
  const requestState = requestStatesRef.current[status]; const column = columnsRef.current[status];
  return !sameBoardQuery(queriesRef.current[status], mutationQuery) || requestState.pending || requestState.superseded
    || column.kind !== "ready" || column.pending || Boolean(column.loadError);
}

export function ReviewQueueRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = parsePageSearch(search); const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: ReviewQueuePageResult } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const [decisionState, setDecisionState] = useState<ReviewDecisionState>({ kind: "idle" });
  const [completedId, setCompletedId] = useState<string | null>(null);
  const controllerRef = useRef<ReturnType<typeof createReviewQueueRequestController> | null>(null);
  const readRef = useRef<object | null>(null);
  const decisionRef = useRef<object | null>(null);
  const operationRef = useRef<ReviewOperation | null>(null);
  const needsClampRef = useRef(false);
  const queryRef = useRef({ page, pageSize }); const sameQuery = (value: { page: number; pageSize: SupportedPageSize }) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize;
  useEffect(() => subscribeWorkspaceLocation(() => { const next = parsePageSearch(window.location.search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); }), []);
  const read = async (controller: ReturnType<typeof createReviewQueueRequestController>, snapshot: { page: number; pageSize: SupportedPageSize }, afterDecision = false) => {
    if (readRef.current || controllerRef.current !== controller) return;
    const token = {}; readRef.current = token;
    setPending(true); setLocalError(undefined);
    const request = controller.request(snapshot);
    try {
      const data = await request.promise;
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
      if ((afterDecision || needsClampRef.current) && data.items.length === 0 && snapshot.page > 1) navigate({ page: Math.max(1, Math.min(snapshot.page - 1, data.pagination.totalPages)), pageSize: snapshot.pageSize }, true);
      else { setState({ kind: "ready", data }); needsClampRef.current = false; }
      if (operationRef.current && !decisionRef.current) { operationRef.current = null; setDecisionState({ kind: "idle" }); }
    } catch (error: unknown) {
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot) || isAbort(error)) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") }); setDecisionState({ kind: "idle" }); operationRef.current = null; setCompletedId(null);
      } else {
        setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
      }
    } finally {
      if (readRef.current === token) { readRef.current = null; setPending(false); }
    }
  };
  useEffect(() => {
    const controller = createReviewQueueRequestController(); controllerRef.current = controller;
    const snapshot = { page, pageSize }; queryRef.current = snapshot;
    setPendingId(null); setDecisionState((old) => old.kind === "success" ? old : { kind: "idle" }); void read(controller, snapshot);
    return () => { controller.dispose(); if (controllerRef.current === controller) { controllerRef.current = null; readRef.current = null; decisionRef.current = null; operationRef.current = null; } };
  }, [locale, page, pageSize]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }, replace = false) => { queryRef.current = next; const url = `${window.location.pathname}${writePageSearch(window.location.search, next)}`; writeWorkspaceHistory(replace ? "replace" : "push", url); setPage(next.page); setPageSize(next.pageSize); };
  const review = async (id: string, action: ReviewDecision, details?: ReviewNoteInput, retryOperation?: ReviewOperation) => {
    if (decisionRef.current || readRef.current || state.kind !== "ready" || localError || completedId === id || (operationRef.current && operationRef.current !== retryOperation)) return;
    const actionController = controllerRef.current; if (!actionController) return;
    const token = {}; decisionRef.current = token;
    const actionQuery = { ...queryRef.current };
    setPendingId(id);
    setDecisionState({ kind: "pending", action });
    try {
      try {
        let operation = retryOperation;
        if (!operation) {
          const publish = action === "publish" ? (await loadReviewDetail(id)).publish
            : { title: "", visibility: "shared" as const, spaceId: "default", collectionId: null, tagIds: [] };
          if (controllerRef.current !== actionController || !sameQuery(actionQuery)) return;
          operation = prepareReviewDecision(id, action, publish, details);
        }
        operationRef.current = operation;
        const receipt = await sendReviewDecision(operation);
        if (controllerRef.current !== actionController || !sameQuery(actionQuery)) return;
        operationRef.current = null;
        setDecisionState({ kind: "success", receipt }); setCompletedId(id); needsClampRef.current = true;
      } catch (error: unknown) {
        if (controllerRef.current === actionController && sameQuery(actionQuery)) {
          if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
            setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
            setLocalError(undefined); setDecisionState({ kind: "idle" }); operationRef.current = null; setCompletedId(null);
          } else {
            const recovery = operationRef.current ? reviewRecovery(error, Boolean(retryOperation)) : "edit";
            if (recovery === "edit") operationRef.current = null;
            setDecisionState({ kind: "error", action, recovery });
          }
        }
        return;
      }
      if (controllerRef.current !== actionController || !sameQuery(actionQuery)) return;
      await read(actionController, actionQuery, true);
    } finally {
      if (decisionRef.current === token) { decisionRef.current = null; setPendingId(null); }
    }
  };
  const retryRead = (afterDecision = false) => {
    const controller = controllerRef.current;
    if (controller && !decisionRef.current && !(decisionState.kind === "error" && decisionState.recovery === "retry")) {
      if (afterDecision) needsClampRef.current = true;
      void read(controller, { ...queryRef.current }, afterDecision);
    }
  };
  return <ReviewQueuePage onOpenDetail={(id) => writeWorkspaceHistory("push", `/admin/submissions/${encodeURIComponent(id)}`)} locale={locale} state={state}
    pendingId={pendingId} completedId={completedId} decisionState={decisionState} localError={localError} pending={pending}
    onRetry={() => retryRead()} onReloadDecision={() => retryRead(true)}
    onRetryDecision={() => { const operation = operationRef.current; if (operation && decisionState.kind === "error" && decisionState.recovery === "retry") void review(operation.id, operation.action, undefined, operation); }}
    onReview={(id, action, details) => void review(id, action, details)} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} />;
}

export function AdminDuplicateRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = parsePageSearch(search); const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminDuplicatePageResult } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createAdminDuplicateRequestController> | null>(null);
  const queryRef = useRef({ page, pageSize }); const sameQuery = (value: { page: number; pageSize: SupportedPageSize }) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize;
  const { retryVersion, retryRead } = useInitialReadRetry(state.kind, () => setState({ kind: "loading" }));
  useEffect(() => subscribeWorkspaceLocation(() => { const next = parsePageSearch(window.location.search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); }), []);
  useEffect(() => { const controller = createAdminDuplicateRequestController(); controllerRef.current = controller; const snapshot = { page, pageSize }; queryRef.current = snapshot; setPending(true); setLocalError(undefined); const request = controller.request(snapshot); void request.promise.then((data) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot)) { setState({ kind: "ready", data }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); } }); return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [locale, page, pageSize, retryVersion]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }, replace = false) => { queryRef.current = next; const url = `${window.location.pathname}${writePageSearch(window.location.search, next)}`; writeWorkspaceHistory(replace ? "replace" : "push", url); setPage(next.page); setPageSize(next.pageSize); };
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
  return <DuplicateQueuePage onLoadRetry={retryRead} locale={locale} state={state} pendingId={pendingId} pending={pending} localError={localError} onDecision={(id, decision) => void decide(id, decision)} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} />;
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
  const { retryVersion, retryRead } = useInitialReadRetry(state.kind, () => setState({ kind: "loading" }));
  useEffect(() => subscribeWorkspaceLocation(() => { const next = parsePageSearch(window.location.search); const nextStatus = memberStatusSearch(window.location.search); queryRef.current = { ...next, status: nextStatus }; setPage(next.page); setPageSize(next.pageSize); setStatus(nextStatus); }), []);
  useEffect(() => { const controller = createNumberedRequestController((input: Omit<LoadAdminMembersInput, "signal">, signal) => load({ ...input, signal })); controllerRef.current = controller; const snapshot = { page, pageSize, status }; queryRef.current = snapshot; setPending(true); setLocalError(undefined); const request = controller.request(snapshot); void request.promise.then((data) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot)) { setState({ kind: "ready", data }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !(error instanceof DOMException && error.name === "AbortError")) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); } }); return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [load, locale, page, pageSize, status, retryVersion]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = { ...next, status }; const nextSearch = writePageSearch(window.location.search, next); writeWorkspaceHistory("push", `${window.location.pathname}${nextSearch}`); setPage(next.page); setPageSize(next.pageSize); };
  const replaceNavigate = (next: { page: number; pageSize: SupportedPageSize }) => { queryRef.current = { ...next, status }; const nextSearch = writePageSearch(window.location.search, next); writeWorkspaceHistory("replace", `${window.location.pathname}${nextSearch}`); setPage(next.page); setPageSize(next.pageSize); };
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
  const changeFilter = (nextStatus: "" | "active" | "disabled") => { const normalized = nextStatus || undefined; queryRef.current = { page: 1, pageSize, status: normalized }; const params = new URLSearchParams(writePageSearch(window.location.search, { page: 1, pageSize })); if (nextStatus) params.set("status", nextStatus); else params.delete("status"); const nextSearch = params.toString(); writeWorkspaceHistory("push", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`); setStatus(normalized); setPage(1); };
  return <MembersPage onLoadRetry={retryRead} locale={locale} status={status || ""} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} pageError={localError} members={state.kind === "ready" ? state.data.items : []} pagination={state.kind === "ready" ? state.data.pagination : undefined} pending={pending} pendingIds={pendingIds} actionError={actionError} onStatusFilterChange={changeFilter} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} onStatusChange={changeStatus} />;
}

function AdminSpacesRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; spaces: AdminSpace[] } | { kind: "error"; message: string }>({ kind: "loading" });
  const { retryVersion, retryRead } = useInitialReadRetry(state.kind, () => setState({ kind: "loading" }));
  useEffect(() => { let active = true; loadAdminSpaces().then((spaces) => { if (active) setState({ kind: "ready", spaces }); }).catch(() => { if (active) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); }); return () => { active = false; }; }, [locale, retryVersion]);
  const create = async (input: { slug: string; name: string }) => {
    const space = await createAdminSpace(input);
    setState((previous) => previous.kind === "ready" ? { ...previous, spaces: [...previous.spaces, space] } : { kind: "ready", spaces: [space] });
  };
  return <SpacesPage onLoadRetry={retryRead} locale={locale} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} spaces={state.kind === "ready" ? state.spaces : []} onCreate={create} />;
}

export function AdminAuditRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = parsePageSearch(search);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [action, setAction] = useState(() => new URLSearchParams(search).get("action") || undefined);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; page: import("./lib/admin-audit-data").AdminAuditPage } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const pendingRef = useRef(false);
  const queryRef = useRef({ page, pageSize, action });

  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = parsePageSearch(window.location.search);
    const nextAction = new URLSearchParams(window.location.search).get("action") || undefined;
    // Invalidate the old query immediately, before React cleans up its effect.
    queryRef.current = { ...next, action: nextAction };
    setPage(next.page); setPageSize(next.pageSize); setAction(nextAction);
  }), []);

  useEffect(() => {
    const controller = createAdminAuditRequestController();
    const snapshot = { page, pageSize, action };
    queryRef.current = snapshot;
    pendingRef.current = true;
    setPending(true); setLocalError(undefined);
    const request = controller.request(snapshot);
    const isCurrent = () => controller.isCurrent(request.generation)
      && samePageQuery(snapshot, queryRef.current) && snapshot.action === queryRef.current.action;
    void request.promise.then((data) => {
      if (!isCurrent()) return;
      setState({ kind: "ready", page: data });
      pendingRef.current = false; setPending(false);
    }).catch((error: unknown) => {
      if (!isCurrent() || isAbort(error)) return;
      const message = frontendText(locale, "ADMIN_AUDIT_UNAVAILABLE");
      setState((old) => old.kind === "ready" ? old : { kind: "error", message });
      setLocalError(message);
      pendingRef.current = false; setPending(false);
    });
    return () => controller.dispose();
  }, [action, locale, page, pageSize, retryVersion]);

  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => {
    queryRef.current = { ...next, action };
    writeWorkspaceHistory("push", `${window.location.pathname}${writePageSearch(window.location.search, next)}`);
    setPage(next.page); setPageSize(next.pageSize);
  };
  const changeFilter = (nextAction: string) => {
    queryRef.current = { page: 1, pageSize, action: nextAction || undefined };
    const params = new URLSearchParams(writePageSearch(window.location.search, { page: 1, pageSize }));
    if (nextAction) params.set("action", nextAction); else params.delete("action");
    const nextSearch = params.toString();
    writeWorkspaceHistory("push", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
    setAction(nextAction || undefined); setPage(1);
  };
  const retry = () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true); setRetryVersion((value) => value + 1);
  };
  return <AuditPage locale={locale} state={state} action={action || ""} pending={pending} localError={localError} onRetry={retry} onActionChange={changeFilter} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} />;
}

function memberStatusSearch(search: string): "active" | "disabled" | undefined { const value = new URLSearchParams(search).get("status"); return value === "active" || value === "disabled" ? value : undefined; }

export function AdminAssetsRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initial = parsePageSearch(search); const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize); const [status, setStatus] = useState<AdminAssetStatus | undefined>(() => assetStatusSearch(search));
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminAssetsPage } | { kind: "error"; message: string }>({ kind: "loading" }); const [pendingIds, setPendingIds] = useState<string[]>([]); const [requestPending, setRequestPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>(); const [retryError, setRetryError] = useState<string | undefined>(); const [preview, setPreview] = useState<AssetPreviewModel | null>(null); const [previewLoading, setPreviewLoading] = useState(false); const [previewError, setPreviewError] = useState<string | undefined>(); const previewAbort = useRef<AbortController | null>(null);
  const controllerRef = useRef<ReturnType<typeof createAdminAssetsRequestController> | null>(null); const queryRef = useRef({ page, pageSize, status }); const sameQuery = (value: { page: number; pageSize: SupportedPageSize; status?: AdminAssetStatus }) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize && value.status === queryRef.current.status;
  const { retryVersion, retryRead } = useInitialReadRetry(state.kind, () => setState({ kind: "loading" }));
  useEffect(() => subscribeWorkspaceLocation(() => { const next = parsePageSearch(window.location.search); const nextStatus = assetStatusSearch(window.location.search); queryRef.current = { ...next, status: nextStatus }; setPage(next.page); setPageSize(next.pageSize); setStatus(nextStatus); }), []);
  useEffect(() => { const controller = createAdminAssetsRequestController(); controllerRef.current = controller; const snapshot = { page, pageSize, status }; queryRef.current = snapshot; setRequestPending(true); setLocalError(undefined); const request = controller.request(snapshot); void request.promise.then((data) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot)) { setState({ kind: "ready", data }); setRequestPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && sameQuery(snapshot) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setRequestPending(false); } }); return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; }; }, [locale, page, pageSize, status, retryVersion]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize; status?: AdminAssetStatus }, replace = false) => { queryRef.current = next; const params = new URLSearchParams(writePageSearch(window.location.search, next)); if (next.status) params.set("status", next.status); else params.delete("status"); const serialized = params.toString(); writeWorkspaceHistory(replace ? "replace" : "push", `${window.location.pathname}${serialized ? `?${serialized}` : ""}`); setPage(next.page); setPageSize(next.pageSize); setStatus(next.status); };
  const retry = async (id: string) => { if (pendingIds.includes(id)) return; const actionQuery = { ...queryRef.current }; setPendingIds((ids) => [...ids, id]); setRetryError(undefined); try { await retryAdminAsset(id); if (!sameQuery(actionQuery)) return; const snapshot = actionQuery; const controller = controllerRef.current; if (!controller) return; setRequestPending(true); const request = controller.request(snapshot); const refreshed = await request.promise; if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return; if (refreshed.items.length === 0 && snapshot.page > 1) navigate({ ...snapshot, page: snapshot.page - 1 }, true); else { setState({ kind: "ready", data: refreshed }); setRequestPending(false); } } catch { if (sameQuery(actionQuery)) { setRetryError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setRequestPending(false); } } finally { setPendingIds((ids) => ids.filter((item) => item !== id)); } };
  const showPreview = async (id: string) => { previewAbort.current?.abort(); const abort = new AbortController(); previewAbort.current = abort; setPreview(null); setPreviewError(undefined); setPreviewLoading(true); try { setPreview(await loadAdminAssetPreview(id, fetch, abort.signal)); } catch (error: unknown) { if (!(error instanceof DOMException && error.name === "AbortError")) setPreviewError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); } finally { if (previewAbort.current === abort) { previewAbort.current = null; setPreviewLoading(false); } } };
  useEffect(() => () => previewAbort.current?.abort(), []);
  return <AssetQueuePage onLoadRetry={retryRead} locale={locale} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} data={state.kind === "ready" ? state.data : undefined} localError={localError} pending={requestPending} pendingIds={pendingIds} status={status || ""} preview={preview} previewLoading={previewLoading} previewError={previewError} retryError={retryError} onRetry={(id) => void retry(id)} onPreview={(id) => void showPreview(id)} onStatusChange={(next) => navigate({ page: 1, pageSize, status: next || undefined })} onPageChange={(next) => navigate({ page: next, pageSize, status })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next, status })} />;
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
