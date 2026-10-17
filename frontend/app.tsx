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
import { AgentTranscript } from "./components/agent/agent-transcript";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Alert, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { PageState } from "./components/ui/page-state";
import { HistoryNavigationNotice } from "./components/history-navigation-notice";
import { AppShell } from "./components/shell/app-shell";
import { AdminDashboardRoute } from "./pages/admin/admin-dashboard-route";
import { AdminAnalyticsPage, type AdminAnalyticsState } from "./pages/admin/analytics-page";
import { AdminRolesPage } from "./pages/admin/roles-page";
import { AdminRoleDetailPage } from "./pages/admin/role-detail-page";
import { AdminRoleCreatePage } from "./pages/admin/create-role-page";
import { useAdminRolesController } from "./lib/admin-roles-controller";
import { AdminMenusPage } from "./pages/admin/menus-page";
import { ReviewQueuePage } from "./pages/admin/review-queue-page";
import { ReviewDetailRoute } from "./pages/admin/review-detail-route";
import { RecycleBinRoute } from "./pages/admin/recycle-bin-route";
import { AdminKnowledgeItemRoute } from "./pages/admin/knowledge-item-route";
import { AssetQueuePage } from "./pages/admin/asset-queue-page";
import { MembersPage } from "./pages/admin/members-page";
import { SpacesPage } from "./pages/admin/spaces-page";
import { AuditPage } from "./pages/admin/audit-page";
import { DuplicateQueuePage } from "./pages/admin/duplicate-queue-page";
import { AgentPage, agentSourceFields } from "./pages/agent-page";
import { HomePage, type WorkbenchHomeState } from "./pages/home-page";
import { KnowledgePage, type KnowledgeFilters, type KnowledgeSection } from "./pages/knowledge-page";
import { KnowledgeReaderPage } from "./pages/knowledge-reader-page";
import { SearchPage, type SearchFilters } from "./pages/search-page";
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
import { taskFilterKey, taskStatusKey } from "./pages/tasks/tasks-model";
import { NotificationsPage, type NotificationsPageState } from "./pages/notifications/notifications-page";
import { MessagesPage, type MessagesPageState } from "./pages/messages/messages-page";
import { ThreadPage, type ThreadPageState } from "./pages/messages/thread-page";
import { LoginPage } from "./pages/login-page";
import { PublicWorkbenchPage } from "./pages/workbench-landing/public-workbench-page";
import { NotFoundGlitch } from "./components/motion/not-found/glitch";
import { ToastProvider } from "./lib/use-toast";
import { Loader } from "./components/motion/loader";
import { SettingsPage } from "./pages/settings-page";
import { GraphRoute } from "./pages/graph-page";
import { ComingSoonPage } from "./pages/coming-soon-page";
import { createKnowledgeRequestController, type FavoriteKnowledgeItem, type LoadKnowledgePageInput, type KnowledgePageResult, type RecentKnowledgeItem, type RecentResearchItem } from "./lib/knowledge-data";
import { loadFavoriteKnowledgePage, loadRecentKnowledgePage, loadRecentResearchPage, type KnowledgeSectionPage } from "./lib/knowledge-panels-data";
import { createKnowledgeReaderRequestController, loadKnowledgeBacklinks, loadKnowledgeFavorite, loadKnowledgeFavoriteOperation, loadKnowledgeRevisionDiff, loadRelatedKnowledge, setKnowledgeFavorite, type KnowledgeBacklinkItem, type KnowledgeRevision, type KnowledgeRevisionDiff, type RelatedKnowledgeItem } from "./lib/knowledge-reader-data";
import { renderSafeMarkdown } from "./lib/markdown-renderer";
import { createSearchRequestController, type LoadSearchPageInput, type SearchPageResult } from "./lib/search-data";
import { type SavedViewItem } from "./lib/saved-views-data";
import { useSavedViews } from "./lib/use-saved-views";
import { discardBlockedSearchComposerDraft, loadSearchComposerDraft, persistSearchComposerDraft } from "./lib/search-composer-draft";
import { clearAgentIntent, createAgentIntent, loadAgentIntent, saveAgentIntent, type AgentTurnIntent, type StoredAgentIntent } from "./lib/agent-turn-intent";
import { clearAgentFeedback, discardBlockedAgentFeedback, loadAgentFeedback, type AgentFeedbackIntent } from "./lib/agent-feedback-intent";
import { discardBlockedAgentComposerDraft, loadAgentComposerDraft, persistAgentComposerDraft } from "./lib/agent-composer-draft";
import { agentScopeSearch, agentLocationFromSearch, agentUnavailableReason, loadAgentConversation, createAgentRequestController, submitAgentFeedback, type AgentConversation, type AgentScope, type AgentTurnState, type ChatStage } from "./lib/agent-data";
import { loadPrivateKnowledgeNotesPage, type PrivateKnowledgeNoteListItem } from "./lib/knowledge-note";
import { createSubmission, type SimilarSubmissionCandidate } from "./lib/submission-data";
import { clearSubmissionIntent, createSubmissionIntent, loadSubmissionIntent, saveSubmissionIntent, type SubmissionIntent } from "./lib/submission-intent";
import { clearOfflineSubmissionDraft, loadOfflineSubmissionDraft } from "./lib/offline-submission-draft";
import { loadDraftRecord } from "./lib/submission-draft-data";
import { useSubmissionDraft } from "./lib/use-submission-draft";
import { useSubmissionTargets } from "./lib/submission-targets-data";
import { isResubmissionOpen, loadResubmitRecord, restartResubmission, resubmitSubmission, closeResubmission, readSubmissionStatus, saveResubmitRecord, beginResubmission, withResubmitEdits, withResubmitResult, type ResubmitRecord, type ResubmitStatus } from "./lib/submission-resubmit-data";
import { loadSubmissionComments } from "./lib/submission-comments-data";
import type { SubmissionCommentsState } from "./components/submissions/submission-comments-panel";
import type { SubmitResubmitView } from "./pages/submit-page";
import type { SubmissionTarget } from "./lib/submission-data";
import { createMySubmissionsRequestController, parseSubmissionRange, submissionResubmitSource, type MySubmissionItem } from "./lib/my-submissions-data";
import { createTasksRequestController, loadTaskDetail, loadTaskSummary, setTaskStatus, type TaskFilters, type TaskItem, type TaskPage } from "./lib/tasks-data";
import { createInbox, readCreatedInbox, loadInboxItem, loadInboxNumbered, parseInboxSearch, writeInboxSearch, promoteInboxTask, updateInboxStatus, type InboxItem, type InboxStatus } from "./lib/inbox-data";
import { createGoal, loadNumberedGoals, setGoalProgress, setGoalStatus, type Goal } from "./lib/goals-data";
import { createProject, createProjectTimeline, editProjectTimeline, loadProject, loadProjectSummary, loadNumberedProjectTimeline, loadNumberedProjects, setProjectStatus, setProjectTimelineStatus, type Project, type ProjectSummary, type ProjectTimelineItem, type ProjectTimelineKind, type ProjectTimelineStatus } from "./lib/projects-data";
import { cancelCalendarEvent, createCalendarEvent, loadCalendarEvent, readCreatedCalendar, loadCalendarNumbered, type CalendarEvent } from "./lib/calendar-data";
import { loadToday } from "./lib/today-data";
import { msUntilNextUtcDate } from "./lib/today-clock";
import { type FocusSession, loadFocusTransitionReceipt, loadCurrentFocus, loadFocusReceipt, startFocus, transitionFocus } from "./lib/focus-data";
import { loadWorkbenchReview } from "./lib/workbench-review-data";
import { buildWorkbenchSummary } from "./lib/workbench-data";
import type { TaskFilterState, TaskStatus } from "./pages/tasks/task-types";
import { BOARD_STATUSES, type BoardColumnStates, type BoardPagination, type BoardStatus, type BoardTargetStatus } from "./pages/boards/board-model";
import { createNotificationsRequestController, markNotificationRead, markVisibleNotificationsRead, type NotificationFilters, type NotificationSummary } from "./lib/notifications-data";
import { notificationTargetHref, parseNotificationSearch, writeNotificationSearch } from "./pages/notifications/notification-model";
import { createDiscussionRequestController, ensureDiscussionThread, loadDiscussionMessageResult, loadDiscussionMessages, loadDiscussionThread, loadDiscussionThreads, sendDiscussionMessage } from "./lib/discussions-data";
import { parseDiscussionSearch, writeDiscussionSearch, type DiscussionSearch } from "./pages/messages/discussion-model";
import { createReviewQueueRequestController, type ReviewQueuePageResult } from "./lib/admin-review-data";
import { loadAdminMembers, updateMemberStatus, type AdminMember, type AdminMembersPage, type LoadAdminMembersInput } from "./lib/admin-members-data";
import { adminMemberInvitationFailure, issueAdminMemberInvitation, loadAdminMemberInvitations, revokeAdminMemberInvitation, type AdminMemberInvitation } from "./lib/admin-member-invitations-data";
import { clearAdminAssetRetry, discardBlockedAdminAssetRetry, loadAdminAssetRetries, saveAdminAssetRetry } from "./lib/admin-asset-retry-intent";
import { clearAdminMemberStatus, discardBlockedAdminMemberStatus, loadAdminMemberStatuses, saveAdminMemberStatus, type AdminMemberStatusIntent } from "./lib/admin-member-status-intent";
import { createAdminSpace, manageAdminSpace, loadAdminSpacesPage, loadAdminCollections, type AdminSpace, type AdminSpaceCommand } from "./lib/admin-spaces-data";
import { clearAdminSpaceWrite, discardBlockedAdminSpaceWrite, loadAdminSpaceWrite, saveAdminSpaceWrite, type AdminSpaceWriteIntent } from "./lib/admin-space-write-intent";
import { persistAdminSpaceDraft } from "./lib/admin-space-draft";
import { createAdminAuditRequestController, type AdminAuditEvent, type AdminAuditPage } from "./lib/admin-audit-data";
import { loadWorkspaceActivity, type WorkspaceActivityItem } from "./lib/activity-data";
import { loadKnowledgeReview, type ReviewPeriod, type ReviewResult } from "./lib/review-data";
import { discardBlockedReviewPeriod, loadReviewPeriod, persistReviewPeriod } from "./lib/review-period";
import { loadAdminAnalytics, type AdminAnalyticsOverview, type LoadAdminAnalyticsInput } from "./lib/admin-analytics-data";
import { ApiRequestError } from "./lib/api";
import { createNumberedRequestController, listPageSize, type SupportedPageSize } from "./lib/numbered-page";
import { createAdminMenu, deleteAdminMenu, loadAdminMenus, menuDescendants, updateAdminMenu, type AdminMenu } from "./lib/admin-menus-data";
import { clearAdminMenuWrite, discardBlockedAdminMenuWrite, loadAdminMenuWrite, saveAdminMenuWrite, type AdminMenuWriteIntent } from "./lib/admin-menu-write-intent";
import { persistAdminMenuDraft } from "./lib/admin-menu-draft";
import { createAdminAssetsRequestController, loadAdminAssetPreview, retryAdminAsset, type AdminAssetsPage, type AdminAssetStatus } from "./lib/admin-assets-data";
import { createAdminDuplicateRequestController, decideAdminDuplicate, loadAdminDuplicate, type AdminDuplicateCandidate, type AdminDuplicatePageResult, type DuplicateDecision } from "./lib/admin-duplicates-data";
import { candidateFromAdminDuplicateIntent, clearAdminDuplicateDecision, discardBlockedAdminDuplicate, loadAdminDuplicateDecisions, saveAdminDuplicateDecision, type AdminDuplicateIntent } from "./lib/admin-duplicate-intent";
import type { AssetPreviewModel } from "./components/assets/asset-preview-model";
import { loadReviewDetail, prepareReviewDecision, sendReviewDecision, reviewRecovery, type ReviewDecision, type ReviewOperation, type ReviewNoteInput } from "./components/review/review-detail-data";
import { clearReviewDecision, discardBlockedCurrentReviewDecision, loadCurrentReviewDecision, saveReviewDecision } from "./lib/review-decision-intent";
import type { ReviewDecisionState } from "./components/review/review-decision-controls";
import { validateSubmissionDraft, type SubmissionDraft } from "./components/submissions/submission-form-model";
import { logoutAccount } from "./lib/logout-account";
import { EnvironmentsPage } from "./features/environments/environments-page";
import { AccountNetworkBoundary } from "./features/environments/account-network-boundary";
import type { AccountNetworkOwner } from "./features/environments/account-network-owner.mjs";
import { createLocaleRuntime, frontendText, syncDocumentLanguage, type LocaleRuntime } from "./lib/i18n";
import { sessionSnapshot } from "./lib/session";
import { isAnonymousSessionError } from "./lib/session-state";
import { pageKindForPath } from "./app-routes";
import type { SessionSnapshot } from "./contracts/api";
import { loadFavoriteIntent, prepareFavoriteIntent, finishFavoriteIntent, favoriteIntentKey, type ReaderFavoriteIntent, type FavoriteWritePhase } from "./lib/reader-favorite-intent";
import { canonicalWorkspaceLocationKey, endWorkspaceSession, readWorkspaceHash, readWorkspaceLocation, registerWorkspaceLeaveGuard, subscribeWorkspaceLocation, WORKSPACE_LOCATION_CHANGE_EVENT, writeWorkspaceHistory } from "./lib/workspace-location";

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
  useEffect(() => syncDocumentLanguage(locale, document), [locale]);
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

  useEffect(() => {
    // /login is a first-class sign-in path: a signed-in visitor is sent home
    // instead of falling through to the not-found page.
    if (session && pathname === "/login") writeWorkspaceHistory("replace", "/");
  }, [session, pathname]);

  if (sessionError) return <LoginPage locale={locale} error={frontendText(locale, "APP_SIGN_IN_DESCRIPTION")} />;
  if (anonymous && pathname === "/") return <PublicWorkbenchPage locale={locale} />;
  if (anonymous) return <LoginPage locale={locale} />;
  if (!session) return <main aria-busy="true" className="mx-auto max-w-xl p-8"><Loader variant="dots" size={22} label={frontendText(locale, "APP_LOADING_TITLE")} /><h1 className="mt-3 text-2xl font-semibold">{frontendText(locale, "APP_LOADING_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "APP_LOADING_DESCRIPTION")}</p></main>;

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
  return <AccountNetworkBoundary memberId={session.member.id}>{(owner) => <ToastProvider locale={locale}><AppShell session={session} pathname={pathname} contentScrollKey={canonicalWorkspaceLocationKey(location)} locale={locale} onNavigate={navigate} onLogout={() => logout(owner)} logoutPending={logoutPending} logoutError={logoutError}><HistoryNavigationNotice locale={locale} />{page}</AppShell></ToastProvider>}</AccountNetworkBoundary>;
}

function renderPage(kind: ReturnType<typeof pageKindForPath>, pathname: string, locale: LocaleRuntime, search = "", session?: SessionSnapshot) {
  switch (kind) {
    case "home": return <HomeRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} />;
    case "knowledge": return <KnowledgeRoute locale={locale} search={search} memberId={session?.member.id} />;
    case "knowledge-reader": return <KnowledgeReaderRoute memberId={session?.member.id} canCreateSubmission={session?.capabilities.includes("submission:create") ?? false} locale={locale} knowledgeItemId={decodeRouteId(pathname)} />;
    case "search": return <SearchRoute memberId={session?.member.id} locale={locale} search={search} />;
    case "agent": return <AgentRoute key={session?.member.id} memberId={session?.member.id} locale={locale} search={search} />;
    case "submit": return session ? <SubmitRoute locale={locale} memberId={session.member.id} /> : <NotFoundPage locale={locale} />;
    case "my-submissions": return <MySubmissionsRoute key={session?.member.id} locale={locale} search={search} memberId={session?.member.id} />;
    case "graph": return <GraphRoute key={session?.member.id} memberId={session?.member.id} locale={locale} />;
    case "tasks": return <TasksRoute memberId={session?.member.id} key={session?.member.id} locale={locale} search={search} />;
    case "inbox": return <InboxRoute memberId={session?.member.id} key={session?.member.id} locale={locale} search={search} />;
    case "goals": return <GoalsRoute memberId={session?.member.id} key={session?.member.id} locale={locale} search={search} />;
    case "projects": return <ProjectsRoute memberId={session?.member.id} key={session?.member.id} locale={locale} search={search} />;
    case "project-timeline": return <ProjectTimelineRoute key={`${session?.member.id}:${pathname}`} locale={locale} memberId={session?.member.id} projectId={pathname.split("/")[2] || ""} search={search} />;
    case "calendar": return <CalendarRoute key={session?.member.id} memberId={session?.member.id} locale={locale} search={search} />;
    case "today": return <TodayRoute key={session?.member.id} locale={locale} />;
    case "focus": return <FocusRoute key={session?.member.id} memberId={session?.member.id} locale={locale} />;
    case "review": return <WorkbenchReviewRoute locale={locale} memberId={session?.member.id} />;
    case "boards": return <BoardsRoute key={session?.member.id} memberId={session?.member.id} locale={locale} search={search} />;
    case "notifications": return <NotificationsRoute key={session?.member.id} memberId={session?.member.id} locale={locale} search={search} isAdmin={session?.member.role === "admin"} />;
    case "messages": return <MessagesRoute locale={locale} search={search} />;
    case "message-thread": return <DiscussionThreadRoute memberId={session?.member.id} locale={locale} threadId={decodeRouteId(pathname)} search={search} />;
    case "environments": return session ? <EnvironmentsPage key={session.member.id} locale={locale} session={session} /> : <NotFoundPage locale={locale} />;
    case "settings": return session ? <SettingsPage locale={locale} email={session.member.email} role={session.member.role} /> : <NotFoundPage locale={locale} />;
    case "coming-soon": return <ComingSoonPage locale={locale} />;
    case "admin": return session ? <AdminDashboardRoute locale={locale} session={session} /> : <NotFoundPage locale={locale} />;
    case "admin-analytics": return <AdminAnalyticsRoute key={JSON.stringify([session?.member.id, session?.permissionMask, session?.capabilities])} locale={locale} search={search} />;
    case "admin-roles": return <AdminRolesRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} memberId={session?.member.id} />;
    case "admin-role-new": return <AdminRoleNewRoute key={`${session?.member.id}:new`} locale={locale} memberId={session?.member.id} />;
    case "admin-role-detail": return <AdminRoleDetailRoute key={`${session?.member.id}:${pathname}`} locale={locale} memberId={session?.member.id} roleId={decodeRouteId(pathname)} />;
    case "admin-menus": return <AdminMenusRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} memberId={session?.member.id} />;
    case "admin-knowledge-trash": return <RecycleBinRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} memberId={session?.member.id} canReview={session?.capabilities.includes("knowledge:review") ?? false} />;
    case "admin-knowledge-item": return <AdminKnowledgeItemRoute key={JSON.stringify([session?.member.id, pathname, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} memberId={session?.member.id} knowledgeItemId={decodeRouteId(pathname)} canReview={session?.capabilities.includes("knowledge:review") ?? false} />;
    case "admin-submissions": return <ReviewQueueRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} memberId={session?.member.id} search={search} canReview={session?.capabilities.includes("knowledge:review") ?? false} />;
    case "admin-submission-detail": return <ReviewDetailRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} memberId={session?.member.id} id={pathname.split("/").pop() || ""} />;
    case "admin-duplicates": return <AdminDuplicateRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} memberId={session?.member.id} search={search} />;
    case "admin-assets": return <AdminAssetsRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} search={search} memberId={session?.member.id} />;
    case "admin-members": return <AdminMembersRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} memberId={session?.member.id} search={search} />;
    case "admin-spaces": return <AdminSpacesRoute key={JSON.stringify([session?.member.id, session?.member.role, session?.permissionMask, [...(session?.capabilities ?? [])].sort()])} locale={locale} memberId={session?.member.id} />;
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
  const controllerRef = useRef<AbortController | null>(null);
  // The recent list is cursor-paged: the raw items accumulate so each appended
  // page maps through the same builder as the first one.
  const recentRaw = useRef<RecentKnowledgeItem[]>([]);
  const morePending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
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
      guard(loadRecentKnowledgePage({ requester: fetch, signal: controller.signal })),
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
      recentRaw.current = knowledgeResult.status === "fulfilled" ? knowledgeResult.value.items : [];
      const summary = buildWorkbenchSummary({
        taskSummary: taskResult.status === "fulfilled" ? taskResult.value : undefined,
        knowledge: recentRaw.current,
        activity: activityResult.status === "fulfilled" ? activityResult.value.items : [],
      });
      setState({
        kind: "ready", summary, unavailable,
        recentCursor: knowledgeResult.status === "fulfilled" ? knowledgeResult.value.nextCursor : null,
        recentPending: false, recentMoreError: false,
      });
    });
    return () => { controller.abort(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale, retry]);
  const loadMoreRecent = () => {
    const controller = controllerRef.current;
    if (!controller || controller.signal.aborted || morePending.current) return;
    if (state.kind !== "ready" || !state.recentCursor || state.unavailable?.includes("knowledge")) return;
    const cursor = state.recentCursor;
    morePending.current = true;
    setState(previous => previous.kind === "ready" ? { ...previous, recentPending: true, recentMoreError: false } : previous);
    void loadRecentKnowledgePage({ cursor, requester: fetch, signal: controller.signal }).then((page) => {
      if (controller.signal.aborted) return;
      recentRaw.current = [...recentRaw.current, ...page.items];
      setState(previous => previous.kind === "ready" ? {
        ...previous,
        summary: { ...previous.summary, recentKnowledge: buildWorkbenchSummary({ knowledge: recentRaw.current }).recentKnowledge },
        recentCursor: page.nextCursor,
        recentPending: false,
        recentMoreError: false,
      } : previous);
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isAbort(error)) return;
      setState(previous => previous.kind === "ready" ? { ...previous, recentPending: false, recentMoreError: true } : previous);
    }).finally(() => { morePending.current = false; });
  };
  return <HomePage locale={locale} state={state} onLoadMoreRecent={loadMoreRecent} onRetry={() => {
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
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const pendingRef = useRef(true);
  const daysRef = useRef(days);
  const controllerRef = useRef<ReturnType<typeof createNumberedRequestController<{ days: number; page: number }, AdminAnalyticsOverview>> | null>(null);

  // A later page appends to the loaded window; the first page replaces it.
  const loadPage = (targetPage: number) => {
    const controller = controllerRef.current;
    if (!controller) return;
    const snapshot = { days: daysRef.current, page: targetPage };
    setLocalError(false);
    pendingRef.current = true;
    setPending(true);
    setState((previous) => previous.kind === "ready" && previous.data.range.days === snapshot.days ? previous : { kind: "loading" });
    const request = controller.request(snapshot);
    void request.promise.then((data) => {
      if (!controller.isCurrent(request.generation)) return;
      setState((previous) => previous.kind === "ready" && targetPage > 1
        ? { kind: "ready", data: { ...data, recentVisitors: { ...data.recentVisitors, items: [...previous.data.recentVisitors.items, ...data.recentVisitors.items] } } }
        : { kind: "ready", data });
      pendingRef.current = false;
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
      const denied = error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
      setState((previous) => denied ? { kind: "forbidden" } : previous.kind === "ready" ? previous : { kind: "error" });
      setLocalError(true);
      pendingRef.current = false;
      setPending(false);
    });
  };

  useEffect(() => {
    const onLocationChange = () => setDays(analyticsUrlState(readWorkspaceLocation().search).days);
    return subscribeWorkspaceLocation(onLocationChange);
  }, []);

  useEffect(() => {
    daysRef.current = initial.days;
    setDays(initial.days);
  }, [initial]);

  useEffect(() => {
    daysRef.current = days;
    const controller = createNumberedRequestController((input: { days: number; page: number }, signal: AbortSignal) => load({ ...input, pageSize: listPageSize, signal }));
    controllerRef.current = controller;
    loadPage(1);
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
    // loadPage reads the live query refs, not a render value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, days, refresh]);

  const changeDays = (nextDays: number) => {
    const params = new URLSearchParams(readWorkspaceLocation().search);
    params.set("days", String(nextDays));
    const nextSearch = params.toString();
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${nextSearch ? `?${nextSearch}` : ""}`, () => setDays(nextDays));
  };

  return <AdminAnalyticsPage locale={locale} state={state} days={days} pending={pending} localError={localError}
    onDaysChange={changeDays}
    onLoadMore={() => { if (state.kind === "ready" && state.data.recentVisitors.pagination.page < state.data.recentVisitors.pagination.totalPages) loadPage(state.data.recentVisitors.pagination.page + 1); }}
    onRefresh={() => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setRefresh((value) => value + 1);
    }} />;
}

function analyticsUrlState(search: string): { days: number } {
  const dayValues = new URLSearchParams(search).getAll("days");
  const rawDays = dayValues.length === 1 ? dayValues[0]! : "7";
  const parsedDays = /^[1-9]\d*$/u.test(rawDays) ? Number(rawDays) : 7;
  const days = Number.isSafeInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 31 ? parsedDays : 7;
  return { days };
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

// The three role routes share one controller, so the write-intent record, recovery
// lock and read-back reconciliation are never re-implemented per surface.
export function AdminRolesRoute({ locale, memberId }: { locale: LocaleRuntime; memberId?: string }) {
  const controller = useAdminRolesController({ locale, memberId });
  return <AdminRolesPage onLoadRetry={controller.retryRead} locale={locale} state={controller.state} />;
}

export function AdminRoleNewRoute({ locale, memberId }: { locale: LocaleRuntime; memberId?: string }) {
  const controller = useAdminRolesController({ locale, memberId });
  const back = () => writeWorkspaceHistory("push", "/admin/roles");
  return <AdminRoleCreatePage locale={locale} onCreate={controller.createRole} onCreated={back} onCancel={back}
    saving={controller.saving} writeBlocked={controller.writeBlocked} saveError={controller.saveError}
    recordBlocked={controller.recordBlocked} onDiscardRecord={controller.discardRecord} onRetryWrite={controller.retryWrite}
    readRequired={controller.readRequired} readPending={controller.readPending} onLoadRetry={controller.retryRead}
    draftMemberId={memberId} suppressDraft={controller.readRequired} />;
}

export function AdminRoleDetailRoute({ locale, memberId, roleId }: { locale: LocaleRuntime; memberId?: string; roleId: string }) {
  const controller = useAdminRolesController({ locale, memberId });
  return <AdminRoleDetailPage state={controller.state} roleId={roleId} locale={locale}
    onBack={() => writeWorkspaceHistory("push", "/admin/roles")}
    onLoadRetry={controller.retryRead}
    onSave={controller.recordBlocked ? undefined : (role, allowBits) => controller.saveRole(role.id, allowBits, role.allowBits)}
    onAssignMember={controller.recordBlocked ? undefined : (role, targetId) => controller.assignMember(role.id, targetId)}
    onUnassignMember={controller.recordBlocked ? undefined : (role, targetId) => controller.unassignMember(role.id, targetId)}
    saving={controller.saving} writeBlocked={controller.writeBlocked} readPending={controller.readPending}
    readRequired={controller.readRequired} saveError={controller.saveError} recordBlocked={controller.recordBlocked}
    onDiscardRecord={controller.discardRecord} onRetryWrite={controller.retryWrite} draftMemberId={memberId} suppressDraft={controller.readRequired} />;
}

export function AdminMenusRoute({ locale, memberId }: { locale: LocaleRuntime; memberId?: string }) {
  const [writeStored] = useState(() => memberId ? loadAdminMenuWrite(memberId) : { kind: "empty" as const });
  const recordBlockedRef = useRef(writeStored.kind === "blocked");
  const [recordBlocked, setRecordBlocked] = useState(recordBlockedRef.current);
  const [recordNotice, setRecordNotice] = useState<string>();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; menus: AdminMenu[] } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [needsRead, setNeedsRead] = useState(writeStored.kind === "ready");
  const [saveError, setSaveError] = useState<string | null>(null);
  const epoch = useRef<object | null>(null);
  const readRef = useRef<AbortController | null>(null);
  const writeRef = useRef<object | null>(null);
  const blockedRef = useRef(writeStored.kind === "ready");
  const intentRef = useRef<AdminMenuWriteIntent | null>(writeStored.kind === "ready" ? writeStored.intent : null);
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
        const intent = intentRef.current;
        if (memberId && intent && !clearAdminMenuWrite(memberId, intent)) {
          blockedRef.current = true; setNeedsRead(true);
          setRecordNotice(frontendText(locale, "ADMIN_MENUS_RECORD_STUCK"));
        } else {
          intentRef.current = null;
          if (intent) setRecordNotice(undefined);
          blockedRef.current = false; setNeedsRead(false); setSaveError(null);
        }
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
  const mutate = async (intent: AdminMenuWriteIntent, operation: () => Promise<unknown>, errorKey: string) => {
    if (recordBlockedRef.current || !epoch.current || state.kind !== "ready" || writeRef.current || readRef.current || blockedRef.current) return false;
    if (memberId && !saveAdminMenuWrite(memberId, intent)) {
      setRecordNotice(frontendText(locale, "ADMIN_MENUS_NOT_RECORDED"));
      return false;
    }
    if (memberId) { intentRef.current = intent; persistAdminMenuDraft(memberId, null); }
    const scope = epoch.current;
    const token = {};
    writeRef.current = token;
    blockedRef.current = true;
    setSaving(true);
    setNeedsRead(true);
    setSaveError(null);
    setRecordNotice(undefined);
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
  function discardRecord() {
    if (!memberId || !recordBlockedRef.current || !discardBlockedAdminMenuWrite(memberId)) return;
    recordBlockedRef.current = false; setRecordBlocked(false); setRecordNotice(undefined);
  }
  return <AdminMenusPage onLoadRetry={retryRead} locale={locale} state={state} writeBlocked={saving || reading || needsRead} readPending={reading || saving} readRequired={needsRead} error={recordNotice ?? saveError} recordBlocked={recordBlocked} onDiscardRecord={discardRecord} draftMemberId={memberId} suppressDraft={needsRead}
    onCreate={recordBlocked ? undefined : (input) => mutate({ op: "create", input }, () => createAdminMenu(input), "ADMIN_MENUS_SAVE_ERROR")}
    onUpdate={recordBlocked ? undefined : (menu, input) => mutate({ op: "update", id: menu.id, input }, () => updateAdminMenu(menu.id, input), "ADMIN_MENUS_SAVE_ERROR")}
    onDelete={recordBlocked ? undefined : (menu) => {
      // The confirmation displayed this exact subtree, so the removal acknowledges it.
      const acknowledged = state.kind === "ready" ? menuDescendants(state.menus, menu.id).map((item) => item.id) : [];
      void mutate({ op: "delete", id: menu.id }, () => deleteAdminMenu(menu.id, acknowledged), "ADMIN_MENUS_DELETE_ERROR");
    }} />;
}


function decodeRouteId(pathname: string): string {
  const value = pathname.split("/").pop() || "";
  try { return decodeURIComponent(value); } catch { return ""; }
}

export function KnowledgeReaderRoute({ locale, knowledgeItemId, memberId = "", canCreateSubmission = false }: { locale: LocaleRuntime; knowledgeItemId: string; memberId?: string; canCreateSubmission?: boolean }) {
  const [citationHash, setCitationHash] = useState(() => readWorkspaceHash());
  useEffect(() => {
    const update = () => setCitationHash(readWorkspaceHash());
    const unsubscribe = subscribeWorkspaceLocation(update);
    return unsubscribe;
  }, []);
  return <KnowledgeReaderSession key={`${memberId}:${knowledgeItemId}:${citationHash}`} memberId={memberId} locale={locale} knowledgeItemId={knowledgeItemId} citationHash={citationHash} canCreateSubmission={canCreateSubmission} />;
}

/** One independently retryable auxiliary read: a fresh attempt token plus its own abort. */
type ReaderSection = { token: object; controller: AbortController; settled: boolean };

function KnowledgeReaderSession({ locale, knowledgeItemId, citationHash, memberId, canCreateSubmission }: { memberId: string; locale: LocaleRuntime; knowledgeItemId: string; citationHash: string; canCreateSubmission: boolean }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; revision: KnowledgeRevision } | { kind: "forbidden" } | { kind: "error"; message: string }>({ kind: "loading" });
  const [diffState, setDiffState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "ready"; diff: KnowledgeRevisionDiff } | { kind: "error" }>({ kind: "idle" });
  const [relatedState, setRelatedState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "ready"; items: readonly RelatedKnowledgeItem[] } | { kind: "error" }>({ kind: "idle" });
  const [backlinkState, setBacklinkState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "ready"; items: readonly KnowledgeBacklinkItem[] } | { kind: "error" }>({ kind: "idle" });
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [favoriteError, setFavoriteError] = useState(false);
  const [retry, setRetry] = useState(0);
  const readOwner = useRef<{
    primary: ReturnType<typeof createKnowledgeReaderRequestController>;
    favorite: ReaderSection | null;
    related: ReaderSection | null;
    backlinks: ReaderSection | null;
    diff: AbortController | null;
  } | null>(null);
  type ReadOwner = NonNullable<typeof readOwner.current>;
  const favoriteIntent = useRef<ReaderFavoriteIntent | null>(null);
  const favoriteAttempt = useRef<object | null>(null);
  const favoritePhaseRef = useRef<FavoriteWritePhase>("idle");
  const [favoritePhase, setFavoritePhase] = useState<FavoriteWritePhase>("idle");
  const transitionFavorite = (phase: FavoriteWritePhase) => { favoritePhaseRef.current = phase; setFavoritePhase(phase); };
  useEffect(() => {
    const locked = () => favoritePhaseRef.current !== "idle";
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: locked() ? "block" : "allow" }));
    const owner = window;
    const warn = (event: BeforeUnloadEvent) => { if (locked()) { event.preventDefault(); event.returnValue = ""; } };
    owner.addEventListener("beforeunload", warn);
    return () => { unregister(); owner.removeEventListener("beforeunload", warn); };
  }, []);
  // Reserving a section synchronously (token + abort) lets a same-event double
  // click start one read, and lets a superseded attempt never apply its result.
  // A settled section stays reachable so revocation still aborts its transport.
  const startSection = (owner: ReadOwner, key: "favorite" | "related" | "backlinks") => {
    const previous = owner[key];
    const section: ReaderSection = { token: {}, controller: new AbortController(), settled: false };
    owner[key] = section;
    previous?.controller.abort();
    return section;
  };
  const sectionLive = (owner: ReadOwner, current: ReaderSection | null, section: ReaderSection) =>
    readOwner.current === owner && current === section && !section.settled && !section.controller.signal.aborted;
  const retire = (owner: ReadOwner) => {
    if (readOwner.current === owner) readOwner.current = null;
    owner.primary.cancel();
    owner.favorite?.controller.abort();
    owner.related?.controller.abort();
    owner.backlinks?.controller.abort();
    owner.diff?.abort();
  };
  const denyRead = (error: unknown, owner: ReadOwner) => {
    if (readOwner.current !== owner || !(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    // One denied member/knowledge read revokes the whole rendered reader. Retire
    // before clearing UI, so even transports ignoring abort cannot restore it.
    retire(owner);
    setState({ kind: "forbidden" });
    setDiffState({ kind: "idle" }); setRelatedState({ kind: "idle" }); setBacklinkState({ kind: "idle" });
    setFavorite(null); setFavoriteError(false);
    return true;
  };
  // Each auxiliary read owns its own attempt and abort, so retrying one section
  // never re-issues, blocks or cancels the body, the favorite, or its sibling.
  const loadFavorite = async (owner: ReadOwner) => {
    if (owner.favorite && !owner.favorite.settled) return;
    const section = startSection(owner, "favorite");
    const live = () => sectionLive(owner, owner.favorite, section);
    try {
      const value = await loadKnowledgeFavorite(knowledgeItemId, fetch, section.controller.signal);
      if (live()) { setFavoriteError(false); setFavorite(value); }
    } catch (error) {
      if (live() && !isAbort(error) && !denyRead(error, owner)) { setFavorite(null); setFavoriteError(true); }
    } finally {
      section.settled = true;
    }
  };
  const loadRelated = async (owner: ReadOwner) => {
    if (owner.related && !owner.related.settled) return;
    const section = startSection(owner, "related");
    const live = () => sectionLive(owner, owner.related, section);
    setRelatedState({ kind: "loading" });
    try {
      const items = await loadRelatedKnowledge(knowledgeItemId, fetch, section.controller.signal);
      if (live()) setRelatedState({ kind: "ready", items });
    } catch (error) {
      if (live() && !isAbort(error) && !denyRead(error, owner)) setRelatedState({ kind: "error" });
    } finally {
      section.settled = true;
    }
  };
  const loadBacklinks = async (owner: ReadOwner) => {
    if (owner.backlinks && !owner.backlinks.settled) return;
    const section = startSection(owner, "backlinks");
    const live = () => sectionLive(owner, owner.backlinks, section);
    setBacklinkState({ kind: "loading" });
    try {
      const items = await loadKnowledgeBacklinks(knowledgeItemId, fetch, section.controller.signal);
      if (live()) setBacklinkState({ kind: "ready", items });
    } catch (error) {
      if (live() && !isAbort(error) && !denyRead(error, owner)) setBacklinkState({ kind: "error" });
    } finally {
      section.settled = true;
    }
  };
  useEffect(() => {
    const owner: ReadOwner = { primary: createKnowledgeReaderRequestController(memberId), favorite: null, related: null, backlinks: null, diff: null };
    readOwner.current = owner;
    favoriteAttempt.current = null;
    const stored = loadFavoriteIntent(memberId, knowledgeItemId);
    if (stored.kind === "ready") favoriteIntent.current = stored.intent;
    transitionFavorite(stored.kind === "blocked" ? "blocked" : favoriteIntent.current ? "unknown" : "idle");
    const request = owner.primary.request(knowledgeItemId, citationHash);
    const live = () => readOwner.current === owner;
    const failed = (error: unknown, ordinary: () => void) => {
      if (live() && !isAbort(error) && !denyRead(error, owner)) ordinary();
    };
    setState({ kind: "loading" });
    setDiffState({ kind: "idle" });
    setRelatedState({ kind: "idle" });
    setBacklinkState({ kind: "idle" });
    setFavorite(null);
    setFavoriteError(false);
    void request.promise.then(({ revision }) => {
      if (!live()) return;
      setState({ kind: "ready", revision });
      void loadFavorite(owner);
      void loadRelated(owner);
      void loadBacklinks(owner);
    }).catch(error => failed(error, () => setState({ kind: "error", message: frontendText(locale, "KNOWLEDGE_READER_ERROR") })));
    return () => retire(owner);
  }, [knowledgeItemId, citationHash, locale, retry]);
  // Cross-tab reactivity: another tab of this origin may reserve or finish the
  // same member+target record. React to that durable signal without ever
  // replaying a write or settling a write from a state read.
  useEffect(() => {
    const area = window.localStorage;
    const recordKey = favoriteIntentKey(memberId, knowledgeItemId);
    const onStorage = (event: StorageEvent) => {
      // `clear()` fires with key === null; only this origin's localStorage counts.
      if (event.storageArea !== area) return;
      if (event.key !== null && event.key !== recordKey) return;
      const owner = readOwner.current;
      if (!owner) return;
      const phase = favoritePhaseRef.current;
      if (phase === "saving") return;
      const stored = loadFavoriteIntent(memberId, knowledgeItemId);
      if (stored.kind === "blocked") { transitionFavorite("blocked"); return; }
      if (stored.kind === "ready") {
        // Only an idle tab adopts an unresolved record; a settled tab is never resurrected.
        if (phase !== "idle") return;
        favoriteIntent.current = stored.intent;
        transitionFavorite("unknown");
        return;
      }
      // The record is gone while this tab was unconfirmed. The settling tab
      // verified its receipt; this tab only re-reads the boolean favourite to
      // display current state. That read must never settle a write.
      if (phase !== "unknown") return;
      favoriteIntent.current = null;
      transitionFavorite("idle");
      void loadFavorite(owner);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [memberId, knowledgeItemId]);
  const retryRelated = () => {
    const owner = readOwner.current;
    if (owner) void loadRelated(owner);
  };
  const retryBacklinks = () => {
    const owner = readOwner.current;
    if (owner) void loadBacklinks(owner);
  };
  const showDiff = async () => {
    const owner = readOwner.current;
    if (!owner || owner.diff || state.kind !== "ready" || !state.revision.previousRevisionId) return;
    // The ref, not the next render's loading flag, owns same-event clicks.
    const controller = new AbortController(); owner.diff = controller;
    const live = () => readOwner.current === owner && owner.diff === controller && !controller.signal.aborted;
    setDiffState({ kind: "loading" });
    try {
      const diff = await loadKnowledgeRevisionDiff(knowledgeItemId, state.revision.previousRevisionId, state.revision.id, fetch, controller.signal);
      if (live()) setDiffState({ kind: "ready", diff });
    } catch (error) {
      if (live() && !isAbort(error) && !denyRead(error, owner)) setDiffState({ kind: "error" });
    } finally {
      if (owner.diff === controller) owner.diff = null;
    }
  };
  if (state.kind !== "ready") {
      return <KnowledgeReaderPage memberId={memberId} locale={locale} canCreateSubmission={canCreateSubmission} state={state.kind === "error" ? { kind: "error", message: state.message } : state} revision={{ id: "", knowledgeItemId: "", markdown: "", isCurrent: false, previousRevisionId: null, sourceVersionId: "", sourceVersionOrdinal: null, parserSchemaVersion: null, indexStatus: "pending", chunks: [] }} renderMarkdown={renderSafeMarkdown} onRetry={() => setRetry((value) => value + 1)} />;
  }
  const toggleFavorite = async () => {
    const owner = readOwner.current;
    if (!owner || favorite === null || favoriteError || favoritePhaseRef.current !== "idle") return;
    // Reserve synchronously and persist before any HTTP mutation. No automatic
    // replay: a failed response is not evidence that the write failed.
    transitionFavorite("saving");
    const attempt = {}; favoriteAttempt.current = attempt;
    let intent: ReaderFavoriteIntent;
    try {
      intent = { id: crypto.randomUUID(), desired: !favorite };
      prepareFavoriteIntent(memberId, knowledgeItemId, intent);
      favoriteIntent.current = intent;
    } catch { transitionFavorite("blocked"); return; }
    const live = () => readOwner.current === owner && favoriteAttempt.current === attempt;
    try {
      // The local intent id is the server operation number: a lost response is
      // resolved by querying that exact number, never by resending a new write.
      const receipt = await setKnowledgeFavorite(knowledgeItemId, intent.desired, intent.id);
      if (!live()) return;
      finishFavoriteIntent(memberId, knowledgeItemId, intent);
      favoriteIntent.current = null; setFavorite(receipt.operation.favorited); setFavoriteError(false); transitionFavorite("idle");
    } catch (error) {
      if (!live()) return;
      setFavorite(null); transitionFavorite("unknown"); denyRead(error, owner);
    }
  };
  const checkFavorite = async () => {
    const owner = readOwner.current;
    if (!owner || favoritePhaseRef.current === "saving" || favoritePhaseRef.current === "checking") return;
    const stored = loadFavoriteIntent(memberId, knowledgeItemId);
    if (stored.kind === "blocked") { transitionFavorite("blocked"); return; }
    if (stored.kind === "ready") favoriteIntent.current = stored.intent;
    const intent = favoriteIntent.current;
    const attempt = {}; favoriteAttempt.current = attempt; transitionFavorite("checking");
    const section = startSection(owner, "favorite");
    const live = () => favoriteAttempt.current === attempt && sectionLive(owner, owner.favorite, section);
    try {
      if (intent) {
        // The server's record of this operation number, not the current boolean
        // state: a coincidental match cannot prove what this write did.
        const receipt = await loadKnowledgeFavoriteOperation(intent.id, fetch, section.controller.signal);
        if (!live()) return;
        if (receipt.knowledgeItemId !== knowledgeItemId || receipt.favorited !== intent.desired) { setFavorite(null); transitionFavorite("unknown"); return; }
        finishFavoriteIntent(memberId, knowledgeItemId, intent);
        favoriteIntent.current = null; setFavorite(receipt.favorited); setFavoriteError(false); transitionFavorite("idle");
        return;
      }
      const value = await loadKnowledgeFavorite(knowledgeItemId, fetch, section.controller.signal);
      if (!live()) return;
      setFavorite(value); setFavoriteError(false); transitionFavorite("idle");
    } catch (error) {
      if (!live()) return;
      setFavorite(null); setFavoriteError(true); transitionFavorite(intent ? "unknown" : "idle"); denyRead(error, owner);
    } finally {
      section.settled = true;
    }
  };
  return <KnowledgeReaderPage memberId={memberId} locale={locale} canCreateSubmission={canCreateSubmission} state={{ kind: "ready" }} revision={state.revision} renderMarkdown={renderSafeMarkdown} diffState={diffState} onCompare={showDiff} relatedState={relatedState} backlinkState={backlinkState} onRetryRelated={retryRelated} onRetryBacklinks={retryBacklinks} favorite={favorite} favoriteError={favoriteError} favoritePhase={favoritePhase} onCheckFavorite={checkFavorite} onToggleFavorite={toggleFavorite} />;
}

function NotFoundPage({ locale }: { locale: LocaleRuntime }) {
  return <NotFoundGlitch code="404" title={frontendText(locale, "PAGE_NOT_FOUND_TITLE")} description={frontendText(locale, "PAGE_NOT_FOUND_DESCRIPTION")} homeHref="/" homeLabel={frontendText(locale, "PAGE_RETURN_HOME")} />;
}

export function KnowledgeRoute(props: { locale: LocaleRuntime; search: string; memberId?: string }) {
  return <MemberKnowledgeRoute key={props.memberId ?? "anonymous"} {...props} />;
}

function MemberKnowledgeRoute({ locale, search, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [filterVersion, setFilterVersion] = useState(0);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: KnowledgePageResult["items"]; pagination: KnowledgePageResult["pagination"] } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createKnowledgeRequestController> | null>(null);
  const deniedRef = useRef(false);
  const appendRef = useRef(false);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
  const sectionsController = useRef<AbortController | null>(null);
  const reviewController = useRef<AbortController | null>(null);
  const activityController = useRef<AbortController | null>(null);
  const [activityMoreError, setActivityMoreError] = useState(false);
  const [reviewRetry, setReviewRetry] = useState(0);
  const [recent, setRecent] = useState<RecentKnowledgeItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteKnowledgeItem[]>([]);
  const [recentResearch, setRecentResearch] = useState<RecentResearchItem[]>([]);
  const [notes, setNotes] = useState<PrivateKnowledgeNoteListItem[]>([]);
  const [activity, setActivity] = useState<WorkspaceActivityItem[]>([]);
  const [recentError, setRecentError] = useState(false);
  const [favoritesError, setFavoritesError] = useState(false);
  const [researchError, setResearchError] = useState(false);
  const [notesError, setNotesError] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [sectionRetry, setSectionRetry] = useState(0);
  const [activityNextCursor, setActivityNextCursor] = useState<string | null>(null);
  // Each side panel continues its own cursor read; a failed append keeps the rows
  // already read and only retries the same cursor.
  const [favoritesCursor, setFavoritesCursor] = useState<string | null>(null);
  const [researchCursor, setResearchCursor] = useState<string | null>(null);
  const [notesCursor, setNotesCursor] = useState<string | null>(null);
  const [favoritesMoreError, setFavoritesMoreError] = useState(false);
  const [researchMoreError, setResearchMoreError] = useState(false);
  const [notesMoreError, setNotesMoreError] = useState(false);
  const [morePending, setMorePending] = useState<KnowledgeSection | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const morePendingRef = useRef<KnowledgeSection | null>(null);
  const [storedPeriod] = useState(() => memberId ? loadReviewPeriod(memberId, "knowledge") : { kind: "empty" as const });
  const [periodBlocked, setPeriodBlocked] = useState(storedPeriod.kind === "blocked");
  const [periodNotice, setPeriodNotice] = useState<string>();
  const restoredPeriod: ReviewPeriod = storedPeriod.kind === "ready" ? storedPeriod.period : "daily";
  const [reviewPeriod, setReviewPeriod] = useState<ReviewPeriod>(restoredPeriod);
  const [review, setReview] = useState<{ kind: "loading" } | { kind: "ready"; data: ReviewResult } | { kind: "error" }>({ kind: "loading" });
  const denyRead = useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    // All page reads share the member boundary. Revoke sibling reads before any
    // late callback can put private data back, including transports ignoring abort.
    deniedRef.current = true;
    controllerRef.current?.dispose(); sectionsController.current?.abort();
    reviewController.current?.abort(); activityController.current?.abort();
    activityController.current = null;
    moreController.current?.abort(); moreController.current = null; morePendingRef.current = null;
    setRecent([]); setFavorites([]); setRecentResearch([]); setNotes([]); setActivity([]);
    setActivityNextCursor(null); setActivityMoreError(false); setReview({ kind: "error" });
    setFavoritesCursor(null); setResearchCursor(null); setNotesCursor(null);
    setFavoritesMoreError(false); setResearchMoreError(false); setNotesMoreError(false); setMorePending(null);
    setState({ kind: "error", message: frontendText(locale, "KNOWLEDGE_ERROR") });
    setPending(false); setLocalError(undefined);
    return true;
  }, [locale]);
  useEffect(() => {
    if (deniedRef.current) return;
    const controller = new AbortController(); sectionsController.current = controller;
    activityController.current?.abort(); activityController.current = null;
    moreController.current?.abort(); moreController.current = null; morePendingRef.current = null;
    setActivityNextCursor(null); setActivityMoreError(false);
    // A section re-read replaces every window, so its continuation cursor restarts too.
    setFavoritesCursor(null); setResearchCursor(null); setNotesCursor(null);
    setFavoritesMoreError(false); setResearchMoreError(false); setNotesMoreError(false); setMorePending(null);
    const live = () => !deniedRef.current && !controller.signal.aborted;
    const failed = (error: unknown, ordinary: () => void) => {
      if (live() && !isAbort(error) && !denyRead(error)) ordinary();
    };
    void loadRecentKnowledgePage({ requester: fetch, signal: controller.signal }).then((page) => { if (live()) { setRecent(page.items); setRecentError(false); } }).catch(error => failed(error, () => { setRecent([]); setRecentError(true); }));
    void loadFavoriteKnowledgePage({ requester: fetch, signal: controller.signal }).then((page) => { if (live()) { setFavorites(page.items); setFavoritesCursor(page.nextCursor); setFavoritesError(false); } }).catch(error => failed(error, () => { setFavorites([]); setFavoritesCursor(null); setFavoritesError(true); }));
    void loadRecentResearchPage({ requester: fetch, signal: controller.signal }).then((page) => { if (live()) { setRecentResearch(page.items); setResearchCursor(page.nextCursor); setResearchError(false); } }).catch(error => failed(error, () => { setRecentResearch([]); setResearchCursor(null); setResearchError(true); }));
    void loadPrivateKnowledgeNotesPage({ requester: fetch, signal: controller.signal }).then((page) => { if (live()) { setNotes(page.items); setNotesCursor(page.nextCursor); setNotesError(false); } }).catch(error => failed(error, () => { setNotes([]); setNotesCursor(null); setNotesError(true); }));
    void loadWorkspaceActivity({ signal: controller.signal }).then((page) => { if (live()) { setActivity(page.items); setActivityNextCursor(page.nextCursor); setActivityError(false); } }).catch(error => failed(error, () => { setActivity([]); setActivityNextCursor(null); setActivityError(true); }));
    return () => {
      controller.abort(); activityController.current?.abort(); activityController.current = null;
      if (sectionsController.current === controller) sectionsController.current = null;
    };
  }, [sectionRetry, retryVersion, denyRead]);
  useEffect(() => {
    if (deniedRef.current) return;
    const controller = new AbortController(); reviewController.current = controller;
    const live = () => !deniedRef.current && !controller.signal.aborted;
    setReview({ kind: "loading" });
    void loadKnowledgeReview(reviewPeriod, fetch, controller.signal).then((data) => {
      if (!live()) return;
      setReview(data.period === reviewPeriod ? { kind: "ready", data } : { kind: "error" });
    }).catch((error: unknown) => { if (live() && !isAbort(error) && !denyRead(error)) setReview({ kind: "error" }); });
    return () => { controller.abort(); if (reviewController.current === controller) reviewController.current = null; };
  }, [reviewPeriod, reviewRetry, retryVersion, denyRead]);
  useEffect(() => {
    if (!memberId || periodBlocked) return;
    const saved = persistReviewPeriod(memberId, "knowledge", reviewPeriod);
    setPeriodNotice(saved ? undefined : frontendText(locale, "REVIEW_PERIOD_NOT_RECORDED"));
  }, [reviewPeriod, memberId, periodBlocked, locale]);
  const discardPeriod = () => { if (!memberId || !periodBlocked || !discardBlockedReviewPeriod(memberId, "knowledge")) return; setPeriodBlocked(false); setPeriodNotice(undefined); };
  const loadMoreActivity = () => {
    if (!activityNextCursor || activityController.current || deniedRef.current) return;
    const cursor = activityNextCursor;
    // Reserve before React renders so same-event clicks cannot issue two appends.
    const controller = new AbortController(); activityController.current = controller;
    const live = () => activityController.current === controller && !controller.signal.aborted && !deniedRef.current;
    setActivityNextCursor(null); setActivityMoreError(false);
    void loadWorkspaceActivity({ cursor, signal: controller.signal }).then((page) => {
      if (!live()) return;
      setActivity((items) => [...items, ...page.items]);
      setActivityNextCursor(page.nextCursor);
    }).catch((error: unknown) => {
      if (!live() || isAbort(error) || denyRead(error)) return;
      setActivityNextCursor(cursor); setActivityMoreError(true);
    }).finally(() => { if (activityController.current === controller) activityController.current = null; });
  };
  // The desktop pager replaces the window; the mobile feed appends a later page.
  const load = (targetPage: number, append = false) => {
    const controller = controllerRef.current;
    if (!controller) return;
    appendRef.current = append;
    setPending(true); setLocalError(undefined);
    const request = controller.request({ page: targetPage, pageSize, ...knowledgeFilters(readWorkspaceLocation().search) });
    void request.promise.then((result) => {
      if (deniedRef.current || !controller.isCurrent(request.generation)) return;
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", items: [...previous.items, ...result.items], pagination: result.pagination }
        : { kind: "ready", items: result.items, pagination: result.pagination });
      setPending(false);
    }).catch((error: unknown) => {
      if (deniedRef.current || !controller.isCurrent(request.generation) || isAbort(error) || denyRead(error)) return;
      setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "KNOWLEDGE_ERROR") });
      setLocalError(frontendText(locale, "KNOWLEDGE_ERROR")); setPending(false);
    });
  };
  const setSectionMoreError = (section: KnowledgeSection, failed: boolean) => {
    if (section === "favorites") setFavoritesMoreError(failed);
    else if (section === "research") setResearchMoreError(failed);
    else setNotesMoreError(failed);
  };
  // A panel append continues its own cursor read. Reserve before React renders, so
  // same-event clicks cannot issue two appends; a failure keeps the cursor for retry.
  const loadMoreSection = <T,>({ section, cursor, loadPage, apply }: { section: KnowledgeSection; cursor: string | null; loadPage: (cursor: string, signal: AbortSignal) => Promise<KnowledgeSectionPage<T>>; apply: (items: readonly T[], nextCursor: string | null) => void }) => {
    if (!cursor || morePendingRef.current || deniedRef.current) return;
    const controller = new AbortController(); moreController.current = controller;
    morePendingRef.current = section; setMorePending(section); setSectionMoreError(section, false);
    const live = () => moreController.current === controller && !controller.signal.aborted && !deniedRef.current;
    void loadPage(cursor, controller.signal).then((page) => {
      if (!live()) return;
      apply(page.items, page.nextCursor);
    }).catch((error: unknown) => {
      if (!live() || isAbort(error) || denyRead(error)) return;
      setSectionMoreError(section, true);
    }).finally(() => {
      if (moreController.current === controller) { moreController.current = null; morePendingRef.current = null; setMorePending(null); }
    });
  };
  const appendSection = (section: KnowledgeSection) => {
    if (section === "favorites") loadMoreSection({ section, cursor: favoritesCursor, loadPage: (cursor, signal) => loadFavoriteKnowledgePage({ cursor, requester: fetch, signal }), apply: (items, nextCursor) => { setFavorites((current) => mergeById(current, items)); setFavoritesCursor(nextCursor); } });
    else if (section === "research") loadMoreSection({ section, cursor: researchCursor, loadPage: (cursor, signal) => loadRecentResearchPage({ cursor, requester: fetch, signal }), apply: (items, nextCursor) => { setRecentResearch((current) => mergeById(current, items)); setResearchCursor(nextCursor); } });
    else loadMoreSection({ section, cursor: notesCursor, loadPage: (cursor, signal) => loadPrivateKnowledgeNotesPage({ cursor, requester: fetch, signal }), apply: (items, nextCursor) => { setNotes((current) => mergeById(current, items)); setNotesCursor(nextCursor); } });
  };
  // A filter change is a read-only re-query of the first page; the pager itself is not in the URL.
  useEffect(() => subscribeWorkspaceLocation(() => setFilterVersion((value) => value + 1)), []);
  useEffect(() => {
    if (deniedRef.current) return;
    const controller = createKnowledgeRequestController(); controllerRef.current = controller;
    load(1);
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads the live location, not a render value
  }, [locale, retryVersion, filterVersion, denyRead, pageSize]);
  // The applied filters live in the location. A filter change starts a fresh read and the
  // header must not present the previous filter's rows as the new answer, while a same-query
  // refresh (retry/page) keeps them; so clearing happens only when the filter set changes.
  const filters = knowledgeFilters(search);
  const filtersKey = JSON.stringify(filters);
  const filtersKeyRef = useRef(filtersKey);
  if (filtersKeyRef.current !== filtersKey) { filtersKeyRef.current = filtersKey; setState({ kind: "loading" }); }
  return <KnowledgePage locale={locale} filters={filters} onFilterChange={(next) => writeWorkspaceHistory("push", `/knowledge${writeKnowledgeFilters(readWorkspaceLocation().search, next)}`)} state={state} pending={pending} localError={localError} onRetry={() => { if (deniedRef.current) { deniedRef.current = false; setState({ kind: "loading" }); } setRetryVersion((value) => value + 1); }} onPageChange={(next) => load(next)} onPageSizeChange={(size) => setPageSize(size)} onLoadMore={() => { if (state.kind === "ready" && state.pagination.page < state.pagination.totalPages) load(state.pagination.page + 1, true); }} recent={recent} favorites={favorites} recentResearch={recentResearch} notes={notes} activity={activity} activityNextCursor={activityNextCursor} activityMoreError={activityMoreError} onLoadMoreActivity={loadMoreActivity} recentError={recentError} favoritesError={favoritesError} researchError={researchError} notesError={notesError} activityError={activityError} favoritesNextCursor={favoritesCursor} researchNextCursor={researchCursor} notesNextCursor={notesCursor} favoritesMoreError={favoritesMoreError} researchMoreError={researchMoreError} notesMoreError={notesMoreError} morePending={morePending} onLoadMoreFavorites={() => appendSection("favorites")} onLoadMoreResearch={() => appendSection("research")} onLoadMoreNotes={() => appendSection("notes")} onRetrySections={() => setSectionRetry((value) => value + 1)} review={review} onRetryReview={() => setReviewRetry(value => value + 1)} reviewPeriod={reviewPeriod} onReviewPeriodChange={setReviewPeriod} periodBlocked={periodBlocked} periodNotice={periodNotice} onDiscardPeriod={discardPeriod} />;
}

export function SearchRoute({ locale, search, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  return <MemberSearchRoute key={memberId ?? "preview"} locale={locale} search={search} memberId={memberId} />;
}

function MemberSearchRoute({ locale, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  const [initialQuery] = useState(() => new URLSearchParams(readWorkspaceLocation().search).get("q") ?? "");
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [retryVersion, setRetryVersion] = useState(0);
  const [filterVersion, setFilterVersion] = useState(0);
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
  }>(() => activeQuery.trim() ? { kind: "loading" } : { kind: "ready", query: "", degraded: false, results: [], pagination: { page: 1, pageSize: listPageSize, total: 0, totalPages: 0 } });
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createSearchRequestController> | null>(null);
  const appendRef = useRef(false);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
  const queryTextRef = useRef(activeQuery);
  queryTextRef.current = activeQuery;
  const [composerStored] = useState(() => memberId ? loadSearchComposerDraft(memberId) : { kind: "empty" as const });
  const [composerBlocked, setComposerBlocked] = useState(composerStored.kind === "blocked");
  const [composerNotice, setComposerNotice] = useState<string>();
  const queryBaseline = useRef(initialQuery);
  const restoredQuery = composerStored.kind === "ready" && composerStored.draft.query !== initialQuery ? composerStored.draft.query : initialQuery;
  const restoredName = composerStored.kind === "ready" ? composerStored.draft.name : "";
  const saved = useSavedViews(locale, () => {
    const params = new URLSearchParams(readWorkspaceLocation().search);
    return { q: params.get("q") ?? "", spaceId: params.get("spaceId"), collectionId: params.get("collectionId"),
      tagIds: params.getAll("tagId"), tagMode: params.get("tagMode") === "and" ? "and" : "or",
      kind: searchKind(params.get("kind")), authorId: params.get("authorId"),
      publishedFrom: params.get("publishedFrom"), publishedTo: params.get("publishedTo") };
  }, (): boolean => queryDraft.isConfirming(), memberId, composerBlocked ? "" : restoredName);
  const queryDraft = useCreateDraft({ query: restoredQuery }, { query: initialQuery },
    saved.isBlocking, locale, (): boolean => saved.draft.isConfirming());
  const rememberComposer = () => {
    if (!memberId || composerBlocked) return;
    const query = queryDraft.current.current.query === queryBaseline.current ? "" : queryDraft.current.current.query;
    const savedDraft = persistSearchComposerDraft(memberId, { query, name: saved.draft.current.current.name });
    setComposerNotice(savedDraft ? undefined : frontendText(locale, "SEARCH_COMPOSER_NOT_RECORDED"));
  };
  useEffect(() => {
    if (!memberId || composerBlocked) return;
    // A submitted view name belongs to the write record. Keeping it here would
    // restore a second dirty name after refresh, after that write has settled.
    if (saved.phase !== "idle" || saved.recordBlocked) {
      const query = queryDraft.current.current.query === queryBaseline.current ? "" : queryDraft.current.current.query;
      const savedDraft = persistSearchComposerDraft(memberId, { query, name: "" });
      setComposerNotice(savedDraft ? undefined : frontendText(locale, "SEARCH_COMPOSER_NOT_RECORDED"));
      return;
    }
    rememberComposer();
  }, [queryDraft.fields.query, saved.draft.fields.name, composerBlocked, memberId, saved.phase, saved.recordBlocked]);
  useEffect(() => {
    const clearOnLeave = () => { if (memberId && !composerBlocked) persistSearchComposerDraft(memberId, { query: "", name: "" }); };
    window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
    return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
  }, [memberId, composerBlocked]);
  useEffect(() => {
    const onPopState = () => {
      const next = new URLSearchParams(readWorkspaceLocation().search).get("q") ?? "";
      queryBaseline.current = next;
      queryDraft.set("query", next); queryDraft.checkpoint({ query: next });
      setActiveQuery(next);
      setFilterVersion((value) => value + 1);
    };
    return subscribeWorkspaceLocation(onPopState);
  }, []);

  // The desktop pager replaces the window; the mobile feed appends later results.
  const load = (targetPage: number, append = false) => {
    const controller = controllerRef.current;
    if (!controller) return;
    const normalized = queryTextRef.current.trim();
    if (!normalized) {
      setState({ kind: "ready", query: "", degraded: false, results: [], pagination: { page: 1, pageSize, total: 0, totalPages: 0 } }); setPending(false);
      return;
    }
    appendRef.current = append;
    setPending(true); setLocalError(undefined);
    const request = controller.request({ query: normalized, page: targetPage, pageSize, ...searchFilters(readWorkspaceLocation().search) });
    void request.promise.then((result) => {
      if (!controller.isCurrent(request.generation)) return;
      setState((previous) => previous.kind === "ready" && previous.query === normalized && append
        ? { kind: "ready", query: normalized, degraded: result.degraded, results: [...previous.results, ...result.items], pagination: result.pagination }
        : { kind: "ready", query: normalized, degraded: result.degraded, results: result.items, pagination: result.pagination });
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
      setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_SEARCH_UNAVAILABLE") });
      setLocalError(frontendText(locale, "COMMON_SEARCH_UNAVAILABLE")); setPending(false);
    });
  };
  useEffect(() => {
    const controller = createSearchRequestController();
    controllerRef.current = controller;
    load(1);
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads the live query ref and location, not render values
  }, [activeQuery, locale, retryVersion, filterVersion, pageSize]);

  const submit = () => {
    const normalized = queryDraft.current.current.query.trim();
    const params = new URLSearchParams(readWorkspaceLocation().search); if (normalized) params.set("q", normalized); else params.delete("q");
    params.delete("page"); params.delete("pageSize");
    const nextUrl = params.size ? `/search?${params.toString()}` : "/search";
    queryDraft.applyNavigation((onCommit, onSettled) => {
      const current = readWorkspaceLocation();
      const mode = `${current.pathname}${current.search}` === nextUrl ? "replace" : "push";
      writeWorkspaceHistory(mode, nextUrl, () => {
        onCommit();
        setActiveQuery(normalized);
      }, onSettled);
    });
  };
  const applyView = (view: SavedViewItem) => {
    if (!saved.mayApply(view)) return;
    const normalized = view.filters.q.trim();
    const params = new URLSearchParams(); if (normalized) params.set("q", normalized);
    if (view.filters.spaceId) params.set("spaceId", view.filters.spaceId);
    if (view.filters.collectionId) params.set("collectionId", view.filters.collectionId);
    for (const id of view.filters.tagIds) params.append("tagId", id);
    // The API rejects a tag mode without tags, so a tag-less view applies none.
    if (view.filters.tagIds.length > 0) params.set("tagMode", view.filters.tagMode);
    if (view.filters.kind) params.set("kind", view.filters.kind);
    if (view.filters.authorId) params.set("authorId", view.filters.authorId);
    if (view.filters.publishedFrom) params.set("publishedFrom", view.filters.publishedFrom);
    if (view.filters.publishedTo) params.set("publishedTo", view.filters.publishedTo);
    const nextUrl = `/search?${params.toString()}`;
    writeWorkspaceHistory("push", nextUrl, () => {
      setActiveQuery(normalized);
    });
  };
  const discardComposer = () => { if (!memberId || !composerBlocked || !discardBlockedSearchComposerDraft(memberId)) return; setComposerBlocked(false); setComposerNotice(undefined); };
  // The conditions live in the location. A condition change starts a fresh read and the
  // list must not present the previous condition's rows as the new answer, while a
  // same-condition refresh (retry/page) keeps them; so clearing happens only on a change.
  const filters = searchFilters(readWorkspaceLocation().search);
  const filtersKey = JSON.stringify(filters);
  const filtersKeyRef = useRef(filtersKey);
  if (filtersKeyRef.current !== filtersKey) { filtersKeyRef.current = filtersKey; setState({ kind: "loading" }); }
  return <SearchPage locale={locale} filters={filters} onFilterChange={(next) => { const nextSearch = writeSearchFilters(readWorkspaceLocation().search, next); writeWorkspaceHistory("push", `/search${nextSearch}`); }} query={queryDraft.fields.query} queryLocked={saved.locked || queryDraft.confirming || queryDraft.applicationPending} state={state} pending={pending} localError={localError} onQueryChange={(value) => queryDraft.edit("query", value)} onSubmit={submit} onPageChange={(next) => load(next)} onPageSizeChange={(size) => setPageSize(size)} onLoadMore={() => { if (state.kind === "ready" && state.pagination.page < state.pagination.totalPages) load(state.pagination.page + 1, true); }} onRetry={() => setRetryVersion((value) => value + 1)} savedViewName={saved.draft.fields.name} onSavedViewNameChange={(value) => saved.draft.edit("name", value)} savedViewConfirmation={<>{saved.confirmation}{queryDraft.confirmation}</>} savedViews={saved.items} savedViewPending={saved.locked || saved.recordBlocked} savedViewError={saved.error} savedViewUnknown={saved.phase === "unknown"} onCheckSavedView={() => { void saved.check(); }} savedViewRecordBlocked={saved.recordBlocked} onDiscardSavedViewRecord={saved.discardRecord} onSaveView={() => { void saved.save(); }} onApplyView={applyView} onDeleteView={saved.requestDelete} composerBlocked={composerBlocked} composerNotice={composerNotice} onDiscardComposer={discardComposer} />;
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
  const [state, setState] = useState<AgentTurnState>({ kind: "ready", answer: frontendText(locale, "AGENT_DEFAULT_ANSWER"), confidence: "low", citations: [], conflicts: [] });
  const [stage, setStage] = useState<ChatStage | null>(null);
  const controllerRef = useRef<ReturnType<typeof createAgentRequestController> | null>(null);
  const pendingRef = useRef(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const alive = useRef(true);
  // Route-owned reservation survives child UI changes. Only a verified feedback
  // receipt releases it; unknown delivery is not an ordinary discardable draft.
  const [feedbackStored] = useState(() => memberId ? loadAgentFeedback(memberId) : { kind: "empty" as const });
  const feedbackLock = useRef<string | null>(feedbackStored.kind === "ready" ? feedbackStored.intent.conversationId : null);
  const [feedbackBlocked, setFeedbackBlocked] = useState(feedbackStored.kind !== "empty");
  const [feedbackIntent, setFeedbackIntent] = useState<AgentFeedbackIntent | null>(feedbackStored.kind === "ready" ? feedbackStored.intent : null);
  const [feedbackRecordBlocked, setFeedbackRecordBlocked] = useState(feedbackStored.kind === "blocked");
  const [feedbackNotice, setFeedbackNotice] = useState<string>();
  // Submitted turns and unsent input share admission, but have distinct lifetimes.
  const locked = () => feedbackLock.current !== null || pendingRef.current || intentRef.current !== null
    || (!!memberId && loadAgentIntent(memberId).kind !== "empty");
  const [composerStored] = useState(() => memberId && stored.kind === "empty" ? loadAgentComposerDraft(memberId) : { kind: "empty" as const });
  const [composerBlocked, setComposerBlocked] = useState(composerStored.kind === "blocked");
  const [composerNotice, setComposerNotice] = useState<string>();
  const questionBaseline = useRef("");
  const questionInitial = composerStored.kind === "ready" ? composerStored.draft.question : "";
  const sourceBaseline = agentSourceFields(initialScope ?? {kind: "all"});
  const sourceInitial = composerStored.kind === "ready" && composerStored.draft.source ? composerStored.draft.source : sourceBaseline;
  const questionDraft = useCreateDraft({question: questionInitial}, {question: ""}, locked, locale,
    (): boolean => !alive.current || sourceDraft.isConfirming() || recovery !== "ready" || storageBlocked || unconfirmed);
  const sourceDraft = useCreateDraft(sourceInitial, sourceBaseline, locked, locale,
    (): boolean => !alive.current || questionDraft.isConfirming() || recovery !== "ready" || storageBlocked || unconfirmed);
  const rememberComposer = () => {
    if (!memberId || composerBlocked) return;
    const source = sourceDraft.current.current;
    const dirtySource = source.kind !== sourceBaseline.kind || source.ids !== sourceBaseline.ids;
    const question = questionDraft.current.current.question === questionBaseline.current ? "" : questionDraft.current.current.question;
    const saved = persistAgentComposerDraft(memberId, { question, source: dirtySource ? { kind: source.kind, ids: source.ids } : null });
    setComposerNotice(saved ? undefined : frontendText(locale, "AGENT_COMPOSER_NOT_RECORDED"));
  };
  useEffect(() => { if (memberId && !composerBlocked) rememberComposer(); }, [questionDraft.fields.question, sourceDraft.fields.kind, sourceDraft.fields.ids, composerBlocked, memberId]);
  useEffect(() => {
    const clearOnLeave = () => { if (memberId && !composerBlocked) persistAgentComposerDraft(memberId, { question: "", source: null }); };
    window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
    return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
  }, [memberId, composerBlocked]);
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
    questionBaseline.current = sentQuestion;
    rememberComposer();
    setLastQuestion(sentQuestion);
    setState({ kind: "loading" });
    setStage(null);
    const request = controllerRef.current.request(sentQuestion, intent?.scope ?? scopeRef.current, intent ? intent.conversationId : conversationIdRef.current, intent?.key, setStage);
    void request.promise.then(({ generation, answer }) => {
      if (controllerRef.current?.isCurrent(generation)) {
        pendingRef.current = false;
        if (memberId && intent && !clearAgentIntent(memberId, intent.key)) { setStorageBlocked(true); return; }
        intentRef.current = null;
        if (intent) {scopeRef.current = intent.scope; setScope(intent.scope);}
        setRecovery("ready");
        conversationIdRef.current = answer.conversationId;
        setState(answer.insufficientEvidence
          ? { kind: "refused", citations: answer.citations, conversationId: answer.conversationId, suggestions: answer.suggestions }
          : { kind: "ready", answer: answer.answer, confidence: answer.confidence, citations: answer.citations, conflicts: answer.conflicts, conversationId: answer.conversationId });
      }
    }).catch((error: unknown) => {
      if (controllerRef.current?.isCurrent(request.generation) && !(error instanceof DOMException && error.name === "AbortError")) {
        pendingRef.current = false;
        if (intent) setUnconfirmed(true);
        // A quota deferral or a degraded AI backend is a server answer about the
        // request, so it is never shown as a generic transport error.
        const reason = agentUnavailableReason(error);
        setState(reason
          ? { kind: "unavailable", reason, code: error instanceof ApiRequestError ? error.code : "AGENT_UNAVAILABLE" }
          : { kind: "error", message: frontendText(locale, "COMMON_ANSWER_UNAVAILABLE") });
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
      scopeRef.current = nextScope; setScope(nextScope); setHistory([]); questionDraft.checkpoint({question: ""}); questionBaseline.current = ""; questionDraft.reset(); setLastQuestion("");
      setState({ kind: "ready", answer: frontendText(locale, "AGENT_DEFAULT_ANSWER"), confidence: "low", citations: [] });
    }, onSettled);
  };
  const abandon = () => {
    if (!alive.current || questionDraft.isConfirming() || sourceDraft.isConfirming() || feedbackLock.current !== null || pendingRef.current) return;
    if (memberId && !clearAgentIntent(memberId)) { setStorageBlocked(true); return; }
    controllerRef.current?.cancel(); intentRef.current = null; conversationIdRef.current = undefined;
    setStorageBlocked(false); setUnconfirmed(false); setRecovery("ready");
    scopeRef.current = initialScope ?? { kind: "all" }; setScope(scopeRef.current); setHistory([]); questionDraft.checkpoint({question: ""}); questionBaseline.current = ""; questionDraft.reset(); setLastQuestion("");
    setState({ kind: "cancelled" });
  };
  const retryFeedback = () => {
    const intent = feedbackIntent;
    if (!alive.current || !memberId || !intent) return;
    feedbackLock.current = intent.conversationId; setFeedbackBlocked(true); setFeedbackNotice(undefined);
    void submitAgentFeedback(intent.conversationId, intent.rating, intent.citationIds).then(() => {
      if (!alive.current || feedbackLock.current !== intent.conversationId) return;
      if (!clearAgentFeedback(memberId, intent)) { setFeedbackNotice(frontendText(locale, "AGENT_FEEDBACK_RECORD_STUCK")); return; }
      feedbackLock.current = null; setFeedbackBlocked(false); setFeedbackIntent(null);
    }).catch(() => { if (alive.current) setFeedbackNotice(frontendText(locale, "AGENT_FEEDBACK_UNKNOWN")); });
  };
  const discardFeedback = () => {
    if (!memberId || !feedbackRecordBlocked || !discardBlockedAgentFeedback(memberId)) return;
    setFeedbackRecordBlocked(false); setFeedbackBlocked(false); setFeedbackNotice(undefined);
  };
  const discardComposer = () => {
    if (!memberId || !composerBlocked || !discardBlockedAgentComposerDraft(memberId)) return;
    setComposerBlocked(false); setComposerNotice(undefined);
  };
  const feedbackAdmission = {
    begin: (id: string) => {
      if (!alive.current || questionDraft.isConfirming() || sourceDraft.isConfirming()
        || pendingRef.current || intentRef.current !== null || storageBlocked || unconfirmed || recovery !== "ready"
        || (memberId && loadAgentIntent(memberId).kind !== "empty")
        || conversationIdRef.current !== id || (state.kind !== "ready" && state.kind !== "refused") || state.conversationId !== id
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
    if (unconfirmed && intentRef.current) return <div data-agent-unavailable={state.kind === "unavailable" ? state.reason : undefined}><PageState kind="degraded" title={frontendText(locale, "AGENT_INTENT_UNKNOWN")} description={frontendText(locale, "AGENT_INTENT_UNKNOWN_DETAIL")}><p className="whitespace-pre-wrap">{intentRef.current.question}</p><p><code>{JSON.stringify(intentRef.current.scope)}</code></p>{state.kind === "unavailable" && <p>{frontendText(locale, state.reason === "quota" ? "AGENT_UNAVAILABLE_QUOTA" : "AGENT_UNAVAILABLE_DEGRADED")}</p>}<Button onClick={() => submit(intentRef.current!.question)}>{frontendText(locale, "AGENT_INTENT_RETRY")}</Button><Button variant="outline" onClick={abandon}>{frontendText(locale, "AGENT_INTENT_ABANDON")}</Button></PageState></div>;
    if (recovery === "loading" && state.kind !== "loading") return <PageState kind="loading" title={frontendText(locale, "AGENT_RESTORING")} />;
    if (recovery === "error") return <PageState kind="error" title={frontendText(locale, "AGENT_RESTORE_FAILED")} description={frontendText(locale, "AGENT_RESTORE_FAILED_DETAIL")}><Button onClick={() => setRecoveryVersion((value) => value + 1)}>{frontendText(locale, "AGENT_RETRY")}</Button><a className="ml-4" href="/agent">{frontendText(locale, "AGENT_NEW_CONVERSATION")}</a></PageState>;
    const visibleConversation = state.kind === "ready" || state.kind === "refused" ? state.conversationId : undefined;
    return <div className="flex flex-col gap-6 lg:h-full lg:min-h-0">
      {composerBlocked && <div role="alert" data-agent-composer-blocked className="space-y-2 rounded-md border p-4 text-sm"><p>{frontendText(locale, "AGENT_COMPOSER_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={discardComposer}>{frontendText(locale, "AGENT_COMPOSER_RECORD_DISCARD")}</Button></div>}
      {composerNotice && <p role="alert">{composerNotice}</p>}
      {feedbackRecordBlocked && <div role="alert" data-agent-feedback-record-blocked className="space-y-2 rounded-md border p-4 text-sm"><p>{frontendText(locale, "AGENT_FEEDBACK_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={discardFeedback}>{frontendText(locale, "AGENT_FEEDBACK_RECORD_DISCARD")}</Button></div>}
      {feedbackIntent && visibleConversation !== feedbackIntent.conversationId && <div role="alert" data-agent-feedback-unconfirmed className="space-y-2 rounded-md border p-4"><p>{feedbackNotice ?? frontendText(locale, "AGENT_FEEDBACK_UNKNOWN")}</p><Button type="button" variant="outline" onClick={retryFeedback}>{frontendText(locale, "AGENT_FEEDBACK_RETRY")}</Button></div>}
      {history.length > 0 && <AgentTranscript locale={locale} messages={history} />}
      {conversationIdRef.current && <a className="underline" href={`/agent?conversationId=${encodeURIComponent(conversationIdRef.current)}`}>{frontendText(locale, "AGENT_RESTORE_LINK")}</a>}
      <AgentPage locale={locale} memberId={memberId} scope={scope} state={state} stage={stage} question={questionDraft.fields.question} onQuestionChange={value => questionDraft.edit("question", value)} onSubmit={() => submit()} onCancel={cancel} onRetry={() => submit(lastQuestion)} onStartScope={startScope} isWriteBlocked={locked} sourceDraft={sourceDraft} feedbackAdmission={feedbackAdmission} feedbackBlocked={feedbackBlocked} />
      <AgentHistoryList locale={locale} />
    </div>;
  };
  return <><div className="flex flex-col lg:h-full lg:min-h-0" inert={questionDraft.confirming || sourceDraft.confirming ? true : undefined}>{content()}</div>{questionDraft.confirmation}{sourceDraft.confirmation}</>;
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
  // A returned item is edited through the resubmission record: it carries the
  // prior source, the destination and the single key this attempt will use.
  const [resubmitLoad] = useState(() => loadResubmitRecord(memberId));
  const [resubmit, setResubmit] = useState<ResubmitRecord | null>(() => resubmitLoad.kind === "ready" && isResubmissionOpen(memberId, resubmitLoad.record.priorId) ? resubmitLoad.record : null);
  const resubmitRef = useRef(resubmit);
  const [resubmitOutcome, setResubmitOutcome] = useState<{ status?: ResubmitStatus; read: "none" | "found" | "missing" | "failed" }>({ read: "none" });
  const [commentRetry, setCommentRetry] = useState(0);
  const [comments, setComments] = useState<SubmissionCommentsState>({ kind: "loading" });
  const [initialDraft] = useState(() => resubmitLoad.kind === "ready" && isResubmissionOpen(memberId, resubmitLoad.record.priorId)
    ? { ...resubmitLoad.record.draft }
    : loadOfflineSubmissionDraft(memberId) ?? { mode: "markdown" as const, title: "", content: "" });
  const [initialTarget] = useState<SubmissionTarget | null>(() => {
    if (resubmitLoad.kind === "ready" && resubmitLoad.record.target) return resubmitLoad.record.target;
    const record = loadDraftRecord(memberId);
    return record.kind === "ready" ? record.record.target : null;
  });
  const targets = useSubmissionTargets({ initial: initialTarget });
  const [state, setState] = useState<{ kind: "idle" } | { kind: "pending" } | { kind: "validation"; message: string } | { kind: "error"; message: string } | { kind: "success"; message: string; similarCandidates: SimilarSubmissionCandidate[] }>({ kind: "idle" });
  const requestRef = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const protectedDraft = useCreateDraft<{ mode: SubmissionDraft["mode"]; title: string; content: string }>(
    initialDraft, { mode: "markdown", title: "", content: "" },
    () => requestRef.current !== null || intentRef.current !== null || invalidIntent, locale, () => false,
  );
  const draft = protectedDraft.fields;
  const draftRef = protectedDraft.current;
  const activeTarget = resubmit ? targets.view.target ?? resubmit.target : targets.view.target;
  const targetKey = JSON.stringify(activeTarget);
  const draftWrites = useSubmissionDraft({
    memberId,
    // A returned item is edited as a resubmission: its text stays in this browser
    // (in the resubmission record) until it is resubmitted, so no draft row — and
    // no other member's draft — is written for it.
    enabled: resubmit === null,
    fields: draft,
    liveFields: draftRef,
    target: targets.view.target,
    suspended: state.kind === "pending",
    // A discard the server confirmed leaves nothing to keep: the editor clears
    // the text the draft held, so a reload cannot resurrect it.
    onDiscarded: () => { protectedDraft.set("title", ""); protectedDraft.set("content", ""); },
  });
  const changeDraft = (patch: Partial<SubmissionDraft>) => {
    if (!alive.current || protectedDraft.isConfirming()) return;
    const nextDraft = { ...draftRef.current, ...patch };
    // A newer draft remains editable while the previous immutable intent is pending.
    protectedDraft.set("mode", nextDraft.mode);
    protectedDraft.set("title", nextDraft.title);
    protectedDraft.set("content", nextDraft.content);
  };
  // The resubmission record is the durable copy of the edits made to a returned
  // item, so a reload restores them without a server draft.
  useEffect(() => {
    const current = resubmitRef.current;
    if (!current || current.state !== "editing") return;
    const next = withResubmitEdits(current, draftRef.current, activeTarget);
    if (JSON.stringify(next.draft) === JSON.stringify(current.draft) && JSON.stringify(next.target) === JSON.stringify(current.target)) return;
    if (saveResubmitRecord(memberId, next)) resubmitRef.current = next;
    else setStorageUnavailable(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetKey stands in for activeTarget identity
  }, [memberId, draft.mode, draft.title, draft.content, targetKey]);
  // The thread on the returned item, so the request for changes is readable in
  // the place where it is answered.
  useEffect(() => {
    if (!resubmit) return;
    const controller = new AbortController();
    let live = true;
    setComments({ kind: "loading" });
    void loadSubmissionComments(resubmit.priorId, { signal: controller.signal }).then((items) => {
      if (live) setComments({ kind: "ready", comments: items });
    }).catch((error: unknown) => {
      if (live && !isAbort(error)) setComments({ kind: "error" });
    });
    return () => { live = false; controller.abort(); };
  }, [resubmit?.priorId, resubmit === null, commentRetry]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, []);
  /** Reads the server's current status for a submission this member owns. */
  const readResubmitStatus = async (submissionId: string) => {
    try {
      const read = await readSubmissionStatus(submissionId);
      if (!alive.current) return;
      setResubmitOutcome(read ? { status: read.status, read: "found" } : { read: "missing" });
    } catch {
      if (alive.current) setResubmitOutcome({ read: "failed" });
    }
  };
  const submitResubmission = async (nextDraft: SubmissionDraft) => {
    const current = resubmitRef.current;
    if (!current || current.state !== "editing") return;
    const candidate = withResubmitEdits(current, nextDraft, targets.view.target ?? current.target);
    if (!validateSubmissionDraft(candidate.draft).ok) { setState({ kind: "validation", message: frontendText(locale, "SUBMIT_VALIDATION_ERROR") }); return; }
    // The attempt is journaled with its key before the request: a retry after an
    // unknown outcome reuses the same key, so it can never create a second record.
    if (!saveResubmitRecord(memberId, candidate)) { setState({ kind: "error", message: frontendText(locale, "SUBMIT_RESUBMIT_STORAGE") }); return; }
    resubmitRef.current = candidate; setResubmit(candidate);
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ kind: "pending" });
    try {
      const result = await resubmitSubmission(candidate, { signal: controller.signal });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      const settled = withResubmitResult(candidate, result);
      resubmitRef.current = settled; setResubmit(settled);
      if (!saveResubmitRecord(memberId, settled)) setStorageUnavailable(true);
      clearOfflineSubmissionDraft(memberId);
      protectedDraft.checkpoint({ mode: settled.draft.mode, title: "", content: "" });
      setState({ kind: "idle" });
      setResubmitOutcome({ status: result.status, read: "none" });
      void readResubmitStatus(result.id);
    } catch (error: unknown) {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
      const validation = error instanceof Error && error.message === "SUBMISSION_DRAFT_INVALID";
      setState({
        kind: validation ? "validation" : "error",
        message: frontendText(locale, validation ? "SUBMIT_VALIDATION_ERROR"
          : code === "SUBMISSION_NOT_FOUND" ? "SUBMIT_RESUBMIT_NOT_FOUND"
            : code === "SUBMISSION_VISIBILITY_EXPANSION_FORBIDDEN" ? "SUBMIT_RESUBMIT_VISIBILITY_LOCKED"
              : code === "IDEMPOTENCY_CONFLICT" ? "SUBMIT_CONFLICT" : "SUBMIT_ERROR"),
      });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  };
  const restartResubmit = () => {
    const current = resubmitRef.current;
    if (!current) return;
    const next = restartResubmission(memberId, withResubmitEdits(current, draftRef.current, activeTarget));
    if (!next) { setStorageUnavailable(true); return; }
    resubmitRef.current = next; setResubmit(next); setResubmitOutcome({ read: "none" });
    protectedDraft.checkpoint({ ...next.draft });
    changeDraft({ ...next.draft });
  };
  const leaveResubmit = () => {
    // Leaving closes the editor for this tab but keeps the record and its key, so
    // returning to the item continues the same attempt instead of starting one.
    closeResubmission(memberId);
    resubmitRef.current = null;
    setResubmit(null);
    protectedDraft.checkpoint({ mode: "markdown", title: "", content: "" });
    changeDraft({ mode: "markdown", title: "", content: "" });
    writeWorkspaceHistory("push", "/my-submissions");
  };
  const submit = async (nextDraft: SubmissionDraft) => {
    if (!alive.current || protectedDraft.isConfirming() || requestRef.current || invalidIntent) return;
    if (resubmitRef.current) { await submitResubmission(nextDraft); return; }
    const destination = targets.view.target;
    // The submission endpoint requires the destination up front; a form without
    // one is never sent, and never falls back to a target the UI did not show.
    if (!destination) { setState({ kind: "validation", message: frontendText(locale, "SUBMIT_TARGET_REQUIRED") }); return; }
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
      const result = await createSubmission(active.draft, active.key, fetch, controller.signal, destination);
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
        // This browser forgets the draft the accepted submission consumed: the
        // remaining draft row on the server is what My submissions lists.
        draftWrites.release();
        changeDraft({ mode: nextDraft.mode, title: "", content: "" });
      }
      setState({ kind: "success", message: frontendText(locale, "SUBMIT_SUCCESS"), similarCandidates: result.similarCandidates });
    } catch (error: unknown) {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      const validation = error instanceof Error && error.message === "SUBMISSION_DRAFT_INVALID";
      const conflict = error !== null && typeof error === "object" && "code" in error && error.code === "IDEMPOTENCY_CONFLICT";
      const targetRejected = error !== null && typeof error === "object" && "code" in error && error.code === "SUBMISSION_TARGET_INVALID";
      const identityError = error instanceof Error && error.message === "SUBMISSION_RANDOM_UNAVAILABLE";
      setState({ kind: validation ? "validation" : "error", message: frontendText(locale, validation ? "SUBMIT_VALIDATION_ERROR" : targetRejected ? "SUBMIT_TARGET_REQUIRED" : conflict ? "SUBMIT_CONFLICT" : identityError ? "SUBMIT_IDENTITY_ERROR" : "SUBMIT_ERROR") });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  };
  const resubmitView: SubmitResubmitView | undefined = resubmit ? {
    priorId: resubmit.priorId,
    title: resubmit.draft.title,
    state: resubmit.state,
    statusRead: resubmitOutcome.read,
    ...(resubmit.reviewNote ? { reviewNote: resubmit.reviewNote } : {}),
    ...(resubmit.submissionId ? { submissionId: resubmit.submissionId } : {}),
    ...(resubmitOutcome.status ? { status: resubmitOutcome.status } : {}),
  } : undefined;
  return <>{protectedDraft.confirmation}<SubmitPage
    memberId={memberId}
    locale={locale}
    draft={draft}
    state={state}
    onDraftChange={changeDraft}
    onSubmit={() => submit(draftRef.current)}
    recovery={{ title: intent?.draft.title, storageUnavailable, invalid: invalidIntent || resubmitLoad.kind === "invalid", onRetry: () => { if (intentRef.current) void submit(intentRef.current.draft); } }}
    targets={targets}
    draftSave={resubmit ? resubmitDraftSaveState : draftWrites.state}
    onDraftRetry={() => { if (draftWrites.state.reason === "unknown" || draftWrites.state.reason === "discard_unknown") draftWrites.recheck(); else draftWrites.saveNow(); }}
    onDraftDiscard={() => draftWrites.discard()}
    {...(resubmitView ? {
      resubmit: resubmitView,
      onResubmitRestart: restartResubmit,
      onResubmitLeave: leaveResubmit,
      onResubmitStatusRetry: () => { if (resubmit?.submissionId) void readResubmitStatus(resubmit.submissionId); },
      comments: { state: comments, onRetry: () => setCommentRetry((value) => value + 1) },
    } : {})}
  /></>;
}

/** Editing a returned item keeps its text in this browser until it is resubmitted. */
const resubmitDraftSaveState = { kind: "unconfirmed" as const, reason: "resubmit" as const };

export function MySubmissionsRoute({ locale, search, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: MySubmissionItem[]; pagination: { page: number; pageSize: SupportedPageSize; total: number; totalPages: number } } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const [resubmitError, setResubmitError] = useState<string | undefined>();
  const controllerRef = useRef<ReturnType<typeof createMySubmissionsRequestController> | null>(null);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
  const range = parseSubmissionRange(search);
  // The range and status filters live in the location. A filter change is a new query, so the
  // previous filter's rows are never passed off as its answer; a retry of the same query keeps them.
  const searchRef = useRef(search);
  if (searchRef.current !== search) { searchRef.current = search; setState({ kind: "loading" }); }
  // The desktop pager replaces the window; the mobile feed appends a later page.
  const load = (targetPage: number, append = false) => {
    const controller = controllerRef.current;
    if (!controller) return;
    setPending(true); setLocalError(undefined);
    const status = new URLSearchParams(readWorkspaceLocation().search).get("status") ?? undefined;
    const request = controller.request({ page: targetPage, pageSize, ...(status ? { status } : {}), ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) });
    void request.promise.then((result) => {
      if (!controller.isCurrent(request.generation)) return;
      setState((old) => old.kind === "ready" && append ? { kind: "ready", items: [...old.items, ...result.items], pagination: result.pagination } : { kind: "ready", items: result.items, pagination: result.pagination });
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
      setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false);
    });
  };
  useEffect(() => {
    // An empty stated interval can match nothing, so the route never sends it.
    if (range.invalid) { setState({ kind: "ready", items: [], pagination: { page: 1, pageSize, total: 0, totalPages: 0 } }); setPending(false); return; }
    const controller = createMySubmissionsRequestController();
    controllerRef.current = controller;
    load(1);
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads the live location, not a render value
  }, [locale, retryVersion, search, pageSize]);
  const resubmitted = state.kind === "ready"
    // A row the member resubmitted is marked superseded by the row that carries
    // its id in `supersedesSubmissionId` — the server's own record of the link.
    ? state.items.flatMap((item) => item.supersedes ? [{ priorId: item.supersedes, submissionId: item.id }] : [])
    : [];
  const startResubmit = (item: MySubmissionItem) => {
    setResubmitError(undefined);
    if (!memberId) return;
    const source = submissionResubmitSource(item);
    if (!source || !beginResubmission(memberId, source)) {
      // The editor is only opened on the item's own readable source and a record
      // this browser can write; otherwise the row stays exactly as it was.
      setResubmitError(frontendText(locale, "SUBMISSIONS_RESUBMIT_UNAVAILABLE"));
      return;
    }
    writeWorkspaceHistory("push", "/submit");
  };
  return <MySubmissionsPage locale={locale} state={state} range={range} pending={pending} localError={localError} resubmitError={resubmitError} resubmitted={resubmitted} onResubmit={memberId ? startResubmit : undefined} onRetry={() => setRetryVersion((value) => value + 1)} onPageChange={(next) => load(next)} onPageSizeChange={(size) => setPageSize(size)} onLoadMore={() => { if (state.kind === "ready" && state.pagination.page < state.pagination.totalPages) load(state.pagination.page + 1, true); }} />;
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
  const initialFilters = useMemo(() => taskFiltersFromSearch(search), [search]);
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
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
  const appendRef = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const appliedFiltersRef = useRef(taskFilterKey(filters));
  const sameFilters = (value: TaskFilterState) => JSON.stringify(value) === JSON.stringify(filtersRef.current);
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
      const nextFilters = taskFiltersFromSearch(readWorkspaceLocation().search);
      if (textFilterTimerRef.current) { clearTimeout(textFilterTimerRef.current); textFilterTimerRef.current = null; }
      setFilters(nextFilters); setDraftFilters(nextFilters); setRetryVersion((value) => value + 1);
    };
    return subscribeWorkspaceLocation(onPopState);
  }, []);

  useEffect(() => () => { if (textFilterTimerRef.current) clearTimeout(textFilterTimerRef.current); }, []);

  // The desktop pager replaces the window; the mobile feed appends a later page.
  const load = (targetPage: number, append = false) => {
    const controller = controllerRef.current;
    if (!controller) return;
    appendRef.current = append;
    setPending(true); setLocalLoadError(undefined);
    const request = controller.request({ page: targetPage, pageSize, filters: filtersRef.current as TaskFilters });
    void request.promise.then((data) => {
      if (!controller.isCurrent(request.generation)) return;
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", data: { items: [...previous.data.items, ...data.items], pagination: data.pagination } }
        : { kind: "ready", data });
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
      if (clearDeniedTasks(error)) return;
      setState((old) => old.kind === "ready" ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setLocalLoadError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false);
    });
  };
  useEffect(() => {
    const controller = createTasksRequestController(); controllerRef.current = controller;
    // A changed condition set must not answer with the previous condition's rows if this read fails;
    // a same-condition refresh keeps them and reports a local error instead (interaction contract §2.2).
    const appliedFilters = taskFilterKey(filters);
    if (appliedFiltersRef.current !== appliedFilters) { appliedFiltersRef.current = appliedFilters; setState({ kind: "loading" }); }
    load(1);
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads the live filters ref, not a render value
  }, [filters, locale, retryVersion, pageSize]);

  const navigate = (nextFilters: TaskFilterState, replace = false) => {
    const url = taskSearch(nextFilters);
    // Only this list's own read-only query changes may pass while a write is pending or unknown.
    ownedNavigationRef.current = true;
    try { writeWorkspaceHistory(replace ? "replace" : "push", `/tasks${url}`, () => {
      setActionError(undefined);
      if (textFilterTimerRef.current) { clearTimeout(textFilterTimerRef.current); textFilterTimerRef.current = null; }
      setFilters(nextFilters); setDraftFilters(nextFilters);
    }); } finally { ownedNavigationRef.current = false; }
  };
  const changeTextFilters = (nextFilters: TaskFilterState) => {
    setDraftFilters(nextFilters);
    if (textFilterTimerRef.current) clearTimeout(textFilterTimerRef.current);
    textFilterTimerRef.current = setTimeout(() => {
      textFilterTimerRef.current = null;
      navigate(nextFilters, true);
    }, 300);
  };
  const mutate = async (intent: TaskWriteIntent, label: string) => {
    if (actionPendingRef.current || listUnknownRef.current || listRecoveringRef.current) return;
    if (!record(intent)) { setActionNotice(undefined); setActionError(frontendText(locale, "TASKS_WRITE_NOT_RECORDED")); return; }
    const snapshot = { filters: { ...filtersRef.current } };
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
        } else if (cleared) { if (!clearDeniedTasks(error) && sameFilters(snapshot.filters)) setActionError(frontendText(locale, "TASKS_ACTION_FAILED")); }
        // The server may have applied it; the unchanged row is not proof that it did not.
        else markUnknown(rejected);
      }
      actionPendingRef.current = false; syncLeaveGuard(); setActionPendingId(null);
      return;
    }
    try {
      if (!sameFilters(snapshot.filters)) return;
      const controller = controllerRef.current; if (!controller) return;
      // A write refreshes the visible window from its first page; earlier appends are not provably current.
      setPending(true); const request = controller.request({ page: 1, pageSize, filters: snapshot.filters as TaskFilters });
      const data = await request.promise;
      if (!controller.isCurrent(request.generation) || !sameFilters(snapshot.filters)) return;
      setState({ kind: "ready", data }); setPending(false);
    } catch (error: unknown) {
      if (sameFilters(snapshot.filters) && !isAbort(error) && !clearDeniedTasks(error)) { setLocalLoadError(frontendText(locale, "COMMON_UNABLE_TO_LOAD")); setPending(false); }
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
  const taskRow = (id: string): TaskItem | null => {
    const item = state.kind === "ready" ? state.data.items.find((candidate) => candidate.id === id) : undefined;
    return item ?? null;
  };
  const taskLabel = (id: string) => {
    const item = state.kind === "ready" ? state.data.items.find((candidate) => candidate.id === id) : undefined;
    return item?.title.trim() || id;
  };
  const ready = state.kind === "ready" ? { kind: "ready" as const, items: state.data.items, pagination: state.data.pagination } : state;
  const discardRecord = () => { if (memberId && discardBlockedTaskWrite(memberId)) setRecordBlocked(false); };
  return <><div className="flex flex-col lg:h-full lg:min-h-0" inert={editor ? true : undefined}>{recordBlocked && <Alert variant="destructive" data-task-write-record-blocked="" className="mb-4">
    <AlertTitle>{frontendText(locale, "TASKS_WRITE_RECORD_BLOCKED")}</AlertTitle>
    <div className="mt-3"><Button variant="outline" onClick={discardRecord}>{frontendText(locale, "TASKS_WRITE_RECORD_DISCARD")}</Button></div>
  </Alert>}{listUnknown && <Alert variant="destructive" data-task-list-unknown="" className="mb-4">
    <AlertTitle>{frontendText(locale, "TASKS_LIST_WRITE_UNKNOWN").replace("{title}", listUnknown.label)}</AlertTitle>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="outline" disabled={listRecovering} onClick={() => void resolveListUnknown("check")}>{frontendText(locale, "TASKS_CHECK_WRITE")}</Button>
      <Button variant="outline" disabled={listRecovering} onClick={() => void resolveListUnknown("retry")}>{frontendText(locale, "TASKS_RETRY_WRITE")}</Button>
    </div>
  </Alert>}{actionNotice && <p role="status" className="mb-4 text-sm">{actionNotice}</p>}<TasksPage onCreate={() => setEditor({ taskId: null })} onOpen={(taskId) => setEditor({ taskId })} locale={locale} state={ready} filters={draftFilters} pending={pending} localLoadError={localLoadError} actionError={actionError} actionPendingId={editor ? "editor" : listUnknown || listRecovering ? "unknown" : actionPendingId} onRetry={() => setRetryVersion((value) => value + 1)} onFilterChange={(next) => navigate(next)} onTextFilterChange={changeTextFilters} onPageChange={(next) => load(next)} onPageSizeChange={(size) => setPageSize(size)} onLoadMore={() => { if (state.kind === "ready" && state.data.pagination.page < state.data.pagination.totalPages) load(state.data.pagination.page + 1, true); }} onStatusChange={(id, status: TaskStatus) => { const row = taskRow(id); if (row === null) { setActionError(frontendText(locale, "TASKS_ACTION_FAILED")); setRetryVersion((value) => value + 1); return; } void mutate({ op: "status", taskId: id, status, expectedStatus: row.status }, taskLabel(id)); }} onDelete={(id) => { const row = taskRow(id); if (row === null) { setActionError(frontendText(locale, "TASKS_ACTION_FAILED")); setRetryVersion((value) => value + 1); return; } void mutate({ op: "delete", taskId: id, expectedUpdatedAt: row.updatedAt }, taskLabel(id)); }} /></div>{editor && <TaskEditor key={editor.taskId ?? "new"} taskId={editor.taskId} memberId={memberId} {...(editor.restored ? { restored: editor.restored } : {})} locale={locale} onClose={() => setEditor(null)} onChanged={() => setRetryVersion((value) => value + 1)} onDenied={clearDeniedTasks} />}</>;
}

type TaskListUnknown = { intent: TaskWriteIntent; label: string };
function isDefiniteTaskRejection(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

export function InboxRoute({ locale, search = "", memberId }: { locale: LocaleRuntime; search?: string; memberId?: string }) {
  const writeRecovery = usePlanningWriteRecovery(memberId, "INBOX", search);
  const [status, setStatus] = useState<InboxStatus | undefined>(() => parseInboxSearch(search).status);
  const statusRef = useRef(status);
  statusRef.current = status;
  const [storedTaskWrite] = useState(() => memberId ? loadTaskWrite(memberId) : { kind: "empty" as const });
  const [taskTarget, setTaskTarget] = useState<{ taskId: string; restored?: TaskWriteIntent } | null>(() => storedTaskWrite.kind === "ready" && storedTaskWrite.intent.op !== "create"
    ? { taskId: storedTaskWrite.intent.taskId, restored: storedTaskWrite.intent } : null);
  const [taskCreatePending, setTaskCreatePending] = useState<string | null>(() => storedTaskWrite.kind === "ready" && storedTaskWrite.intent.op === "create" ? storedTaskWrite.intent.taskId : null);
  const [taskRecordBlocked, setTaskRecordBlocked] = useState(storedTaskWrite.kind === "blocked");
  // Do not display persisted private fields until this Inbox entry has passed its read gate.
  // Subsequent list refreshes must not tear down an already-open editor or its recovery intent.
  const [taskAccessReady, setTaskAccessReady] = useState(false);
  useEffect(() => {
    if (!taskTarget?.restored || taskAccessReady) return;
    const owner = window;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: "block" }));
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    owner.addEventListener("beforeunload", warn);
    return () => { unregister(); owner.removeEventListener("beforeunload", warn); };
  }, [taskTarget, taskAccessReady]);
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
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = parseInboxSearch(readWorkspaceLocation().search).status;
    if (next !== statusRef.current) { statusRef.current = next; setStatus(next); }
  }), []);
  useEffect(() => {
    // The pager is not part of the URL: page and page-size parameters are stripped, the status filter is kept.
    const canonical = writeInboxSearch(search, { page: 1, pageSize: listPageSize, status });
    if (canonical !== search) writeWorkspaceHistory("replace", `${readWorkspaceLocation().pathname}${canonical}`);
  }, [search, status]);
  const clearReadFailure = useCallback(() => {
    setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
  }, [locale]);
  const clearDenied = useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError) || ![401, 403, 404].includes(error.status)) return false;
    if (error.status === 401 || error.status === 403) {
      writeRecovery.deny();
      // Revoke both entry views and invalidate any list response still in flight.
      generationRef.current++; controllerRef.current?.abort();
      pendingRef.current = false; setPending(false);
      setTaskTarget(null); setTaskAccessReady(false); setTaskCreatePending(null);
    }
    clearReadFailure(); return true;
  }, [clearReadFailure, writeRecovery.deny]);
  // The desktop pager replaces the window; the mobile feed appends a later page.
  const load = useCallback(async (targetPage: number, append = false): Promise<boolean> => {
    generationRef.current += 1;
    const generation = generationRef.current;
    pendingRef.current = true; setPending(true);
    const controller = new AbortController(); controllerRef.current?.abort(); controllerRef.current = controller;
    try {
      const result = await loadInboxNumbered({ page: targetPage, pageSize, status: statusRef.current }, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return false;
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", items: [...previous.items, ...result.items], pagination: result.pagination }
        : { kind: "ready", items: result.items, pagination: result.pagination });
      setTaskAccessReady(true);
      const stored = memberId ? loadTaskWrite(memberId) : { kind: "empty" as const };
      setTaskRecordBlocked(stored.kind === "blocked");
      setTaskCreatePending(stored.kind === "ready" && stored.intent.op === "create" ? stored.intent.taskId : null);
      if (stored.kind === "ready" && stored.intent.op !== "create") setTaskTarget(current => current ?? {
        taskId: stored.intent.taskId, restored: stored.intent,
      });
      return true;
    } catch (error: unknown) {
      if (!activeRef.current || generation !== generationRef.current || isAbort(error)) return false;
      if (!clearDenied(error)) clearReadFailure();
      return false;
    } finally {
      if (activeRef.current && generation === generationRef.current) { pendingRef.current = false; setPending(false); }
    }
  }, [memberId, clearDenied, clearReadFailure, pageSize]);
  const refresh = useCallback(() => load(1), [load]);
  useEffect(() => {
    activeRef.current = true; void load(1);
    return () => { activeRef.current = false; generationRef.current++; controllerRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads the live status ref, not a render value
  }, [status, retryVersion, pageSize]);
  const navigate = (nextStatus: InboxStatus | undefined) => {
    if (pendingRef.current || writingRef.current || captureLockedRef.current || writeRecovery.locked) return;
    const nextSearch = writeInboxSearch(readWorkspaceLocation().search, { page: 1, pageSize: listPageSize, status: nextStatus });
    if (nextSearch === readWorkspaceLocation().search) return;
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${nextSearch}`, () => {
      if (nextStatus !== statusRef.current) { statusRef.current = nextStatus; setStatus(nextStatus); }
    });
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
  return <><div className="flex flex-col lg:h-full lg:min-h-0" inert={taskTarget && taskAccessReady ? true : undefined}>{taskRecordBlocked && <Alert variant="destructive" data-task-write-record-blocked="" className="mb-4">
    <AlertTitle>{frontendText(locale, "TASKS_WRITE_RECORD_BLOCKED")}</AlertTitle>
    <div className="mt-3"><Button variant="outline" onClick={() => { if (memberId && discardBlockedTaskWrite(memberId)) setTaskRecordBlocked(false); }}>{frontendText(locale, "TASKS_WRITE_RECORD_DISCARD")}</Button></div>
  </Alert>}{taskCreatePending && taskAccessReady && <Alert data-task-create-recovery="" className="mb-4">
    <AlertTitle>{frontendText(locale, "TASKS_LIST_WRITE_UNKNOWN").replace("{title}", taskCreatePending)}</AlertTitle>
    <div className="mt-3"><Button variant="outline" onClick={() => writeWorkspaceHistory("push", "/tasks")}>{frontendText(locale, "NAV_TASKS")}</Button></div>
  </Alert>}<PlanningWriteRecovery recovery={writeRecovery} locale={locale} pending={pending || writing || captureLocked} refresh={refresh} onDenied={clearDenied} onReadFailure={clearReadFailure} /><InboxPage locale={locale} state={state} pending={pending || writing || captureLocked || writeRecovery.locked} capturePending={pending || writing || writeRecovery.locked} actionError={actionError} status={status}
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
      const result = await loadInboxNumbered({ page: 1, pageSize, status: statusRef.current }, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return false;
      setState({ kind: "ready", items: result.items, pagination: result.pagination });
      return true;
    }}
    onCreateDenied={() => { generationRef.current++; controllerRef.current?.abort(); setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }); }}
    onStatusChange={item => void changeItem(item, "status")}
    onPromoteTask={item => void changeItem(item, "task")}
    onOpenTask={item => {
      if (pendingRef.current || writingRef.current || captureLockedRef.current || writeRecovery.locked || taskTarget || !item.promotedTaskId) return;
      const stored = memberId ? loadTaskWrite(memberId) : { kind: "empty" as const };
      setTaskRecordBlocked(stored.kind === "blocked");
      if (stored.kind === "blocked") return;
      // Inbox opens existing targets only. Recover task creation in its owning Tasks entry.
      if (stored.kind === "ready" && stored.intent.op === "create") { setTaskCreatePending(stored.intent.taskId); return; }
      setTaskTarget(stored.kind === "ready" ? { taskId: stored.intent.taskId, restored: stored.intent } : { taskId: item.promotedTaskId });
    }}
    onPageChange={(next) => void load(next)}
    onPageSizeChange={(size) => setPageSize(size)}
    onLoadMore={() => { if (state.kind === "ready" && state.pagination.page < state.pagination.totalPages) void load(state.pagination.page + 1, true); }}
    onFilterChange={navigate} /></div>{taskTarget && taskAccessReady && <TaskEditor key={`${memberId}:${taskTarget.taskId ?? "new"}`} taskId={taskTarget.taskId} {...(taskTarget.restored ? { restored: taskTarget.restored } : {})} memberId={memberId} locale={locale} onClose={() => setTaskTarget(null)} onChanged={() => setRetryVersion(value => value + 1)} onDenied={error => { if (clearDenied(error)) setTaskTarget(null); }} />}</>;
}

