import { ReviewDraftProvider, useReviewDrafts } from "./components/review/review-drafts";
import { SnapshotTargetDetail } from "./components/snapshot-target-detail";
import type { ReviewTarget } from "./pages/workbench-review-page";
import { acknowledgeFocusTransition, clearFocusTransition, loadFocusTransition, saveFocusTransition, type FocusTransitionIntent, type StoredFocusTransition } from "./lib/focus-transition-intent";
import { acknowledgeFocusIntent, clearFocusIntent, loadFocusIntent, saveFocusIntent, type FocusCreateIntent, type StoredFocusIntent } from "./lib/focus-create-intent";
import { TodayTargetDetail, type TodayTarget } from "./components/today-target-detail";
import { defaultCalendarRange, parseCalendarSearch, writeCalendarSearch, type CalendarQuery } from "./lib/calendar-query";
import { GoalTasksEditor } from "./components/goal-tasks-editor";
import { loadTimelineIntent, clearTimelineIntent } from "./lib/timeline-create-intent";
import { canonicalPlanningVersion, type PlanningWriteRecord } from "./lib/planning-write-recovery";
import { PlanningWriteRecovery, usePlanningWriteRecovery } from "./components/planning-write-recovery";
import { loadPlanningIntent, clearPlanningIntent } from "./lib/planning-create-intent";
import { ProjectRelationsEditor } from "./components/project-relations-editor";
import { useCreateDraft } from "./lib/use-create-draft";
import { AgentHistoryList } from "./components/agent/agent-history-list";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Alert, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { PageState } from "./components/ui/page-state";
import { HistoryNavigationNotice } from "./components/history-navigation-notice";
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
import { AgentPage, agentSourceFields } from "./pages/agent-page";
import { HomePage, type WorkbenchHomeState } from "./pages/home-page";
import { KnowledgePage } from "./pages/knowledge-page";
import { KnowledgeReaderPage } from "./pages/knowledge-reader-page";
import { SearchPage } from "./pages/search-page";
import { SubmitPage } from "./pages/submit-page";
import { MySubmissionsPage } from "./pages/my-submissions-page";
import { TaskEditor } from "./pages/tasks/task-editor";
import { TasksPage } from "./pages/tasks/tasks-page";
import { InboxPage, type InboxPageState } from "./pages/inbox-page";
import { GoalsPage, type GoalsPageState } from "./pages/goals-page";
import { ProjectsPage, type ProjectsPageState } from "./pages/projects-page";
import { ProjectTimelinePage, type ProjectTimelinePageState } from "./pages/project-timeline-page";
import { CalendarPage, type CalendarPageState } from "./pages/calendar-page";
import { TodayPage, type TodayPageState } from "./pages/today-page";
import { FocusPage, type FocusPageState } from "./pages/focus-page";
import { WorkbenchReviewPage, type WorkbenchReviewPageState } from "./pages/workbench-review-page";
import { BoardsPage, type BoardUnknownMove } from "./pages/boards/boards-page";
import { clearBoardMove, discardBlockedBoardMove, loadBoardMove, saveBoardMove, type BoardMoveIntent } from "./lib/board-move-intent";
import { clearNotificationUpdate, discardBlockedNotificationUpdate, loadNotificationUpdate, saveNotificationUpdate, type NotificationUpdateIntent } from "./lib/notification-update-intent";
import { checkTaskWrite, clearTaskWrite, discardBlockedTaskWrite, loadTaskWrite, runTaskWrite, saveTaskWrite, type TaskWriteIntent } from "./lib/task-write-intent";
import { taskStatusKey } from "./pages/tasks/tasks-model";
import { NotificationsPage, type NotificationsPageState } from "./pages/notifications/notifications-page";
import { MessagesPage, type MessagesPageState } from "./pages/messages/messages-page";
import { ThreadPage, type ThreadPageState } from "./pages/messages/thread-page";
import { LoginPage } from "./pages/login-page";
import { PublicWorkbenchPage } from "./pages/workbench-landing/public-workbench-page";
import { SettingsPage } from "./pages/settings-page";
import { GraphRoute } from "./pages/graph-page";
import { ComingSoonPage } from "./pages/coming-soon-page";
import { createKnowledgeRequestController, loadFavoriteKnowledge, loadRecentKnowledge, loadRecentResearch, type FavoriteKnowledgeItem, type LoadKnowledgePageInput, type KnowledgePageResult, type RecentKnowledgeItem, type RecentResearchItem } from "./lib/knowledge-data";
import { createKnowledgeReaderRequestController, loadKnowledgeBacklinks, loadKnowledgeFavorite, loadKnowledgeRevisionDiff, loadRelatedKnowledge, setKnowledgeFavorite, type KnowledgeBacklinkItem, type KnowledgeRevision, type KnowledgeRevisionDiff, type RelatedKnowledgeItem } from "./lib/knowledge-reader-data";
import { renderSafeMarkdown } from "./lib/markdown-renderer";
import { createSearchRequestController, type LoadSearchPageInput, type SearchPageResult } from "./lib/search-data";
import { type SavedViewItem } from "./lib/saved-views-data";
import { useSavedViews } from "./lib/use-saved-views";
import { clearAgentIntent, createAgentIntent, loadAgentIntent, saveAgentIntent, type AgentTurnIntent, type StoredAgentIntent } from "./lib/agent-turn-intent";
import { agentScopeSearch, agentLocationFromSearch, loadAgentConversation, createAgentRequestController, type AgentConversation, type AgentAnswer, type AgentScope } from "./lib/agent-data";
import { loadPrivateKnowledgeNotes, type PrivateKnowledgeNoteListItem } from "./lib/knowledge-note";
import { createSubmission, type SimilarSubmissionCandidate } from "./lib/submission-data";
import { clearSubmissionIntent, createSubmissionIntent, loadSubmissionIntent, saveSubmissionIntent, type SubmissionIntent } from "./lib/submission-intent";
import { clearOfflineSubmissionDraft, loadOfflineSubmissionDraft, saveOfflineSubmissionDraft } from "./lib/offline-submission-draft";
import { createMySubmissionsRequestController, type MySubmissionItem } from "./lib/my-submissions-data";
import { createTasksRequestController, loadTaskDetail, loadTaskSummary, setTaskStatus, type TaskFilters, type TaskItem, type TaskPage } from "./lib/tasks-data";
import { createInbox, readCreatedInbox, loadInboxItem, loadInboxNumbered, parseInboxSearch, writeInboxSearch, promoteInboxTask, updateInboxStatus, type InboxPageRequest, type InboxItem } from "./lib/inbox-data";
import { createGoal, loadNumberedGoals, setGoalProgress, setGoalStatus, type Goal } from "./lib/goals-data";
import { createProject, createProjectTimeline, editProjectTimeline, loadProject, loadProjectSummary, loadNumberedProjectTimeline, loadNumberedProjects, setProjectStatus, setProjectTimelineStatus, type Project, type ProjectSummary, type ProjectTimelineItem, type ProjectTimelineKind, type ProjectTimelineStatus } from "./lib/projects-data";
import { cancelCalendarEvent, createCalendarEvent, loadCalendarEvent, readCreatedCalendar, loadCalendarNumbered, type CalendarEvent } from "./lib/calendar-data";
import { loadToday } from "./lib/today-data";
import { type FocusSession, loadFocusTransitionReceipt, loadCurrentFocus, loadFocusReceipt, startFocus, transitionFocus } from "./lib/focus-data";
import { loadWorkbenchReview } from "./lib/workbench-review-data";
import { buildWorkbenchSummary } from "./lib/workbench-data";
import type { TaskFilterState, TaskStatus } from "./pages/tasks/task-types";
import { BOARD_STATUSES, parseBoardSearch, writeBoardColumnSearch, type BoardColumnStates, type BoardPagination, type BoardStatus, type BoardTargetStatus } from "./pages/boards/board-model";
import { createNotificationsRequestController, markNotificationRead, markVisibleNotificationsRead, type NotificationFilters, type NotificationSummary } from "./lib/notifications-data";
import { notificationTargetHref, parseNotificationSearch, writeNotificationSearch, type NotificationQuery } from "./pages/notifications/notification-model";
import { createDiscussionRequestController, ensureDiscussionThread, loadDiscussionMessageResult, loadDiscussionMessages, loadDiscussionThread, loadDiscussionThreads, sendDiscussionMessage } from "./lib/discussions-data";
import { parseDiscussionSearch, writeDiscussionSearch, type DiscussionSearch } from "./pages/messages/discussion-model";
import { createReviewQueueRequestController, type ReviewQueuePageResult } from "./lib/admin-review-data";
import { loadAdminMembers, updateMemberStatus, type AdminMember, type AdminMembersPage, type LoadAdminMembersInput } from "./lib/admin-members-data";
import { createAdminSpace, manageAdminSpace, loadAdminSpacesPage, loadAdminCollections, type AdminSpace, type AdminSpaceCommand } from "./lib/admin-spaces-data";
import { createAdminAuditRequestController, type AdminAuditEvent } from "./lib/admin-audit-data";
import { loadWorkspaceActivity, type WorkspaceActivityItem } from "./lib/activity-data";
import { loadKnowledgeReview, type ReviewPeriod, type ReviewResult } from "./lib/review-data";
import { loadAdminAnalytics, type AdminAnalyticsOverview, type LoadAdminAnalyticsInput } from "./lib/admin-analytics-data";
import { ApiRequestError } from "./lib/api";
import { createNumberedRequestController, parsePageSearch, writePageSearch, type SupportedPageSize } from "./lib/numbered-page";
import { assignAdminRoleMember, createAdminRole, loadAdminRoles, unassignAdminRoleMember, updateAdminRole, type AdminRole } from "./lib/admin-roles-data";
import { createAdminMenu, deleteAdminMenu, loadAdminMenus, updateAdminMenu, type AdminMenu } from "./lib/admin-menus-data";
import { createAdminAssetsRequestController, loadAdminAssetPreview, retryAdminAsset, type AdminAssetsPage, type AdminAssetStatus } from "./lib/admin-assets-data";
import { createAdminDuplicateRequestController, decideAdminDuplicate, loadAdminDuplicate, type AdminDuplicateCandidate, type AdminDuplicatePageResult, type DuplicateDecision } from "./lib/admin-duplicates-data";
import type { AssetPreviewModel } from "./components/assets/asset-preview-model";
import { loadReviewDetail, prepareReviewDecision, sendReviewDecision, reviewRecovery, type ReviewDecision, type ReviewOperation, type ReviewNoteInput } from "./components/review/review-detail-data";
import type { ReviewDecisionState } from "./components/review/review-decision-controls";
import type { SubmissionDraft } from "./components/submissions/submission-form-model";
import { logoutAccount } from "./lib/logout-account";
import { EnvironmentsPage } from "./features/environments/environments-page";
import { AccountNetworkBoundary } from "./features/environments/account-network-boundary";
import type { AccountNetworkOwner } from "./features/environments/account-network-owner.mjs";
import { createLocaleRuntime, frontendText, type LocaleRuntime } from "./lib/i18n";
import { sessionSnapshot } from "./lib/session";
import { isAnonymousSessionError } from "./lib/session-state";
import { pageKindForPath } from "./app-routes";
import type { SessionSnapshot } from "./contracts/api";
import { canonicalWorkspaceLocationKey, endWorkspaceSession, readWorkspaceHash, readWorkspaceLocation, registerWorkspaceLeaveGuard, subscribeWorkspaceLocation, writeWorkspaceHistory } from "./lib/workspace-location";

export function App() {
  const [location, setLocation] = useState(readWorkspaceLocation);
  const pathname = location.pathname;
  const [session, setSession] = useState<Awaited<ReturnType<typeof sessionSnapshot>> | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutInFlight = useRef(false);
  const [localeTick, setLocaleTick] = useState(0);
  const locale = useMemo(() => createLocaleRuntime({ navigatorLanguage: navigator.language, storage: window.localStorage }), []);
  useEffect(() => { const unsubscribe = locale.subscribe(() => setLocaleTick((tick) => tick + 1)); return () => { unsubscribe(); }; }, [locale]);
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
  const logout = async (owner: AccountNetworkOwner) => {
    // React state does not reserve the action until the next render.
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLogoutPending(true);
    setLogoutError(null);
    try {
      await logoutAccount(owner, session.logoutUrl);
      // Return to the anonymous shell. Starting OAuth here would immediately
      // sign the user back in when GitHub still has an active browser session.
      endWorkspaceSession(() => {
        setSession(null);
        setAnonymous(true);
        setLogoutPending(false);
      });
    } catch {
      logoutInFlight.current = false;
      setLogoutError(frontendText(locale, "SHELL_LOGOUT_FAILED"));
      setLogoutPending(false);
    }
  };
  const kind = pageKindForPath(pathname);
  const page = renderPage(kind, pathname, locale, location.search, session);
  return <AccountNetworkBoundary memberId={session.member.id}>{(owner) => <AppShell session={session} pathname={pathname} contentScrollKey={canonicalWorkspaceLocationKey(location)} locale={locale} onNavigate={navigate} onLogout={() => logout(owner)} logoutPending={logoutPending} logoutError={logoutError}><HistoryNavigationNotice locale={locale} />{page}</AppShell>}</AccountNetworkBoundary>;
}

function renderPage(kind: ReturnType<typeof pageKindForPath>, pathname: string, locale: LocaleRuntime, search = "", session?: SessionSnapshot) {
  switch (kind) {
    case "home": return <HomeRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} />;
    case "knowledge": return <KnowledgeRoute locale={locale} search={search} />;
    case "knowledge-reader": return <KnowledgeReaderRoute memberId={session?.member.id} locale={locale} knowledgeItemId={decodeRouteId(pathname)} />;
    case "search": return <SearchRoute memberId={session?.member.id} locale={locale} search={search} />;
    case "agent": return <AgentRoute key={session?.member.id} memberId={session?.member.id} locale={locale} search={search} />;
    case "submit": return session ? <SubmitRoute locale={locale} memberId={session.member.id} /> : <NotFoundPage locale={locale} />;
    case "my-submissions": return <MySubmissionsRoute locale={locale} search={search} />;
    case "graph": return <GraphRoute key={session?.member.id} memberId={session?.member.id} locale={locale} />;
    case "tasks": return <TasksRoute memberId={session?.member.id} key={session?.member.id} locale={locale} search={search} />;
    case "inbox": return <InboxRoute memberId={session?.member.id} key={session?.member.id} locale={locale} search={search} />;
    case "goals": return <GoalsRoute memberId={session?.member.id} key={session?.member.id} locale={locale} search={search} />;
    case "projects": return <ProjectsRoute memberId={session?.member.id} key={session?.member.id} locale={locale} search={search} />;
    case "project-timeline": return <ProjectTimelineRoute key={`${session?.member.id}:${pathname}`} locale={locale} memberId={session?.member.id} projectId={pathname.split("/")[2] || ""} search={search} />;
    case "calendar": return <CalendarRoute key={session?.member.id} memberId={session?.member.id} locale={locale} search={search} />;
    case "today": return <TodayRoute key={session?.member.id} locale={locale} />;
    case "focus": return <FocusRoute key={session?.member.id} memberId={session?.member.id} locale={locale} />;
    case "review": return <WorkbenchReviewRoute locale={locale} />;
    case "boards": return <BoardsRoute key={session?.member.id} memberId={session?.member.id} locale={locale} search={search} />;
    case "notifications": return <NotificationsRoute key={session?.member.id} memberId={session?.member.id} locale={locale} search={search} isAdmin={session?.member.role === "admin"} />;
    case "messages": return <MessagesRoute locale={locale} search={search} />;
    case "message-thread": return <DiscussionThreadRoute memberId={session?.member.id} locale={locale} threadId={decodeRouteId(pathname)} search={search} />;
    case "environments": return session ? <EnvironmentsPage key={session.member.id} locale={locale} session={session} /> : <NotFoundPage locale={locale} />;
    case "settings": return session ? <SettingsPage locale={locale} email={session.member.email} role={session.member.role} /> : <NotFoundPage locale={locale} />;
    case "coming-soon": return <ComingSoonPage locale={locale} />;
    case "admin": return session ? <AdminDashboardRoute locale={locale} session={session} /> : <NotFoundPage locale={locale} />;
    case "admin-analytics": return <AdminAnalyticsRoute key={JSON.stringify([session?.member.id, session?.permissionMask, session?.capabilities])} locale={locale} search={search} />;
    case "admin-roles": return <AdminRolesRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} />;
    case "admin-menus": return <AdminMenusRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} />;
    case "admin-submissions": return <ReviewQueueRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} search={search} />;
    case "admin-submission-detail": return <ReviewDetailRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} id={pathname.split("/").pop() || ""} />;
    case "admin-duplicates": return <AdminDuplicateRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} search={search} />;
    case "admin-assets": return <AdminAssetsRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} search={search} />;
    case "admin-members": return <AdminMembersRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} search={search} />;
    case "admin-spaces": return <AdminSpacesRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} />;
    case "admin-audit": return <AdminAuditRoute locale={locale} search={search} />;
    case "not-found": return <NotFoundPage locale={locale} />;
    default: return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace page kind: ${String(value)}`);
}

function HomeRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<WorkbenchHomeState>({ kind: "loading" });
  const [retry, setRetry] = useState(0);
  const pending = useRef(true);
  useEffect(() => {
    const controller = new AbortController();
    pending.current = true;
    // A denial invalidates the entire protected snapshot immediately, even if
    // another endpoint is stalled or ignores cancellation.
    const guard = <T,>(request: Promise<T>): Promise<T> => request.catch((error: unknown) => {
      if (!controller.signal.aborted && error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        controller.abort();
        setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD"), retryable: false });
      }
      throw error;
    });
    void Promise.allSettled([
      guard(loadTaskSummary(fetch, controller.signal)),
      guard(loadRecentKnowledge(fetch, controller.signal)),
      guard(loadWorkspaceActivity({ signal: controller.signal })),
    ]).then(([taskResult, knowledgeResult, activityResult]) => {
      if (controller.signal.aborted) return;
      pending.current = false;
      const unavailable: Array<"tasks" | "knowledge" | "activity"> = [];
      if (taskResult.status === "rejected") unavailable.push("tasks");
      if (knowledgeResult.status === "rejected") unavailable.push("knowledge");
      if (activityResult.status === "rejected") unavailable.push("activity");
      if (unavailable.length === 3) {
        setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        return;
      }
      const summary = buildWorkbenchSummary({
        taskSummary: taskResult.status === "fulfilled" ? taskResult.value : undefined,
        knowledge: knowledgeResult.status === "fulfilled" ? knowledgeResult.value : [],
        activity: activityResult.status === "fulfilled" ? activityResult.value.items : [],
      });
      setState({ kind: "ready", summary, unavailable });
    });
    return () => controller.abort();
  }, [locale, retry]);
  return <HomePage locale={locale} state={state} onRetry={() => {
    if (pending.current) return;
    pending.current = true;
    setState({ kind: "loading" });
    setRetry(value => value + 1);
  }} />;
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
      const next = analyticsUrlState(readWorkspaceLocation().search);
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
    const params = new URLSearchParams(writePageSearch(readWorkspaceLocation().search, next));
    params.set("days", String(next.days));
    const nextSearch = params.toString();
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${nextSearch ? `?${nextSearch}` : ""}`, () => {
      queryRef.current = next;
      setDays(next.days); setPage(next.page); setPageSize(next.pageSize);
    });
  };

  return <AdminAnalyticsPage locale={locale} state={state} days={days} pending={pending} localError={localError}
    onDaysChange={(nextDays) => navigateState({ days: nextDays, page: 1, pageSize })}
    onPageChange={(nextPage) => navigateState({ ...analyticsUrlState(readWorkspaceLocation().search), page: nextPage })}
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

export function AdminRolesRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; roles: AdminRole[] } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [needsRead, setNeedsRead] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const epoch = useRef<object | null>(null);
  const readRef = useRef<AbortController | null>(null);
  const writeRef = useRef<object | null>(null);
  const blockedRef = useRef(false);
  useEffect(() => {
    // This guard outlives the editor: denied/failed reads can replace its UI
    // without resolving a write. Never offer "discard" for an unknown outcome.
    const owner = window;
    const locked = () => writeRef.current !== null || blockedRef.current;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: locked() ? "block" : "allow" }));
    const warn = (event: BeforeUnloadEvent) => {
      if (locked()) { event.preventDefault(); event.returnValue = ""; }
    };
    owner.addEventListener("beforeunload", warn);
    return () => { unregister(); owner.removeEventListener("beforeunload", warn); };
  }, []);
  const deny = (error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_ROLES_UNAVAILABLE") });
    setSaveError(null);
    return true;
  };
  const read = async () => {
    if (!epoch.current || readRef.current) return false;
    const scope = epoch.current;
    const controller = new AbortController();
    const activeWrite = writeRef.current;
    readRef.current = controller;
    setReading(true);
    try {
      const roles = await loadAdminRoles(fetch, controller.signal);
      if (epoch.current !== scope || readRef.current !== controller) return false;
      setState({ kind: "ready", roles });
      if (!activeWrite && !writeRef.current) {
        blockedRef.current = false;
        setNeedsRead(false);
        setSaveError(null);
      }
      return true;
    } catch (error) {
      if (epoch.current !== scope || readRef.current !== controller) return false;
      if (!deny(error)) {
        const message = frontendText(locale, "ADMIN_ROLES_UNAVAILABLE");
        setState((previous) => previous.kind === "ready" ? previous : { kind: "error", message });
        setSaveError(message);
      }
      return false;
    } finally {
      if (readRef.current === controller) { readRef.current = null; setReading(false); }
    }
  };
  useEffect(() => {
    epoch.current = {};
    setState({ kind: "loading" });
    void read();
    return () => { epoch.current = null; readRef.current?.abort(); readRef.current = null; };
  }, [locale]);
  const retryRead = () => {
    if (readRef.current || writeRef.current) return;
    if (state.kind !== "ready") setState({ kind: "loading" });
    void read();
  };
  const mutate = async (operation: () => Promise<unknown>, errorKey: string) => {
    if (!epoch.current || state.kind !== "ready" || writeRef.current || readRef.current || blockedRef.current) return false;
    const scope = epoch.current;
    const token = {};
    writeRef.current = token;
    blockedRef.current = true;
    setSaving(true);
    setNeedsRead(true);
    setSaveError(null);
    try {
      await operation();
      if (epoch.current !== scope) return false;
      // A receipt acknowledges the request, not the current member set. Always read it.
      writeRef.current = null;
      setSaving(false);
      return await read();
    } catch (error) {
      if (epoch.current === scope && !deny(error)) setSaveError(frontendText(locale, errorKey));
      return false;
    } finally {
      if (writeRef.current === token) {
        writeRef.current = null;
        if (epoch.current) setSaving(false);
      }
    }
  };
  return <AdminRolesPage onLoadRetry={retryRead} locale={locale} state={state} saving={saving} writeBlocked={reading || needsRead} readPending={reading || saving} readRequired={needsRead} saveError={saveError}
    onSave={(role, allowBits) => mutate(() => updateAdminRole(role.id, { allowBits }), "ADMIN_ROLES_SAVE_ERROR")}
    onCreate={(input) => mutate(() => createAdminRole(input), "ADMIN_ROLES_CREATE_ERROR")}
    onAssignMember={(role, memberId) => mutate(() => assignAdminRoleMember(role.id, memberId), "ADMIN_ROLES_MEMBER_ASSIGN_ERROR")}
    onUnassignMember={(role, memberId) => mutate(() => unassignAdminRoleMember(role.id, memberId), "ADMIN_ROLES_MEMBER_ASSIGN_ERROR")} />;
}