export function GoalsRoute({ locale, search = "", memberId }: { locale: LocaleRuntime; search?: string; memberId?: string }) {
  const writeRecovery = usePlanningWriteRecovery(memberId, "GOALS", search);
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
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
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

  // The desktop pager replaces the window; the mobile feed appends a later page.
  const load = useCallback(async (targetPage: number, append = false): Promise<boolean> => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const generation = ++generationRef.current;
    pendingRef.current = true; setPending(true); setActionError(undefined);
    try {
      const page = await loadNumberedGoals({ page: targetPage, pageSize }, fetch, controller.signal);
      if (!activeRef.current || generationRef.current !== generation) return false;
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", items: [...previous.items, ...page.items], pagination: page.pagination }
        : { kind: "ready", items: page.items, pagination: page.pagination });
      return true;
    } catch (error: unknown) {
      if (!activeRef.current || generationRef.current !== generation || isAbort(error)) return false;
      if (clearDeniedGoals(error)) return false;
      setState((current) => current.kind === "ready" ? current : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setActionError(frontendText(locale, "GOALS_ACTION_FAILED")); return false;
    } finally { if (activeRef.current && generationRef.current === generation) { pendingRef.current = false; setPending(false); } }
  }, [locale, clearDeniedGoals, pageSize]);
  const refresh = useCallback(() => load(1), [load]);

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
    onPageChange={(next) => void load(next)}
    onPageSizeChange={(size) => setPageSize(size)}
    onLoadMore={() => { if (state.kind === "ready" && state.pagination && state.pagination.page < state.pagination.totalPages) void load(state.pagination.page + 1, true); }} />
    {relationGoal && <GoalTasksEditor key={relationGoal.id} goalId={relationGoal.id} title={relationGoal.title} locale={locale} onDenied={clearDeniedGoals} onReadFailure={relationReadFailed} onClose={() => void closeRelations()} onBeginWrite={writeRecovery.begin} onFinishWrite={writeRecovery.finish} writeBlocked={writeRecovery.blocked} />}
  </>;
}

export function ProjectsRoute({ locale, search = "", memberId }: { locale: LocaleRuntime; search?: string; memberId?: string }) {
  const writeRecovery = usePlanningWriteRecovery(memberId, "PROJECTS", search);
  const statuses = new URLSearchParams(search).getAll("status");
  const status = statuses.length === 0 ? undefined : statuses.length === 1 ? statuses[0] : "invalid";
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
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
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

  // The desktop pager replaces the window; the mobile feed appends a later page.
  const load = useCallback(async (targetPage: number, append = false): Promise<boolean> => {
    cancelReads();
    const generation = ++generationRef.current;
    const controller = new AbortController(); listControllerRef.current = controller;
    pendingRef.current = true; setPending(true); setSummaryPending([]); setActionError(undefined);
    try {
      const page = await loadNumberedProjects({ page: targetPage, pageSize, status }, fetch, controller.signal);
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
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", items: [...previous.items, ...page.items], pagination: page.pagination, summaries: { ...previous.summaries, ...summaries } }
        : { kind: "ready", items: page.items, pagination: page.pagination, summaries });
      return true;
    } catch (error: unknown) {
      if (!activeRef.current || generationRef.current !== generation || isAbort(error)) return false;
      if (clearDeniedProjects(error)) return false;
      setState((current) => current.kind === "ready" ? current : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      setActionError(frontendText(locale, "PROJECTS_ACTION_FAILED")); return false;
    } finally { if (activeRef.current && generationRef.current === generation) { pendingRef.current = false; setPending(false); } }
  }, [locale, cancelReads, clearDeniedProjects, status, pageSize]);
  const refresh = useCallback(() => load(1), [load]);

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
    onPageChange={(next) => void load(next)}
    onPageSizeChange={(size) => setPageSize(size)}
    onLoadMore={() => { if (state.kind === "ready" && state.pagination && state.pagination.page < state.pagination.totalPages) void load(state.pagination.page + 1, true); }} /></>;
}