export function AdminMenusRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; menus: AdminMenu[] } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [needsRead, setNeedsRead] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const epoch = useRef<object | null>(null);
  const readRef = useRef<AbortController | null>(null);
  const writeRef = useRef<object | null>(null);
  const blockedRef = useRef(false);
  useEffect(() => {
    // This guard outlives the editor: denied/failed reads can replace its UI
    // without resolving a write. Never offer "discard" for an unknown outcome.
    const owner = window;
    const locked = () => writeRef.current !== null || blockedRef.current;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: locked() ? "block" : "allow" }));
    const warn = (event: BeforeUnloadEvent) => {
      if (locked()) { event.preventDefault(); event.returnValue = ""; }
    };
    owner.addEventListener("beforeunload", warn);
    return () => { unregister(); owner.removeEventListener("beforeunload", warn); };
  }, []);
  const deny = (error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_MENUS_UNAVAILABLE") });
    setSaveError(null);
    return true;
  };
  const read = async () => {
    if (!epoch.current || readRef.current) return false;
    const scope = epoch.current;
    const controller = new AbortController();
    const activeWrite = writeRef.current;
    readRef.current = controller;
    setReading(true);
    try {
      const menus = await loadAdminMenus(fetch, controller.signal);
      if (epoch.current !== scope || readRef.current !== controller) return false;
      setState({ kind: "ready", menus });
      if (!activeWrite && !writeRef.current) {
        blockedRef.current = false;
        setNeedsRead(false);
        setSaveError(null);
      }
      return true;
    } catch (error) {
      if (epoch.current !== scope || readRef.current !== controller) return false;
      if (!deny(error)) {
        const message = frontendText(locale, "ADMIN_MENUS_UNAVAILABLE");
        setState((previous) => previous.kind === "ready" ? previous : { kind: "error", message });
        setSaveError(message);
      }
      return false;
    } finally {
      if (readRef.current === controller) { readRef.current = null; setReading(false); }
    }
  };
  useEffect(() => {
    epoch.current = {};
    setState({ kind: "loading" });
    void read();
    return () => { epoch.current = null; readRef.current?.abort(); readRef.current = null; };
  }, [locale]);
  const retryRead = () => {
    if (readRef.current || writeRef.current) return;
    if (state.kind !== "ready") setState({ kind: "loading" });
    void read();
  };
  const mutate = async (operation: () => Promise<unknown>, errorKey: string) => {
    if (!epoch.current || state.kind !== "ready" || writeRef.current || readRef.current || blockedRef.current) return false;
    const scope = epoch.current;
    const token = {};
    writeRef.current = token;
    blockedRef.current = true;
    setSaving(true);
    setNeedsRead(true);
    setSaveError(null);
    try {
      await operation();
      if (epoch.current !== scope) return false;
      // A receipt acknowledges the request, not the current menu hierarchy. Always read it.
      writeRef.current = null;
      setSaving(false);
      await read();
      return epoch.current === scope;
    } catch (error) {
      if (epoch.current === scope && !deny(error)) setSaveError(frontendText(locale, errorKey));
      return false;
    } finally {
      if (writeRef.current === token) {
        writeRef.current = null;
        if (epoch.current) setSaving(false);
      }
    }
  };
  return <AdminMenusPage onLoadRetry={retryRead} locale={locale} state={state} writeBlocked={saving || reading || needsRead} readPending={reading || saving} readRequired={needsRead} error={saveError}
    onCreate={(input) => mutate(() => createAdminMenu(input), "ADMIN_MENUS_SAVE_ERROR")}
    onUpdate={(menu, input) => mutate(() => updateAdminMenu(menu.id, input), "ADMIN_MENUS_SAVE_ERROR")}
    onDelete={(menu) => { void mutate(() => deleteAdminMenu(menu.id), "ADMIN_MENUS_DELETE_ERROR"); }} />;
}


function decodeRouteId(pathname: string): string {
  const value = pathname.split("/").pop() || "";
  try { return decodeURIComponent(value); } catch { return ""; }
}

export function KnowledgeReaderRoute({ locale, knowledgeItemId, memberId = "" }: { locale: LocaleRuntime; knowledgeItemId: string; memberId?: string }) {
  const [citationHash, setCitationHash] = useState(() => readWorkspaceHash());
  useEffect(() => {
    const update = () => setCitationHash(readWorkspaceHash());
    const unsubscribe = subscribeWorkspaceLocation(update);
    return unsubscribe;
  }, []);
  return <KnowledgeReaderSession key={`${memberId}:${knowledgeItemId}:${citationHash}`} memberId={memberId} locale={locale} knowledgeItemId={knowledgeItemId} citationHash={citationHash} />;
}

function KnowledgeReaderSession({ locale, knowledgeItemId, citationHash, memberId }: { memberId: string; locale: LocaleRuntime; knowledgeItemId: string; citationHash: string }) {
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
    const request = controller.request(knowledgeItemId, citationHash);
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
  }, [knowledgeItemId, citationHash, locale, retry]);
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
      return <KnowledgeReaderPage memberId={memberId} locale={locale} state={state.kind === "loading" ? state : { kind: "error", message: state.message }} revision={{ id: "", knowledgeItemId: "", markdown: "", isCurrent: false, previousRevisionId: null, sourceVersionId: "", sourceVersionOrdinal: null, parserSchemaVersion: null, indexStatus: "pending", chunks: [] }} renderMarkdown={renderSafeMarkdown} onRetry={() => setRetry((value) => value + 1)} />;
  }
  const toggleFavorite = async () => {
    if (favorite === null) return;
    const next = !favorite;
    setFavorite(next);
    try { await setKnowledgeFavorite(knowledgeItemId, next); } catch { setFavorite(!next); }
  };
  return <KnowledgeReaderPage memberId={memberId} locale={locale} state={{ kind: "ready" }} revision={state.revision} renderMarkdown={renderSafeMarkdown} diffState={diffState} onCompare={showDiff} relatedState={relatedState} backlinkState={backlinkState} favorite={favorite} onToggleFavorite={toggleFavorite} />;
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
  useEffect(() => subscribeWorkspaceLocation(() => { const next = parsePageSearch(readWorkspaceLocation().search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); setUrlVersion((value) => value + 1); }), []);
  useEffect(() => {
    const controller = createKnowledgeRequestController(); controllerRef.current = controller;
    const snapshot = { page, pageSize }; queryRef.current = snapshot; setPending(true); setLocalError(undefined);
    const request = controller.request({ ...snapshot, ...knowledgeFilters(readWorkspaceLocation().search) });
    void request.promise.then((result) => { if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current)) { setState({ kind: "ready", items: result.items, pagination: result.pagination }); setPending(false); } }).catch((error: unknown) => { if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "KNOWLEDGE_ERROR") }); setLocalError(frontendText(locale, "KNOWLEDGE_ERROR")); setPending(false); } });
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale, page, pageSize, retryVersion, urlVersion]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${writePageSearch(readWorkspaceLocation().search, next)}`, () => { queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); }); };
  return <KnowledgePage locale={locale} state={state} pending={pending} localError={localError} onRetry={() => setRetryVersion((value) => value + 1)} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} recent={recent} favorites={favorites} recentResearch={recentResearch} notes={notes} activity={activity} activityNextCursor={activityNextCursor} onLoadMoreActivity={loadMoreActivity} review={review} reviewPeriod={reviewPeriod} onReviewPeriodChange={setReviewPeriod} />;
}

export function SearchRoute({ locale, search, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  return <MemberSearchRoute key={memberId ?? "preview"} locale={locale} search={search} />;
}

function MemberSearchRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const initialPage = useMemo(() => parsePageSearch(search), [search]);
  const [initialQuery] = useState(() => new URLSearchParams(readWorkspaceLocation().search).get("q") ?? "");
  const [activeQuery, setActiveQuery] = useState(initialQuery);
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
  const saved = useSavedViews(locale, () => {
    const params = new URLSearchParams(readWorkspaceLocation().search);
    return { q: params.get("q") ?? "", spaceId: params.get("spaceId"), collectionId: params.get("collectionId"),
      tagIds: params.getAll("tagId"), tagMode: params.get("tagMode") === "and" ? "and" : "or" };
  }, (): boolean => queryDraft.isConfirming());
  const queryDraft = useCreateDraft({ query: initialQuery }, { query: initialQuery },
    saved.isBlocking, locale, (): boolean => saved.draft.isConfirming());
  useEffect(() => {
    const onPopState = () => {
      const next = new URLSearchParams(readWorkspaceLocation().search).get("q") ?? "";
      const pagination = parsePageSearch(readWorkspaceLocation().search);
      queryDraft.set("query", next); queryDraft.checkpoint({ query: next });
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
    const request = controller.request({ ...snapshot, ...searchFilters(readWorkspaceLocation().search) });
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
    const normalized = queryDraft.current.current.query.trim();
    const params = new URLSearchParams(readWorkspaceLocation().search); if (normalized) params.set("q", normalized); else params.delete("q"); params.delete("page");
    const nextUrl = params.size ? `/search?${params.toString()}` : "/search";
    queryDraft.applyNavigation((onCommit, onSettled) => {
      const current = readWorkspaceLocation();
      const mode = `${current.pathname}${current.search}` === nextUrl ? "replace" : "push";
      writeWorkspaceHistory(mode, nextUrl, () => {
        onCommit();
        setActiveQuery(normalized);
        setPage(1); queryRef.current = { query: normalized, page: 1, pageSize };
      }, onSettled);
    });
  };
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${writePageSearch(readWorkspaceLocation().search, next)}`, () => { queryRef.current = { query: activeQuery, ...next }; setPage(next.page); setPageSize(next.pageSize); }); };
  const applyView = (view: SavedViewItem) => {
    if (!saved.mayApply(view)) return;
    const normalized = view.filters.q.trim();
    const params = new URLSearchParams(); if (normalized) params.set("q", normalized);
    if (view.filters.spaceId) params.set("spaceId", view.filters.spaceId);
    if (view.filters.collectionId) params.set("collectionId", view.filters.collectionId);
    for (const id of view.filters.tagIds) params.append("tagId", id);
    params.set("tagMode", view.filters.tagMode);
    const nextUrl = `/search?${params.toString()}`;
    writeWorkspaceHistory("push", nextUrl, () => {
      setActiveQuery(normalized);
      setPage(1); queryRef.current = { query: normalized, page: 1, pageSize };
    });
  };
  return <SearchPage locale={locale} query={queryDraft.fields.query} queryLocked={saved.locked || queryDraft.confirming || queryDraft.applicationPending} state={state} pending={pending} localError={localError} onQueryChange={(value) => queryDraft.edit("query", value)} onSubmit={submit} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} onRetry={() => setRetryVersion((value) => value + 1)} savedViewName={saved.draft.fields.name} onSavedViewNameChange={(value) => saved.draft.edit("name", value)} savedViewConfirmation={<>{saved.confirmation}{queryDraft.confirmation}</>} savedViews={saved.items} savedViewPending={saved.locked} savedViewError={saved.error} savedViewUnknown={saved.phase === "unknown"} onCheckSavedView={() => { void saved.check(); }} onSaveView={() => { void saved.save(); }} onApplyView={applyView} onDeleteView={saved.requestDelete} />;
}

export function AgentRoute({ locale, search = "", memberId }: { locale: LocaleRuntime; search?: string; memberId?: string }) {
  let location: ReturnType<typeof agentLocationFromSearch>;
  try { location = agentLocationFromSearch(search); } catch {
    return <PageState kind="error" title={frontendText(locale, "AGENT_SCOPE_INVALID")}><a href="/agent">{frontendText(locale, "AGENT_NEW_CONVERSATION")}</a></PageState>;
  }
  return <AgentConversationRoute key={`${memberId ?? "preview"}:${search}`} memberId={memberId} locale={locale} initialScope={location.scope} restoreId={location.conversationId} />;
}