export function ProjectTimelineRoute({ locale, projectId, memberId }: { locale: LocaleRuntime; projectId: string; memberId?: string; search?: string }) {
  const writeRecovery = usePlanningWriteRecovery(memberId, `TIMELINE:${projectId}`, projectId);
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
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
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

  // The desktop pager replaces the window; the mobile feed appends a later page.
  const load = useCallback(async (targetPage: number, clearOnFailure = false, record?: PlanningWriteRecord, receiptVersion?: string, append = false): Promise<boolean> => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const generation = ++generationRef.current;
    pendingRef.current = true; setPending(true); setActionError(undefined);
    try {
      const [project, page] = await Promise.all([
        loadProject(projectId, fetch, controller.signal),
        loadNumberedProjectTimeline(projectId, { page: targetPage, pageSize }, fetch, controller.signal),
      ]);
      if (!activeRef.current || generationRef.current !== generation) return false;
      if (record) {
        const item = page.items.find(item => item.id === record.id);
        if (!item || !canonicalPlanningVersion(item.updatedAt) || Date.parse(item.updatedAt) < Math.max(Date.parse(record.expectedUpdatedAt), Date.parse(receiptVersion ?? record.expectedUpdatedAt))) throw new Error("TIMELINE_RECOVERY_VERSION_INVALID");
      }
      const previous = stateRef.current;
      const next: ProjectTimelinePageState = previous.kind === "ready" && append
        ? { kind: "ready", project, items: [...previous.items, ...page.items], pagination: page.pagination }
        : { kind: "ready", project, items: page.items, pagination: page.pagination };
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
  }, [locale, projectId, clearDenied, writeRecovery.finish, pageSize]);
  const refresh = useCallback((clearOnFailure = false, record?: PlanningWriteRecord, receiptVersion?: string) => load(1, clearOnFailure, record, receiptVersion), [load]);

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
    onPageChange={(next) => void load(next)}
    onPageSizeChange={(size) => setPageSize(size)}
    onLoadMore={() => { if (state.kind === "ready" && state.pagination && state.pagination.page < state.pagination.totalPages) void load(state.pagination.page + 1, false, undefined, undefined, true); }} /></>;
}

export function CalendarRoute({ locale, search = "", memberId }: { locale: LocaleRuntime; search?: string; memberId?: string }) {
  const writeRecovery = usePlanningWriteRecovery(memberId, "CALENDAR", search);
  const [captureLocked, setCaptureLocked] = useState(false);
  const captureLockedRef = useRef(false);
  const [defaultRange] = useState(defaultCalendarRange);
  const { from, to, status } = parseCalendarSearch(search, defaultRange);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
  // The pager is not part of the URL: page and page-size are stripped, the range and status filter are kept.
  const queryRef = useRef<CalendarQuery>({ page: 1, pageSize, from, to, status });
  queryRef.current = { page: 1, pageSize, from, to, status };
  const [state, setState] = useState<CalendarPageState>({ kind: "loading" });
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState(true);
  const [writing, setWriting] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [retryVersion, setRetryVersion] = useState(0);
  const activeRef = useRef(true), pendingRef = useRef(true), writingRef = useRef(false);
  const generationRef = useRef(0), controllerRef = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {
    generationRef.current++; controllerRef.current?.abort(); pendingRef.current = true;
    setPending(true); setDenied(false); setState({ kind: "loading" }); setActionError(undefined);
  }, []);
  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = parseCalendarSearch(readWorkspaceLocation().search, defaultRange);
    const current = queryRef.current;
    if (next.from !== current.from || next.to !== current.to || next.status !== current.status) {
      queryRef.current = { page: 1, pageSize: listPageSize, from: next.from, to: next.to, status: next.status };
      invalidate();
    }
  }), [defaultRange, invalidate]);
  useEffect(() => {
    const canonical = writeCalendarSearch(search, { page: 1, pageSize: listPageSize, from, to, status });
    if (canonical !== search) writeWorkspaceHistory("replace", `${readWorkspaceLocation().pathname}${canonical}`);
  }, [search, from, to, status]);
  const clearReadFailure = useCallback(() => setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") }), [locale]);
  const clearDenied = useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError) || ![401, 403, 404].includes(error.status)) return false;
    if (error.status !== 404) writeRecovery.deny();
    setDenied(true); clearReadFailure(); return true;
  }, [clearReadFailure, writeRecovery.deny]);
  // The desktop pager replaces the window; the mobile feed appends a later page.
  const load = useCallback(async (targetPage: number, append = false): Promise<boolean> => {
    generationRef.current += 1;
    const generation = generationRef.current;
    pendingRef.current = true; setPending(true); setDenied(false); setActionError(undefined);
    const controller = new AbortController(); controllerRef.current?.abort(); controllerRef.current = controller;
    try {
      const result = await loadCalendarNumbered({ page: targetPage, pageSize, from, to, status }, fetch, controller.signal);
      if (!activeRef.current || generation !== generationRef.current) return false;
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", items: [...previous.items, ...result.items], pagination: result.pagination }
        : { kind: "ready", items: result.items, pagination: result.pagination });
      return true;
    } catch (error: unknown) {
      if (!activeRef.current || generation !== generationRef.current || isAbort(error)) return false;
      if (!clearDenied(error)) {
        setState((current) => current.kind === "ready" ? current : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        setActionError(frontendText(locale, "CALENDAR_ACTION_FAILED"));
      }
      return false;
    } finally { if (activeRef.current && generation === generationRef.current) { pendingRef.current = false; setPending(false); } }
  }, [locale, from, to, status, clearDenied, pageSize]);
  const refresh = useCallback(() => load(1), [load]);
  useEffect(() => {
    activeRef.current = true; void refresh();
    return () => { activeRef.current = false; generationRef.current++; controllerRef.current?.abort(); };
  }, [refresh, retryVersion]);
  // A range edit restarts the window; the pager never re-enters the URL.
  const changeRange = (range: { from: string; to: string }) => {
    if (pendingRef.current || writingRef.current || captureLockedRef.current || writeRecovery.locked) return;
    const nextSearch = writeCalendarSearch(readWorkspaceLocation().search, { page: 1, pageSize: listPageSize, ...range, ...(status ? { status } : {}) });
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
  return <><PlanningWriteRecovery recovery={writeRecovery} locale={locale} pending={pending || writing || captureLocked} refresh={refresh} onDenied={clearDenied} onReadFailure={clearReadFailure} /><CalendarPage locale={locale} state={state} denied={denied} pending={pending || writing || captureLocked || writeRecovery.locked} createPending={pending || writing || writeRecovery.locked} actionError={actionError} range={{ from, to }}
    onRangeChange={changeRange}
    onPageChange={(next) => void load(next)}
    onPageSizeChange={(size) => setPageSize(size)}
    onLoadMore={() => { if (state.kind === "ready" && state.pagination && state.pagination.page < state.pagination.totalPages) void load(state.pagination.page + 1, true); }}
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
  useEffect(() => {
    const timer = setTimeout(() => setRetryVersion((value) => value + 1), msUntilNextUtcDate());
    return () => clearTimeout(timer);
  }, [retryVersion]);
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
    setPending(false); setActionError(undefined); setActionNotice(undefined);
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

export function WorkbenchReviewRoute({ locale, memberId }: { locale: LocaleRuntime; memberId?: string }) {
  const [storedPeriod] = useState(() => memberId ? loadReviewPeriod(memberId, "workbench") : { kind: "empty" as const });
  const [periodBlocked, setPeriodBlocked] = useState(storedPeriod.kind === "blocked");
  const [periodNotice, setPeriodNotice] = useState<string>();
  const [period, setPeriod] = useState<"daily" | "weekly">(storedPeriod.kind === "ready" ? storedPeriod.period : "daily");
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
  useEffect(() => {
    if (!memberId || periodBlocked) return;
    const saved = persistReviewPeriod(memberId, "workbench", period);
    setPeriodNotice(saved ? undefined : frontendText(locale, "REVIEW_PERIOD_NOT_RECORDED"));
  }, [period, memberId, periodBlocked, locale]);
  const discardPeriod = () => { if (!memberId || !periodBlocked || !discardBlockedReviewPeriod(memberId, "workbench")) return; setPeriodBlocked(false); setPeriodNotice(undefined); };
  const changePeriod = (next: "daily" | "weekly") => {
    if (next === period) return;
    // Clear the old snapshot in the same render as the selected period.
    setTarget(null);
    setState({ kind: "loading" });
    setPeriod(next);
  };
  return <><div inert={target ? true : undefined}><WorkbenchReviewPage locale={locale} period={period} state={state} onOpen={setTarget} onPeriodChange={changePeriod} onRetry={() => { setState({ kind: "loading" }); setRetryVersion((value) => value + 1); }} periodBlocked={periodBlocked} periodNotice={periodNotice} onDiscardPeriod={discardPeriod} /></div>{target && <SnapshotTargetDetail key={`${target.kind}:${target.id}`} target={target} locale={locale} title={frontendText(locale, "REVIEW_DETAIL_TITLE")} onClose={() => setTarget(null)} onDenied={clearDenied} />}</>;
}

export function NotificationsRoute({ locale, search, isAdmin = false, memberId }: { locale: LocaleRuntime; search: string; isAdmin?: boolean; memberId?: string }) {
  const [stored] = useState(() => memberId ? loadNotificationUpdate(memberId) : { kind: "empty" as const });
  const [filters, setFilters] = useState<NotificationFilters>(() => parseNotificationSearch(search).filters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [state, setState] = useState<NotificationsPageState>({ kind: "loading" });
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [revokedTarget, setRevokedTarget] = useState(false);
  const [recordBlocked, setRecordBlocked] = useState(stored.kind === "blocked");
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
    setRevokedTarget(false);
    invalidateSnapshot({ kind: "forbidden" });
    syncLeaveGuard();
  };

  // The loaded window appends a later page to the rows already shown; page one replaces them.
  const load = (targetPage: number) => {
    const controller = controllerRef.current;
    if (!controller) return;
    readyRef.current = false;
    setPending(true);
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    const request = controller.request({ page: targetPage, pageSize: listPageSize, filters: filtersRef.current });
    void request.promise.then(({ page, summary: nextSummary }) => {
      if (!controller.isCurrent(request.generation)) return;
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
      setState((previous) => previous.kind === "ready" && targetPage > 1
        ? { kind: "ready", items: [...previous.items, ...page.items], pagination: page.pagination }
        : { kind: "ready", items: page.items, pagination: page.pagination });
      setSummary(nextSummary);
      setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        clearRestrictedState(); return;
      }
      setSummary(null);
      setState({ kind: "error" }); setPending(false);
    });
  };
  useEffect(() => {
    const controller = createNotificationsRequestController();
    controllerRef.current = controller;
    load(1);
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads the live filters ref, not a render value
  }, [filters, retryVersion, syncLeaveGuard, writeOwned]);

  useEffect(() => {
    const onPopState = () => {
      locationEpochRef.current += 1;
      readyRef.current = false;
      const next = parseNotificationSearch(readWorkspaceLocation().search).filters;
      setActionError(undefined);
      setRevokedTarget(false);
      setFilters(next);
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

  const navigate = (nextFilters: NotificationFilters, replace = false) => {
    writeOwned(replace ? "replace" : "push", `/notifications${writeNotificationSearch(readWorkspaceLocation().search, { page: 1, pageSize: listPageSize, filters: nextFilters })}`, () => {
      readyRef.current = false; setActionError(undefined); setRevokedTarget(false);
      setFilters(nextFilters);
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
    filters={filters}
    pending={pending}
    actionPending={actionPending}
    actionError={actionError}
    onRetry={() => { setRevokedTarget(false); invalidateSnapshot({ kind: "loading" }); setRetryVersion((value) => value + 1); }}
    onFilterChange={(next: NotificationFilters) => navigate(next)}
    onLoadMore={() => { if (state.kind === "ready" && state.pagination.page < state.pagination.totalPages) load(state.pagination.page + 1); }}
    recordBlocked={recordBlocked}
    revokedTarget={revokedTarget}
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
        // The server redacted this notification's target: the member no longer has
        // access. Show the explicit revoked state instead of a generic write error.
        else setRevokedTarget(true);
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
      }).catch((error: unknown) => {
        if (!active) return;
        setState(isDiscussionAccessLost(error) ? { kind: "revoked", target: "thread" } : { kind: "error" });
        setPending(false);
      });
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
      setState(isDiscussionAccessLost(error) ? { kind: "revoked", target: "list" } : { kind: "error" }); setPending(false);
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
      if (isDiscussionAccessLost(error)) {
        accessEpochRef.current += 1;
        setState({ kind: "revoked" });
      } else setState({ kind: "error" });
      setPending(false);
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
        && isDiscussionAccessLost(error)) {
        // Revocation also invalidates concurrent reads; a late response must not
        // restore the private transcript or the composer after access is denied.
        controllerRef.current?.dispose(); controllerRef.current = null;
        accessEpochRef.current += 1;
        setState({ kind: "revoked" }); setPending(false);
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

/** The worker answers a revoked context (and a lost session) as 404/403/401 on purpose,
 * so the reader must treat them as one explicit revocation instead of a retryable failure. */
function isDiscussionAccessLost(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403 || error.status === 404);
}

export function BoardsRoute({ locale, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  // Without a member (preview) moves are not recorded; with one, an unknown move survives refresh in this tab.
  const [stored] = useState(() => memberId ? loadBoardMove(memberId) : { kind: "empty" as const });
  const restoredMove: BoardUnknownMove | null = stored.kind === "ready"
    ? { task: { id: stored.intent.taskId, title: stored.intent.title }, source: stored.intent.source, target: stored.intent.target } : null;
  // Each column keeps its own loaded window; the pager is not part of the URL.
  const [queries, setQueries] = useState<BoardPagination>(initialBoardQueries);
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
  const leaveGuardRef = useRef<(() => void) | null>(null);
  // Registered only while locked: an idle board keeps ordinary browser history behaviour.
  // Call synchronously at every lock transition so a same-event leave cannot pass.
  const syncLeaveGuard = useCallback(() => {
    const locked = () => actionPendingRef.current || recoveringRef.current || unknownMoveRef.current !== null;
    if (locked() && !leaveGuardRef.current) {
      leaveGuardRef.current = registerWorkspaceLeaveGuard(() => ({ kind: locked() ? "block" : "allow" }));
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

  useBoardColumnRequest("todo", queries.todo, retryVersions.todo, queriesRef, requestStatesRef, mutationOwnersRef, deniedRef, controllersRef, clearDeniedBoard, setQueries, setColumns);
  useBoardColumnRequest("doing", queries.doing, retryVersions.doing, queriesRef, requestStatesRef, mutationOwnersRef, deniedRef, controllersRef, clearDeniedBoard, setQueries, setColumns);
  useBoardColumnRequest("blocked", queries.blocked, retryVersions.blocked, queriesRef, requestStatesRef, mutationOwnersRef, deniedRef, controllersRef, clearDeniedBoard, setQueries, setColumns);
  useBoardColumnRequest("done", queries.done, retryVersions.done, queriesRef, requestStatesRef, mutationOwnersRef, deniedRef, controllersRef, clearDeniedBoard, setQueries, setColumns);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; actionGenerationRef.current += 1; };
  }, []);

  // Each column appends its own next page; the other three keep the window they already loaded.
  const loadMore = (status: BoardStatus) => {
    const column = columnsRef.current[status];
    if (column.kind !== "ready" || column.pagination.page >= column.pagination.totalPages) return;
    setQueries((current) => ({ ...current, [status]: { page: current[status].page + 1, pageSize: listPageSize } }));
  };

  // A refreshed column starts over from its first page; only an explicit end-of-list pull appends.
  const reloadColumn = (status: BoardStatus) => {
    const nextQueries = { ...queriesRef.current, [status]: { page: 1, pageSize: listPageSize } };
    queriesRef.current = nextQueries; setQueries(nextQueries);
    setRetryVersions((current) => ({ ...current, [status]: current[status] + 1 }));
  };
  const refreshAllColumns = () => { for (const status of BOARD_STATUSES) reloadColumn(status); };
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
      reloadColumn(source);
      if (isBoardStatus(target) && target !== source) reloadColumn(target);
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
        // Decide every replacement from the pre-reload query/state snapshot, then reload the affected columns.
        const reloadSource = (!sourceMatches && needsBoardReplacement(source, delta.sourceQuery, queriesRef, requestStatesRef, columnsRef))
          || (sourceMatches && (requestStatesRef.current[source].pending || requestStatesRef.current[source].superseded));
        const reloadTarget = delta.target !== undefined && (
          (delta.targetChanged && !targetMatches && needsBoardReplacement(delta.target, delta.targetQuery!, queriesRef, requestStatesRef, columnsRef))
          || (targetMatches && (requestStatesRef.current[delta.target].pending || requestStatesRef.current[delta.target].superseded)));
        if (reloadSource) reloadColumn(source);
        if (reloadTarget && delta.target) reloadColumn(delta.target);
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
      if (deniedRef.current) { deniedRef.current = false; refreshAllColumns(); return; }
      reloadColumn(status);
    }}
    onLoadMore={loadMore}
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
      setColumns((current) => {
        // Only the exact next page appends; any other read (retry, refresh after a move) replaces the window.
        const previous = current[status];
        const append = previous.kind === "ready" && querySnapshot.page === previous.pagination.page + 1;
        return { ...current, [status]: { kind: "ready", items: append ? [...previous.items, ...data.items] : data.items, pagination: data.pagination, pending: false } };
      });
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
  }, [query.page, query.pageSize, retryVersion, setColumns, setQueries, status, clearDeniedBoard]);
}

// Status writes reject 4xx before committing; transport failures, 5xx, 408/429 and malformed receipts are unknown.
function isDefiniteBoardMoveRejection(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

function initialBoardColumns(): BoardColumnStates {
  return { todo: { kind: "loading" }, doing: { kind: "loading" }, blocked: { kind: "loading" }, done: { kind: "loading" } };
}

function initialBoardQueries(): BoardPagination {
  const firstPage = { page: 1, pageSize: listPageSize };
  return { todo: { ...firstPage }, doing: { ...firstPage }, blocked: { ...firstPage }, done: { ...firstPage } };
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

export function ReviewQueueRoute(props: { locale: LocaleRuntime; search: string; memberId?: string; canReview: boolean }) {
  return <ReviewDraftProvider locale={props.locale} memberId={props.memberId} preserveUnsent><ReviewQueueSession {...props} /></ReviewDraftProvider>;
}
function ReviewQueueSession({ locale, memberId, canReview }: { locale: LocaleRuntime; search: string; memberId?: string; canReview: boolean }) {
  const drafts = useReviewDrafts()!;
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: ReviewQueuePageResult } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [localError, setLocalError] = useState<string | undefined>();
  const [decisionStored] = useState(() => memberId ? loadCurrentReviewDecision(memberId) : { kind: "empty" as const });
  const blockedRef = useRef(decisionStored.kind === "blocked");
  const [recordBlocked, setRecordBlocked] = useState(blockedRef.current);
  const [recordNotice, setRecordNotice] = useState<string>();
  const [decisionState, setDecisionState] = useState<ReviewDecisionState>(decisionStored.kind === "ready" ? { kind: "error", action: decisionStored.intent.action, recovery: "retry" } : { kind: "idle" });
  const [completedId, setCompletedId] = useState<string | null>(null);
  const controllerRef = useRef<ReturnType<typeof createReviewQueueRequestController> | null>(null);
  const readRef = useRef<object | null>(null);
  const decisionRef = useRef<{ settled: boolean } | null>(null);
  const operationRef = useRef<ReviewOperation | null>(decisionStored.kind === "ready" ? decisionStored.intent : null);
  // Retrying a failed read repeats the page it asked for; a later page appends.
  const requestedPageRef = useRef(1);
  const appendRef = useRef(false);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
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
  const read = async (controller: ReturnType<typeof createReviewQueueRequestController>, targetPage: number, append = false) => {
    if (readRef.current || controllerRef.current !== controller) return;
    const token = {}; readRef.current = token;
    requestedPageRef.current = targetPage; appendRef.current = append;
    const activeAtStart = decisionRef.current;
    setPending(true); setLocalError(undefined);
    const request = controller.request({ page: targetPage, pageSize });
    try {
      const data = await request.promise;
      if (!controller.isCurrent(request.generation)) return;
      // A paginated pending queue cannot establish the outcome of a missing row.
      // Resolve that exact object before releasing its unknown-operation lock.
      const operation = operationRef.current;
      if (operation && !activeAtStart && !decisionRef.current) {
        const row = data.items.find((item) => item.id === operation.id);
        const status = row?.status ?? (await loadReviewDetail(operation.id)).detail.status;
        if (!controller.isCurrent(request.generation)) return;
        if (["published", "rejected", "revision_requested"].includes(status)) {
          if (memberId && !clearReviewDecision(memberId, operation.id, operation)) {
            setRecordNotice(frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_STUCK"));
            setDecisionState({ kind: "error", action: operation.action, recovery: "retry" });
          } else {
            drafts.clear(operation.id); operationRef.current = null; setRecordNotice(undefined); setDecisionState({ kind: "idle" }); setCompletedId(operation.id);
          }
        }
      }
      deniedRef.current = false;
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", data: { items: [...previous.data.items, ...data.items], pagination: data.pagination } }
        : { kind: "ready", data });
    } catch (error: unknown) {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
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
    void read(controller, 1);
    return () => { controller.dispose(); if (controllerRef.current === controller) { controllerRef.current = null; readRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read only needs the controller; locale pins the error text
  }, [locale, pageSize]);
  const review = async (id: string, action: ReviewDecision, details?: ReviewNoteInput, retryOperation?: ReviewOperation) => {
    if (blockedRef.current || decisionRef.current || readRef.current || state.kind !== "ready" || localError || completedId === id || (operationRef.current && operationRef.current !== retryOperation)) return;
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
          const detail = action === "publish" ? await loadReviewDetail(id) : null;
          if (!ownsDecision()) return;
          if (deniedRef.current) { setDecisionState({ kind: "idle" }); return; }
          // The detail read is the freshest authoritative version; for the other
          // decisions the queue row itself carries the version it was read at, so
          // a stale row conflicts instead of overwriting a newer state.
          const version = detail?.version ?? state.data.items.find((item) => item.id === id)?.updatedAt;
          const publish = detail?.publish
            ?? { title: "", visibility: "shared" as const, spaceId: "default", collectionId: null, tagIds: [] };
          operation = prepareReviewDecision(id, action, publish, details, version);
          if (memberId && !saveReviewDecision(memberId, id, operation)) {
            setRecordNotice(frontendText(locale, "ADMIN_REVIEW_DECISION_NOT_RECORDED"));
            setDecisionState({ kind: "idle" });
            return;
          }
        }
        operationRef.current = operation;
        const receipt = await sendReviewDecision(operation);
        if (!ownsDecision()) return;
        if (memberId && !clearReviewDecision(memberId, operation.id, operation)) {
          setRecordNotice(frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_STUCK"));
          setDecisionState({ kind: "error", action, recovery: "retry" });
          return;
        }
        drafts.clear(id); operationRef.current = null; setRecordNotice(undefined); token.settled = true;
        setDecisionState({ kind: "success", receipt }); setCompletedId(id);
      } catch (error: unknown) {
        if (ownsDecision()) {
          if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
            setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
            deniedRef.current = true; setLocalError(undefined);
            setDecisionState(operationRef.current ? { kind: "error", action, recovery: "retry" } : { kind: "idle" });
          } else {
            const recovery = operationRef.current ? reviewRecovery(error, Boolean(retryOperation)) : "edit";
            if (recovery === "edit" && operationRef.current) {
              if (memberId && !clearReviewDecision(memberId, operationRef.current.id, operationRef.current)) {
                setRecordNotice(frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_STUCK"));
                setDecisionState({ kind: "error", action, recovery: "retry" });
                return;
              }
              operationRef.current = null; setRecordNotice(undefined);
            }
            setDecisionState({ kind: "error", action, recovery });
          }
        }
        return;
      }
      if (!ownsDecision()) return;
      const currentController = controllerRef.current;
      if (currentController && !deniedRef.current) await read(currentController, 1);
    } finally {
      if (decisionRef.current === token) { decisionRef.current = null; setPendingId(null); }
    }
  };
  const retryRead = () => {
    const controller = controllerRef.current;
    if (controller && !decisionRef.current) void read(controller, requestedPageRef.current, appendRef.current);
  };
  function discardRecord() {
    if (!memberId || !blockedRef.current || !discardBlockedCurrentReviewDecision(memberId)) return;
    blockedRef.current = false; setRecordBlocked(false); setRecordNotice(undefined);
  }
  return <ReviewQueuePage onOpenDetail={(id) => writeWorkspaceHistory("push", `/admin/submissions/${encodeURIComponent(id)}`)} locale={locale} state={state}
    batchEnabled={canReview}
    memberId={memberId}
    pendingId={pendingId} completedId={completedId} decisionState={decisionState} localError={recordNotice ?? localError} pending={pending || recordBlocked}
    decisionRecordBlocked={recordBlocked} onDiscardDecisionRecord={discardRecord}
    onRetry={() => retryRead()} onReloadDecision={() => retryRead()}
    onRetryDecision={() => { const operation = operationRef.current; if (operation && decisionState.kind === "error" && decisionState.recovery === "retry") void review(operation.id, operation.action, undefined, operation); }}
    onReview={recordBlocked ? undefined : (id, action, details) => void review(id, action, details)}
    onPageChange={(next) => { const controller = controllerRef.current; if (controller && state.kind === "ready") void read(controller, next); }}
    onPageSizeChange={(size) => setPageSize(size)}
    onLoadMore={() => { const controller = controllerRef.current; if (controller && state.kind === "ready" && state.data.pagination.page < state.data.pagination.totalPages) void read(controller, state.data.pagination.page + 1, true); }} />;
}

export function AdminDuplicateRoute({ locale, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminDuplicatePageResult } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [decisionStored] = useState(() => memberId ? loadAdminDuplicateDecisions(memberId) : { kind: "empty" as const });
  const blockedRef = useRef(decisionStored.kind === "blocked");
  const [recordBlocked, setRecordBlocked] = useState(blockedRef.current);
  const [recordNotice, setRecordNotice] = useState<string>();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lockedIds, setLockedIds] = useState<string[]>(() => decisionStored.kind === "ready" ? decisionStored.intents.map((intent) => intent.submissionId) : []);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [readVersion, setReadVersion] = useState(0);
  const controllerRef = useRef<ReturnType<typeof createAdminDuplicateRequestController> | null>(null);
  const requestedPageRef = useRef(1);
  const appendRef = useRef(false);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
  const scopeRef = useRef({});
  const readRef = useRef<object | null>(null);
  const mutationRef = useRef<{ id: string } | null>(null);
  // These locks are local to this mounted route. Missing from a pending page is
  // not proof of a particular decision, and an acknowledged terminal receipt
  // must never be unlocked by stale pending data.
  const needsReadRef = useRef(new Set<string>(decisionStored.kind === "ready" ? decisionStored.intents.map((intent) => intent.submissionId) : []));
  const unresolvedWrites = useRef(new Map<string, AdminDuplicateCandidate>(decisionStored.kind === "ready" ? decisionStored.intents.map((intent) => [intent.submissionId, candidateFromAdminDuplicateIntent(intent)]) : []));
  const intentRef = useRef(new Map<string, AdminDuplicateIntent>(decisionStored.kind === "ready" ? decisionStored.intents.map((intent) => [intent.submissionId, intent]) : []));
  const acknowledgedRef = useRef(new Set<string>());
  useEffect(() => {
    const owner = window;
    const locked = () => mutationRef.current !== null || unresolvedWrites.current.size > 0;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: locked() ? "block" : "allow" }));
    const warn = (event: BeforeUnloadEvent) => { if (locked()) { event.preventDefault(); event.returnValue = ""; } };
    owner.addEventListener("beforeunload", warn);
    return () => { unregister(); owner.removeEventListener("beforeunload", warn); };
  }, []);
  const syncLocks = () => setLockedIds([...needsReadRef.current]);
  const invalidateQuery = () => {
    scopeRef.current = {};
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
  const read = async (controller: NonNullable<typeof controllerRef.current>, targetPage: number, afterWrite = false, append = false) => {
    if ((!afterWrite && readRef.current) || controllerRef.current !== controller) return;
    const token = {}; readRef.current = token;
    requestedPageRef.current = targetPage; appendRef.current = append;
    const activeAtStart = mutationRef.current?.id;
    setPending(true); setLocalError(undefined);
    const request = controller.request({ page: targetPage, pageSize });
    try {
      const data = await request.promise;
      if (!controller.isCurrent(request.generation)) return;
      // Publish the page before reconciliation so an invalid detail read cannot
      // leave the previous window (and its stale rows) on screen.
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", data: { items: [...previous.data.items, ...data.items], pagination: data.pagination } }
        : { kind: "ready", data });
      // A pending-only page cannot prove the outcome of an absent candidate.
      // Recover it through an authenticated detail GET, never by replaying POST.
      for (const [id, expected] of unresolvedWrites.current) {
        if (id === activeAtStart || id === mutationRef.current?.id) continue;
        const row = data.items.find(item => item.submissionId === id) ?? await loadAdminDuplicate(id);
        if (!controller.isCurrent(request.generation)) return;
        if (row.canonicalSubmissionId !== expected.canonicalSubmissionId || row.canonicalSourceId !== expected.canonicalSourceId || row.canonicalSourceVersionId !== expected.canonicalSourceVersionId) throw new Error("DUPLICATE_RESPONSE_INVALID");
        const intent = intentRef.current.get(id);
        if (memberId && intent && !clearAdminDuplicateDecision(memberId, intent)) {
          setRecordNotice(frontendText(locale, "ADMIN_DUPLICATE_RECORD_STUCK"));
          continue;
        }
        intentRef.current.delete(id);
        unresolvedWrites.current.delete(id); setRecordNotice(undefined);
        if (row.decision === "pending") needsReadRef.current.delete(id);
        else acknowledgedRef.current.add(id);
      }
      for (const row of data.items) {
        if (row.submissionId !== activeAtStart && row.submissionId !== mutationRef.current?.id && !acknowledgedRef.current.has(row.submissionId)) needsReadRef.current.delete(row.submissionId);
      }
      syncLocks();
    } catch (error: unknown) {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
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
    if (controllerRef.current) void read(controllerRef.current, requestedPageRef.current, false, appendRef.current);
    else { readRef.current = {}; setReadVersion((version) => version + 1); }
  };
  useEffect(() => {
    const controller = createAdminDuplicateRequestController(); controllerRef.current = controller; readRef.current = null;
    void read(controller, 1);
    return () => { invalidateQuery(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read only needs the controller; locale pins the error text
  }, [locale, readVersion, pageSize]);
  const decide = async (id: string, decision: DuplicateDecision) => {
    if (blockedRef.current || !controllerRef.current || readRef.current || mutationRef.current || needsReadRef.current.has(id)) return;
    const candidate = state.kind === "ready" ? state.data.items.find((item) => item.submissionId === id) : undefined;
    if (!candidate || candidate.decision !== "pending") return;
    const intent: AdminDuplicateIntent = { submissionId: id, decision, canonicalSubmissionId: candidate.canonicalSubmissionId, canonicalSourceId: candidate.canonicalSourceId, canonicalSourceVersionId: candidate.canonicalSourceVersionId };
    if (memberId && !saveAdminDuplicateDecision(memberId, intent)) {
      setRecordNotice(frontendText(locale, "ADMIN_DUPLICATE_NOT_RECORDED"));
      return;
    }
    if (memberId) intentRef.current.set(id, intent);
    const token = { id }; const scope = scopeRef.current;
    mutationRef.current = token; needsReadRef.current.add(id); unresolvedWrites.current.set(id, candidate); syncLocks(); setPendingId(id); setLocalError(undefined); setRecordNotice(undefined);
    try {
      const receipt = await decideAdminDuplicate(id, decision);
      if (scopeRef.current !== scope) return;
      if (receipt.canonicalSubmissionId !== candidate.canonicalSubmissionId || receipt.canonicalSourceId !== candidate.canonicalSourceId || receipt.canonicalSourceVersionId !== candidate.canonicalSourceVersionId) throw new Error("DUPLICATE_RESPONSE_INVALID");
      if (memberId && !clearAdminDuplicateDecision(memberId, intent)) {
        setRecordNotice(frontendText(locale, "ADMIN_DUPLICATE_RECORD_STUCK"));
        return;
      }
      intentRef.current.delete(id);
      unresolvedWrites.current.delete(id); acknowledgedRef.current.add(id); mutationRef.current = null; setPendingId(null);
      if (controllerRef.current) await read(controllerRef.current, 1, true);
    } catch (error: unknown) {
      if (scopeRef.current === scope && !deny(error)) setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
    } finally {
      if (mutationRef.current === token) { mutationRef.current = null; setPendingId(null); }
    }
  };
  function discardRecord() {
    if (!memberId || !blockedRef.current || !discardBlockedAdminDuplicate(memberId)) return;
    blockedRef.current = false; setRecordBlocked(false); setRecordNotice(undefined);
  }
  return <DuplicateQueuePage onLoadRetry={retryRead} locale={locale} state={state} pendingId={pendingId} pending={pending || recordBlocked} lockedIds={lockedIds} readRequired={!pendingId && lockedIds.some((id) => !acknowledgedRef.current.has(id) || (state.kind === "ready" && state.data.items.some((item) => item.submissionId === id)))} localError={recordNotice ?? localError} decisionRecordBlocked={recordBlocked} onDiscardDecisionRecord={discardRecord} onDecision={recordBlocked ? undefined : (id, decision) => void decide(id, decision)} onPageChange={(next) => { const controller = controllerRef.current; if (controller && state.kind === "ready") void read(controller, next); }} onPageSizeChange={(size) => setPageSize(size)}
    onLoadMore={() => { const controller = controllerRef.current; if (controller && state.kind === "ready" && state.data.pagination.page < state.data.pagination.totalPages) void read(controller, state.data.pagination.page + 1, false, true); }} />;
}

export function AdminMembersRoute({ locale, search, memberId, load = loadAdminMembers, update = updateMemberStatus, loadInvitations = loadAdminMemberInvitations, issueInvitation = issueAdminMemberInvitation, revokeInvitation = revokeAdminMemberInvitation }: { locale: LocaleRuntime; search: string; memberId?: string; load?: typeof loadAdminMembers; update?: typeof updateMemberStatus; loadInvitations?: typeof loadAdminMemberInvitations; issueInvitation?: typeof issueAdminMemberInvitation; revokeInvitation?: typeof revokeAdminMemberInvitation }) {
  const [status, setStatus] = useState<"active" | "disabled" | undefined>(() => memberStatusSearch(search));
  const [statusStored] = useState(() => memberId ? loadAdminMemberStatuses(memberId) : { kind: "empty" as const });
  const blockedRef = useRef(statusStored.kind === "blocked");
  const [recordBlocked, setRecordBlocked] = useState(blockedRef.current);
  const [recordNotice, setRecordNotice] = useState<string>();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminMembersPage } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [pendingIds, setPendingIds] = useState<string[]>(() => statusStored.kind === "ready" ? statusStored.intents.map((intent) => intent.id) : []);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [readVersion, setReadVersion] = useState(0);
  const controllerRef = useRef<ReturnType<typeof createNumberedRequestController<Omit<LoadAdminMembersInput, "signal">, AdminMembersPage>> | null>(null);
  // Retrying a failed read repeats the page it asked for; desktop page changes
  // replace the window while the mobile feed appends the next one.
  const requestedPageRef = useRef(1);
  const appendRef = useRef(false);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
  const queryRef = useRef({ status });
  const scopeRef = useRef({});
  const readRef = useRef<object | null>(null);
  const mutationsRef = useRef(new Map<string, object>());
  // In-memory safety only: an uncertain PATCH is not replayed. A later GET must
  // expose this row before another explicit change; absence is not proof of success.
  const needsReadRef = useRef(new Set<string>(statusStored.kind === "ready" ? statusStored.intents.map((intent) => intent.id) : []));
  // A validated PATCH receipt resolves its outcome; row readiness is separate.
  // Without a receipt, only a post-settlement GET containing that row unlocks leave.
  const unresolvedWrites = useRef(new Set<string>(statusStored.kind === "ready" ? statusStored.intents.map((intent) => intent.id) : []));
  const intentRef = useRef(new Map<string, AdminMemberStatusIntent>(statusStored.kind === "ready" ? statusStored.intents.map((intent) => [intent.id, intent]) : []));
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
  const sameQuery = (value: typeof queryRef.current) => value.status === queryRef.current.status;
  const syncPendingIds = () => setPendingIds([...new Set([...mutationsRef.current.keys(), ...needsReadRef.current])]);
  const invalidateQuery = () => {
    scopeRef.current = {};
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
  const changeStatusFilter = (nextStatus: "active" | "disabled" | undefined) => {
    if (mutationsRef.current.size > 0) return;
    const params = new URLSearchParams(readWorkspaceLocation().search);
    if (nextStatus) params.set("status", nextStatus); else params.delete("status");
    const serialized = params.toString();
    // This synchronous allowance is only for this route's read-only query change.
    // It neither clears unresolved intents nor permits a later/deferred leave.
    ownedQueryNavigation.current = true;
    try { writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${serialized ? `?${serialized}` : ""}`, () => {
      invalidateQuery(); queryRef.current = { status: nextStatus };
      setStatus(nextStatus);
    }); } finally { ownedQueryNavigation.current = false; }
  };
  const read = async (controller: NonNullable<typeof controllerRef.current>, targetPage: number, afterWrite = false, append = false) => {
    if ((!afterWrite && readRef.current) || controllerRef.current !== controller) return;
    const token = {}; readRef.current = token;
    requestedPageRef.current = targetPage; appendRef.current = append;
    // A read that began while PATCH was pending cannot prove the post-write state,
    // even if its response arrives after PATCH settles on another URL scope.
    const activeAtStart = new Set(mutationsRef.current.keys());
    setPending(true); setLocalError(undefined); setActionError(undefined);
    const request = controller.request({ page: targetPage, pageSize, status: queryRef.current.status });
    try {
      const data = await request.promise;
      if (!controller.isCurrent(request.generation)) return;
      for (const row of data.items) {
        if (!activeAtStart.has(row.id) && !mutationsRef.current.has(row.id)) {
          const intent = intentRef.current.get(row.id);
          if (memberId && intent && !clearAdminMemberStatus(memberId, intent)) {
            setRecordNotice(frontendText(locale, "ADMIN_MEMBER_STATUS_RECORD_STUCK"));
            continue;
          }
          intentRef.current.delete(row.id);
          if (intent) setRecordNotice(undefined);
          needsReadRef.current.delete(row.id); unresolvedWrites.current.delete(row.id);
        }
      }
      syncPendingIds();
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", data: { items: [...previous.data.items, ...data.items], pagination: data.pagination } }
        : { kind: "ready", data });
    } catch (error: unknown) {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
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
    if (controllerRef.current) void read(controllerRef.current, requestedPageRef.current, false, appendRef.current);
    else { readRef.current = {}; setReadVersion((version) => version + 1); }
  };
  const [invitations, setInvitations] = useState<AdminMemberInvitation[]>([]);
  const [invitationsPending, setInvitationsPending] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string>();
  const [invitationForbidden, setInvitationForbidden] = useState(false);
  const [invitationWritePending, setInvitationWritePending] = useState(false);
  const [invitationError, setInvitationError] = useState<string>();
  const [issuedInvitation, setIssuedInvitation] = useState<{ email: string; code: string; expiresAt: string } | null>(null);
  const [invitationsVersion, setInvitationsVersion] = useState(0);
  const invitationReadRef = useRef<AbortController | null>(null);
  const invitationWriteRef = useRef<object | null>(null);
  // The invitation list is the only source of truth we can re-read after an ambiguous write.
  const readInvitations = async () => {
    invitationReadRef.current?.abort();
    const controller = new AbortController();
    invitationReadRef.current = controller;
    setInvitationsPending(true);
    try {
      const items = await loadInvitations(fetch, controller.signal);
      if (invitationReadRef.current !== controller) return;
      setInvitationForbidden(false); setInvitations(items); setInvitationsError(undefined);
    } catch (error: unknown) {
      if (invitationReadRef.current !== controller || isAbort(error)) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) { setInvitationForbidden(true); setInvitations([]); }
      else setInvitationsError(frontendText(locale, "ADMIN_INVITATION_LIST_ERROR"));
    } finally {
      if (invitationReadRef.current === controller) { invitationReadRef.current = null; setInvitationsPending(false); }
    }
  };
  useEffect(() => {
    void readInvitations();
    return () => { invitationReadRef.current?.abort(); invitationReadRef.current = null; };
  }, [loadInvitations, locale, invitationsVersion]);
  const retryInvitations = () => { setInvitationsError(undefined); setInvitationsVersion((version) => version + 1); };
  const issueInvitationFor = async (email: string) => {
    if (invitationWriteRef.current || !email) return;
    const token = {};
    invitationWriteRef.current = token;
    setInvitationWritePending(true); setInvitationError(undefined);
    try {
      const result = await issueInvitation(email);
      if (invitationWriteRef.current !== token) return;
      setIssuedInvitation({ email: result.invitation.email, code: result.code, expiresAt: result.invitation.expiresAt });
      await readInvitations();
    } catch (error: unknown) {
      if (invitationWriteRef.current !== token) return;
      const reason = adminMemberInvitationFailure(error);
      if (reason === "forbidden") { setInvitationForbidden(true); setInvitations([]); setInvitationError(frontendText(locale, "ADMIN_INVITATION_ERROR_FORBIDDEN")); return; }
      if (reason === "already_pending" || reason === "unknown") {
        // Never silently retry an ambiguous issue: a blind retry could mint a second code.
        // Re-read the list to reconcile; a duplicate (409) means one is already pending, and
        // its plaintext code is unrecoverable — the admin must revoke before issuing again.
        await readInvitations();
        const message = frontendText(locale, reason === "already_pending" ? "ADMIN_INVITATION_ALREADY_PENDING" : "ADMIN_INVITATION_UNKNOWN");
        setInvitationError(message.replace("{email}", email));
        return;
      }
      setInvitationError(frontendText(locale, reason === "invalid" ? "ADMIN_INVITATION_ERROR_INVALID" : reason === "admin_email" ? "ADMIN_INVITATION_ERROR_ADMIN_EMAIL" : "ADMIN_INVITATION_ERROR_UNKNOWN"));
    } finally {
      if (invitationWriteRef.current === token) { invitationWriteRef.current = null; setInvitationWritePending(false); }
    }
  };
  const revokeInvitationFor = async (id: string) => {
    if (invitationWriteRef.current || !id) return;
    const token = {};
    invitationWriteRef.current = token;
    setInvitationWritePending(true); setInvitationError(undefined);
    try {
      await revokeInvitation(id);
      if (invitationWriteRef.current !== token) return;
      await readInvitations();
    } catch (error: unknown) {
      if (invitationWriteRef.current !== token) return;
      const reason = adminMemberInvitationFailure(error);
      if (reason === "forbidden") { setInvitationForbidden(true); setInvitations([]); setInvitationError(frontendText(locale, "ADMIN_INVITATION_ERROR_FORBIDDEN")); return; }
      if (reason === "not_found" || reason === "not_pending") {
        await readInvitations();
        setInvitationError(frontendText(locale, reason === "not_found" ? "ADMIN_INVITATION_ERROR_NOT_FOUND" : "ADMIN_INVITATION_ERROR_NOT_PENDING"));
        return;
      }
      setInvitationError(frontendText(locale, "ADMIN_INVITATION_ERROR_UNKNOWN"));
    } finally {
      if (invitationWriteRef.current === token) { invitationWriteRef.current = null; setInvitationWritePending(false); }
    }
  };
  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = { status: memberStatusSearch(readWorkspaceLocation().search) };
    if (sameQuery(next)) return;
    invalidateQuery(); queryRef.current = next; setStatus(next.status);
  }), []);
  useEffect(() => {
    const controller = createNumberedRequestController((input: Omit<LoadAdminMembersInput, "signal">, signal) => load({ ...input, signal }));
    controllerRef.current = controller; readRef.current = null;
    void read(controller, 1);
    return () => { invalidateQuery(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read only needs the controller; locale pins the error text
  }, [load, locale, status, readVersion, pageSize]);
  const changeStatus = async (id: string, nextStatus: "active" | "disabled") => {
    if (blockedRef.current || !controllerRef.current || readRef.current || mutationsRef.current.has(id) || needsReadRef.current.has(id)) return;
    const member = state.kind === "ready" ? state.data.items.find((item) => item.id === id) : undefined;
    if (member?.role !== "contributor" || (member.status !== "active" && member.status !== "disabled") || member.status === nextStatus) return;
    const intent: AdminMemberStatusIntent = { id, status: nextStatus, expectedStatus: member.status };
    if (memberId && !saveAdminMemberStatus(memberId, intent)) {
      setRecordNotice(frontendText(locale, "ADMIN_MEMBER_STATUS_NOT_RECORDED"));
      return;
    }
    if (memberId) intentRef.current.set(id, intent);
    const token = {}; const scope = scopeRef.current; const actionQuery = { ...queryRef.current };
    mutationsRef.current.set(id, token); needsReadRef.current.add(id); unresolvedWrites.current.add(id); syncPendingIds(); setActionError(undefined); setRecordNotice(undefined);
    try {
      await update(id, nextStatus, member.status);
      if (memberId && !clearAdminMemberStatus(memberId, intent)) {
        setRecordNotice(frontendText(locale, "ADMIN_MEMBER_STATUS_RECORD_STUCK"));
        return;
      }
      intentRef.current.delete(id);
      unresolvedWrites.current.delete(id);
      if (scopeRef.current !== scope || !sameQuery(actionQuery)) return;
      mutationsRef.current.delete(id); syncPendingIds();
      const controller = controllerRef.current;
      if (controller) await read(controller, 1, true);
    } catch (error: unknown) {
      if (scopeRef.current === scope && sameQuery(actionQuery) && !deny(error)) setActionError(frontendText(locale, "ADMIN_MEMBER_STATUS_ERROR"));
    } finally {
      if (mutationsRef.current.get(id) === token) { mutationsRef.current.delete(id); syncPendingIds(); }
    }
  };
  function discardRecord() {
    if (!memberId || !blockedRef.current || !discardBlockedAdminMemberStatus(memberId)) return;
    blockedRef.current = false; setRecordBlocked(false); setRecordNotice(undefined);
  }
  return <MembersPage onLoadRetry={retryRead} locale={locale} status={status || ""} loading={state.kind === "loading"} forbidden={state.kind === "forbidden" || invitationForbidden} error={state.kind === "error" || state.kind === "forbidden" ? state.message : invitationForbidden ? frontendText(locale, "COMMON_UNABLE_TO_LOAD") : undefined} pageError={localError} members={state.kind === "ready" ? state.data.items : []} pagination={state.kind === "ready" ? state.data.pagination : undefined} pending={pending || recordBlocked} pendingIds={pendingIds} readRequired={pendingIds.some((id) => needsReadRef.current.has(id) && !mutationsRef.current.has(id))} actionError={recordNotice ?? actionError} statusRecordBlocked={recordBlocked} onDiscardStatusRecord={discardRecord} onPageChange={(next) => { const controller = controllerRef.current; if (controller && state.kind === "ready") void read(controller, next); }} onPageSizeChange={(size) => setPageSize(size)} onStatusFilterChange={(next) => changeStatusFilter(next || undefined)}
    onLoadMore={() => { const controller = controllerRef.current; if (controller && state.kind === "ready" && state.data.pagination.page < state.data.pagination.totalPages) void read(controller, state.data.pagination.page + 1, false, true); }}
    onStatusChange={recordBlocked ? undefined : changeStatus} invitations={invitations} invitationsPending={invitationsPending} invitationWritePending={invitationWritePending} invitationError={invitationError} invitationsError={invitationsError} issuedInvitation={issuedInvitation} onIssueInvitation={invitationForbidden || state.kind === "forbidden" ? undefined : issueInvitationFor} onRevokeInvitation={invitationForbidden || state.kind === "forbidden" ? undefined : revokeInvitationFor} onLoadInvitationsRetry={retryInvitations} />;
}

export function AdminSpacesRoute({ locale, memberId }: { locale: LocaleRuntime; memberId?: string }) {
  const [writeStored] = useState(() => memberId ? loadAdminSpaceWrite(memberId) : { kind: "empty" as const });
  const recordBlockedRef = useRef(writeStored.kind === "blocked");
  const [recordBlocked, setRecordBlocked] = useState(recordBlockedRef.current);
  const [recordNotice, setRecordNotice] = useState<string>();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; spaces: AdminSpace[]; nextCursor?: string } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [needsRead, setNeedsRead] = useState(writeStored.kind === "ready");
  const scope = useRef(0);
  const write = useRef<object | null>(null);
  const blocked = useRef(writeStored.kind === "ready");
  const unresolvedWrite = useRef(writeStored.kind === "ready");
  const intentRef = useRef<AdminSpaceWriteIntent | null>(writeStored.kind === "ready" ? writeStored.intent : null);
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
      if (!activeWrite && !write.current) {
        const intent = intentRef.current;
        if (memberId && intent && !clearAdminSpaceWrite(memberId, intent)) {
          unresolvedWrite.current = true; blocked.current = true; setNeedsRead(true);
          setRecordNotice(frontendText(locale, "ADMIN_SPACE_RECORD_STUCK"));
        } else {
          intentRef.current = null;
          if (intent) setRecordNotice(undefined);
          unresolvedWrite.current = false; blocked.current = false; setNeedsRead(false);
        }
      }
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
    if (recordBlockedRef.current || write.current || readController.current || blocked.current || state.kind !== "ready") return false;
    const intent: AdminSpaceWriteIntent = { op: "create", slug: input.slug, name: input.name };
    if (memberId && !saveAdminSpaceWrite(memberId, intent)) {
      setRecordNotice(frontendText(locale, "ADMIN_SPACE_NOT_RECORDED"));
      return false;
    }
    if (memberId) { intentRef.current = intent; persistAdminSpaceDraft(memberId, null); }
    const token = {}; const epoch = scope.current; write.current = token; unresolvedWrite.current = true; requireRead(); setRecordNotice(undefined);
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
    if (recordBlockedRef.current || write.current || readController.current || blocked.current || state.kind !== "ready") return false;
    const current = state.spaces.find(item => item.id === command.spaceId);
    if (!current || current.readOnly || current.kind === "legacy") return false;
    const intent: AdminSpaceWriteIntent = { op: "manage", command };
    if (memberId && !saveAdminSpaceWrite(memberId, intent)) {
      setRecordNotice(frontendText(locale, "ADMIN_SPACE_NOT_RECORDED"));
      return false;
    }
    if (memberId) { intentRef.current = intent; persistAdminSpaceDraft(memberId, null); }
    const token = {}; const epoch = scope.current; write.current = token; unresolvedWrite.current = true; requireRead(); setRecordNotice(undefined);
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
  function discardRecord() {
    if (!memberId || !recordBlockedRef.current || !discardBlockedAdminSpaceWrite(memberId)) return;
    recordBlockedRef.current = false; setRecordBlocked(false); setRecordNotice(undefined);
  }
  return <SpacesPage onLoadRetry={() => void read()} locale={locale} loading={state.kind === "loading"} error={state.kind === "error" ? state.message : undefined} spaces={state.kind === "ready" ? state.spaces : []} nextCursor={state.kind === "ready" ? state.nextCursor : undefined} onLoadMore={() => void read("spaces")} onLoadCollections={id => void read("collections", id)} pending={pending} blocked={needsRead || recordBlocked} navigationBlocked={unresolvedWrite.current} needsRead={needsRead} recordBlocked={recordBlocked} recordNotice={recordNotice} onDiscardRecord={discardRecord} onCreate={recordBlocked ? undefined : create} onManage={recordBlocked ? undefined : manage} draftMemberId={memberId} suppressDraft={needsRead} />;
}

export function AdminAuditRoute({ locale, search }: { locale: LocaleRuntime; search: string }) {
  const [action, setAction] = useState(() => new URLSearchParams(search).get("action") || undefined);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; page: AdminAuditPage } | { kind: "error"; message: string }>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();
  const pendingRef = useRef(false);
  const actionRef = useRef(action);
  const controllerRef = useRef<ReturnType<typeof createAdminAuditRequestController> | null>(null);
  // Retrying a failed read repeats the page it asked for; desktop page changes
  // replace the window while the mobile feed appends the next one.
  const requestedPageRef = useRef(1);
  const appendRef = useRef(false);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);

  const load = (targetPage: number, append = false) => {
    const controller = controllerRef.current;
    if (!controller) return;
    requestedPageRef.current = targetPage; appendRef.current = append;
    pendingRef.current = true;
    setPending(true); setLocalError(undefined);
    const request = controller.request({ page: targetPage, pageSize, action: actionRef.current });
    void request.promise.then((data) => {
      if (!controller.isCurrent(request.generation)) return;
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", page: { items: [...previous.page.items, ...data.items], pagination: data.pagination } }
        : { kind: "ready", page: data });
      pendingRef.current = false; setPending(false);
    }).catch((error: unknown) => {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
      const message = frontendText(locale, "ADMIN_AUDIT_UNAVAILABLE");
      setState((old) => old.kind === "ready" ? old : { kind: "error", message });
      setLocalError(message);
      pendingRef.current = false; setPending(false);
    });
  };

  useEffect(() => subscribeWorkspaceLocation(() => {
    const nextAction = new URLSearchParams(readWorkspaceLocation().search).get("action") || undefined;
    // Invalidate the old query immediately, before React cleans up its effect.
    actionRef.current = nextAction;
    setAction(nextAction);
  }), []);

  useEffect(() => {
    actionRef.current = action;
    const controller = createAdminAuditRequestController();
    controllerRef.current = controller;
    load(1);
    return () => { controller.dispose(); if (controllerRef.current === controller) controllerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads the live action ref, not a render value
  }, [action, locale, pageSize]);

  const changeFilter = (nextAction: string) => {
    const params = new URLSearchParams(readWorkspaceLocation().search);
    if (nextAction) params.set("action", nextAction); else params.delete("action");
    const nextSearch = params.toString();
    writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${nextSearch ? `?${nextSearch}` : ""}`, () => {
      actionRef.current = nextAction || undefined;
      setAction(nextAction || undefined);
    });
  };
  const retry = () => {
    if (pendingRef.current) return;
    load(requestedPageRef.current, appendRef.current);
  };
  return <AuditPage locale={locale} state={state} action={action || ""} pending={pending} localError={localError} onRetry={retry} onActionChange={changeFilter}
    onPageChange={(next) => load(next)}
    onPageSizeChange={(size) => setPageSize(size)}
    onLoadMore={() => { if (state.kind === "ready" && state.page.pagination.page < state.page.pagination.totalPages) load(state.page.pagination.page + 1, true); }} />;
}

function memberStatusSearch(search: string): "active" | "disabled" | undefined { const value = new URLSearchParams(search).get("status"); return value === "active" || value === "disabled" ? value : undefined; }

export function AdminAssetsRoute({ locale, search, memberId }: { locale: LocaleRuntime; search: string; memberId?: string }) {
  const [status, setStatus] = useState<AdminAssetStatus | undefined>(() => assetStatusSearch(search));
  const [retryStored] = useState(() => memberId ? loadAdminAssetRetries(memberId) : { kind: "empty" as const });
  const blockedRef = useRef(retryStored.kind === "blocked");
  const [recordBlocked, setRecordBlocked] = useState(blockedRef.current);
  const [recordNotice, setRecordNotice] = useState<string>();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; data: AdminAssetsPage } | { kind: "error" | "forbidden"; message: string }>({ kind: "loading" });
  const [pendingIds, setPendingIds] = useState<string[]>(() => retryStored.kind === "ready" ? retryStored.intents.map((intent) => intent.id) : []);
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
  const needsReadRef = useRef(new Set<string>(retryStored.kind === "ready" ? retryStored.intents.map((intent) => intent.id) : []));
  const intentRef = useRef(new Set<string>(retryStored.kind === "ready" ? retryStored.intents.map((intent) => intent.id) : []));
  const ownedQueryNavigation = useRef(false);
  const leaveGuardRef = useRef<(() => void) | null>(null);
  const releaseLeaveGuard = () => { leaveGuardRef.current?.(); leaveGuardRef.current = null; };
  const syncLeaveGuard = () => {
    // Register only while a signed-in retry is unresolved. A permanent guard would
    // route ordinary back/forward through the async gate and stall query changes.
    const locked = Boolean(memberId) && (mutationsRef.current.size > 0 || needsReadRef.current.size > 0);
    if (locked && !leaveGuardRef.current) {
      const owner = window;
      const isLocked = () => mutationsRef.current.size > 0 || needsReadRef.current.size > 0;
      const unregister = registerWorkspaceLeaveGuard(() => ({ kind: isLocked() && !ownedQueryNavigation.current ? "block" : "allow" }));
      const warn = (event: BeforeUnloadEvent) => { if (isLocked()) { event.preventDefault(); event.returnValue = ""; } };
      owner.addEventListener("beforeunload", warn);
      leaveGuardRef.current = () => { unregister(); owner.removeEventListener("beforeunload", warn); };
    } else if (!locked) releaseLeaveGuard();
  };
  useEffect(() => { syncLeaveGuard(); return releaseLeaveGuard; }, []);
  const [readVersion, setReadVersion] = useState(0);
  // Retrying a failed read repeats the page it asked for; desktop page changes
  // replace the window while the mobile feed appends the next one.
  const requestedPageRef = useRef(1);
  const appendRef = useRef(false);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(listPageSize);
  const queryRef = useRef({ status });
  // The query the visible window answers. A failed read for a different query
  // must not leave that window's rows actionable, so it falls back to the error
  // state instead of keeping the previous rows.
  const displayedQueryRef = useRef<{ status: AdminAssetStatus | undefined } | null>(null);
  const sameQuery = (value: typeof queryRef.current) => value.status === queryRef.current.status;
  const syncPendingIds = () => { setPendingIds([...new Set([...mutationsRef.current.keys(), ...needsReadRef.current])]); syncLeaveGuard(); };
  const clearPreview = () => {
    previewAbort.current?.abort(); previewAbort.current = null;
    setPreview(null); setPreviewError(undefined); setPreviewLoading(false);
  };
  const invalidateQuery = (keepLoaded = false) => {
    scopeRef.current = {}; controllerRef.current?.dispose(); controllerRef.current = null; readRef.current = null;
    clearPreview(); setState((old) => keepLoaded && old.kind === "ready" ? old : { kind: "loading" }); setRequestPending(false); setLocalError(undefined); setRetryError(undefined);
  };
  const deny = (error: unknown) => {
    if (!(error instanceof ApiRequestError) || (error.status !== 401 && error.status !== 403)) return false;
    const ids = [...needsReadRef.current];
    invalidateQuery(); mutationsRef.current.clear(); needsReadRef.current.clear();
    if (memberId) {
      for (const id of ids) {
        if (!clearAdminAssetRetry(memberId, id)) { needsReadRef.current.add(id); setRecordNotice(frontendText(locale, "ADMIN_ASSET_RETRY_RECORD_STUCK")); }
        else intentRef.current.delete(id);
      }
    }
    syncPendingIds();
    setState({ kind: "forbidden", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
    return true;
  };
  const changeStatusFilter = (nextStatus: AdminAssetStatus | undefined) => {
    const params = new URLSearchParams(readWorkspaceLocation().search);
    if (nextStatus) params.set("status", nextStatus); else params.delete("status");
    const serialized = params.toString();
    ownedQueryNavigation.current = true;
    try { writeWorkspaceHistory("push", `${readWorkspaceLocation().pathname}${serialized ? `?${serialized}` : ""}`, () => {
      invalidateQuery(true); queryRef.current = { status: nextStatus };
      setStatus(nextStatus);
    }); } finally { ownedQueryNavigation.current = false; }
  };
  const read = async (controller: NonNullable<typeof controllerRef.current>, targetPage: number, afterRetry = false, append = false) => {
    if ((!afterRetry && readRef.current) || controllerRef.current !== controller) return;
    const token = {}; readRef.current = token;
    requestedPageRef.current = targetPage; appendRef.current = append;
    setRequestPending(true); setLocalError(undefined); setRetryError(undefined);
    const requestStatus = queryRef.current.status;
    const request = controller.request({ page: targetPage, pageSize, status: requestStatus });
    try {
      const data = await request.promise;
      if (!controller.isCurrent(request.generation)) return;
      for (const row of data.items) {
        if (mutationsRef.current.has(row.id)) continue;
        const recorded = intentRef.current.has(row.id);
        if (memberId && recorded && !clearAdminAssetRetry(memberId, row.id)) {
          setRecordNotice(frontendText(locale, "ADMIN_ASSET_RETRY_RECORD_STUCK"));
          continue;
        }
        intentRef.current.delete(row.id);
        if (recorded) setRecordNotice(undefined);
        needsReadRef.current.delete(row.id);
      }
      syncPendingIds();
      displayedQueryRef.current = { status: requestStatus };
      setState((previous) => previous.kind === "ready" && append
        ? { kind: "ready", data: { items: [...previous.data.items, ...data.items], pagination: data.pagination } }
        : { kind: "ready", data });
    } catch (error: unknown) {
      if (!controller.isCurrent(request.generation) || isAbort(error)) return;
      if (!deny(error)) {
        // A window loaded for another query cannot stand in for this one.
        const staleWindow = displayedQueryRef.current !== null && displayedQueryRef.current.status !== requestStatus;
        setState((old) => old.kind === "ready" && !staleWindow ? old : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
        setLocalError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
      }
    } finally {
      if (readRef.current === token) { readRef.current = null; setRequestPending(false); }
    }
  };
  const retryRead = () => {
    if (readRef.current) return;
    setState((old) => old.kind === "ready" ? old : { kind: "loading" });
    if (controllerRef.current) void read(controllerRef.current, requestedPageRef.current, false, appendRef.current);
    else { readRef.current = {}; setReadVersion((version) => version + 1); }
  };
  useEffect(() => subscribeWorkspaceLocation(() => {
    const next = { status: assetStatusSearch(readWorkspaceLocation().search) };
    if (sameQuery(next)) return;
    invalidateQuery(true); queryRef.current = next; setStatus(next.status);
  }), []);
  useEffect(() => {
    const controller = createAdminAssetsRequestController(); controllerRef.current = controller; readRef.current = null;
    void read(controller, 1);
    // Swapping the controller for a new query must not empty the window: the
    // in-flight disposal keeps whatever was loaded so the next read shows it.
    return () => { invalidateQuery(true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read only needs the controller; locale pins the error text
  }, [locale, status, readVersion, pageSize]);
  const retry = async (id: string) => {
    if (blockedRef.current || !controllerRef.current || readRef.current || mutationsRef.current.has(id) || needsReadRef.current.has(id)) return;
    if (memberId && !saveAdminAssetRetry(memberId, { id })) {
      setRecordNotice(frontendText(locale, "ADMIN_ASSET_RETRY_NOT_RECORDED"));
      return;
    }
    if (memberId) intentRef.current.add(id);
    // Requeuing resets the parse job, so a parsed preview of this asset is stale
    // until the server returns the parsed content again.
    if (preview?.assetId === id) clearPreview();
    const token = {}; const scope = scopeRef.current; const actionQuery = { ...queryRef.current };
    mutationsRef.current.set(id, token); needsReadRef.current.add(id); syncPendingIds(); setRetryError(undefined); setRecordNotice(undefined);
    try {
      await retryAdminAsset(id);
      if (scopeRef.current !== scope || !sameQuery(actionQuery)) return;
      mutationsRef.current.delete(id); syncPendingIds();
      const controller = controllerRef.current;
      if (controller) await read(controller, 1, true);
    } catch (error: unknown) {
      if (scopeRef.current === scope && sameQuery(actionQuery) && !deny(error)) setRetryError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
    } finally {
      if (mutationsRef.current.get(id) === token) { mutationsRef.current.delete(id); syncPendingIds(); }
    }
  };
  function discardRecord() {
    if (!memberId || !blockedRef.current || !discardBlockedAdminAssetRetry(memberId)) return;
    blockedRef.current = false; setRecordBlocked(false); setRecordNotice(undefined);
  }
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
  return <AssetQueuePage onLoadRetry={retryRead} locale={locale} loading={state.kind === "loading"} forbidden={state.kind === "forbidden"} error={state.kind === "error" || state.kind === "forbidden" ? state.message : undefined} data={state.kind === "ready" ? state.data : undefined} localError={localError} readRequired={pendingIds.some((id) => needsReadRef.current.has(id) && !mutationsRef.current.has(id))} pending={requestPending} pendingIds={pendingIds} status={status || ""} preview={preview} previewLoading={previewLoading} previewError={previewError} retryError={recordNotice ?? retryError} recordBlocked={recordBlocked} onDiscardRecord={discardRecord} onRetry={recordBlocked ? undefined : (id) => void retry(id)} onPreview={(id) => void showPreview(id)} onStatusChange={(next) => changeStatusFilter(next || undefined)} onPageChange={(next) => { const controller = controllerRef.current; if (controller && state.kind === "ready") void read(controller, next); }} onPageSizeChange={(size) => setPageSize(size)} memberId={memberId}
    onLoadMore={() => { const controller = controllerRef.current; if (controller && state.kind === "ready" && state.data.pagination.page < state.data.pagination.totalPages) void read(controller, state.data.pagination.page + 1, false, true); }} />;
}

function assetStatusSearch(search: string): AdminAssetStatus | undefined { const value = new URLSearchParams(search).get("status"); return value === "queued" || value === "processing" || value === "succeeded" || value === "failed_retryable" || value === "failed_terminal" ? value : undefined; }
function knowledgeFilters(search: string): Omit<LoadKnowledgePageInput, "page" | "pageSize" | "signal"> {
  const params = new URLSearchParams(search); const value = (key: string) => params.get(key) || undefined;
  const kind = searchKind(params.get("kind"));
  return { spaceId: value("spaceId"), collectionId: value("collectionId"), tagId: value("tagId"), ...(kind ? { kind } : {}), authorId: value("authorId"), publishedFrom: value("publishedFrom"), publishedTo: value("publishedTo") };
}
/** The library kind filter, narrowed from an unvalidated location value. */
function searchKind(value: string | null | undefined): "text" | "markdown" | "code" | undefined {
  return value === "text" || value === "markdown" || value === "code" ? value : undefined;
}
// The inverse of `knowledgeFilters`: a removed applied condition rewrites the list location.
function writeKnowledgeFilters(search: string, next: KnowledgeFilters): string {
  const params = new URLSearchParams(search);
  for (const key of ["spaceId", "collectionId", "tagId", "kind", "authorId", "publishedFrom", "publishedTo"]) params.delete(key);
  params.delete("page");
  if (next.spaceId) params.set("spaceId", next.spaceId);
  if (next.collectionId) params.set("collectionId", next.collectionId);
  if (next.tagId) params.set("tagId", next.tagId);
  if (next.kind) params.set("kind", next.kind);
  if (next.authorId) params.set("authorId", next.authorId);
  if (next.publishedFrom) params.set("publishedFrom", next.publishedFrom);
  if (next.publishedTo) params.set("publishedTo", next.publishedTo);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
function searchFilters(search: string): SearchFilters {
  const params = new URLSearchParams(search); const value = (key: string) => params.get(key) || undefined; const { tagId: _tagId, ...base } = knowledgeFilters(search); const tagIds = params.getAll("tagId"); const tagMode = value("tagMode");
  return { ...base, tagIds, ...(tagMode === "and" || tagMode === "or" ? { tagMode } : {}) };
}
// The inverse of `searchFilters`. `tagMode` only exists with tags: the API rejects a
// bare mode, so dropping the last tag drops the mode too.
function writeSearchFilters(search: string, next: SearchFilters): string {
  const params = new URLSearchParams(search);
  for (const key of ["spaceId", "collectionId", "tagId", "tagMode", "kind", "authorId", "publishedFrom", "publishedTo", "page", "pageSize"]) params.delete(key);
  if (next.spaceId) params.set("spaceId", next.spaceId);
  if (next.collectionId) params.set("collectionId", next.collectionId);
  for (const tagId of next.tagIds) params.append("tagId", tagId);
  if (next.tagIds.length > 0 && next.tagMode) params.set("tagMode", next.tagMode);
  if (next.kind) params.set("kind", next.kind);
  if (next.authorId) params.set("authorId", next.authorId);
  if (next.publishedFrom) params.set("publishedFrom", next.publishedFrom);
  if (next.publishedTo) params.set("publishedTo", next.publishedTo);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
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
function taskSearch(filters: TaskFilterState): string {
  const params = new URLSearchParams();
  for (const key of ["status", "priority", "tag", "due", "q"] as const) {
    const value = filters[key]; if (value) params.set(key, value);
  }
  return params.size ? `?${params}` : "";
}
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === "AbortError"; }
/** A continuation page appends to the window; a repeated row id must not be shown twice. */
function mergeById<T extends { id: string }>(current: readonly T[], added: readonly T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...added.filter((item) => !seen.has(item.id))];
}