function AgentConversationRoute({ locale, initialScope, restoreId, memberId }: { locale: LocaleRuntime; initialScope?: AgentScope; restoreId?: string; memberId?: string }) {
  const [stored] = useState<StoredAgentIntent>(() => memberId ? loadAgentIntent(memberId) : { kind: "empty" });
  const intentRef = useRef<AgentTurnIntent | null>(stored.kind === "ready" ? stored.intent : null);
  const [unconfirmed, setUnconfirmed] = useState(stored.kind === "ready");
  const [storageBlocked, setStorageBlocked] = useState(stored.kind === "blocked");
  const [scope, setScope] = useState<AgentScope>(initialScope ?? { kind: "all" });
  const scopeRef = useRef(scope);
  const [history, setHistory] = useState<AgentConversation["messages"]>([]);
  const [recovery, setRecovery] = useState<"loading" | "ready" | "error">(restoreId ? "loading" : "ready");
  const [recoveryVersion, setRecoveryVersion] = useState(0);
  useEffect(() => {
    if (!restoreId || stored.kind !== "empty") return;
    const abort = new AbortController(); let current = true;
    setRecovery("loading");
    void loadAgentConversation(restoreId, { signal: abort.signal }).then((conversation) => {
      if (!current) return;
      scopeRef.current = conversation.scope; setScope(conversation.scope);
      sourceDraft.checkpoint(agentSourceFields(conversation.scope)); sourceDraft.reset(); setHistory(conversation.messages);
      conversationIdRef.current = conversation.id; setRecovery("ready");
    }).catch(() => { if (current) setRecovery("error"); });
    return () => { current = false; abort.abort(); };
  }, [restoreId, recoveryVersion]);
  const [lastQuestion, setLastQuestion] = useState("");
  const [state, setState] = useState<{ kind: "loading" } | { kind: "cancelled" } | ({ kind: "ready" } & AgentAnswer) | { kind: "error"; message: string }>({ kind: "ready", answer: frontendText(locale, "AGENT_DEFAULT_ANSWER"), confidence: "low", citations: [], conflicts: [] });
  const controllerRef = useRef<ReturnType<typeof createAgentRequestController> | null>(null);
  const pendingRef = useRef(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const alive = useRef(true);
  // Route-owned reservation survives child UI changes. Only a verified feedback
  // receipt releases it; unknown delivery is not an ordinary discardable draft.
  const feedbackLock = useRef<string | null>(null);
  const [feedbackBlocked, setFeedbackBlocked] = useState(false);
  // Submitted turns and unsent input share admission, but have distinct lifetimes.
  const locked = () => feedbackLock.current !== null || pendingRef.current || intentRef.current !== null
    || (!!memberId && loadAgentIntent(memberId).kind !== "empty");
  const questionDraft = useCreateDraft({question: ""}, {question: ""}, locked, locale,
    (): boolean => !alive.current || sourceDraft.isConfirming() || recovery !== "ready" || storageBlocked || unconfirmed);
  const sourceInitial = agentSourceFields(initialScope ?? {kind: "all"});
  const sourceDraft = useCreateDraft(sourceInitial, sourceInitial, locked, locale,
    (): boolean => !alive.current || questionDraft.isConfirming() || recovery !== "ready" || storageBlocked || unconfirmed);
  if (!controllerRef.current) controllerRef.current = createAgentRequestController();
  useEffect(() => {alive.current = true; return () => {alive.current = false; controllerRef.current?.cancel(conversationIdRef.current);};}, []);
  const submit = (nextQuestion = questionDraft.current.current.question) => {
    const normalized = nextQuestion.trim();
    if (!alive.current || questionDraft.isConfirming() || sourceDraft.isConfirming() || !normalized || !controllerRef.current || feedbackLock.current !== null || pendingRef.current || (recovery !== "ready" && !unconfirmed) || storageBlocked) return;
    let intent = intentRef.current;
    if (memberId) {
      try {
        if (!intent) intent = createAgentIntent(memberId, normalized, scopeRef.current, conversationIdRef.current);
        if (!saveAgentIntent(intent)) { setStorageBlocked(true); return; }
        intentRef.current = intent;
      } catch { setStorageBlocked(true); return; }
    }
    const sentQuestion = intent?.question ?? normalized;
    pendingRef.current = true;
    setUnconfirmed(false);
    // Retry uses its original question without overwriting a newer unsent follow-up.
    const displayed = questionDraft.current.current.question.trim();
    if (!displayed || displayed === sentQuestion) questionDraft.set("question", sentQuestion);
    questionDraft.checkpoint({question: sentQuestion});
    setLastQuestion(sentQuestion);
    setState({ kind: "loading" });
    const request = controllerRef.current.request(sentQuestion, intent?.scope ?? scopeRef.current, intent ? intent.conversationId : conversationIdRef.current, intent?.key);
    void request.promise.then(({ generation, answer }) => {
      if (controllerRef.current?.isCurrent(generation)) {
        pendingRef.current = false;
        if (memberId && intent && !clearAgentIntent(memberId, intent.key)) { setStorageBlocked(true); return; }
        intentRef.current = null;
        if (intent) {scopeRef.current = intent.scope; setScope(intent.scope);}
        setRecovery("ready");
        conversationIdRef.current = answer.conversationId;
        setState({ kind: "ready", ...answer });
      }
    }).catch((error: unknown) => {
      if (controllerRef.current?.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) {
        pendingRef.current = false;
        if (intent) setUnconfirmed(true);
        setState({ kind: "error", message: frontendText(locale, "COMMON_ANSWER_UNAVAILABLE") });
      }
    });
  };
  const cancel = () => {
    if (!alive.current || questionDraft.isConfirming() || sourceDraft.isConfirming() || !pendingRef.current) return;
    controllerRef.current?.cancel(conversationIdRef.current);
    // A delayed conversation-level cancellation must not target a subsequent turn.
    conversationIdRef.current = undefined;
    pendingRef.current = false;
    if (memberId && !clearAgentIntent(memberId, intentRef.current?.key)) { setStorageBlocked(true); return; }
    intentRef.current = null; setUnconfirmed(false); setRecovery("ready");
    setState({ kind: "cancelled" });
  };
  const startScope = (nextScope: AgentScope, onCommit: () => void, onSettled: () => void) => {
    if (!alive.current || questionDraft.isConfirming() || locked() || recovery !== "ready") {onSettled(); return;}
    writeWorkspaceHistory("push", `/agent${agentScopeSearch(nextScope)}`, () => {
      onCommit();
      controllerRef.current?.cancel(); conversationIdRef.current = undefined;
      scopeRef.current = nextScope; setScope(nextScope); setHistory([]); questionDraft.checkpoint({question: ""}); questionDraft.reset(); setLastQuestion("");
      setState({ kind: "ready", answer: frontendText(locale, "AGENT_DEFAULT_ANSWER"), confidence: "low", citations: [] });
    }, onSettled);
  };
  const abandon = () => {
    if (!alive.current || questionDraft.isConfirming() || sourceDraft.isConfirming() || feedbackLock.current !== null || pendingRef.current) return;
    if (memberId && !clearAgentIntent(memberId)) { setStorageBlocked(true); return; }
    controllerRef.current?.cancel(); intentRef.current = null; conversationIdRef.current = undefined;
    setStorageBlocked(false); setUnconfirmed(false); setRecovery("ready");
    scopeRef.current = initialScope ?? { kind: "all" }; setScope(scopeRef.current); setHistory([]); questionDraft.checkpoint({question: ""}); questionDraft.reset(); setLastQuestion("");
    setState({ kind: "cancelled" });
  };
  const feedbackAdmission = {
    begin: (id: string) => {
      if (!alive.current || questionDraft.isConfirming() || sourceDraft.isConfirming()
        || pendingRef.current || intentRef.current !== null || storageBlocked || unconfirmed || recovery !== "ready"
        || (memberId && loadAgentIntent(memberId).kind !== "empty")
        || conversationIdRef.current !== id || state.kind !== "ready" || state.conversationId !== id
        || (feedbackLock.current !== null && feedbackLock.current !== id)) return false;
      feedbackLock.current = id; setFeedbackBlocked(true); return true;
    },
    settled: (id: string) => {
      if (!alive.current || feedbackLock.current !== id) return;
      feedbackLock.current = null; setFeedbackBlocked(false);
    },
  };
  const content = () => {
    if (storageBlocked) return <PageState kind="error" title={frontendText(locale, "AGENT_INTENT_STORAGE_BLOCKED")} description={frontendText(locale, "AGENT_INTENT_STORAGE_DETAIL")}><Button onClick={abandon}>{frontendText(locale, "AGENT_INTENT_ABANDON")}</Button></PageState>;
    if (unconfirmed && intentRef.current) return <PageState kind="degraded" title={frontendText(locale, "AGENT_INTENT_UNKNOWN")} description={frontendText(locale, "AGENT_INTENT_UNKNOWN_DETAIL")}><p className="whitespace-pre-wrap">{intentRef.current.question}</p><p><code>{JSON.stringify(intentRef.current.scope)}</code></p><Button onClick={() => submit(intentRef.current!.question)}>{frontendText(locale, "AGENT_INTENT_RETRY")}</Button><Button variant="outline" onClick={abandon}>{frontendText(locale, "AGENT_INTENT_ABANDON")}</Button></PageState>;
    if (recovery === "loading" && state.kind !== "loading") return <PageState kind="loading" title={frontendText(locale, "AGENT_RESTORING")} />;
    if (recovery === "error") return <PageState kind="error" title={frontendText(locale, "AGENT_RESTORE_FAILED")} description={frontendText(locale, "AGENT_RESTORE_FAILED_DETAIL")}><Button onClick={() => setRecoveryVersion((value) => value + 1)}>{frontendText(locale, "AGENT_RETRY")}</Button><a className="ml-4" href="/agent">{frontendText(locale, "AGENT_NEW_CONVERSATION")}</a></PageState>;
    return <div className="space-y-6">
      {history.length > 0 && <section aria-label={frontendText(locale, "AGENT_HISTORY")} className="space-y-3"><h2>{frontendText(locale, "AGENT_HISTORY")}</h2><p className="text-sm text-muted-foreground">{frontendText(locale, "AGENT_HISTORY_DETAIL")}</p>{history.map((message, index) => <article key={index} className="rounded-md border p-3"><h3 className="font-medium">{frontendText(locale, message.role === "user" ? "AGENT_QUESTION_LABEL" : "AGENT_HISTORY_ANSWER")}</h3><p className="whitespace-pre-wrap">{message.content}</p>{message.citations.map((citation) => <a key={citation.id} className="mr-3 underline" href={citation.href}>{citation.title ?? citation.id}</a>)}</article>)}</section>}
      {conversationIdRef.current && <a className="underline" href={`/agent?conversationId=${encodeURIComponent(conversationIdRef.current)}`}>{frontendText(locale, "AGENT_RESTORE_LINK")}</a>}
      <AgentPage locale={locale} scope={scope} state={state} question={questionDraft.fields.question} onQuestionChange={value => questionDraft.edit("question", value)} onSubmit={() => submit()} onCancel={cancel} onRetry={() => submit(lastQuestion)} onStartScope={startScope} isWriteBlocked={locked} sourceDraft={sourceDraft} feedbackAdmission={feedbackAdmission} feedbackBlocked={feedbackBlocked} />
      <AgentHistoryList locale={locale} />
    </div>;
  };
  return <><div inert={questionDraft.confirming || sourceDraft.confirming ? true : undefined}>{content()}</div>{questionDraft.confirmation}{sourceDraft.confirmation}</>;
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
  const [initialDraft] = useState(() => loadOfflineSubmissionDraft(memberId) ?? { mode: "markdown" as const, title: "", content: "" });
  const [state, setState] = useState<{ kind: "idle" } | { kind: "pending" } | { kind: "validation"; message: string } | { kind: "error"; message: string } | { kind: "success"; message: string; similarCandidates: SimilarSubmissionCandidate[] }>({ kind: "idle" });
  const requestRef = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const protectedDraft = useCreateDraft<{ mode: SubmissionDraft["mode"]; title: string; content: string }>(
    initialDraft, { mode: "markdown", title: "", content: "" },
    () => requestRef.current !== null || intentRef.current !== null || invalidIntent, locale, () => false,
  );
  const draft = protectedDraft.fields;
  const draftRef = protectedDraft.current;
  const changeDraft = (patch: Partial<SubmissionDraft>) => {
    if (!alive.current || protectedDraft.isConfirming()) return;
    const nextDraft = { ...draftRef.current, ...patch };
    // A newer draft remains editable while the previous immutable intent is pending.
    protectedDraft.set("mode", nextDraft.mode);
    protectedDraft.set("title", nextDraft.title);
    protectedDraft.set("content", nextDraft.content);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, []);
  const submit = async (nextDraft: SubmissionDraft) => {
    if (!alive.current || protectedDraft.isConfirming() || requestRef.current || invalidIntent) return;
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
      if (clearSubmissionIntent(memberId, active.key)) {
        intentRef.current = null;
        setIntent(null);
      } else {
        // A receipt confirms the write, not removal of the recovery record.
        // Keep its identity until an explicit retry can safely clear it.
        setStorageUnavailable(true);
      }
      protectedDraft.checkpoint({ mode: active.draft.mode, title: "", content: "" });
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
  // The shared draft guard resets its ref on committed navigation. Persist that
  // reset synchronously: the App may unmount this form before a state effect runs.
  useEffect(() => subscribeWorkspaceLocation(() => {
    if (alive.current && !requestRef.current && !intentRef.current) {
      saveOfflineSubmissionDraft(memberId, draftRef.current);
    }
  }), [memberId, draftRef]);
  useEffect(() => { saveOfflineSubmissionDraft(memberId, draft); }, [memberId, draft]);
  return <>{protectedDraft.confirmation}<SubmitPage memberId={memberId} locale={locale} draft={draft} state={state} onDraftChange={changeDraft} onSubmit={() => submit(draftRef.current)} recovery={{ title: intent?.draft.title, storageUnavailable, invalid: invalidIntent, onRetry: () => { if (intentRef.current) void submit(intentRef.current.draft); } }} /></>;
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
  useEffect(() => subscribeWorkspaceLocation(() => { const next = parsePageSearch(readWorkspaceLocation().search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); setUrlVersion((value) => value + 1); }), []);
  useEffect(() => {
    const controller = createMySubmissionsRequestController();
    controllerRef.current = controller;
    const snapshot = { page, pageSize }; queryRef.current = snapshot; setPending(true); setLocalError(undefined);
    const status = new URLSearchParams(readWorkspaceLocation().search).get("status") ?? undefined;
    const request = controller.request({ ...snapshot, ...(status ? { status } : {}) });
    void request.promise.then((result) => {
      if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current)) { setState({ kind: "ready", items: result.items, pagination: result.pagination }); setPending(false); }
    }).catch((error: unknown) => {
      if (controller.isCurrent(request.generation) && samePageQuery(snapshot, queryRef.current) && !isAbort(error)) { setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); }
    });
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale, page, pageSize, retryVersion, urlVersion]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }) => { writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${writePageSearch(readWorkspaceLocation().search, next)}`, () => { queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); }); };
  return <MySubmissionsPage locale={locale} state={state} pending={pending} localError={localError} onRetry={() => setRetryVersion((value) => value + 1)} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} />;
}

export function TasksRoute({ locale, search, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  // A write whose result was unknown before a refresh comes back locked: field drafts reopen their
  // editor so they stay visible, every other operation is reconciled from the list.
  const [stored] = useState(() => memberId ? loadTaskWrite(memberId) : { kind: "empty" as const });
  const restoredInEditor = stored.kind === "ready" && (stored.intent.op === "create" || stored.intent.op === "update");
  const [editor, setEditor] = useState<{ taskId: string | null; restored?: TaskWriteIntent } | null>(() => stored.kind === "ready" && restoredInEditor
    ? { taskId: stored.intent.op === "create" ? null : stored.intent.taskId, restored: stored.intent } : null);
  const restoredListUnknown: TaskListUnknown | null = stored.kind === "ready" && !restoredInEditor ? { intent: stored.intent, label: stored.intent.taskId } : null;
  const [listUnknown, setListUnknown] = useState<TaskListUnknown | null>(restoredListUnknown);
  const [listRecovering, setListRecovering] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | undefined>();
  const listUnknownRef = useRef<TaskListUnknown | null>(restoredListUnknown);
  const listRecoveringRef = useRef(false);
  const activeRef = useRef(true);
  const ownedNavigationRef = useRef(false);
  const leaveGuardRef = useRef<(() => void) | null>(null);
  const [recordBlocked, setRecordBlocked] = useState(stored.kind === "blocked");
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
  // Registered only while a list write is pending or unknown; call at every lock transition.
  const syncLeaveGuard = useCallback(() => {
    const locked = () => actionPendingRef.current || listRecoveringRef.current || listUnknownRef.current !== null;
    if (locked() && !leaveGuardRef.current) leaveGuardRef.current = registerWorkspaceLeaveGuard(() => ({ kind: locked() && !ownedNavigationRef.current ? "block" : "allow" }));
    else if (!locked() && leaveGuardRef.current) { leaveGuardRef.current(); leaveGuardRef.current = null; }
  }, []);
  useEffect(() => {
    activeRef.current = true;
    const owner = window;
    const warn = (event: BeforeUnloadEvent) => {
      if (actionPendingRef.current || listRecoveringRef.current || listUnknownRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    owner.addEventListener("beforeunload", warn);
    syncLeaveGuard();
    return () => {
      activeRef.current = false; actionPendingRef.current = false; listRecoveringRef.current = false; listUnknownRef.current = null; syncLeaveGuard();
      owner.removeEventListener("beforeunload", warn);
    };
  }, [syncLeaveGuard]);
  const record = (intent: TaskWriteIntent) => !memberId || saveTaskWrite(memberId, intent);
  const unrecord = (intent: TaskWriteIntent) => !memberId || clearTaskWrite(memberId, intent);

  const clearDeniedTasks = (error: unknown): boolean => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    // Invalidate pending reads so a late response cannot restore protected rows.
    controllerRef.current?.dispose();
    listUnknownRef.current = null; listRecoveringRef.current = false; syncLeaveGuard();
    setListUnknown(null); setListRecovering(false); setActionNotice(undefined);
    setEditor(null);
    setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
    setPending(false); setLocalLoadError(undefined); setActionError(undefined);
    return true;
  };

  useEffect(() => {
    const onPopState = () => {
      setActionError(undefined);
      const pagination = parsePageSearch(readWorkspaceLocation().search);
      const nextFilters = taskFiltersFromSearch(readWorkspaceLocation().search);
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
        if (clearDeniedTasks(error)) return;
        setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        setLocalLoadError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false);
      }
    });
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [filters, locale, page, pageSize, retryVersion]);

  const navigate = (next: { page: number; pageSize: SupportedPageSize; filters: TaskFilterState }, replace = false) => {
    const url = taskSearch(next);
    // Only this list's own read-only query changes may pass while a write is pending or unknown.
    ownedNavigationRef.current = true;
    try { writeWorkspaceHistory(replace ? "replace" : "push", `/tasks${url}`, () => {
      setActionError(undefined);
      if (textFilterTimerRef.current) { clearTimeout(textFilterTimerRef.current); textFilterTimerRef.current = null; }
      queryRef.current = next;
      setPage(next.page); setPageSize(next.pageSize); setFilters(next.filters); setDraftFilters(next.filters);
    }); } finally { ownedNavigationRef.current = false; }
  };
  const changeTextFilters = (nextFilters: TaskFilterState) => {
    setDraftFilters(nextFilters);
    if (textFilterTimerRef.current) clearTimeout(textFilterTimerRef.current);
    textFilterTimerRef.current = setTimeout(() => {
      textFilterTimerRef.current = null;
      navigate({ page: 1, pageSize: queryRef.current.pageSize, filters: nextFilters }, true);
    }, 300);
  };
  const mutate = async (intent: TaskWriteIntent, label: string) => {
    if (actionPendingRef.current || listUnknownRef.current || listRecoveringRef.current) return;
    if (!record(intent)) { setActionNotice(undefined); setActionError(frontendText(locale, "TASKS_WRITE_NOT_RECORDED")); return; }
    const snapshot = { ...queryRef.current, filters: { ...queryRef.current.filters } };
    actionPendingRef.current = true; syncLeaveGuard(); setActionPendingId(intent.taskId); setActionError(undefined); setActionNotice(undefined); setLocalLoadError(undefined);
    const markUnknown = (stuck: boolean) => {
      const pending = { intent, label }; listUnknownRef.current = pending; setListUnknown(pending);
      if (stuck) setActionError(frontendText(locale, "TASKS_WRITE_RECORD_STUCK"));
    };
    try {
      await runTaskWrite(intent);
      if (!unrecord(intent) && activeRef.current) markUnknown(true);
    } catch (error: unknown) {
      const rejected = isDefiniteTaskRejection(error);
      const cleared = rejected && unrecord(intent);
      if (activeRef.current && !isAbort(error)) {
        if (cleared && error instanceof ApiRequestError && error.status === 409) {
          setActionError(frontendText(locale, "TASKS_ACTION_CONFLICT")); setRetryVersion((value) => value + 1);
        } else if (cleared) { if (!clearDeniedTasks(error) && sameQuery(snapshot)) setActionError(frontendText(locale, "TASKS_ACTION_FAILED")); }
        // The server may have applied it; the unchanged row is not proof that it did not.
        else markUnknown(rejected);
      }
      actionPendingRef.current = false; syncLeaveGuard(); setActionPendingId(null);
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
      if (sameQuery(snapshot) && !isAbort(error) && !clearDeniedTasks(error)) { setLocalLoadError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); }
    } finally { actionPendingRef.current = false; syncLeaveGuard(); setActionPendingId(null); }
  };
  const resolveListUnknown = async (mode: "check" | "retry") => {
    const pending = listUnknownRef.current;
    if (!pending || listRecoveringRef.current || actionPendingRef.current) return;
    listRecoveringRef.current = true; syncLeaveGuard(); setListRecovering(true); setActionError(undefined); setActionNotice(undefined);
    const live = () => activeRef.current && listUnknownRef.current === pending;
    try {
      let outcome: "applied" | "not_applied" | "missing" = "applied";
      if (mode === "check") outcome = await checkTaskWrite(pending.intent);
      else await runTaskWrite(pending.intent);
      if (!live()) return;
      if (!unrecord(pending.intent)) { setActionError(frontendText(locale, "TASKS_WRITE_RECORD_STUCK")); return; }
      listUnknownRef.current = null; setListUnknown(null);
      setActionNotice(frontendText(locale, outcome === "applied" ? "TASKS_WRITE_APPLIED" : outcome === "missing" ? "TASKS_WRITE_MISSING" : "TASKS_LIST_WRITE_NOT_APPLIED"));
      setRetryVersion((value) => value + 1);
    } catch (error: unknown) {
      if (!live() || clearDeniedTasks(error)) return;
      // A rejected retry does not prove the earlier attempt failed; only a read can settle it.
      setActionError(frontendText(locale, mode === "check" ? "TASKS_WRITE_CHECK_FAILED" : "TASKS_LIST_WRITE_STILL_UNKNOWN"));
    } finally {
      if (activeRef.current) { listRecoveringRef.current = false; syncLeaveGuard(); setListRecovering(false); }
    }
  };
  const taskRowStatus = (id: string): { expectedStatus?: TaskItem["status"] } => {
    const item = state.kind === "ready" ? state.data.items.find((candidate) => candidate.id === id) : undefined;
    return item ? { expectedStatus: item.status } : {};
  };
  const taskLabel = (id: string) => {
    const item = state.kind === "ready" ? state.data.items.find((candidate) => candidate.id === id) : undefined;
    return item?.title.trim() || id;
  };
  const ready = state.kind === "ready" ? { kind: "ready" as const, items: state.data.items, pagination: state.data.pagination } : state;
  const discardRecord = () => { if (memberId && discardBlockedTaskWrite(memberId)) setRecordBlocked(false); };
  return <><div inert={editor ? true : undefined}>{recordBlocked && <Alert variant="destructive" data-task-write-record-blocked="" className="mb-4">
    <AlertTitle>{frontendText(locale, "TASKS_WRITE_RECORD_BLOCKED")}</AlertTitle>
    <div className="mt-3"><Button variant="outline" onClick={discardRecord}>{frontendText(locale, "TASKS_WRITE_RECORD_DISCARD")}</Button></div>
  </Alert>}{listUnknown && <Alert variant="destructive" data-task-list-unknown="" className="mb-4">
    <AlertTitle>{frontendText(locale, "TASKS_LIST_WRITE_UNKNOWN").replace("{title}", listUnknown.label)}</AlertTitle>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="outline" disabled={listRecovering} onClick={() => void resolveListUnknown("check")}>{frontendText(locale, "TASKS_CHECK_WRITE")}</Button>
      <Button variant="outline" disabled={listRecovering} onClick={() => void resolveListUnknown("retry")}>{frontendText(locale, "TASKS_RETRY_WRITE")}</Button>
    </div>
  </Alert>}{actionNotice && <p role="status" className="mb-4 text-sm">{actionNotice}</p>}<TasksPage onCreate={() => setEditor({ taskId: null })} onOpen={(taskId) => setEditor({ taskId })} locale={locale} state={ready} filters={draftFilters} pending={pending} localLoadError={localLoadError} actionError={actionError} actionPendingId={editor ? "editor" : listUnknown || listRecovering ? "unknown" : actionPendingId} onRetry={() => setRetryVersion((value) => value + 1)} onFilterChange={(next) => navigate({ page: 1, pageSize, filters: next })} onTextFilterChange={changeTextFilters} onPageChange={(next) => navigate({ page: next, pageSize, filters })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next, filters })} onStatusChange={(id, status: TaskStatus) => void mutate({ op: "status", taskId: id, status, ...taskRowStatus(id) }, taskLabel(id))} onDelete={(id) => void mutate({ op: "delete", taskId: id }, taskLabel(id))} /></div>{editor && <TaskEditor key={editor.taskId ?? "new"} taskId={editor.taskId} memberId={memberId} {...(editor.restored ? { restored: editor.restored } : {})} locale={locale} onClose={() => setEditor(null)} onChanged={() => setRetryVersion((value) => value + 1)} onDenied={clearDeniedTasks} />}</>;
}

type TaskListUnknown = { intent: TaskWriteIntent; label: string };
function isDefiniteTaskRejection(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

export function InboxRoute({ locale, search = "", memberId }: { locale: LocaleRuntime; search?: string; memberId?: string }) {
  const writeRecovery = usePlanningWriteRecovery(memberId, "INBOX", search);
  const { page, pageSize, status } = parseInboxSearch(search);
  const query = { page, pageSize, status };
  const queryRef = useRef<InboxPageRequest>(query);
  queryRef.current = query;
  const [taskTarget, setTaskTarget] = useState<string | null>(null);
  const [state, setState] = useState<InboxPageState>({ kind: "loading" });
  const [pending, setPending] = useState(true);
  const [captureLocked, setCaptureLocked] = useState(false);
  const captureLockedRef = useRef(false);
  const [writing, setWriting] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true);
  const pendingRef = useRef(true);
  const writingRef = useRef(false);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {
    generationRef.current++; controllerRef.current?.abort();
    pendingRef.current = true; setPending(true); setState({ kind: "loading" }); setActionError(undefined);
  }, []);
  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = parseInboxSearch(readWorkspaceLocation().search);
    const current = queryRef.current;
    if (next.page !== current.page || next.pageSize !== current.pageSize || next.status !== current.status) {
      queryRef.current = next; invalidate();
    }
  }), [invalidate]);
  useEffect(() => {
    const canonical = writeInboxSearch(search, { page, pageSize, status });
    if (canonical !== search) writeWorkspaceHistory("replace", `${readWorkspaceLocation().pathname}${canonical}`);
  }, [search, page, pageSize, status]);
  const clearReadFailure = useCallback(() => {
    setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
  }, [locale]);
  const clearDenied = useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError) || ![401, 403, 404].includes(error.status)) return false;
    if (error.status === 401 || error.status === 403) writeRecovery.deny();
    clearReadFailure(); return true;
  }, [clearReadFailure, writeRecovery.deny]);
  const refresh = useCallback(async (): Promise<boolean> => {
    invalidate();
    const generation = generationRef.current;
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const result = await loadInboxNumbered({ page, pageSize, status }, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return false;
      setState({ kind: "ready", items: result.items, pagination: result.pagination });
      return true;
    } catch (error: unknown) {
      if (!activeRef.current || generation !== generationRef.current || isAbort(error)) return false;
      if (!clearDenied(error)) clearReadFailure();
      return false;
    } finally {
      if (activeRef.current && generation === generationRef.current) { pendingRef.current = false; setPending(false); }
    }
  }, [page, pageSize, status, invalidate, clearDenied, clearReadFailure]);
  useEffect(() => {
    activeRef.current = true; void refresh();
    return () => { activeRef.current = false; generationRef.current++; controllerRef.current?.abort(); };
  }, [refresh, retryVersion]);
  const navigate = (next: InboxPageRequest) => {
    if (pendingRef.current || writingRef.current || captureLockedRef.current || writeRecovery.locked) return;
    const nextSearch = writeInboxSearch(readWorkspaceLocation().search, next);
    if (nextSearch === readWorkspaceLocation().search) return;
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${nextSearch}`, invalidate);
  };
  const changeItem = async (item: InboxItem, operation: "status" | "task") => {
    if (!memberId || pendingRef.current || writingRef.current || captureLockedRef.current || writeRecovery.locked) return;
    const record = writeRecovery.begin(item.id, item.updatedAt);
    if (!record) return;
    writingRef.current = true; setWriting(true); setActionError(undefined);
    const generation = generationRef.current;
    let reading = false;
    try {
      const receipt = operation === "task"
        ? (await promoteInboxTask(item.id, item.updatedAt)).item
        : await updateInboxStatus(item.id, item.status === "archived" ? "inbox" : "archived", item.updatedAt);
      if (!activeRef.current || generation !== generationRef.current) return;
      reading = true;
      const controller = new AbortController(); controllerRef.current?.abort(); controllerRef.current = controller;
      const current = await loadInboxItem(item.id, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return;
      if (Date.parse(current.updatedAt) < Date.parse(receipt.updatedAt)) throw new Error("INBOX_READBACK_STALE");
      if (operation === "task" && (current.status !== "promoted" || current.promotedTaskId !== receipt.promotedTaskId)) throw new Error("INBOX_READBACK_TARGET_CHANGED");
      const refreshed = await refresh();
      if (!activeRef.current || generationRef.current !== generation + 1) return;
      if (refreshed) writeRecovery.finish(record);
    } catch (error) {
      if (!activeRef.current || generation !== generationRef.current) return;
      if (clearDenied(error)) return;
      if (reading) clearReadFailure();
      else {
        const rejected = error instanceof ApiRequestError && !error.retryable && error.status >= 400 && error.status < 500 && ![408, 409].includes(error.status);
        if (rejected) writeRecovery.finish(record);
        setActionError(frontendText(locale, "INBOX_ACTION_FAILED"));
      }
    } finally {
      writingRef.current = false;
      if (activeRef.current) setWriting(false);
    }
  };
  return <><div inert={taskTarget ? true : undefined}><PlanningWriteRecovery recovery={writeRecovery} locale={locale} pending={pending || writing || captureLocked} refresh={refresh} onDenied={clearDenied} onReadFailure={clearReadFailure} /><InboxPage locale={locale} state={state} pending={pending || writing || captureLocked || writeRecovery.locked} capturePending={pending || writing || writeRecovery.locked} actionError={actionError} status={status}
    onRetry={() => setRetryVersion(value => value + 1)}
    createMemberId={memberId}
    onCreateLock={locked => { captureLockedRef.current = locked; setCaptureLocked(locked); }}
    onCreate={input => {
      if (!activeRef.current || pendingRef.current || writingRef.current || writeRecovery.locked) throw new Error("INBOX_CREATE_BUSY");
      return createInbox(input);
    }}
    onCreateReadback={async intent => {
      if (!activeRef.current || pendingRef.current || writingRef.current || writeRecovery.locked) return false;
      const generation = generationRef.current;
      const controller = new AbortController(); controllerRef.current?.abort(); controllerRef.current = controller;
      await readCreatedInbox(intent, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return false;
      const result = await loadInboxNumbered(queryRef.current, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return false;
      setState({ kind: "ready", items: result.items, pagination: result.pagination });
      return true;
    }}
    onCreateDenied={() => { generationRef.current++; controllerRef.current?.abort(); setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); }}
    onStatusChange={item => void changeItem(item, "status")}
    onPromoteTask={item => void changeItem(item, "task")}
    onOpenTask={item => { if (!pendingRef.current && !writingRef.current && !captureLockedRef.current && !writeRecovery.locked && item.promotedTaskId) setTaskTarget(item.promotedTaskId); }}
    onPageChange={next => navigate({ ...query, page: next })}
    onPageSizeChange={next => navigate({ ...query, page: 1, pageSize: next })}
    onFilterChange={next => navigate({ ...query, page: 1, status: next })} /></div>{taskTarget && <TaskEditor key={`${memberId}:${taskTarget}`} taskId={taskTarget} locale={locale} onClose={() => setTaskTarget(null)} onChanged={() => setRetryVersion(value => value + 1)} onDenied={error => { if (clearDenied(error)) setTaskTarget(null); }} />}</>;
}

export function GoalsRoute({ locale, search = "", memberId }: { locale: LocaleRuntime; search?: string; memberId?: string }) {
  const writeRecovery = usePlanningWriteRecovery(memberId, "GOALS", search);
  const query = parsePageSearch(search);
  const { page: requestedPage, pageSize } = query;
  useEffect(() => {
    const canonical = writePageSearch(search, { page: requestedPage, pageSize });
    if (canonical !== search) writeWorkspaceHistory("replace", `${readWorkspaceLocation().pathname}${canonical}`);
  }, [search, requestedPage, pageSize]);
  const [relationGoal, setRelationGoal] = useState<Goal | null>(null);
  const relationGoalRef = useRef<Goal | null>(null);
  const restoreGoalTaskFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!relationGoal && restoreGoalTaskFocus.current) {
      document.getElementById(`manage-goal-tasks-${restoreGoalTaskFocus.current}`)?.focus();
      restoreGoalTaskFocus.current = null;
    }
  }, [relationGoal]);
  const [state, setState] = useState<GoalsPageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [createLocked, setCreateLocked] = useState(false);
  const createLockedRef = useRef(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true);
  const pendingRef = useRef(false);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef<GoalsPageState>({ kind: "loading" });
  stateRef.current = state;
  const clearDeniedGoals = useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403 && error.status !== 404)) return false;
    if (error.status === 401 || error.status === 403) writeRecovery.deny();
    if (memberId && (error.status === 401 || error.status === 403)) {
      const stored = loadPlanningIntent(memberId, "GOALS");
      if (stored.kind === "ready") clearPlanningIntent(memberId, "GOALS", stored.intent);
    }
    relationGoalRef.current = null; setRelationGoal(null);
    generationRef.current++; controllerRef.current?.abort();
    pendingRef.current = false; setPending(false); setActionError(undefined);
    createLockedRef.current = false; setCreateLocked(false);
    const cleared: GoalsPageState = { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") };
    stateRef.current = cleared; setState(cleared); return true;
  }, [locale, memberId, writeRecovery.deny]);

  const refresh = useCallback(async (): Promise<boolean> => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const generation = ++generationRef.current;
    pendingRef.current = true; setPending(true); setActionError(undefined);
    try {
      const page = await loadNumberedGoals({ page: requestedPage, pageSize }, fetch, controller.signal);
      if (!activeRef.current || generationRef.current !== generation) return false;
      setState({ kind: "ready", items: page.items, pagination: page.pagination });
      return true;
    } catch (error: unknown) {
      if (!activeRef.current || generationRef.current !== generation || isAbort(error)) return false;
      if (clearDeniedGoals(error)) return false;
      setState((current) => current.kind === "ready" ? current : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setActionError(frontendText(locale, "GOALS_ACTION_FAILED")); return false;
    } finally { if (activeRef.current && generationRef.current === generation) { pendingRef.current = false; setPending(false); } }
  }, [locale, clearDeniedGoals, requestedPage, pageSize]);

  useEffect(() => {
    activeRef.current = true;
    relationGoalRef.current = null; setRelationGoal(null);
    createLockedRef.current = false; setCreateLocked(false);
    stateRef.current = { kind: "loading" }; setState({ kind: "loading" });
    void refresh();
    return () => { activeRef.current = false; generationRef.current++; controllerRef.current?.abort(); };
  }, [refresh, retryVersion]);

  const mutate = async (item: Goal, operation: () => Promise<unknown>) => {
    if (relationGoalRef.current || pendingRef.current || createLockedRef.current || writeRecovery.locked) return;
    const record = writeRecovery.begin(item.id, item.updatedAt);
    if (!record) return;
    const generation = generationRef.current;
    pendingRef.current = true; setPending(true); setActionError(undefined);
    const reconcile = async (conflict = false) => {
      const readGeneration = generationRef.current + 1;
      const recovered = await refresh();
      if (!activeRef.current || generationRef.current !== readGeneration) return;
      if (recovered) {
        writeRecovery.finish(record);
        if (conflict) setActionError(frontendText(locale, "PLANNING_VERSION_CONFLICT"));
      } else {
        const cleared: GoalsPageState = { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") };
        stateRef.current = cleared; setState(cleared); setActionError(undefined);
      }
    };
    try { await operation(); if (activeRef.current && generationRef.current === generation) await reconcile(); }
    catch (error: unknown) {
      if (!activeRef.current || generationRef.current !== generation) return;
      if (clearDeniedGoals(error)) return;
      if (error instanceof ApiRequestError && error.status === 409 && error.code === "GOAL_VERSION_CONFLICT") { await reconcile(true); return; }
      const rejected = error instanceof ApiRequestError && !error.retryable && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 409;
      if (rejected) writeRecovery.finish(record);
      setActionError(frontendText(locale, "GOALS_ACTION_FAILED"));
    } finally { if (activeRef.current && generationRef.current === generation) { pendingRef.current = false; setPending(false); } }
  };

  const changePage = (page: number, size = pageSize) => {
    if (relationGoalRef.current || pendingRef.current || createLockedRef.current || writeRecovery.locked || (page - 1) * size >= 10_000 || (page === requestedPage && size === pageSize)) return;
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${writePageSearch(search, { page, pageSize: size })}`, () => {
      pendingRef.current = true; setPending(true);
    });
  };

  const relationReadFailed = useCallback(() => {
    const cleared: GoalsPageState = { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") };
    stateRef.current = cleared; setState(cleared);
  }, [locale]);
  const closeRelations = async () => {
    const goalId = relationGoalRef.current?.id;
    const generation = generationRef.current + 1;
    await refresh();
    if (!activeRef.current || generationRef.current !== generation) return;
    restoreGoalTaskFocus.current = goalId ?? null;
    relationGoalRef.current = null; setRelationGoal(null);
  };
  return <><PlanningWriteRecovery recovery={writeRecovery} locale={locale} pending={pending || !!relationGoal} refresh={refresh} onDenied={clearDeniedGoals} /><GoalsPage createMemberId={memberId} locale={locale} state={state} pending={pending || writeRecovery.locked || !!relationGoal} actionError={actionError} createLocked={createLocked}
    onManageTasks={(goal) => { if (pendingRef.current || createLockedRef.current || writeRecovery.locked || relationGoalRef.current) return; relationGoalRef.current = goal; setRelationGoal(goal); }}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onCreate={async (input) => {
      if (relationGoalRef.current || pendingRef.current || writeRecovery.locked) throw new ApiRequestError("PLANNING_BUSY", "Another operation is pending", 409, false);
      return createGoal(input);
    }} onCreateReadback={() => refresh()} onCreateDenied={clearDeniedGoals}
    onCreateLock={(locked) => { createLockedRef.current = locked; setCreateLocked(locked); }}
    onStatusChange={(goal: Goal, status) => void mutate(goal, () => setGoalStatus(goal.id, status, goal.updatedAt))}
    onProgressChange={(goal: Goal, progress) => void mutate(goal, () => setGoalProgress(goal.id, progress, goal.updatedAt))}
    onPageChange={page => changePage(page)} onPageSizeChange={size => changePage(1, size)} />
    {relationGoal && <GoalTasksEditor key={relationGoal.id} goalId={relationGoal.id} title={relationGoal.title} locale={locale} onDenied={clearDeniedGoals} onReadFailure={relationReadFailed} onClose={() => void closeRelations()} onBeginWrite={writeRecovery.begin} onFinishWrite={writeRecovery.finish} writeBlocked={writeRecovery.blocked} />}
  </>;
}

export function ProjectsRoute({ locale, search = "", memberId }: { locale: LocaleRuntime; search?: string; memberId?: string }) {
  const writeRecovery = usePlanningWriteRecovery(memberId, "PROJECTS", search);
  const statuses = new URLSearchParams(search).getAll("status");
  const status = statuses.length === 0 ? undefined : statuses.length === 1 ? statuses[0] : "invalid";
  const query = parsePageSearch(search);
  const { page: requestedPage, pageSize } = query;
  useEffect(() => {
    const canonical = writePageSearch(search, { page: requestedPage, pageSize });
    if (canonical !== search) writeWorkspaceHistory("replace", `${readWorkspaceLocation().pathname}${canonical}`);
  }, [search, requestedPage, pageSize]);
  const [state, setState] = useState<ProjectsPageState>({ kind: "loading" });
  const [relationProject, setRelationProject] = useState<Project>();
  const relationProjectRef = useRef<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [createLocked, setCreateLocked] = useState(false);
  const createLockedRef = useRef(false);
  const [summaryPending, setSummaryPending] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true);
  const pendingRef = useRef(false);
  const generationRef = useRef(0);
  const listControllerRef = useRef<AbortController | null>(null);
  const rowControllersRef = useRef(new Map<string, AbortController>());
  const stateRef = useRef<ProjectsPageState>({ kind: "loading" });
  stateRef.current = state;

  const cancelReads = useCallback(() => {
    listControllerRef.current?.abort();
    for (const controller of rowControllersRef.current.values()) controller.abort();
    rowControllersRef.current.clear();
  }, []);
  const clearDeniedProjects = useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403 && error.status !== 404)) return false;
    if (error.status === 401 || error.status === 403) writeRecovery.deny();
    if (memberId && (error.status === 401 || error.status === 403)) {
      const stored = loadPlanningIntent(memberId, "PROJECTS");
      if (stored.kind === "ready") clearPlanningIntent(memberId, "PROJECTS", stored.intent);
    }
    relationProjectRef.current = undefined; setRelationProject(undefined);
    generationRef.current += 1; cancelReads();
    pendingRef.current = false; setPending(false); setSummaryPending([]); setActionError(undefined);
    createLockedRef.current = false; setCreateLocked(false);
    const cleared: ProjectsPageState = { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") };
    stateRef.current = cleared; setState(cleared);
    return true;
  }, [cancelReads, locale, memberId, writeRecovery.deny]);

  const refresh = useCallback(async (): Promise<boolean> => {
    cancelReads();
    const generation = ++generationRef.current;
    const controller = new AbortController(); listControllerRef.current = controller;
    pendingRef.current = true; setPending(true); setSummaryPending([]); setActionError(undefined);
    try {
      const page = await loadNumberedProjects({ page: requestedPage, pageSize, status }, fetch, controller.signal);
      if (!activeRef.current || generationRef.current !== generation) return false;
      const entries = await Promise.all(page.items.map(async (project) => {
        try { return [project.id, await loadProjectSummary(project.id, fetch, controller.signal)] as const; }
        catch (error) {
          if (isAbort(error) || (error instanceof ApiRequestError && (error.status === 401 || error.status === 403))) throw error;
          return [project.id, undefined] as const;
        }
      }));
      if (!activeRef.current || generationRef.current !== generation) return false;
      const summaries = Object.fromEntries(entries.filter((entry) => entry[1] !== undefined)) as Record<string, ProjectSummary>;
      setState({ kind: "ready", items: page.items, pagination: page.pagination, summaries });
      return true;
    } catch (error: unknown) {
      if (!activeRef.current || generationRef.current !== generation || isAbort(error)) return false;
      if (clearDeniedProjects(error)) return false;
      setState((current) => current.kind === "ready" ? current : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setActionError(frontendText(locale, "PROJECTS_ACTION_FAILED")); return false;
    } finally { if (activeRef.current && generationRef.current === generation) { pendingRef.current = false; setPending(false); } }
  }, [locale, cancelReads, clearDeniedProjects, requestedPage, pageSize, status]);

  useEffect(() => {
    activeRef.current = true;
    relationProjectRef.current = undefined; setRelationProject(undefined);
    createLockedRef.current = false; setCreateLocked(false);
    stateRef.current = { kind: "loading" }; setState({ kind: "loading" });
    void refresh();
    return () => { activeRef.current = false; generationRef.current += 1; cancelReads(); };
  }, [refresh, retryVersion, cancelReads]);

  const retrySummary = async (project: Project) => {
    const current = stateRef.current;
    if (relationProjectRef.current || pendingRef.current || createLockedRef.current || rowControllersRef.current.has(project.id) || current.kind !== "ready"
      || !current.items.some((item) => item.id === project.id) || Object.hasOwn(current.summaries, project.id)) return;
    const generation = generationRef.current;
    const controller = new AbortController(); rowControllersRef.current.set(project.id, controller);
    setSummaryPending((ids) => [...ids, project.id]);
    try {
      const summary = await loadProjectSummary(project.id, fetch, controller.signal);
      if (!activeRef.current || generationRef.current !== generation || controller.signal.aborted) return;
      setState((current) => current.kind === "ready" ? { ...current, summaries: { ...current.summaries, [project.id]: summary } } : current);
    } catch (error: unknown) {
      if (!activeRef.current || generationRef.current !== generation || isAbort(error)) return;
      clearDeniedProjects(error);
    } finally {
      if (rowControllersRef.current.get(project.id) === controller) rowControllersRef.current.delete(project.id);
      if (activeRef.current && generationRef.current === generation) setSummaryPending((ids) => ids.filter((id) => id !== project.id));
    }
  };

  const mutate = async (item: Project, operation: () => Promise<unknown>) => {
    if (relationProjectRef.current || pendingRef.current || createLockedRef.current || writeRecovery.locked) return;
    const record = writeRecovery.begin(item.id, item.updatedAt);
    if (!record) return;
    const generation = generationRef.current;
    pendingRef.current = true; setPending(true); setActionError(undefined);
    const reconcile = async (conflict = false) => {
      const readGeneration = generationRef.current + 1;
      const recovered = await refresh();
      if (!activeRef.current || generationRef.current !== readGeneration) return;
      if (recovered) {
        writeRecovery.finish(record);
        if (conflict) setActionError(frontendText(locale, "PLANNING_VERSION_CONFLICT"));
      } else {
        const cleared: ProjectsPageState = { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") };
        stateRef.current = cleared; setState(cleared); setActionError(undefined);
      }
    };
    try { await operation(); if (activeRef.current && generationRef.current === generation) await reconcile(); }
    catch (error: unknown) {
      if (!activeRef.current || generationRef.current !== generation) return;
      if (clearDeniedProjects(error)) return;
      if (error instanceof ApiRequestError && error.status === 409 && error.code === "PROJECT_VERSION_CONFLICT") { await reconcile(true); return; }
      const rejected = error instanceof ApiRequestError && !error.retryable && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 409;
      if (rejected) writeRecovery.finish(record);
      setActionError(frontendText(locale, "PROJECTS_ACTION_FAILED"));
    } finally { if (activeRef.current && generationRef.current === generation) { pendingRef.current = false; setPending(false); } }
  };

  const changePage = (page: number, size = pageSize) => {
    if (relationProjectRef.current || pendingRef.current || createLockedRef.current || writeRecovery.locked || (page - 1) * size >= 10_000 || (page === requestedPage && size === pageSize)) return;
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${writePageSearch(search, { page, pageSize: size })}`, () => {
      pendingRef.current = true; setPending(true);
    });
  };

  const updateRelationSummary = useCallback((projectId: string, summary: ProjectSummary | undefined) => {
    if (!activeRef.current || relationProjectRef.current !== projectId || stateRef.current.kind !== "ready") return;
    const summaries = { ...stateRef.current.summaries };
    if (summary) summaries[projectId] = summary; else delete summaries[projectId];
    const next = { ...stateRef.current, summaries }; stateRef.current = next; setState(next);
  }, []);
  const openRelations = (project: Project) => {
    if (relationProjectRef.current || pendingRef.current || createLockedRef.current || writeRecovery.locked) return;
    generationRef.current++; cancelReads(); setSummaryPending([]);
    relationProjectRef.current = project.id; setRelationProject(project);
  };
  const closeRelations = () => {
    const id = relationProjectRef.current;
    relationProjectRef.current = undefined; setRelationProject(undefined);
    // The trigger is enabled after React commits the closed state.
    queueMicrotask(() => document.getElementById(`manage-relations-${id}`)?.focus());
  };

  return <><PlanningWriteRecovery recovery={writeRecovery} locale={locale} pending={pending || !!relationProject} refresh={refresh} onDenied={clearDeniedProjects} /><ProjectsPage createMemberId={memberId} locale={locale} state={state} pending={pending || writeRecovery.locked} createLocked={createLocked} summaryPending={summaryPending} actionError={actionError}
    relationProjectId={relationProject?.id} onManageRelations={openRelations}
    relationEditor={relationProject && <ProjectRelationsEditor key={relationProject.id} projectId={relationProject.id} title={relationProject.title} locale={locale} onSummary={updateRelationSummary} onDenied={clearDeniedProjects} onClose={closeRelations} onBeginWrite={writeRecovery.begin} onFinishWrite={writeRecovery.finish} writeBlocked={writeRecovery.blocked} />}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onRetrySummary={(project) => void retrySummary(project)}
    onCreate={async (input) => {
      if (relationProjectRef.current || pendingRef.current || writeRecovery.locked) throw new ApiRequestError("PLANNING_BUSY", "Another operation is pending", 409, false);
      return createProject(input);
    }} onCreateReadback={() => refresh()} onCreateDenied={clearDeniedProjects}
    onCreateLock={(locked) => {
      if (locked && !createLockedRef.current && !pendingRef.current) { generationRef.current++; cancelReads(); setSummaryPending([]); }
      createLockedRef.current = locked; setCreateLocked(locked);
    }}
    onStatusChange={(project: Project, status) => void mutate(project, () => setProjectStatus(project.id, status, project.updatedAt))}
    onOpenTimeline={(project) => writeWorkspaceHistory("push", `/projects/${encodeURIComponent(project.id)}/timeline`)}
    onPageChange={page => changePage(page)} onPageSizeChange={size => changePage(1, size)} /></>;
}

export function ProjectTimelineRoute({ locale, projectId, memberId, search = "" }: { locale: LocaleRuntime; projectId: string; memberId?: string; search?: string }) {
  const { page: requestedPage, pageSize } = useMemo(() => parsePageSearch(search), [search]);
  const writeRecovery = usePlanningWriteRecovery(memberId, `TIMELINE:${projectId}`, `${projectId}:${requestedPage}:${pageSize}`);
  useEffect(() => {
    const canonical = writePageSearch(search, { page: requestedPage, pageSize });
    if (canonical !== search) writeWorkspaceHistory("replace", `${readWorkspaceLocation().pathname}${canonical}`);
  }, [search, requestedPage, pageSize]);
  const [state, setState] = useState<ProjectTimelinePageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [createLocked, setCreateLocked] = useState(false);
  const createLockedRef = useRef(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true);
  const pendingRef = useRef(false);
  const statusNoticeRef = useRef<"PLANNING_VERSION_CONFLICT" | "PROJECT_TIMELINE_STATUS_UNKNOWN" | "PROJECT_TIMELINE_EDIT_UNKNOWN" | undefined>(undefined);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef<ProjectTimelinePageState>({ kind: "loading" });
  stateRef.current = state;
  const clearDenied = useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError) || ![401, 403, 404].includes(error.status)) return false;
    if (error.status !== 404) {
      writeRecovery.deny();
      if (memberId) {
        const stored = loadTimelineIntent(memberId, projectId);
        if (stored.kind === "ready") clearTimelineIntent(memberId, projectId, stored.intent);
      }
    }
    statusNoticeRef.current = undefined;
    generationRef.current++; controllerRef.current?.abort();
    pendingRef.current = false; setPending(false); setActionError(undefined);
    createLockedRef.current = false; setCreateLocked(false);
    const cleared: ProjectTimelinePageState = { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") };
    stateRef.current = cleared; setState(cleared); return true;
  }, [locale, memberId, projectId, writeRecovery.deny]);

  const refresh = useCallback(async (clearOnFailure = false, record?: PlanningWriteRecord, receiptVersion?: string): Promise<boolean> => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const generation = ++generationRef.current;
    pendingRef.current = true; setPending(true); setActionError(undefined);
    try {
      const [project, page] = await Promise.all([
        loadProject(projectId, fetch, controller.signal),
        loadNumberedProjectTimeline(projectId, { page: requestedPage, pageSize }, fetch, controller.signal),
      ]);
      if (!activeRef.current || generationRef.current !== generation) return false;
      if (record) {
        const item = page.items.find(item => item.id === record.id);
        if (!item || !canonicalPlanningVersion(item.updatedAt) || Date.parse(item.updatedAt) < Math.max(Date.parse(record.expectedUpdatedAt), Date.parse(receiptVersion ?? record.expectedUpdatedAt))) throw new Error("TIMELINE_RECOVERY_VERSION_INVALID");
      }
      const next: ProjectTimelinePageState = { kind: "ready", project, items: page.items, pagination: page.pagination };
      stateRef.current = next; setState(next);
      setActionError(statusNoticeRef.current ? frontendText(locale, statusNoticeRef.current) : undefined);
      if (record) writeRecovery.finish(record);
      return true;
    } catch (error: unknown) {
      if (!activeRef.current || generationRef.current !== generation || isAbort(error)) return false;
      controller.abort();
      if (clearDenied(error)) return false;
      const next: ProjectTimelinePageState = !clearOnFailure && stateRef.current.kind === "ready"
        ? stateRef.current : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") };
      stateRef.current = next; setState(next);
      setActionError(frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED")); return false;
    } finally { if (activeRef.current && generationRef.current === generation) { pendingRef.current = false; setPending(false); } }
  }, [locale, projectId, requestedPage, pageSize, clearDenied, writeRecovery.finish]);

  useEffect(() => {
    activeRef.current = true;
    stateRef.current = { kind: "loading" }; setState({ kind: "loading" });
    createLockedRef.current = false; setCreateLocked(false);
    void refresh();
    return () => { activeRef.current = false; generationRef.current++; controllerRef.current?.abort(); };
  }, [refresh, retryVersion]);
  const mutate = async (item: ProjectTimelineItem, operation: () => Promise<ProjectTimelineItem>, unknownNotice: "PROJECT_TIMELINE_STATUS_UNKNOWN" | "PROJECT_TIMELINE_EDIT_UNKNOWN" = "PROJECT_TIMELINE_STATUS_UNKNOWN"): Promise<boolean> => {
    if (pendingRef.current || createLockedRef.current || writeRecovery.locked) return false;
    const record = writeRecovery.begin(item.id, item.updatedAt);
    if (!record) return false;
    const generation = generationRef.current;
    pendingRef.current = true; setPending(true); setActionError(undefined);
    statusNoticeRef.current = undefined;
    let receipt: ProjectTimelineItem | undefined;
    try {
      try { receipt = await operation(); }
      catch (error: unknown) {
        if (!activeRef.current || generationRef.current !== generation) return false;
        if (clearDenied(error)) return false;
        if (error instanceof ApiRequestError && error.status === 409) {
          statusNoticeRef.current = "PLANNING_VERSION_CONFLICT";
        } else if (!(error instanceof ApiRequestError) || error.retryable || error.status === 408 || error.status >= 500) {
          statusNoticeRef.current = unknownNotice;
        } else {
          writeRecovery.finish(record);
          setActionError(frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED")); return false;
        }
      }
      // A receipt or a new read cannot justify replaying an uncertain write.
      if (activeRef.current && generationRef.current === generation) {
        const refreshed = await refresh(true, record, unknownNotice === "PROJECT_TIMELINE_EDIT_UNKNOWN" ? receipt?.updatedAt : undefined);
        return refreshed && !statusNoticeRef.current;
      }
      return false;
    } finally { if (activeRef.current && generationRef.current === generation) { pendingRef.current = false; setPending(false); } }
  };
  const changePage = (page: number, size = pageSize) => {
    if (pendingRef.current || createLockedRef.current || writeRecovery.locked || (page - 1) * size >= 10_000 || (page === requestedPage && size === pageSize)) return;
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${writePageSearch(search, { page, pageSize: size })}`, () => {
      pendingRef.current = true; setPending(true);
    });
  };
  return <><PlanningWriteRecovery recovery={writeRecovery} locale={locale} pending={pending || createLocked} refresh={() => refresh(true)} onDenied={clearDenied} /><ProjectTimelinePage createMemberId={memberId} createProjectId={projectId} locale={locale} state={state} pending={pending || writeRecovery.locked} createLocked={createLocked} actionError={actionError}
    onRetry={() => setRetryVersion(value => value + 1)}
    onBack={() => writeWorkspaceHistory("push", "/projects")}
    onCreate={async input => {
      if (pendingRef.current || writeRecovery.locked) throw new ApiRequestError("PLANNING_BUSY", "Another operation is pending", 409, false);
      return createProjectTimeline(projectId, input);
    }} onCreateReadback={() => refresh()} onCreateDenied={clearDenied}
    onCreateLock={locked => { createLockedRef.current = locked; setCreateLocked(locked); }}
    onEdit={(item, content) => mutate(item, () => editProjectTimeline(projectId, item, content), "PROJECT_TIMELINE_EDIT_UNKNOWN")}
    onStatusChange={(item: ProjectTimelineItem, status: ProjectTimelineStatus) => void mutate(item, () => setProjectTimelineStatus(projectId, item.id, status, item.updatedAt))}
    onPageChange={page => changePage(page)} onPageSizeChange={size => changePage(1, size)} /></>;
}

export function CalendarRoute({ locale, search = "", memberId }: { locale: LocaleRuntime; search?: string; memberId?: string }) {
  const writeRecovery = usePlanningWriteRecovery(memberId, "CALENDAR", search);
  const [captureLocked, setCaptureLocked] = useState(false);
  const captureLockedRef = useRef(false);
  const [defaultRange] = useState(defaultCalendarRange);
  const { page, pageSize, from, to, status } = parseCalendarSearch(search, defaultRange);
  const query = { page, pageSize, from, to, status };
  const queryRef = useRef<CalendarQuery>(query); queryRef.current = query;
  const [state, setState] = useState<CalendarPageState>({ kind: "loading" });
  const [pending, setPending] = useState(true);
  const [writing, setWriting] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true), pendingRef = useRef(true), writingRef = useRef(false);
  const generationRef = useRef(0), controllerRef = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {
    generationRef.current++; controllerRef.current?.abort(); pendingRef.current = true;
    setPending(true); setState({ kind: "loading" }); setActionError(undefined);
  }, []);
  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = parseCalendarSearch(readWorkspaceLocation().search, defaultRange);
    const current = queryRef.current;
    if (next.page !== current.page || next.pageSize !== current.pageSize || next.from !== current.from || next.to !== current.to || next.status !== current.status) {
      queryRef.current = next; invalidate();
    }
  }), [defaultRange, invalidate]);
  useEffect(() => {
    const canonical = writeCalendarSearch(search, { page, pageSize, from, to, status });
    if (canonical !== search) writeWorkspaceHistory("replace", `${readWorkspaceLocation().pathname}${canonical}`);
  }, [search, page, pageSize, from, to, status]);
  const clearReadFailure = useCallback(() => setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }), [locale]);
  const clearDenied = useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError) || ![401, 403, 404].includes(error.status)) return false;
    if (error.status !== 404) writeRecovery.deny();
    clearReadFailure(); return true;
  }, [clearReadFailure, writeRecovery.deny]);
  const refresh = useCallback(async (): Promise<boolean> => {
    invalidate(); const generation = generationRef.current;
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const result = await loadCalendarNumbered({ page, pageSize, from, to, status }, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return false;
      setState({ kind: "ready", items: result.items, pagination: result.pagination });
      return true;
    } catch (error: unknown) {
      if (!activeRef.current || generation !== generationRef.current || isAbort(error)) return false;
      if (!clearDenied(error)) clearReadFailure();
      return false;
    } finally { if (activeRef.current && generation === generationRef.current) { pendingRef.current = false; setPending(false); } }
  }, [locale, page, pageSize, from, to, status, invalidate, clearDenied, clearReadFailure]);
  useEffect(() => {
    activeRef.current = true; void refresh();
    return () => { activeRef.current = false; generationRef.current++; controllerRef.current?.abort(); };
  }, [refresh, retryVersion]);
  const navigate = (next: CalendarQuery) => {
    if (pendingRef.current || writingRef.current || captureLockedRef.current || writeRecovery.locked) return;
    const nextSearch = writeCalendarSearch(readWorkspaceLocation().search, next);
    if (nextSearch === readWorkspaceLocation().search) return;
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${nextSearch}`, invalidate);
  };
  const cancel = async (event: CalendarEvent) => {
    if (!memberId || pendingRef.current || writingRef.current || captureLockedRef.current || writeRecovery.locked) return;
    const record = writeRecovery.begin(event.id, event.updatedAt);
    if (!record) return;
    writingRef.current = true; setWriting(true); setActionError(undefined);
    const generation = generationRef.current;
    try {
      const receipt = await cancelCalendarEvent(event.id, event.updatedAt);
      if (!activeRef.current || generation !== generationRef.current) return;
      const controller = new AbortController(); controllerRef.current?.abort(); controllerRef.current = controller;
      const current = await loadCalendarEvent(event.id, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return;
      if (Date.parse(current.updatedAt) < Date.parse(receipt.updatedAt) || current.status !== "canceled") throw new Error("CALENDAR_READBACK_STALE");
      const read = await refresh();
      if (activeRef.current && generationRef.current === generation + 1 && read) writeRecovery.finish(record);
    } catch (error) {
      if (!activeRef.current || generation !== generationRef.current || isAbort(error)) return;
      if (!clearDenied(error)) { clearReadFailure(); setActionError(frontendText(locale, "CALENDAR_ACTION_FAILED")); }
    } finally { writingRef.current = false; if (activeRef.current) setWriting(false); }
  };
  return <><PlanningWriteRecovery recovery={writeRecovery} locale={locale} pending={pending || writing || captureLocked} refresh={refresh} onDenied={clearDenied} onReadFailure={clearReadFailure} /><CalendarPage locale={locale} state={state} pending={pending || writing || captureLocked || writeRecovery.locked} createPending={pending || writing || writeRecovery.locked} actionError={actionError} range={{ from, to }}
    onRangeChange={range => navigate({ ...query, ...range, page: 1 })}
    onPageChange={next => navigate({ ...query, page: next })} onPageSizeChange={size => navigate({ ...query, page: 1, pageSize: size })}
    onRetry={() => setRetryVersion(value => value + 1)}
    createMemberId={memberId} onCreateLock={locked => { captureLockedRef.current = locked; setCaptureLocked(locked); }}
    onCreate={input => {
      if (!activeRef.current || pendingRef.current || writingRef.current || writeRecovery.locked) throw new Error("CALENDAR_CREATE_BUSY");
      return createCalendarEvent(input);
    }}
    onCreateReadback={async intent => {
      if (!activeRef.current || pendingRef.current || writingRef.current || writeRecovery.locked) return false;
      const generation = generationRef.current;
      const controller = new AbortController(); controllerRef.current?.abort(); controllerRef.current = controller;
      await readCreatedCalendar(intent, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return false;
      const result = await loadCalendarNumbered(queryRef.current, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return false;
      setState({ kind: "ready", items: result.items, pagination: result.pagination }); return true;
    }}
    onCreateDenied={error => { generationRef.current++; controllerRef.current?.abort(); clearDenied(error); }} onCancel={event => void cancel(event)} /></>;
}

export function TodayRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<TodayPageState>({ kind: "loading" });
  const [retryVersion, setRetryVersion] = useState(0);
  const [target, setTarget] = useState<TodayTarget | null>(null);
  const clearDenied = useCallback(() => {
    setTarget(null); setState({kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD")});
  }, [locale]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setTarget(null); setState({kind: "loading"});
    void loadToday(fetch, controller.signal).then((snapshot) => { if (active) setState({ kind: "ready", snapshot }); }).catch((error: unknown) => { if (active && !isAbort(error)) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); });
    return () => { active = false; controller.abort(); };
  }, [locale, retryVersion]);
  return <><div inert={target ? true : undefined}><TodayPage locale={locale} state={state} onOpen={setTarget} onRetry={() => setRetryVersion((value) => value + 1)} /></div>{target && <TodayTargetDetail key={`${target.kind}:${target.id}`} target={target} locale={locale} onClose={() => setTarget(null)} onDenied={clearDenied} />}</>;
}

export function FocusRoute({ locale, memberId = "" }: { locale: LocaleRuntime; memberId?: string }) {
  const [recovery, setRecovery] = useState<StoredFocusIntent>(() => loadFocusIntent(memberId));
  const intentRef = useRef<FocusCreateIntent | null>(recovery.kind === "ready" ? recovery.intent : null);
  const [transitionRecovery, setTransitionRecovery] = useState<StoredFocusTransition>(() => loadFocusTransition(memberId));
  const transitionRef = useRef<FocusTransitionIntent | null>(transitionRecovery.kind === "ready" ? transitionRecovery.intent : null);
  const [state, setState] = useState<FocusPageState>({ kind: "loading" });
  const [retryVersion, setRetryVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [actionNotice, setActionNotice] = useState<string>();
  const [selectionVersion, setSelectionVersion] = useState(0);
  const epochRef = useRef(0);
  const busyRef = useRef(false);
  const readRef = useRef<AbortController | null>(null);
  useEffect(() => {
    // Journals, not the running timer or preflight GET, own the leave lock.
    // Read refs/storage synchronously: a write and navigation can share one event.
    const locked = () => intentRef.current !== null || transitionRef.current !== null
      || loadFocusIntent(memberId).kind !== "empty" || loadFocusTransition(memberId).kind !== "empty";
    const owner = window;
    const unregister = registerWorkspaceLeaveGuard(() => ({kind: locked() ? "block" : "allow"}));
    const warn = (event: BeforeUnloadEvent) => { if (locked()) {event.preventDefault(); event.returnValue = "";} };
    owner.addEventListener("beforeunload", warn);
    return () => {unregister(); owner.removeEventListener("beforeunload", warn);};
  }, [memberId]);
  const clearDenied = useCallback(() => {
    epochRef.current += 1;
    readRef.current?.abort();
    busyRef.current = false;
    setPending(false); setSelectionVersion(value => value + 1); setActionError(undefined); setActionNotice(undefined);
    setRecovery({kind: "empty"});
    setState({kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD")});
  }, [locale]);
  useEffect(() => {
    const epoch = ++epochRef.current;
    const controller = new AbortController();
    readRef.current = controller;
    busyRef.current = false;
    setPending(false); setActionError(undefined); setActionNotice(undefined); setSelectionVersion(value => value + 1);
    setState({kind: "loading"});
    void (async () => {
      const stored = loadFocusIntent(memberId);
      setRecovery(stored); intentRef.current = stored.kind === "ready" ? stored.intent : null;
      const transitionStored = loadFocusTransition(memberId);
      setTransitionRecovery(transitionStored); transitionRef.current = transitionStored.kind === "ready" ? transitionStored.intent : null;
      // Two unresolved journals cannot safely be interpreted as one operation.
      if (transitionStored.kind === "blocked" || (transitionStored.kind !== "empty" && stored.kind !== "empty")) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
      let transitionReceipt: FocusSession | undefined;
      if (transitionStored.kind === "ready") {
        transitionReceipt = await loadFocusTransitionReceipt(transitionStored.intent, fetch, controller.signal);
        if (epoch !== epochRef.current) return;
        if (transitionReceipt.updatedAt === transitionStored.intent.expectedUpdatedAt) {
          if (transitionStored.acknowledged) throw new Error("FOCUS_RESPONSE_INVALID");
          setState({kind: "ready", session: null});
          return; // Still unresolved: never infer failure, clear the journal or auto-replay.
        }
        if (!acknowledgeFocusTransition(memberId, transitionStored.intent)) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
      }
      let receipt: FocusSession | undefined;
      if (stored.kind === "ready") {
        try { receipt = await loadFocusReceipt(stored.intent, fetch, controller.signal); }
        catch (error) { if (!(error instanceof ApiRequestError && error.status === 404)) throw error; }
        if (epoch !== epochRef.current) return;
        if (receipt && !acknowledgeFocusIntent(memberId, stored.intent)) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
      }
      const session = await loadCurrentFocus(fetch, controller.signal);
      if (epoch !== epochRef.current) return;
      if (receipt && stored.kind === "ready") {
        if (!clearFocusIntent(memberId, stored.intent)) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
        intentRef.current = null; setRecovery({kind: "empty"});
        setActionNotice(frontendText(locale, `FOCUS_STATUS_${receipt.status.toUpperCase()}`));
      }
      if (transitionReceipt && transitionStored.kind === "ready") {
        if (!clearFocusTransition(memberId, transitionStored.intent)) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
        transitionRef.current = null; setTransitionRecovery({kind: "empty"});
        setActionNotice(frontendText(locale, `FOCUS_STATUS_${transitionReceipt.status.toUpperCase()}`));
      }
      setState({kind: "ready", session});
    })().catch(error => {
      if (epoch === epochRef.current && error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {clearDenied(); return;}
      if (epoch === epochRef.current && !isAbort(error)) setState({kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD")});
    });
    return () => {epochRef.current += 1; controller.abort(); readRef.current?.abort();};
  }, [locale, memberId, retryVersion, clearDenied]);
  const mutate = async (operation: (epoch: number) => Promise<FocusSession | undefined>, retrySaved = false) => {
    if (busyRef.current || state.kind !== "ready") return;
    busyRef.current = true;
    const epoch = epochRef.current;
    setPending(true); setActionError(undefined); setActionNotice(undefined);
    try {
      const receipt = await operation(epoch);
      if (epoch !== epochRef.current) return;
      if (receipt && transitionRef.current && !acknowledgeFocusTransition(memberId, transitionRef.current)) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
      if (receipt && intentRef.current && !acknowledgeFocusIntent(memberId, intentRef.current)) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
      const controller = new AbortController();
      readRef.current?.abort(); readRef.current = controller;
      const session = await loadCurrentFocus(fetch, controller.signal);
      if (epoch === epochRef.current) {
        if (receipt && intentRef.current) {
          if (!clearFocusIntent(memberId, intentRef.current)) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
          intentRef.current = null; setRecovery({kind: "empty"});
        }
        if (receipt && transitionRef.current) {
          if (!clearFocusTransition(memberId, transitionRef.current)) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
          transitionRef.current = null; setTransitionRecovery({kind: "empty"});
        }
        setState({kind: "ready", session});
        if (receipt) setActionNotice(frontendText(locale, `FOCUS_STATUS_${receipt.status.toUpperCase()}`));
      }
    } catch (error: unknown) {
      if (epoch !== epochRef.current) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) clearDenied();
      else if (transitionRef.current) {
        setState({kind: "error", message: frontendText(locale, error instanceof ApiRequestError && error.status === 409 ? "FOCUS_CONFLICT" : "FOCUS_TRANSITION_UNCERTAIN")});
      } else if (intentRef.current && (retrySaved || !(error instanceof ApiRequestError && error.status === 404 && error.code === "TASK_NOT_FOUND"))) {
        const stored = loadFocusIntent(memberId);
        setRecovery(stored.kind === "empty" ? {kind: "blocked"} : stored);
        setActionError(frontendText(locale, "FOCUS_START_UNCERTAIN"));
      } else if (error instanceof ApiRequestError && error.status === 409) {
        setSelectionVersion(value => value + 1);
        setState({kind: "error", message: frontendText(locale, "FOCUS_CONFLICT")});
      } else if (!isAbort(error)) {
        if (state.kind === "ready" && state.session) {
          setState({kind: "error", message: frontendText(locale, "FOCUS_ACTION_FAILED")});
          return;
        }
        if (intentRef.current) {
          if (clearFocusIntent(memberId, intentRef.current)) {intentRef.current = null; setRecovery({kind: "empty"});}
          else setRecovery({kind: "blocked"});
        }
        setSelectionVersion(value => value + 1);
        setActionError(frontendText(locale, error instanceof ApiRequestError && error.status === 404 ? "FOCUS_TASK_UNAVAILABLE" : "FOCUS_ACTION_FAILED"));
      }
    } finally {
      if (epoch === epochRef.current) {busyRef.current = false; setPending(false);}
    }
  };
  const sendStart = async (epoch: number, input: {taskId: string; title: string; durationMinutes: number}, saved?: FocusCreateIntent) => {
    const controller = new AbortController();
    readRef.current?.abort(); readRef.current = controller;
    if (saved) {
      try {return await loadFocusReceipt(saved, fetch, controller.signal);}
      catch (error) {if (!(error instanceof ApiRequestError && error.status === 404)) throw error;}
      if (epoch !== epochRef.current) return;
      const stored = loadFocusIntent(memberId);
      if (stored.kind !== "ready" || stored.acknowledged) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
    }
    await loadTaskDetail(input.taskId, fetch, controller.signal);
    if (epoch !== epochRef.current) return;
    const intent = saved ?? Object.freeze({id: crypto.randomUUID(), clientKey: crypto.randomUUID(), ...input});
    if (!saveFocusIntent(memberId, intent)) {setRecovery(loadFocusIntent(memberId)); throw new Error("FOCUS_STORAGE_UNAVAILABLE");}
    intentRef.current = intent;
    // Write only after the complete immutable payload was durably saved and read back.
    return startFocus(intent);
  };
  const sendTransition = async (epoch: number, intent: FocusTransitionIntent, retry = false) => {
    if (loadFocusIntent(memberId).kind !== "empty") throw new Error("FOCUS_STORAGE_UNAVAILABLE");
    if (retry) {
      const controller = new AbortController(); readRef.current?.abort(); readRef.current = controller;
      const receipt = await loadFocusTransitionReceipt(intent, fetch, controller.signal);
      if (epoch !== epochRef.current) return;
      if (receipt.updatedAt !== intent.expectedUpdatedAt) return receipt;
      const stored = loadFocusTransition(memberId);
      if (stored.kind !== "ready" || stored.acknowledged) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
    }
    if (!saveFocusTransition(memberId, intent)) throw new Error("FOCUS_STORAGE_UNAVAILABLE");
    transitionRef.current = intent;
    const receipt = await transitionFocus(intent.id, intent.action, intent.expectedUpdatedAt);
    if (receipt.taskId !== intent.taskId || receipt.clientKey !== intent.clientKey) throw new Error("FOCUS_RESPONSE_INVALID");
    return receipt;
  };
  if (transitionRecovery.kind !== "empty" && state.kind === "ready") return <section className="space-y-3">
    <h1 className="text-2xl font-semibold">{frontendText(locale, "FOCUS_TITLE")}</h1>
    <p role="alert">{frontendText(locale, transitionRecovery.kind === "blocked" ? "FOCUS_STORAGE_BLOCKED" : "FOCUS_TRANSITION_UNCERTAIN")}</p>
    <Button disabled={pending} onClick={() => setRetryVersion(value => value + 1)}>{frontendText(locale, "FOCUS_RETRY")}</Button>
    {transitionRecovery.kind === "ready" && !transitionRecovery.acknowledged && <Button disabled={pending} onClick={() => void mutate(epoch => sendTransition(epoch, transitionRecovery.intent, true))}>{frontendText(locale, "FOCUS_RETRY_TRANSITION")}</Button>}
  </section>;
  if (recovery.kind !== "empty" && state.kind === "ready") return <section className="space-y-3">
    <h1 className="text-2xl font-semibold">{frontendText(locale, "FOCUS_TITLE")}</h1>
    <p role="alert">{frontendText(locale, recovery.kind === "blocked" ? "FOCUS_STORAGE_BLOCKED" : "FOCUS_START_UNCERTAIN")}</p>
    <Button disabled={pending} onClick={() => setRetryVersion(value => value + 1)}>{frontendText(locale, "FOCUS_RETRY")}</Button>
    {recovery.kind === "ready" && !recovery.acknowledged && <Button disabled={pending} onClick={() => void mutate(epoch => sendStart(epoch, recovery.intent, recovery.intent), true)}>{frontendText(locale, "FOCUS_RETRY_START")}</Button>}
  </section>;
  return <FocusPage locale={locale} state={state} memberId={memberId} pending={pending} actionError={actionError} actionNotice={actionNotice} selectionVersion={selectionVersion} onDenied={clearDenied} onRetry={() => setRetryVersion(value => value + 1)} onStart={input => void mutate(epoch => sendStart(epoch, input))} onTransition={action => {
    if (state.kind === "ready" && state.session) void mutate(epoch => sendTransition(epoch, Object.freeze({id: state.session!.id, taskId: state.session!.taskId, clientKey: state.session!.clientKey, action, expectedUpdatedAt: state.session!.updatedAt})));
  }} />;
}

export function WorkbenchReviewRoute({ locale }: { locale: LocaleRuntime }) {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [state, setState] = useState<WorkbenchReviewPageState>({ kind: "loading" });
  const [retryVersion, setRetryVersion] = useState(0);
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const clearDenied = useCallback(() => {
    setTarget(null);
    setState({kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD")});
  }, [locale]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setTarget(null);
    setState({ kind: "loading" });
    void loadWorkbenchReview(period, fetch, controller.signal).then((snapshot) => {
      if (active) setState({ kind: "ready", snapshot });
    }).catch((error: unknown) => {
      if (active && !isAbort(error)) setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
    });
    return () => { active = false; controller.abort(); };
  }, [locale, period, retryVersion]);
  const changePeriod = (next: "daily" | "weekly") => {
    if (next === period) return;
    // Clear the old snapshot in the same render as the selected period.
    setTarget(null);
    setState({ kind: "loading" });
    setPeriod(next);
  };
  return <><div inert={target ? true : undefined}><WorkbenchReviewPage locale={locale} period={period} state={state} onOpen={setTarget} onPeriodChange={changePeriod} onRetry={() => { setState({ kind: "loading" }); setRetryVersion((value) => value + 1); }} /></div>{target && <SnapshotTargetDetail key={`${target.kind}:${target.id}`} target={target} locale={locale} title={frontendText(locale, "REVIEW_DETAIL_TITLE")} onClose={() => setTarget(null)} onDenied={clearDenied} />}</>;
}

export function NotificationsRoute({ locale, search, isAdmin = false, memberId }: { locale: LocaleRuntime; search: string; isAdmin?: boolean; memberId?: string }) {
  const initial = useMemo(() => parseNotificationSearch(search), [search]);
  const [stored] = useState(() => memberId ? loadNotificationUpdate(memberId) : { kind: "empty" as const });
  const [query, setQuery] = useState<NotificationQuery>(initial);
  const [state, setState] = useState<NotificationsPageState>({ kind: "loading" });
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [recordBlocked, setRecordBlocked] = useState(stored.kind === "blocked");
  const queryRef = useRef(query);
  queryRef.current = query;
  const controllerRef = useRef<ReturnType<typeof createNotificationsRequestController> | null>(null);
  const actionPendingRef = useRef(false);
  const activeRef = useRef(true);
  const readyRef = useRef(false);
  const locationEpochRef = useRef(0);
  // An update whose response was lost stays locked until a later read shows the current list.
  // With a member, that lock is restored from this tab after refresh.
  const unknownRef = useRef(stored.kind === "ready");
  const intentRef = useRef<NotificationUpdateIntent | null>(stored.kind === "ready" ? stored.intent : null);
  const recordBlockedRef = useRef(stored.kind === "blocked");
  const ownedNavigationRef = useRef(false);
  const leaveGuardRef = useRef<(() => void) | null>(null);
  const syncLeaveGuard = useCallback(() => {
    const locked = actionPendingRef.current || unknownRef.current;
    if (locked && !leaveGuardRef.current) {
      leaveGuardRef.current = registerWorkspaceLeaveGuard(() => ({
        kind: (actionPendingRef.current || unknownRef.current) && !ownedNavigationRef.current ? "block" : "allow",
      }));
    } else if (!locked && leaveGuardRef.current) {
      leaveGuardRef.current();
      leaveGuardRef.current = null;
    }
  }, []);
  const writeOwned = useCallback((mode: "push" | "replace", url: string, onCommit?: () => void) => {
    ownedNavigationRef.current = true;
    try { return writeWorkspaceHistory(mode, url, onCommit); }
    finally { ownedNavigationRef.current = false; }
  }, []);

  const invalidateSnapshot = (next: NotificationsPageState) => {
    readyRef.current = false;
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setSummary(null);
    setPending(false);
    setState(next);
  };

  const clearRestrictedState = () => {
    const intent = intentRef.current;
    if (memberId && intent) clearNotificationUpdate(memberId, intent);
    intentRef.current = null;
    unknownRef.current = false;
    recordBlockedRef.current = false;
    setRecordBlocked(false);
    setActionError(undefined);
    invalidateSnapshot({ kind: "forbidden" });
    syncLeaveGuard();
  };

  useEffect(() => {
    const controller = controllerRef.current ?? createNotificationsRequestController();
    controllerRef.current = controller;
    readyRef.current = false;
    setPending(true);
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    const snapshot = query;
    const request = controller.request(snapshot);
    void request.promise.then(({ page, summary: nextSummary }) => {
      if (!controller.isCurrent(request.generation) || !sameNotificationQuery(queryRef.current, snapshot)) return;
      const lastPage = Math.max(1, page.pagination.totalPages);
      if (snapshot.page > lastPage) {
        const next = { ...snapshot, page: lastPage };
        writeOwned("replace", `/notifications${writeNotificationSearch(readWorkspaceLocation().search, next)}`, () => {
          queryRef.current = next; setQuery(next);
        });
        return;
      }
      if (intentRef.current && memberId && !clearNotificationUpdate(memberId, intentRef.current)) {
        unknownRef.current = true;
        syncLeaveGuard();
        setActionError(frontendText(locale, "NOTIFICATIONS_UPDATE_RECORD_STUCK"));
        setSummary(null);
        setState({ kind: "recovery" });
        setPending(false);
        return;
      }
      intentRef.current = null;
      unknownRef.current = false;
      syncLeaveGuard();
      readyRef.current = true;
      setState({ kind: "ready", items: page.items, pagination: page.pagination });
      setSummary(nextSummary);
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || !sameNotificationQuery(queryRef.current, snapshot) || isAbort(error)) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        clearRestrictedState(); return;
      }
      setSummary(null);
      setState({ kind: "error" }); setPending(false);
    });
  }, [query, retryVersion, syncLeaveGuard, writeOwned]);

  useEffect(() => {
    const onPopState = () => {
      locationEpochRef.current += 1;
      readyRef.current = false;
      const next = parseNotificationSearch(readWorkspaceLocation().search);
      setActionError(undefined);
      queryRef.current = next; setQuery(next);
    };
    return subscribeWorkspaceLocation(onPopState);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (actionPendingRef.current || unknownRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    syncLeaveGuard();
    return () => window.removeEventListener("beforeunload", warn);
  }, [syncLeaveGuard]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      readyRef.current = false;
      locationEpochRef.current += 1;
      actionPendingRef.current = false;
      unknownRef.current = false;
      syncLeaveGuard();
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [syncLeaveGuard]);

  const navigate = (next: NotificationQuery, replace = false) => {
    writeOwned(replace ? "replace" : "push", `/notifications${writeNotificationSearch(readWorkspaceLocation().search, next)}`, () => {
      readyRef.current = false; setActionError(undefined);
      queryRef.current = next; setQuery(next);
    });
  };

  const mutate = async (intent: NotificationUpdateIntent, operation: () => Promise<unknown>) => {
    if (actionPendingRef.current || unknownRef.current || recordBlockedRef.current || !readyRef.current) return;
    if (memberId && !saveNotificationUpdate(memberId, intent)) {
      setActionError(frontendText(locale, "NOTIFICATIONS_UPDATE_NOT_RECORDED"));
      return;
    }
    if (memberId) intentRef.current = intent;
    actionPendingRef.current = true;
    syncLeaveGuard();
    setActionPending(true); setActionError(undefined);
    try {
      await operation();
      if (activeRef.current && readWorkspaceLocation().pathname === "/notifications") {
        invalidateSnapshot({ kind: "loading" });
        setRetryVersion((value) => value + 1);
      }
    } catch (error: unknown) {
      if (activeRef.current) {
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) clearRestrictedState();
        else if (readWorkspaceLocation().pathname === "/notifications") {
          unknownRef.current = true;
          setActionError(undefined);
          invalidateSnapshot({ kind: "recovery" });
        }
      }
    } finally {
      actionPendingRef.current = false;
      syncLeaveGuard();
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
    onRetry={() => { invalidateSnapshot({ kind: "loading" }); setRetryVersion((value) => value + 1); }}
    onFilterChange={(filters: NotificationFilters) => navigate({ page: 1, pageSize: query.pageSize, filters })}
    onPageChange={(page) => navigate({ ...query, page })}
    onPageSizeChange={(pageSize) => navigate({ page: 1, pageSize, filters: query.filters })}
    recordBlocked={recordBlocked}
    onDiscardRecord={() => {
      if (!memberId || !discardBlockedNotificationUpdate(memberId)) return;
      recordBlockedRef.current = false;
      setRecordBlocked(false);
      setActionError(undefined);
    }}
    onMarkRead={(id) => void mutate({ op: "read", id }, () => markNotificationRead(id))}
    onMarkVisibleRead={(ids) => void mutate({ op: "bulk", ids: [...ids] }, () => markVisibleNotificationsRead(ids))}
    onOpen={(id) => {
      const epoch = locationEpochRef.current;
      void mutate({ op: "open", id }, async () => {
        const current = await markNotificationRead(id);
        if (!activeRef.current || epoch !== locationEpochRef.current) return;
        const href = notificationTargetHref(current, isAdmin);
        if (href) {
          actionPendingRef.current = false;
          syncLeaveGuard();
          writeWorkspaceHistory("push", href);
        }
        else setActionError(frontendText(locale, "NOTIFICATIONS_TARGET_UNAVAILABLE"));
      });
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
      if (readWorkspaceLocation().pathname !== "/messages") return;
      const next = parseDiscussionSearch(readWorkspaceLocation().search);
      if (sameDiscussionSearch(queryRef.current, next)) return;
      queryRef.current = next;
      setQuery(next);
    };
    return subscribeWorkspaceLocation(onLocationChange);
  }, []);
  useEffect(() => () => { controllerRef.current?.dispose(); controllerRef.current = null; }, []);

  const navigate = (next: DiscussionSearch) => {
    writeWorkspaceHistory("push", `/messages${writeDiscussionSearch(readWorkspaceLocation().search, next)}`, () => {
      queryRef.current = next; setQuery(next);
    });
  };
  return <MessagesPage locale={locale} state={state} page={query.page} limit={query.limit} pending={pending}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onNext={(cursor) => navigate({ page: query.page + 1, limit: query.limit, cursor })}
    onPrevious={() => window.history.back()}
    onLimitChange={(limit) => navigate({ page: 1, limit })} />;
}

export function DiscussionThreadRoute({ memberId, locale, threadId, search }: { memberId?: string; locale: LocaleRuntime; threadId: string; search: string }) {
  if (!memberId) return <PageState kind="error" title={frontendText(locale, "MESSAGES_THREAD_ERROR")} />;
  return <MemberDiscussionThreadRoute key={`${memberId}:${threadId}`} memberId={memberId} locale={locale} threadId={threadId} search={search} />;
}

function MemberDiscussionThreadRoute({ memberId, locale, threadId, search }: { memberId: string; locale: LocaleRuntime; threadId: string; search: string }) {
  const initial = useMemo(() => parseDiscussionSearch(search), [search]);
  const [query, setQuery] = useState<DiscussionSearch>(initial);
  const [state, setState] = useState<ThreadPageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  // Denial hides private content and invalidates callbacks, not unresolved identity.
  const accessEpochRef = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const activeRef = useRef(true);
  const currentThreadIdRef = useRef(threadId);
  if (currentThreadIdRef.current !== threadId) {
    currentThreadIdRef.current = threadId;
    accessEpochRef.current += 1;
  }
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
      if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) {
        accessEpochRef.current += 1;
      }
      setState({ kind: "error" }); setPending(false);
    });
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [query, retryVersion, threadId]);

  useEffect(() => {
    activeRef.current = true;
    const onPopState = () => { const next = parseDiscussionSearch(readWorkspaceLocation().search); queryRef.current = next; setQuery(next); };
    const unsubscribe = subscribeWorkspaceLocation(onPopState);
    return () => { activeRef.current = false; unsubscribe(); controllerRef.current?.dispose(); controllerRef.current = null; };
  }, []);

  const navigate = (next: DiscussionSearch, replace = false) => {
    writeWorkspaceHistory(replace ? "replace" : "push", `/messages/${encodeURIComponent(threadId)}${writeDiscussionSearch(readWorkspaceLocation().search, next)}`, () => {
      queryRef.current = next; setQuery(next);
    });
  };
  const withCurrentAccess = async <T,>(operation: () => Promise<T>): Promise<T> => {
    const sendingThreadId = threadId;
    const sendingEpoch = accessEpochRef.current;
    let result: T;
    try {
      result = await operation();
    } catch (error) {
      if (activeRef.current && currentThreadIdRef.current === sendingThreadId && accessEpochRef.current === sendingEpoch
        && error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) {
        // Revocation also invalidates concurrent reads; a late response must not
        // restore the private transcript or the composer after access is denied.
        controllerRef.current?.dispose(); controllerRef.current = null;
        accessEpochRef.current += 1;
        setState({ kind: "error" }); setPending(false);
      }
      throw error;
    }
    if (!activeRef.current || currentThreadIdRef.current !== sendingThreadId || accessEpochRef.current !== sendingEpoch) throw new Error("DISCUSSION_ACCESS_CHANGED");
    return result;
  };
  const send = async (input: Parameters<typeof sendDiscussionMessage>[0]) => { await withCurrentAccess(() => sendDiscussionMessage(input)); };
  const lookup = async (input: Parameters<typeof loadDiscussionMessageResult>[0]) => (await withCurrentAccess(() => loadDiscussionMessageResult(input))) !== null;
  const sent = () => {
    if (queryRef.current.page !== 1 || queryRef.current.cursor) navigate({ page: 1, limit: queryRef.current.limit }, true);
    else setRetryVersion((value) => value + 1);
  };
  const visibleState: ThreadPageState = state.kind === "ready" && state.thread.id !== threadId ? { kind: "loading" } : state;
  return <ThreadPage key={threadId} recoveryOwner={{ memberId, threadId }} locale={locale} state={visibleState} page={query.page} limit={query.limit} pending={pending}
    onRetry={() => setRetryVersion((value) => value + 1)}
    onRefresh={() => setRetryVersion((value) => value + 1)}
    onNext={(cursor) => navigate({ page: query.page + 1, limit: query.limit, cursor })}
    onPrevious={() => window.history.back()}
    onLimitChange={(limit) => navigate({ page: 1, limit })}
    onSend={send} onLookup={lookup} onSent={sent} />;
}

function sameDiscussionSearch(left: DiscussionSearch, right: DiscussionSearch): boolean {
  return left.page === right.page && left.limit === right.limit && left.cursor === right.cursor
    && left.context?.kind === right.context?.kind && left.context?.id === right.context?.id;
}

function sameNotificationQuery(left: NotificationQuery, right: NotificationQuery): boolean {
  return left.page === right.page && left.pageSize === right.pageSize
    && left.filters.read === right.filters.read && left.filters.eventType === right.filters.eventType;
}

export function BoardsRoute({ locale, search, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  const initial = useMemo(() => parseBoardSearch(search), [search]);
  // Without a member (preview) moves are not recorded; with one, an unknown move survives refresh in this tab.
  const [stored] = useState(() => memberId ? loadBoardMove(memberId) : { kind: "empty" as const });
  const restoredMove: BoardUnknownMove | null = stored.kind === "ready"
    ? { task: { id: stored.intent.taskId, title: stored.intent.title }, source: stored.intent.source, target: stored.intent.target } : null;
  const [queries, setQueries] = useState<BoardPagination>(initial);
  const [columns, setColumns] = useState<BoardColumnStates>(initialBoardColumns);
  const [retryVersions, setRetryVersions] = useState<Record<BoardStatus, number>>(() => ({ todo: 0, doing: 0, blocked: 0, done: 0 }));
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | undefined>();
  const [actionNotice, setActionNotice] = useState<string | undefined>();
  const [unknownMove, setUnknownMove] = useState<BoardUnknownMove | null>(restoredMove);
  const [recordBlocked, setRecordBlocked] = useState(stored.kind === "blocked");
  const [recovering, setRecovering] = useState(false);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const queriesRef = useRef(queries);
  queriesRef.current = queries;
  const requestStatesRef = useRef<Record<BoardStatus, BoardRequestState>>(initialBoardRequestStates());
  const mutationOwnersRef = useRef<Record<BoardStatus, number | null>>({ todo: null, doing: null, blocked: null, done: null });
  const actionPendingRef = useRef(false);
  const actionGenerationRef = useRef(0);
  const activeRef = useRef(true);
  // A move whose write outcome is unknown stays here until an explicit GET or same-target retry settles it.
  const unknownMoveRef = useRef<BoardUnknownMove | null>(restoredMove);
  const recordBlockedRef = useRef(stored.kind === "blocked");
  const recoveringRef = useRef(false);
  const ownedQueryNavigationRef = useRef(false);
  const leaveGuardRef = useRef<(() => void) | null>(null);
  // Registered only while locked: an idle board keeps ordinary browser history behaviour.
  // Call synchronously at every lock transition so a same-event leave cannot pass.
  const syncLeaveGuard = useCallback(() => {
    const locked = () => actionPendingRef.current || recoveringRef.current || unknownMoveRef.current !== null;
    if (locked() && !leaveGuardRef.current) {
      leaveGuardRef.current = registerWorkspaceLeaveGuard(() => ({ kind: locked() && !ownedQueryNavigationRef.current ? "block" : "allow" }));
    } else if (!locked() && leaveGuardRef.current) {
      leaveGuardRef.current(); leaveGuardRef.current = null;
    }
  }, []);

  const deniedRef = useRef(false);
  const controllersRef = useRef<Partial<Record<BoardStatus, ReturnType<typeof createTasksRequestController>>>>({});
  const clearDeniedBoard = useCallback((error: unknown): boolean => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    // Revoke the entire view before any stale read or optimistic rollback can restore private cards.
    deniedRef.current = true;
    for (const status of BOARD_STATUSES) {
      controllersRef.current[status]?.dispose();
      requestStatesRef.current[status] = { revision: requestStatesRef.current[status].revision + 1, pending: false, superseded: false };
      mutationOwnersRef.current[status] = null;
    }
    actionGenerationRef.current += 1;
    actionPendingRef.current = false;
    unknownMoveRef.current = null; recoveringRef.current = false; syncLeaveGuard();
    setActionPendingId(null); setActionError(undefined); setActionNotice(undefined); setUnknownMove(null); setRecovering(false);
    const cleared: BoardColumnStates = { todo: { kind: "error" }, doing: { kind: "error" }, blocked: { kind: "error" }, done: { kind: "error" } };
    columnsRef.current = cleared; setColumns(cleared);
    return true;
  }, [syncLeaveGuard]);
  // Only this route's read-only column query changes may pass while a move is unresolved.
  const writeOwnBoardHistory = useCallback((mode: "push" | "replace", url: string, onCommit: () => void) => {
    ownedQueryNavigationRef.current = true;
    try { writeWorkspaceHistory(mode, url, onCommit); } finally { ownedQueryNavigationRef.current = false; }
  }, []);

  useEffect(() => {
    const owner = window;
    const warn = (event: BeforeUnloadEvent) => {
      if (actionPendingRef.current || recoveringRef.current || unknownMoveRef.current !== null) { event.preventDefault(); event.returnValue = ""; }
    };
    owner.addEventListener("beforeunload", warn);
    syncLeaveGuard();
    return () => {
      unknownMoveRef.current = null; recoveringRef.current = false; actionPendingRef.current = false; syncLeaveGuard();
      owner.removeEventListener("beforeunload", warn);
    };
  }, [syncLeaveGuard]);

  useBoardColumnRequest("todo", queries.todo, retryVersions.todo, queriesRef, requestStatesRef, mutationOwnersRef, deniedRef, controllersRef, clearDeniedBoard, writeOwnBoardHistory, setQueries, setColumns);
  useBoardColumnRequest("doing", queries.doing, retryVersions.doing, queriesRef, requestStatesRef, mutationOwnersRef, deniedRef, controllersRef, clearDeniedBoard, writeOwnBoardHistory, setQueries, setColumns);
  useBoardColumnRequest("blocked", queries.blocked, retryVersions.blocked, queriesRef, requestStatesRef, mutationOwnersRef, deniedRef, controllersRef, clearDeniedBoard, writeOwnBoardHistory, setQueries, setColumns);
  useBoardColumnRequest("done", queries.done, retryVersions.done, queriesRef, requestStatesRef, mutationOwnersRef, deniedRef, controllersRef, clearDeniedBoard, writeOwnBoardHistory, setQueries, setColumns);

  useEffect(() => {
    const onPopState = () => {
      const next = parseBoardSearch(readWorkspaceLocation().search);
      queriesRef.current = next; setActionError(undefined); setQueries(next);
    };
    return subscribeWorkspaceLocation(onPopState);
  }, []);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; actionGenerationRef.current += 1; };
  }, []);

  const navigate = (status: BoardStatus, next: { page: number; pageSize: SupportedPageSize }) => {
    writeOwnBoardHistory("push", `/boards${writeBoardColumnSearch(readWorkspaceLocation().search, status, next)}`, () => {
      setActionError(undefined);
      const nextQueries = { ...queriesRef.current, [status]: next };
      queriesRef.current = nextQueries; setQueries(nextQueries);
    });
  };

  const refreshAllColumns = () => setRetryVersions((current) => ({ todo: current.todo + 1, doing: current.doing + 1, blocked: current.blocked + 1, done: current.done + 1 }));
  const statusText = (status: TaskItem["status"]) => frontendText(locale, taskStatusKey(status));
  const moveIntent = (pending: BoardUnknownMove): BoardMoveIntent => ({ taskId: pending.task.id, title: pending.task.title.slice(0, 500), source: pending.source, target: pending.target });
  const clearMoveRecord = (pending: BoardUnknownMove) => !memberId || clearBoardMove(memberId, moveIntent(pending));
  const settleUnknownMove = (pending: BoardUnknownMove, notice: string | undefined, error?: string) => {
    if (unknownMoveRef.current !== pending) return;
    if (!clearMoveRecord(pending)) { setActionNotice(undefined); setActionError(frontendText(locale, "BOARDS_MOVE_RECORD_STUCK")); return; }
    unknownMoveRef.current = null; recoveringRef.current = false; syncLeaveGuard();
    setUnknownMove(null); setRecovering(false); setActionNotice(notice); setActionError(error);
    refreshAllColumns();
  };
  const outcomeNotice = (pending: BoardUnknownMove, current: TaskItem["status"]) =>
    current === pending.target ? frontendText(locale, "BOARDS_MOVE_APPLIED").replace("{status}", statusText(pending.target))
      : current === pending.source ? frontendText(locale, "BOARDS_MOVE_NOT_APPLIED").replace("{status}", statusText(pending.source))
        : frontendText(locale, "BOARDS_MOVE_CHANGED").replace("{status}", statusText(current));
  const resolveUnknownMove = async (mode: "check" | "retry") => {
    const pending = unknownMoveRef.current;
    if (!pending || recoveringRef.current || actionPendingRef.current || deniedRef.current) return;
    recoveringRef.current = true; syncLeaveGuard(); setRecovering(true); setActionError(undefined); setActionNotice(undefined);
    const generation = actionGenerationRef.current;
    const live = () => activeRef.current && generation === actionGenerationRef.current && unknownMoveRef.current === pending;
    try {
      const current = mode === "check"
        ? (await loadTaskDetail(pending.task.id)).task.status
        : (await setTaskStatus(pending.task.id, pending.target, fetch, pending.source)).status;
      if (live()) settleUnknownMove(pending, outcomeNotice(pending, current));
    } catch (error: unknown) {
      if (!live() || clearDeniedBoard(error)) return;
      if (mode === "check" && error instanceof ApiRequestError && error.status === 404) settleUnknownMove(pending, frontendText(locale, "BOARDS_MOVE_MISSING"));
      else if (mode === "retry" && isDefiniteBoardMoveRejection(error)) settleUnknownMove(pending, undefined, frontendText(locale, "BOARDS_ACTION_FAILED"));
      else setActionError(frontendText(locale, mode === "check" ? "BOARDS_MOVE_CHECK_FAILED" : "BOARDS_MOVE_STILL_UNKNOWN"));
    } finally {
      if (live()) { recoveringRef.current = false; syncLeaveGuard(); setRecovering(false); }
    }
  };

  const move = async (task: TaskItem, target: BoardTargetStatus) => {
    if (deniedRef.current || actionPendingRef.current || unknownMoveRef.current || recoveringRef.current || recordBlockedRef.current
      || task.status === target || !BOARD_STATUSES.includes(task.status as BoardStatus)) return;
    const source = task.status as BoardStatus;
    const before = columnsRef.current;
    const optimistic = moveTaskBetweenColumns(before, task, source, target);
    if (optimistic === before) return;
    const pending: BoardUnknownMove = { task, source, target };
    if (memberId && !saveBoardMove(memberId, moveIntent(pending))) {
      setActionNotice(undefined); setActionError(frontendText(locale, "BOARDS_MOVE_NOT_RECORDED"));
      return;
    }
    const sourceQuery = { ...queriesRef.current[source] };
    const targetQuery = isBoardStatus(target) ? { ...queriesRef.current[target] } : undefined;
    const targetChanged = isBoardStatus(target) && optimistic[target] !== before[target];
    const targetBefore = isBoardStatus(target) ? before[target] : undefined;
    const targetEvicted = targetChanged && targetBefore?.kind === "ready" && targetBefore.pagination.page === 1
      && targetBefore.items.length === targetBefore.pagination.pageSize ? targetBefore.items.at(-1) : undefined;
    const targetEvictedIndex = targetEvicted && targetBefore?.kind === "ready" ? targetBefore.items.length - 1 : undefined;
    actionPendingRef.current = true; syncLeaveGuard();
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
    setActionPendingId(task.id); setActionError(undefined); setActionNotice(undefined); setColumns(optimistic); columnsRef.current = optimistic;
    try {
      await setTaskStatus(task.id, target, fetch, source);
      const cleared = clearMoveRecord(pending);
      if (!activeRef.current || generation !== actionGenerationRef.current) return;
      if (!cleared) {
        unknownMoveRef.current = pending; syncLeaveGuard(); setUnknownMove(pending);
        setActionError(frontendText(locale, "BOARDS_MOVE_RECORD_STUCK"));
      }
      setRetryVersions((current) => ({ ...current, [source]: current[source] + 1, ...(isBoardStatus(target) ? { [target]: current[target] + 1 } : {}) }));
    } catch (error: unknown) {
      const rejected = isDefiniteBoardMoveRejection(error);
      const cleared = rejected && clearMoveRecord(pending);
      if (activeRef.current && generation === actionGenerationRef.current && !isAbort(error)) {
        if (clearDeniedBoard(error)) return;
        const sourceMatches = sameBoardQuery(queriesRef.current[source], delta.sourceQuery)
          && requestStatesRef.current[source].revision === delta.sourceRequestRevision
          && mutationOwnersRef.current[source] === delta.owner;
        const targetMatches = delta.target !== undefined && delta.targetChanged === true
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
        if (rejected && cleared && error instanceof ApiRequestError && error.status === 409) {
          setActionError(frontendText(locale, "BOARDS_MOVE_CONFLICT")); refreshAllColumns();
        } else if (rejected && cleared) setActionError(frontendText(locale, "BOARDS_ACTION_FAILED"));
        else {
          // The server may have applied the move; the rolled-back cards are not proof that it did not.
          // A rejection whose record could not be cleared is reconciled the same way so the record is not orphaned.
          unknownMoveRef.current = pending; syncLeaveGuard(); setUnknownMove(pending);
          if (rejected) setActionError(frontendText(locale, "BOARDS_MOVE_RECORD_STUCK"));
        }
      }
    } finally {
      if (activeRef.current && generation === actionGenerationRef.current) {
        actionPendingRef.current = false; syncLeaveGuard(); setActionPendingId(null);
      }
    }
  };

  return <BoardsPage locale={locale} columns={columns} actionError={actionError} actionNotice={actionNotice} actionPendingId={actionPendingId}
    unknownMove={unknownMove} recovering={recovering} recordBlocked={recordBlocked}
    onDiscardRecord={() => {
      if (!memberId || !discardBlockedBoardMove(memberId)) { setActionError(frontendText(locale, "BOARDS_MOVE_RECORD_STUCK")); return; }
      recordBlockedRef.current = false; setRecordBlocked(false); setActionError(undefined);
    }}
    onCheckMove={() => void resolveUnknownMove("check")} onRetryMove={() => void resolveUnknownMove("retry")}
    onRetry={(status) => {
      if (deniedRef.current) {
        deniedRef.current = false;
        setRetryVersions((current) => ({ todo: current.todo + 1, doing: current.doing + 1, blocked: current.blocked + 1, done: current.done + 1 }));
      } else setRetryVersions((current) => ({ ...current, [status]: current[status] + 1 }));
    }}
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
  deniedRef: { current: boolean },
  controllersRef: { current: Partial<Record<BoardStatus, ReturnType<typeof createTasksRequestController>>> },
  clearDeniedBoard: (error: unknown) => boolean,
  writeOwnBoardHistory: (mode: "push" | "replace", url: string, onCommit: () => void) => void,
  setQueries: Dispatch<SetStateAction<BoardPagination>>,
  setColumns: Dispatch<SetStateAction<BoardColumnStates>>,
) {
  useEffect(() => {
    if (deniedRef.current) return;
    const controller = createTasksRequestController();
    controllersRef.current[status] = controller;
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
        writeOwnBoardHistory("replace", `/boards${writeBoardColumnSearch(readWorkspaceLocation().search, status, nextQuery)}`, () => {
          const nextQueries = { ...queriesRef.current, [status]: nextQuery };
          queriesRef.current = nextQueries; setQueries(nextQueries);
        });
        return;
      }
      setColumns((current) => ({ ...current, [status]: { kind: "ready", items: data.items, pagination: data.pagination, pending: false } }));
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || requestStatesRef.current[status].revision !== revision || isAbort(error)) return;
      if (clearDeniedBoard(error)) return;
      if (!sameBoardQuery(queriesRef.current[status], querySnapshot) || mutationOwnersRef.current[status] !== owner) {
        requestStatesRef.current[status] = { revision, pending: false, superseded: true }; return;
      }
      requestStatesRef.current[status] = { revision, pending: false, superseded: false };
      setColumns((current) => ({ ...current, [status]: current[status].kind === "ready" ? { ...current[status], pending: false, loadError: true } : { kind: "error" } }));
    });
    return () => {
      controller.dispose();
      if (controllersRef.current[status] === controller) delete controllersRef.current[status];
    };
  }, [query.page, query.pageSize, retryVersion, setColumns, setQueries, status, clearDeniedBoard, writeOwnBoardHistory]);
}

// Status writes reject 4xx before committing; transport failures, 5xx, 408/429 and malformed receipts are unknown.
function isDefiniteBoardMoveRejection(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
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

export function ReviewQueueRoute(props: { locale: LocaleRuntime; search: string }) {
  return <ReviewDraftProvider locale={props.locale} preserveUnsent><ReviewQueueSession {...props} /></ReviewDraftProvider>;
}
function ReviewQueueSession({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const drafts = useReviewDrafts()!;
  const initial = parsePageSearch(search); const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: ReviewQueuePageResult } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const [decisionState, setDecisionState] = useState<ReviewDecisionState>({ kind: "idle" });
  const [completedId, setCompletedId] = useState<string | null>(null);
  const controllerRef = useRef<ReturnType<typeof createReviewQueueRequestController> | null>(null);
  const readRef = useRef<object | null>(null);
  const decisionRef = useRef<{ settled: boolean } | null>(null);
  const operationRef = useRef<ReviewOperation | null>(null);
  const needsClampRef = useRef(false);
  const [clampTarget, setClampTarget] = useState<{ source: { page: number; pageSize: SupportedPageSize }; page: number } | null>(null);
  const lifetimeRef = useRef({});
  const deniedRef = useRef(false);
  useEffect(() => {
    const owner = window;
    const locked = () => Boolean(decisionRef.current && !decisionRef.current.settled) || operationRef.current !== null;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: locked() ? "block" : "allow" }));
    const warn = (event: BeforeUnloadEvent) => { if (locked()) { event.preventDefault(); event.returnValue = ""; } };
    owner.addEventListener("beforeunload", warn);
    return () => {
      lifetimeRef.current = {}; decisionRef.current = null; operationRef.current = null;
      unregister(); owner.removeEventListener("beforeunload", warn);
    };
  }, []);
  const queryRef = useRef({ page, pageSize }); const sameQuery = (value: { page: number; pageSize: SupportedPageSize }) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize;
  useEffect(() => subscribeWorkspaceLocation(() => { const next = parsePageSearch(readWorkspaceLocation().search); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); }), []);
  const read = async (controller: ReturnType<typeof createReviewQueueRequestController>, snapshot: { page: number; pageSize: SupportedPageSize }, afterDecision = false) => {
    if (readRef.current || controllerRef.current !== controller) return;
    const token = {}; readRef.current = token;
    const activeAtStart = decisionRef.current;
    setPending(true); setLocalError(undefined);
    const request = controller.request(snapshot);
    try {
      const data = await request.promise;
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
      // A paginated pending queue cannot establish the outcome of a missing row.
      // Resolve that exact object before releasing its unknown-operation lock.
      const operation = operationRef.current;
      if (operation && !activeAtStart && !decisionRef.current) {
        const row = data.items.find((item) => item.id === operation.id);
        const status = row?.status ?? (await loadReviewDetail(operation.id)).detail.status;
        if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
        if (["published", "rejected", "revision_requested"].includes(status)) {
          drafts.clear(operation.id); operationRef.current = null; setDecisionState({ kind: "idle" }); setCompletedId(operation.id);
        }
      }
      deniedRef.current = false;
      setState({ kind: "ready", data });
      if (!operationRef.current && (afterDecision || needsClampRef.current) && data.items.length === 0 && snapshot.page > 1) {
        setClampTarget({ source: snapshot, page: Math.max(1, Math.min(snapshot.page - 1, data.pagination.totalPages)) });
      }
      needsClampRef.current = false;
    } catch (error: unknown) {
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot) || isAbort(error)) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        deniedRef.current = true;
        setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
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
    void read(controller, snapshot);
    return () => { controller.dispose(); if (controllerRef.current === controller) { controllerRef.current = null; readRef.current = null; } };
  }, [locale, page, pageSize]);
  const navigate = (next: { page: number; pageSize: SupportedPageSize }, replace = false) => { const url = `${readWorkspaceLocation().pathname}${writePageSearch(readWorkspaceLocation().search, next)}`; writeWorkspaceHistory(replace ? "replace" : "push", url, () => { queryRef.current = next; setPage(next.page); setPageSize(next.pageSize); }); };
  // Admit empty-page repair only after React commits the acknowledged result,
  // so stale row-level pending guards cannot veto the already-settled write.
  useEffect(() => {
    if (!clampTarget) return;
    setClampTarget(null);
    if (sameQuery(clampTarget.source) && !operationRef.current && !decisionRef.current) {
      navigate({ page: clampTarget.page, pageSize: clampTarget.source.pageSize }, true);
    }
  }, [clampTarget]);
  const review = async (id: string, action: ReviewDecision, details?: ReviewNoteInput, retryOperation?: ReviewOperation) => {
    if (decisionRef.current || readRef.current || state.kind !== "ready" || localError || completedId === id || (operationRef.current && operationRef.current !== retryOperation)) return;
    const actionController = controllerRef.current; if (!actionController) return;
    const token = { settled: false }; decisionRef.current = token;
    const lifetime = lifetimeRef.current;
    const ownsDecision = () => lifetimeRef.current === lifetime && decisionRef.current === token;
    setPendingId(id);
    setDecisionState({ kind: "pending", action });
    try {
      try {
        let operation = retryOperation;
        if (!operation) {
          const publish = action === "publish" ? (await loadReviewDetail(id)).publish
            : { title: "", visibility: "shared" as const, spaceId: "default", collectionId: null, tagIds: [] };
          if (!ownsDecision()) return;
          if (deniedRef.current) { setDecisionState({ kind: "idle" }); return; }
          operation = prepareReviewDecision(id, action, publish, details);
        }
        operationRef.current = operation;
        const receipt = await sendReviewDecision(operation);
        if (!ownsDecision()) return;
        drafts.clear(id); operationRef.current = null; token.settled = true;
        setDecisionState({ kind: "success", receipt }); setCompletedId(id); needsClampRef.current = true;
      } catch (error: unknown) {
        if (ownsDecision()) {
          if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
            setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
            deniedRef.current = true; setLocalError(undefined);
            setDecisionState(operationRef.current ? { kind: "error", action, recovery: "retry" } : { kind: "idle" });
          } else {
            const recovery = operationRef.current ? reviewRecovery(error, Boolean(retryOperation)) : "edit";
            if (recovery === "edit") operationRef.current = null;
            setDecisionState({ kind: "error", action, recovery });
          }
        }
        return;
      }
      if (!ownsDecision()) return;
      const currentController = controllerRef.current;
      if (currentController && !deniedRef.current) await read(currentController, { ...queryRef.current }, true);
    } finally {
      if (decisionRef.current === token) { decisionRef.current = null; setPendingId(null); }
    }
  };
  const retryRead = (afterDecision = false) => {
    const controller = controllerRef.current;
    if (controller && !decisionRef.current) {
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
  const initial = parsePageSearch(search);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminDuplicatePageResult } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [readVersion, setReadVersion] = useState(0);
  const controllerRef = useRef<ReturnType<typeof createAdminDuplicateRequestController> | null>(null);
  const queryRef = useRef({ page, pageSize });
  const scopeRef = useRef({});
  const readRef = useRef<object | null>(null);
  const mutationRef = useRef<{ id: string } | null>(null);
  // These locks are local to this mounted route. Missing from a pending page is
  // not proof of a particular decision, and an acknowledged terminal receipt
  // must never be unlocked by stale pending data.
  const needsReadRef = useRef(new Set<string>());
  const unresolvedWrites = useRef(new Map<string, AdminDuplicateCandidate>());
  const acknowledgedRef = useRef(new Set<string>());
  const needsClampRef = useRef(false);
  useEffect(() => {
    const owner = window;
    const locked = () => mutationRef.current !== null || unresolvedWrites.current.size > 0;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: locked() ? "block" : "allow" }));
    const warn = (event: BeforeUnloadEvent) => { if (locked()) { event.preventDefault(); event.returnValue = ""; } };
    owner.addEventListener("beforeunload", warn);
    return () => { unregister(); owner.removeEventListener("beforeunload", warn); };
  }, []);
  const syncLocks = () => setLockedIds([...needsReadRef.current]);
  const sameQuery = (value: typeof queryRef.current) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize;
  const invalidateQuery = () => {
    scopeRef.current = {}; needsClampRef.current = false;
    controllerRef.current?.dispose(); controllerRef.current = null; readRef.current = null;
    setState({ kind: "loading" }); setPending(false); setLocalError(undefined);
  };
  const deny = (error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    // A denied read can overlap an actual POST after a locale refresh. Hide
    // private data, but only the POST settlement may release its active token.
    invalidateQuery(); syncLocks();
    setState({ kind: "forbidden", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
    return true;
  };
  const navigate = (next: typeof queryRef.current, replace = false) => {
    writeWorkspaceHistory(replace ? "replace" : "push", `${readWorkspaceLocation().pathname}${writePageSearch(readWorkspaceLocation().search, next)}`, () => {
      invalidateQuery(); queryRef.current = next;
      setPage(next.page); setPageSize(next.pageSize);
    });
  };
  const read = async (controller: NonNullable<typeof controllerRef.current>, snapshot: typeof queryRef.current, afterWrite = false) => {
    if ((!afterWrite && readRef.current) || controllerRef.current !== controller) return;
    const token = {}; readRef.current = token;
    const activeAtStart = mutationRef.current?.id;
    setPending(true); setLocalError(undefined);
    const request = controller.request(snapshot);
    try {
      const data = await request.promise;
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
      setState({ kind: "ready", data });
      // A pending-only page cannot prove the outcome of an absent candidate.
      // Recover it through an authenticated detail GET, never by replaying POST.
      for (const [id, expected] of unresolvedWrites.current) {
        if (id === activeAtStart || id === mutationRef.current?.id) continue;
        const row = data.items.find(item => item.submissionId === id) ?? await loadAdminDuplicate(id);
        if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
        if (row.canonicalSubmissionId !== expected.canonicalSubmissionId || row.canonicalSourceId !== expected.canonicalSourceId || row.canonicalSourceVersionId !== expected.canonicalSourceVersionId) throw new Error("DUPLICATE_RESPONSE_INVALID");
        unresolvedWrites.current.delete(id);
        if (row.decision === "pending") needsReadRef.current.delete(id);
        else acknowledgedRef.current.add(id);
      }
      for (const row of data.items) {
        if (row.submissionId !== activeAtStart && row.submissionId !== mutationRef.current?.id && !acknowledgedRef.current.has(row.submissionId)) needsReadRef.current.delete(row.submissionId);
      }
      syncLocks();
      if ((afterWrite || needsClampRef.current) && data.items.length === 0 && snapshot.page > 1) navigate({ ...snapshot, page: Math.max(1, Math.min(snapshot.page - 1, data.pagination.totalPages)) }, true);
      else { setState({ kind: "ready", data }); needsClampRef.current = false; }
    } catch (error: unknown) {
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot) || isAbort(error)) return;
      if (!deny(error)) {
        setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
      }
    } finally {
      if (readRef.current === token) { readRef.current = null; setPending(false); }
    }
  };
  const retryRead = () => {
    if (readRef.current || mutationRef.current) return;
    setState((old) => old.kind === "ready" ? old : { kind: "loading" });
    if (controllerRef.current) void read(controllerRef.current, { ...queryRef.current });
    else { readRef.current = {}; setReadVersion((version) => version + 1); }
  };
  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = parsePageSearch(readWorkspaceLocation().search);
    if (sameQuery(next)) return;
    invalidateQuery(); queryRef.current = next; setPage(next.page); setPageSize(next.pageSize);
  }), []);
  useEffect(() => {
    const controller = createAdminDuplicateRequestController(); controllerRef.current = controller; readRef.current = null;
    const snapshot = { page, pageSize }; queryRef.current = snapshot;
    void read(controller, snapshot);
    return () => { invalidateQuery(); };
  }, [locale, page, pageSize, readVersion]);
  const decide = async (id: string, decision: DuplicateDecision) => {
    if (!controllerRef.current || readRef.current || mutationRef.current || needsReadRef.current.has(id)) return;
    const candidate = state.kind === "ready" ? state.data.items.find((item) => item.submissionId === id) : undefined;
    if (!candidate || candidate.decision !== "pending") return;
    const token = { id }; const scope = scopeRef.current; const actionQuery = { ...queryRef.current };
    mutationRef.current = token; needsReadRef.current.add(id); unresolvedWrites.current.set(id, candidate); syncLocks(); setPendingId(id); setLocalError(undefined);
    try {
      const receipt = await decideAdminDuplicate(id, decision);
      if (scopeRef.current !== scope || !sameQuery(actionQuery)) return;
      if (receipt.canonicalSubmissionId !== candidate.canonicalSubmissionId || receipt.canonicalSourceId !== candidate.canonicalSourceId || receipt.canonicalSourceVersionId !== candidate.canonicalSourceVersionId) throw new Error("DUPLICATE_RESPONSE_INVALID");
      unresolvedWrites.current.delete(id); acknowledgedRef.current.add(id); mutationRef.current = null; setPendingId(null); needsClampRef.current = true;
      if (controllerRef.current) await read(controllerRef.current, actionQuery, true);
    } catch (error: unknown) {
      if (scopeRef.current === scope && sameQuery(actionQuery) && !deny(error)) setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
    } finally {
      if (mutationRef.current === token) { mutationRef.current = null; setPendingId(null); }
    }
  };
  return <DuplicateQueuePage onLoadRetry={retryRead} locale={locale} state={state} pendingId={pendingId} pending={pending} lockedIds={lockedIds} readRequired={!pendingId && lockedIds.some((id) => !acknowledgedRef.current.has(id) || (state.kind === "ready" && state.data.items.some((item) => item.submissionId === id)))} localError={localError} onDecision={(id, decision) => void decide(id, decision)} onPageChange={(next) => navigate({ page: next, pageSize })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next })} />;
}

export function AdminMembersRoute({ locale, search, load = loadAdminMembers, update = updateMemberStatus }: { locale: LocaleRuntime; search: string; load?: typeof loadAdminMembers; update?: typeof updateMemberStatus }) {
  const initial = parsePageSearch(search);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [status, setStatus] = useState<"active" | "disabled" | undefined>(() => memberStatusSearch(search));
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminMembersPage } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [readVersion, setReadVersion] = useState(0);
  const controllerRef = useRef<ReturnType<typeof createNumberedRequestController<Omit<LoadAdminMembersInput, "signal">, AdminMembersPage>> | null>(null);
  const queryRef = useRef({ page, pageSize, status });
  const scopeRef = useRef({});
  const readRef = useRef<object | null>(null);
  const mutationsRef = useRef(new Map<string, object>());
  // In-memory safety only: an uncertain PATCH is not replayed. A later GET must
  // expose this row before another explicit change; absence is not proof of success.
  const needsReadRef = useRef(new Set<string>());
  // A validated PATCH receipt resolves its outcome; row readiness is separate.
  // Without a receipt, only a post-settlement GET containing that row unlocks leave.
  const unresolvedWrites = useRef(new Set<string>());
  const ownedQueryNavigation = useRef(false);
  useEffect(() => {
    const owner = window;
    const locked = () => mutationsRef.current.size > 0 || unresolvedWrites.current.size > 0;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind:
      mutationsRef.current.size > 0 || (unresolvedWrites.current.size > 0 && !ownedQueryNavigation.current) ? "block" : "allow" }));
    const warn = (event: BeforeUnloadEvent) => { if (locked()) { event.preventDefault(); event.returnValue = ""; } };
    owner.addEventListener("beforeunload", warn);
    return () => { unregister(); owner.removeEventListener("beforeunload", warn); };
  }, []);
  const needsClampRef = useRef(false);
  const sameQuery = (value: typeof queryRef.current) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize && value.status === queryRef.current.status;
  const syncPendingIds = () => setPendingIds([...new Set([...mutationsRef.current.keys(), ...needsReadRef.current])]);
  const invalidateQuery = () => {
    scopeRef.current = {}; needsClampRef.current = false;
    controllerRef.current?.dispose(); controllerRef.current = null; readRef.current = null;
    setState({ kind: "loading" }); setPending(false); setLocalError(undefined); setActionError(undefined);
  };
  const deny = (error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    // Denial hides private rows, but must not erase another in-flight PATCH.
    invalidateQuery(); syncPendingIds();
    setState({ kind: "forbidden", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
    return true;
  };
  const navigate = (next: typeof queryRef.current, replace = false) => {
    if (mutationsRef.current.size > 0) return;
    const params = new URLSearchParams(writePageSearch(readWorkspaceLocation().search, next));
    if (next.status) params.set("status", next.status); else params.delete("status");
    const serialized = params.toString();
    // This synchronous allowance is only for this route's read-only query change.
    // It neither clears unresolved intents nor permits a later/deferred leave.
    ownedQueryNavigation.current = true;
    try { writeWorkspaceHistory(replace ? "replace" : "push", `${readWorkspaceLocation().pathname}${serialized ? `?${serialized}` : ""}`, () => {
      invalidateQuery(); queryRef.current = next;
      setPage(next.page); setPageSize(next.pageSize); setStatus(next.status);
    }); } finally { ownedQueryNavigation.current = false; }
  };
  const read = async (controller: NonNullable<typeof controllerRef.current>, snapshot: typeof queryRef.current, afterWrite = false) => {
    if ((!afterWrite && readRef.current) || controllerRef.current !== controller) return;
    const token = {}; readRef.current = token;
    // A read that began while PATCH was pending cannot prove the post-write state,
    // even if its response arrives after PATCH settles on another URL scope.
    const activeAtStart = new Set(mutationsRef.current.keys());
    setPending(true); setLocalError(undefined); setActionError(undefined);
    const request = controller.request(snapshot);
    try {
      const data = await request.promise;
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
      for (const row of data.items) {
        if (!activeAtStart.has(row.id) && !mutationsRef.current.has(row.id)) {
          needsReadRef.current.delete(row.id); unresolvedWrites.current.delete(row.id);
        }
      }
      syncPendingIds();
      if ((afterWrite || needsClampRef.current) && data.items.length === 0 && snapshot.page > 1) navigate({ ...snapshot, page: Math.max(1, Math.min(snapshot.page - 1, data.pagination.totalPages)) }, true);
      else { setState({ kind: "ready", data }); needsClampRef.current = false; }
    } catch (error: unknown) {
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot) || isAbort(error)) return;
      if (!deny(error)) {
        setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
      }
    } finally {
      if (readRef.current === token) { readRef.current = null; setPending(false); }
    }
  };
  const retryRead = () => {
    if (readRef.current) return;
    setState((old) => old.kind === "ready" ? old : { kind: "loading" });
    if (controllerRef.current) void read(controllerRef.current, { ...queryRef.current });
    else { readRef.current = {}; setReadVersion((version) => version + 1); }
  };
  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = { ...parsePageSearch(readWorkspaceLocation().search), status: memberStatusSearch(readWorkspaceLocation().search) };
    if (sameQuery(next)) return;
    invalidateQuery(); queryRef.current = next;
    setPage(next.page); setPageSize(next.pageSize); setStatus(next.status);
  }), []);
  useEffect(() => {
    const controller = createNumberedRequestController((input: Omit<LoadAdminMembersInput, "signal">, signal) => load({ ...input, signal }));
    controllerRef.current = controller; readRef.current = null;
    const snapshot = { page, pageSize, status }; queryRef.current = snapshot;
    void read(controller, snapshot);
    return () => { invalidateQuery(); };
  }, [load, locale, page, pageSize, status, readVersion]);
  const changeStatus = async (id: string, nextStatus: "active" | "disabled") => {
    if (!controllerRef.current || readRef.current || mutationsRef.current.has(id) || needsReadRef.current.has(id)) return;
    const member = state.kind === "ready" ? state.data.items.find((item) => item.id === id) : undefined;
    if (member?.role !== "contributor" || (member.status !== "active" && member.status !== "disabled") || member.status === nextStatus) return;
    const token = {}; const scope = scopeRef.current; const actionQuery = { ...queryRef.current };
    mutationsRef.current.set(id, token); needsReadRef.current.add(id); unresolvedWrites.current.add(id); syncPendingIds(); setActionError(undefined);
    try {
      await update(id, nextStatus);
      unresolvedWrites.current.delete(id);
      if (scopeRef.current !== scope || !sameQuery(actionQuery)) return;
      mutationsRef.current.delete(id); syncPendingIds(); needsClampRef.current = true;
      const controller = controllerRef.current;
      if (controller) await read(controller, actionQuery, true);
    } catch (error: unknown) {
      if (scopeRef.current === scope && sameQuery(actionQuery) && !deny(error)) setActionError(frontendText(locale, "ADMIN_MEMBER_STATUS_ERROR"));
    } finally {
      if (mutationsRef.current.get(id) === token) { mutationsRef.current.delete(id); syncPendingIds(); }
    }
  };
  return <MembersPage onLoadRetry={retryRead} locale={locale} status={status || ""} loading={state.kind === "loading"} forbidden={state.kind === "forbidden"} error={state.kind === "error" || state.kind === "forbidden" ? state.message : undefined} pageError={localError} members={state.kind === "ready" ? state.data.items : []} pagination={state.kind === "ready" ? state.data.pagination : undefined} pending={pending} pendingIds={pendingIds} readRequired={pendingIds.some((id) => needsReadRef.current.has(id) && !mutationsRef.current.has(id))} actionError={actionError} onStatusFilterChange={(next) => navigate({ page: 1, pageSize, status: next || undefined })} onPageChange={(next) => navigate({ page: next, pageSize, status })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next, status })} onStatusChange={changeStatus} />;
}

export function AdminSpacesRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; spaces: AdminSpace[]; nextCursor?: string } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [needsRead, setNeedsRead] = useState(false);
  const scope = useRef(0);
  const write = useRef<object | null>(null);
  const blocked = useRef(false);
  const unresolvedWrite = useRef(false);
  useEffect(() => {
    // Keep the unresolved-write guard mounted even when denied reads hide editors.
    const owner = window;
    const locked = () => write.current !== null || unresolvedWrite.current;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: locked() ? "block" : "allow" }));
    const warn = (event: BeforeUnloadEvent) => {
      if (locked()) { event.preventDefault(); event.returnValue = ""; }
    };
    owner.addEventListener("beforeunload", warn);
    return () => { unregister(); owner.removeEventListener("beforeunload", warn); };
  }, []);
  const readController = useRef<AbortController | null>(null);
  const requireRead = () => { blocked.current = true; setNeedsRead(true); };
  const deny = (error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    scope.current++; readController.current?.abort(); readController.current = null; setPending(false);
    setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
    return true;
  };
  const read = async (mode: "reset" | "spaces" | "collections" = "reset", spaceId?: string) => {
    if (readController.current) return false;
    const controller = new AbortController(); readController.current = controller;
    const epoch = scope.current; const activeWrite = write.current;
    setPending(true);
    setState(previous => previous.kind === "ready" ? previous : { kind: "loading" });
    try {
      let spaces: AdminSpace[]; let nextCursor: string | undefined;
      if (mode === "collections" && state.kind === "ready") {
        const target = state.spaces.find(item => item.id === spaceId);
        if (!target?.collectionsCursor) return false;
        const data = await loadAdminCollections(target.id, { signal: controller.signal, cursor: target.collectionsCursor });
        if (data.nextCursor === target.collectionsCursor || data.items.some(item => target.collections.some(old => old.id === item.id))) throw new Error("SPACE_PAGE_OVERLAP");
        spaces = state.spaces.map(item => item.id === target.id ? { ...item, collections: [...item.collections, ...data.items], collectionsCursor: data.nextCursor } : item);
        nextCursor = state.nextCursor;
      } else {
        const cursor = mode === "spaces" && state.kind === "ready" ? state.nextCursor : undefined;
        const data = await loadAdminSpacesPage({ signal: controller.signal, cursor });
        const previous = mode === "spaces" && state.kind === "ready" ? state.spaces : [];
        if ((cursor && data.nextCursor === cursor) || data.items.some(item => previous.some(old => old.id === item.id))) throw new Error("SPACE_PAGE_OVERLAP");
        spaces = [...previous, ...data.items]; nextCursor = data.nextCursor;
      }
      if (epoch !== scope.current || controller.signal.aborted) return false;
      setState({ kind: "ready", spaces, nextCursor });
      // A GET started before a write settled is not post-write evidence.
      if (!activeWrite && !write.current) { unresolvedWrite.current = false; blocked.current = false; setNeedsRead(false); }
      return true;
    } catch (error) {
      if (epoch !== scope.current || controller.signal.aborted) return false;
      requireRead();
      if (!deny(error)) setState(previous => previous.kind === "ready" ? previous : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      return false;
    } finally {
      if (readController.current === controller) { readController.current = null; setPending(false); }
    }
  };
  useEffect(() => {
    scope.current++; setState({ kind: "loading" }); void read();
    return () => { scope.current++; readController.current?.abort(); readController.current = null; };
  }, [locale]);
  const create = async (input: { slug: string; name: string }) => {
    if (write.current || readController.current || blocked.current || state.kind !== "ready") return false;
    const token = {}; const epoch = scope.current; write.current = token; unresolvedWrite.current = true; requireRead();
    try {
      await createAdminSpace(input);
      if (epoch !== scope.current) return false;
      write.current = null;
      return await read();
    } catch (error) {
      if (epoch === scope.current) { requireRead(); deny(error); }
      return false;
    } finally { if (write.current === token) write.current = null; }
  };
  const manage = async (command: AdminSpaceCommand) => {
    if (write.current || readController.current || blocked.current || state.kind !== "ready") return false;
    const current = state.spaces.find(item => item.id === command.spaceId);
    if (!current || current.readOnly || current.kind === "legacy") return false;
    const token = {}; const epoch = scope.current; write.current = token; unresolvedWrite.current = true; requireRead();
    try {
      await manageAdminSpace(command, current);
      if (epoch !== scope.current) return false;
      write.current = null;
      await read();
      // A validated receipt confirms this write even when the follow-up GET fails.
      // Close the acknowledged draft; the route still requires GET-only recovery.
      return epoch === scope.current;
    } catch (error) {
      if (epoch === scope.current) { requireRead(); deny(error); }
      return false;
    } finally { if (write.current === token) write.current = null; }
  };
  return <SpacesPage onLoadRetry={() => void read()} locale={locale} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} spaces={state.kind === "ready" ? state.spaces : []} nextCursor={state.kind === "ready" ? state.nextCursor : undefined} onLoadMore={() => void read("spaces")} onLoadCollections={id => void read("collections", id)} pending={pending} blocked={needsRead} navigationBlocked={unresolvedWrite.current} needsRead={needsRead} onCreate={create} onManage={manage} />;
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
    const next = parsePageSearch(readWorkspaceLocation().search);
    const nextAction = new URLSearchParams(readWorkspaceLocation().search).get("action") || undefined;
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
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${writePageSearch(readWorkspaceLocation().search, next)}`, () => {
      queryRef.current = { ...next, action }; setPage(next.page); setPageSize(next.pageSize);
    });
  };
  const changeFilter = (nextAction: string) => {
    const params = new URLSearchParams(writePageSearch(readWorkspaceLocation().search, { page: 1, pageSize }));
    if (nextAction) params.set("action", nextAction); else params.delete("action");
    const nextSearch = params.toString();
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${nextSearch ? `?${nextSearch}` : ""}`, () => {
      queryRef.current = { page: 1, pageSize, action: nextAction || undefined };
      setAction(nextAction || undefined); setPage(1);
    });
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
  const initial = parsePageSearch(search);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [status, setStatus] = useState<AdminAssetStatus | undefined>(() => assetStatusSearch(search));
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminAssetsPage } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [requestPending, setRequestPending] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [retryError, setRetryError] = useState<string>();
  const [preview, setPreview] = useState<AssetPreviewModel | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const previewAbort = useRef<AbortController | null>(null);
  const controllerRef = useRef<ReturnType<typeof createAdminAssetsRequestController> | null>(null);
  const readRef = useRef<object | null>(null);
  const scopeRef = useRef({});
  const mutationsRef = useRef(new Map<string, object>());
  // Neither a lost POST response nor a failed follow-up GET permits a blind POST replay.
  // A fresh queue read must expose the row again before a new explicit retry is offered.
  const needsReadRef = useRef(new Set<string>());
  const needsClampRef = useRef(false);
  const [readVersion, setReadVersion] = useState(0);
  const queryRef = useRef({ page, pageSize, status });
  const sameQuery = (value: typeof queryRef.current) => value.page === queryRef.current.page && value.pageSize === queryRef.current.pageSize && value.status === queryRef.current.status;
  const syncPendingIds = () => setPendingIds([...new Set([...mutationsRef.current.keys(), ...needsReadRef.current])]);
  const clearPreview = () => {
    previewAbort.current?.abort(); previewAbort.current = null;
    setPreview(null); setPreviewError(undefined); setPreviewLoading(false);
  };
  const invalidateQuery = () => {
    scopeRef.current = {}; needsClampRef.current = false; controllerRef.current?.dispose(); controllerRef.current = null; readRef.current = null;
    clearPreview(); setState({ kind: "loading" }); setRequestPending(false); setLocalError(undefined); setRetryError(undefined);
  };
  const deny = (error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    invalidateQuery(); mutationsRef.current.clear(); needsReadRef.current.clear(); syncPendingIds();
    setState({ kind: "forbidden", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
    return true;
  };
  const navigate = (next: typeof queryRef.current, replace = false) => {
    const params = new URLSearchParams(writePageSearch(readWorkspaceLocation().search, next));
    if (next.status) params.set("status", next.status); else params.delete("status");
    const serialized = params.toString();
    writeWorkspaceHistory(replace ? "replace" : "push", `${readWorkspaceLocation().pathname}${serialized ? `?${serialized}` : ""}`, () => {
      invalidateQuery(); queryRef.current = next;
      setPage(next.page); setPageSize(next.pageSize); setStatus(next.status);
    });
  };
  const read = async (controller: NonNullable<typeof controllerRef.current>, snapshot: typeof queryRef.current, afterRetry = false) => {
    if ((!afterRetry && readRef.current) || controllerRef.current !== controller) return;
    const token = {}; readRef.current = token;
    setRequestPending(true); setLocalError(undefined); setRetryError(undefined);
    const request = controller.request(snapshot);
    try {
      const data = await request.promise;
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
      for (const row of data.items) { if (!mutationsRef.current.has(row.id)) needsReadRef.current.delete(row.id); }
      syncPendingIds();
      if ((afterRetry || needsClampRef.current) && data.items.length === 0 && snapshot.page > 1) navigate({ ...snapshot, page: Math.max(1, Math.min(snapshot.page - 1, data.pagination.totalPages)) }, true);
      else { setState({ kind: "ready", data }); needsClampRef.current = false; }
    } catch (error: unknown) {
      if (!controller.isCurrent(request.generation) || !sameQuery(snapshot) || isAbort(error)) return;
      if (!deny(error)) {
        setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
      }
    } finally {
      if (readRef.current === token) { readRef.current = null; setRequestPending(false); }
    }
  };
  const retryRead = () => {
    if (readRef.current) return;
    setState((old) => old.kind === "ready" ? old : { kind: "loading" });
    if (controllerRef.current) void read(controllerRef.current, { ...queryRef.current });
    else { readRef.current = {}; setReadVersion((version) => version + 1); }
  };
  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = { ...parsePageSearch(readWorkspaceLocation().search), status: assetStatusSearch(readWorkspaceLocation().search) };
    if (sameQuery(next)) return;
    invalidateQuery(); queryRef.current = next;
    setPage(next.page); setPageSize(next.pageSize); setStatus(next.status);
  }), []);
  useEffect(() => {
    const controller = createAdminAssetsRequestController(); controllerRef.current = controller; readRef.current = null;
    const snapshot = { page, pageSize, status }; queryRef.current = snapshot;
    void read(controller, snapshot);
    return () => { invalidateQuery(); };
  }, [locale, page, pageSize, status, readVersion]);
  const retry = async (id: string) => {
    if (!controllerRef.current || readRef.current || mutationsRef.current.has(id) || needsReadRef.current.has(id)) return;
    const token = {}; const scope = scopeRef.current; const actionQuery = { ...queryRef.current };
    mutationsRef.current.set(id, token); needsReadRef.current.add(id); syncPendingIds(); setRetryError(undefined);
    try {
      await retryAdminAsset(id);
      if (scopeRef.current !== scope || !sameQuery(actionQuery)) return;
      mutationsRef.current.delete(id); syncPendingIds(); needsClampRef.current = true;
      const controller = controllerRef.current;
      if (controller) await read(controller, actionQuery, true);
    } catch (error: unknown) {
      if (scopeRef.current === scope && sameQuery(actionQuery) && !deny(error)) setRetryError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
    } finally {
      if (mutationsRef.current.get(id) === token) { mutationsRef.current.delete(id); syncPendingIds(); }
    }
  };
  const showPreview = async (id: string) => {
    if (!controllerRef.current || readRef.current || previewAbort.current) return;
    const abort = new AbortController(); const scope = scopeRef.current;
    previewAbort.current = abort; setPreview(null); setPreviewError(undefined); setPreviewLoading(true);
    try {
      const data = await loadAdminAssetPreview(id, fetch, abort.signal);
      if (previewAbort.current === abort && scopeRef.current === scope) setPreview(data);
    } catch (error: unknown) {
      if (previewAbort.current === abort && scopeRef.current === scope && !isAbort(error) && !deny(error)) setPreviewError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
    } finally {
      if (previewAbort.current === abort) { previewAbort.current = null; setPreviewLoading(false); }
    }
  };
  return <AssetQueuePage onLoadRetry={retryRead} locale={locale} loading={state.kind === "loading"} forbidden={state.kind === "forbidden"} error={state.kind === "error" || state.kind === "forbidden" ? state.message : undefined} data={state.kind === "ready" ? state.data : undefined} localError={localError} readRequired={pendingIds.some((id) => needsReadRef.current.has(id) && !mutationsRef.current.has(id))} pending={requestPending} pendingIds={pendingIds} status={status || ""} preview={preview} previewLoading={previewLoading} previewError={previewError} retryError={retryError} onRetry={(id) => void retry(id)} onPreview={(id) => void showPreview(id)} onStatusChange={(next) => navigate({ page: 1, pageSize, status: next || undefined })} onPageChange={(next) => navigate({ page: next, pageSize, status })} onPageSizeChange={(next) => navigate({ page: 1, pageSize: next, status })} />;
}

function assetStatusSearch(search: string): AdminAssetStatus | undefined { const value = new URLSearchParams(search).get("status"); return value === "queued" || value === "processing" || value === "succeeded" || value === "failed_retryable" || value === "failed_terminal" ? value : undefined; }
function samePageQuery(left: { page: number; pageSize: SupportedPageSize }, right: { page: number; pageSize: SupportedPageSize }): boolean { return left.page === right.page && left.pageSize === right.pageSize; }
function sameSearchQuery(left: { query: string; page: number; pageSize: SupportedPageSize }, right: { query: string; page: number; pageSize: SupportedPageSize }): boolean { return left.query === right.query && samePageQuery(left, right); }
function knowledgeFilters(search: string): Omit<LoadKnowledgePageInput, "page" | "pageSize" | "signal"> {
  const params = new URLSearchParams(search); const value = (key: string) => params.get(key) || undefined;
  const kind = value("kind");
  return { spaceId: value("spaceId"), collectionId: value("collectionId"), tagId: value("tagId"), ...(kind === "text" || kind === "markdown" || kind === "code" ? { kind } : {}), authorId: value("authorId"), publishedFrom: value("publishedFrom"), publishedTo: value("publishedTo") };
}
function searchFilters(search: string): Omit<LoadSearchPageInput, "query" | "page" | "pageSize" | "signal"> {
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
