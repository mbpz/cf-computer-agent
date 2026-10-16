export type MaturityClassification = "usable" | "partial" | "unusable" | "pseudo_entry" | "unreachable";
export type MaturityDimension = "entry" | "journey" | "api" | "persistence" | "isolation" | "query_or_idempotency" | "states" | "accessibility" | "evidence";

export interface WorkbenchMaturityCapability {
  readonly id: string;
  readonly routeId: string;
  readonly pathname: string;
  readonly parentRouteId?: string;
  readonly routePattern?: string;
  readonly requiredRole: "anonymous" | "contributor" | "admin";
  readonly journey: string;
  readonly classification: MaturityClassification;
  readonly dimensions: Readonly<Record<MaturityDimension, "proven" | "gap" | "not_applicable">>;
  readonly frontendEvidence: readonly string[];
  readonly backendEvidence: readonly string[];
  readonly testEvidence: readonly string[];
  readonly ledgerIds: readonly string[];
  readonly gaps: readonly string[];
}

export type WorkbenchPaginationAudit = "numbered" | "cursor" | "not_applicable";
export type WorkbenchMutationSafety = "idempotency_key" | "conditional_write" | "convergent_delete" | "mixed" | "not_applicable";

export interface WorkbenchMaturityDomainEvidence {
  readonly id: string;
  readonly apiPaths: readonly string[];
  readonly persistencePaths: readonly string[];
  readonly ownerPredicate: string | null;
  readonly pagination: WorkbenchPaginationAudit;
  readonly mutations: readonly string[];
  readonly mutationSafety: WorkbenchMutationSafety;
}

export interface WorkbenchMutationStrategyBinding {
  readonly capabilityId: string;
  readonly operation: string;
  readonly strategy: Exclude<WorkbenchMutationSafety, "mixed" | "not_applicable">;
  readonly source: {
    readonly path: string;
    readonly symbol: string;
    readonly tokens: readonly string[];
  };
  readonly tests: readonly {
    readonly path: string;
    readonly tokens: readonly string[];
  }[];
}

export interface WorkbenchOperationRoot {
  readonly capabilityId: string;
  readonly path: string;
  readonly symbol: string;
}

export interface WorkbenchSourceSideEffectBinding {
  readonly capabilityId: string;
  readonly operation: string;
  readonly apiPath: string;
  readonly source: WorkbenchMutationStrategyBinding["source"];
  readonly tests: WorkbenchMutationStrategyBinding["tests"];
}

export const WORKBENCH_MUTATION_STRATEGY_BINDINGS = Object.freeze([
  {
    capabilityId: "workbench-review", operation: "GET /api/workbench/review#persist-snapshot", strategy: "idempotency_key",
    source: { path: "src/workbench-review/repository.ts", symbol: "WorkbenchReviewRepository.refresh", tokens: ["ON CONFLICT(member_id, period, period_key) DO UPDATE", "RETURNING id, period, period_key, payload_json, created_at, updated_at", "MAX(workbench_review_snapshots.updated_at + 1, excluded.updated_at)"] },
    tests: [{ path: "test/worker/workbench-review.test.ts", tokens: ["keeps the old stored snapshot on write failure and repairs it only on an explicit retry", "does not let a delayed older observation overwrite a newer period projection", "rows.results[0].updated_at", "final.taskSummary.done"] }],
  },
  {
    capabilityId: "workbench-goals", operation: "POST /api/goals/:id/tasks", strategy: "conditional_write",
    source: { path: "src/goal-tasks/repository.ts", symbol: "GoalTasksRepository.change", tokens: ["member_id = ? AND id = ? AND updated_at = ?", "consumed.meta.changes === 1", "this.db.batch"] },
    tests: [{ path: "test/worker/goal-tasks.test.ts", tokens: ["consumes goal versions for no-ops and rejects mixed stale writes", "allows only one of concurrent different task writes to consume a version"] }],
  },
  {
    capabilityId: "workbench-goals", operation: "DELETE /api/goals/:id/tasks/:id", strategy: "conditional_write",
    source: { path: "src/goal-tasks/repository.ts", symbol: "GoalTasksRepository.change", tokens: ["member_id = ? AND id = ? AND updated_at = ?", "consumed.meta.changes === 1", "this.db.batch"] },
    tests: [{ path: "test/worker/goal-tasks.test.ts", tokens: ["consumes goal versions for no-ops and rejects mixed stale writes", "allows only one of concurrent different task writes to consume a version"] }],
  },
  {
    capabilityId: "workbench-project-timeline", operation: "PATCH /api/projects/:id/timeline/:id", strategy: "conditional_write",
    source: { path: "src/project-timeline/repository.ts", symbol: "ProjectTimelineRepository.updateContent", tokens: ["AND updated_at = ?", "member_id = ? AND project_id = ? AND id = ?", "write.meta.changes !== 1"] },
    tests: [{ path: "test/worker/project-timeline-edit.test.ts", tokens: ["allows only one editor or status writer to consume a version", "enforces SQL ownership and expected version even when called directly"] }],
  },
  {
    capabilityId: "workbench-agent", operation: "POST /api/knowledge/chat/conversations/:id/feedback", strategy: "conditional_write",
    source: { path: "src/chat/feedback-repository.ts", symbol: "D1ChatFeedbackRepository.save", tokens: ["ON CONFLICT(conversation_id, member_id) DO UPDATE", "rating = excluded.rating", "citation_ids_json = excluded.citation_ids_json"] },
    tests: [{ path: "test/worker/m1-api.test.ts", tokens: ["persists a bounded owner-scoped chat history and rejects scope widening", "feedbackReplay.status", "SELECT COUNT(*) AS count FROM chat_feedback", "count: 1"] }],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets", strategy: "idempotency_key",
    source: {"path": "src/assets/service.ts", "symbol": "AssetService.create", "tokens": ["findByIdempotency", "if (replay) return replay"]},
    tests: [{"path": "test/worker/m2-assets.test.ts", "tokens": ["replays an idempotent upload and hides another member's asset"]}],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets/:id", strategy: "conditional_write",
    source: {"path": "src/assets/repository.ts", "symbol": "AssetsRepository.claimParseJob", "tokens": ["status IN ('queued', 'failed_retryable')", "result.meta.changes"]},
    tests: [{"path": "test/worker/m2-assets.test.ts", "tokens": ["processes a text original and exposes the succeeded parse state", "attempts: 1"]}],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets/:id/cancel", strategy: "conditional_write",
    source: {"path": "src/assets/repository.ts", "symbol": "AssetsRepository.cancelOwned", "tokens": ["owner_id = ?", "status IN ('queued', 'failed_retryable')", "meta.changes"]},
    tests: [{"path": "test/worker/m2-assets.test.ts", "tokens": ["does not cancel an asset that is already processing or parsed", "ASSET_CANCEL_CONFLICT"]}],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets/:id/submit", strategy: "idempotency_key",
    source: {"path": "src/routes/member.ts", "symbol": "routeMemberApi", "tokens": ["findByIdempotencyKey", "replay?.submission.assetId === assetId"]},
    tests: [{"path": "test/worker/m2-assets.test.ts", "tokens": ["atomically pairs a succeeded asset with its review submission", "ASSET_ALREADY_SUBMITTED"]}],
  },
  {
    capabilityId: "workbench-submit",
    operation: "POST /api/submissions",
    strategy: "idempotency_key",
    source: { path: "src/submissions/repository.ts", symbol: "SubmissionsRepository.findByIdempotencyKey", tokens: ["s.submitter_id = ?", "s.idempotency_key = ?"] },
    tests: [{ path: "test/worker/submissions.test.ts", tokens: ["returns an exact replay and rejects changed content or target for the same member key", "submissions: 1"] }],
  },
  {
    capabilityId: "workbench-tasks",
    operation: "POST /api/tasks",
    strategy: "idempotency_key",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.insert", tokens: ["INSERT OR IGNORE INTO tasks"] },
    tests: [{ path: "test/worker/tasks.test.ts", tokens: ["creates idempotently, lists, updates, transitions, and deletes", "created: false"] }],
  },
  {
    capabilityId: "workbench-tasks",
    operation: "POST /api/tasks/:id/status",
    strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.compareAndSetStatus", tokens: ["expectedStatus", "AND status = ?"] },
    tests: [{ path: "test/unit/tasks-service.test.ts", tokens: ["compareAndSetStatus", "previousStatus: expectedStatus"] }],
  },
  {
    capabilityId: "workbench-boards",
    operation: "POST /api/tasks/:id/status",
    strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.compareAndSetStatus", tokens: ["expectedStatus", "AND status = ?"] },
    tests: [{ path: "test/unit/tasks-service.test.ts", tokens: ["compareAndSetStatus", "previousStatus: expectedStatus"] }],
  },
  {
    capabilityId: "workbench-admin-duplicates",
    operation: "POST /api/admin/duplicates/:submissionId/decision",
    strategy: "conditional_write",
    source: { path: "src/duplicates/repository.ts", symbol: "DuplicateCandidatesRepository.decide", tokens: ["current.decision === decision", "current.decidedBy === reviewerId", "AND decision = 'pending'"] },
    tests: [{ path: "test/worker/submissions.test.ts", tokens: ["keeps exact duplicate decisions admin-scoped, idempotent, and audited", "DUPLICATE_DECISION_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-notifications",
    operation: "POST /api/notifications/:id/read",
    strategy: "conditional_write",
    source: { path: "src/notifications/repository.ts", symbol: "NotificationsRepository.markRead", tokens: ["recipient_member_id = ?", "read_at IS NULL", "result.meta.changes === 1"] },
    tests: [{ path: "test/worker/notifications.test.ts", tokens: ["marks one notification replay-safely and returns 404 across recipients", "toEqual(firstBody)"] }],
  },
  {
    capabilityId: "workbench-notifications",
    operation: "POST /api/notifications/read",
    strategy: "conditional_write",
    source: { path: "src/notifications/repository.ts", symbol: "NotificationsRepository.markManyRead", tokens: ["recipient_member_id = ?", "read_at IS NULL", "selection.limit"] },
    tests: [{ path: "test/worker/notifications.test.ts", tokens: ["marks only a bounded visible ID set and converges on bulk replay", "marked: 0"] }],
  },
  {
    capabilityId: "workbench-knowledge-reader",
    operation: "PUT /api/knowledge/:id/favorite",
    strategy: "idempotency_key",
    source: { path: "src/favorites/repository.ts", symbol: "FavoritesRepository.add", tokens: ["ON CONFLICT(member_id, knowledge_item_id) DO NOTHING"] },
    tests: [{ path: "test/worker/favorites.test.ts", tokens: ["keeps favorites private, visible only for readable knowledge, and removable", "favorite: true"] }],
  },
  {
    capabilityId: "workbench-message-thread",
    operation: "POST /api/discussions/messages",
    strategy: "idempotency_key",
    source: { path: "src/discussions/service.ts", symbol: "DiscussionsService.sendMessage", tokens: ["findMessageByAuthorClientKey", "normalized.clientKey"] },
    tests: [{ path: "test/worker/discussions.test.ts", tokens: ["sends idempotently, validates replies and mentions, and keeps route ordering canonical", "created: false"] }],
  },
  {
    capabilityId: "workbench-goals", operation: "POST /api/goals", strategy: "idempotency_key",
    source: { path: "src/goals/repository.ts", symbol: "GoalsRepository.insert", tokens: ["INSERT OR IGNORE INTO goals", "(id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at)", "result.meta.changes === 1"] },
    tests: [{ path: "test/worker/goals.test.ts", tokens: ["workbench-goals:query_or_idempotency:create-goal — double click and lost response converge to one goal while a re-keyed mismatch is refused and members stay isolated", "expect([first.created, second.created].filter(Boolean)).toHaveLength(1);", "idx_goals_member_client_key"] }],
  },
  {
    capabilityId: "workbench-goals", operation: "POST /api/goals/:id/status", strategy: "conditional_write",
    source: { path: "src/goals/repository.ts", symbol: "GoalsRepository.updateStatus", tokens: ["UPDATE goals SET status = ?, updated_at = ? WHERE member_id = ? AND id = ? AND updated_at = ?", ".bind(status, updatedAt, memberId, id, expectedUpdatedAt)"] },
    tests: [{ path: "test/worker/goals.test.ts", tokens: ["workbench-goals:query_or_idempotency:transition-goal-status — one concurrent status writer wins, the loser recovers, and a stale retry cannot overwrite", "GOAL_VERSION_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-goals", operation: "POST /api/goals/:id/progress", strategy: "conditional_write",
    source: { path: "src/goals/repository.ts", symbol: "GoalsRepository.updateProgress", tokens: ["UPDATE goals SET progress = ?, updated_at = ? WHERE member_id = ? AND id = ? AND updated_at = ?", ".bind(progress, updatedAt, memberId, id, expectedUpdatedAt)"] },
    tests: [{ path: "test/worker/goals.test.ts", tokens: ["workbench-goals:query_or_idempotency:update-goal-progress — an out-of-order request cannot overwrite a newer value and a lost-response retry stays authoritative", "GOAL_VERSION_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-projects", operation: "POST /api/projects", strategy: "idempotency_key",
    source: { path: "src/projects/repository.ts", symbol: "ProjectsRepository.insert", tokens: ["INSERT OR IGNORE INTO projects", "(id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at)", "result.meta.changes === 1"] },
    tests: [{ path: "test/worker/projects.test.ts", tokens: ["workbench-projects:query_or_idempotency:create-project — 重复创建及断线重试只有一个项目，键冲突可见且其他成员无法读取该项目。", "expect(count?.total).toBe(1);", "idx_projects_member_client_key"] }],
  },
  {
    capabilityId: "workbench-projects", operation: "POST /api/projects/:id/status", strategy: "conditional_write",
    source: { path: "src/projects/repository.ts", symbol: "ProjectsRepository.updateStatus", tokens: ["UPDATE projects SET status = ?, updated_at = ? WHERE member_id = ? AND id = ? AND updated_at = ?", ".bind(status, updatedAt, memberId, id, expectedUpdatedAt)"] },
    tests: [{ path: "test/worker/projects.test.ts", tokens: ["workbench-projects:query_or_idempotency:transition-project-status — 并发归档与激活出现明确冲突，刷新取得权威状态且重复请求不覆盖更新结果。", "PROJECT_VERSION_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-projects", operation: "POST /api/projects/:id/goals", strategy: "conditional_write",
    source: { path: "src/projects/repository.ts", symbol: "ProjectsRepository.changeRelation", tokens: ["INSERT OR IGNORE INTO ${table} (project_id, member_id, ${key}, created_at) SELECT ?, ?, ?, ? WHERE ${guard}", "UPDATE projects SET updated_at = ? WHERE member_id = ? AND id = ? AND updated_at = ? AND EXISTS(SELECT 1 FROM ${kind} WHERE member_id = ? AND id = ?)", "return consumed.meta.changes === 1 ? changed.meta.changes === 1 : null;"] },
    tests: [
      { path: "test/worker/project-relations.test.ts", tokens: ["workbench-projects:query_or_idempotency:link/unlink-project-goal|task — 关联与解除关联逆序到达时拒绝旧意图；响应丢失并刷新后可只读核对且不得重放覆盖新状态，跨成员仍为 404（%s）", ".toMatchObject({ linked: false });"] },
      { path: "test/worker/project-relation-conditional-writes.test.ts", tokens: ["admits one same-version concurrent %s writer", "now + 2, now)).toBeNull();"] },
    ],
  },
  {
    capabilityId: "workbench-projects", operation: "DELETE /api/projects/:id/goals/:id", strategy: "convergent_delete",
    source: { path: "src/projects/repository.ts", symbol: "ProjectsRepository.changeRelation", tokens: ["DELETE FROM ${table} WHERE project_id = ? AND member_id = ? AND ${key} = ? AND ${guard}", "UPDATE projects SET updated_at = ? WHERE member_id = ? AND id = ? AND updated_at = ? AND EXISTS(SELECT 1 FROM ${kind} WHERE member_id = ? AND id = ?)", "return consumed.meta.changes === 1 ? changed.meta.changes === 1 : null;"] },
    tests: [
      { path: "test/worker/project-relations.test.ts", tokens: ["workbench-projects:query_or_idempotency:link/unlink-project-goal|task — 关联与解除关联逆序到达时拒绝旧意图；响应丢失并刷新后可只读核对且不得重放覆盖新状态，跨成员仍为 404（%s）"] },
      { path: "test/worker/project-relation-conditional-writes.test.ts", tokens: ["admits one same-version concurrent %s writer", "now + 2, now)).toBeNull();"] },
    ],
  },
  {
    capabilityId: "workbench-projects", operation: "POST /api/projects/:id/tasks", strategy: "conditional_write",
    source: { path: "src/projects/repository.ts", symbol: "ProjectsRepository.changeRelation", tokens: ["INSERT OR IGNORE INTO ${table} (project_id, member_id, ${key}, created_at) SELECT ?, ?, ?, ? WHERE ${guard}", "UPDATE projects SET updated_at = ? WHERE member_id = ? AND id = ? AND updated_at = ? AND EXISTS(SELECT 1 FROM ${kind} WHERE member_id = ? AND id = ?)", "return consumed.meta.changes === 1 ? changed.meta.changes === 1 : null;"] },
    tests: [
      { path: "test/worker/project-relations.test.ts", tokens: ["workbench-projects:query_or_idempotency:link/unlink-project-goal|task — 关联与解除关联逆序到达时拒绝旧意图；响应丢失并刷新后可只读核对且不得重放覆盖新状态，跨成员仍为 404（%s）", "PROJECT_TASK_NOT_FOUND"] },
      { path: "test/worker/project-relation-conditional-writes.test.ts", tokens: ["admits one same-version concurrent %s writer", "now + 1, now)).toBeNull();"] },
    ],
  },
  {
    capabilityId: "workbench-projects", operation: "DELETE /api/projects/:id/tasks/:id", strategy: "convergent_delete",
    source: { path: "src/projects/repository.ts", symbol: "ProjectsRepository.changeRelation", tokens: ["DELETE FROM ${table} WHERE project_id = ? AND member_id = ? AND ${key} = ? AND ${guard}", "UPDATE projects SET updated_at = ? WHERE member_id = ? AND id = ? AND updated_at = ? AND EXISTS(SELECT 1 FROM ${kind} WHERE member_id = ? AND id = ?)", "return consumed.meta.changes === 1 ? changed.meta.changes === 1 : null;"] },
    tests: [
      { path: "test/worker/project-relations.test.ts", tokens: ["workbench-projects:query_or_idempotency:link/unlink-project-goal|task — 关联与解除关联逆序到达时拒绝旧意图；响应丢失并刷新后可只读核对且不得重放覆盖新状态，跨成员仍为 404（%s）"] },
      { path: "test/worker/project-relation-conditional-writes.test.ts", tokens: ["admits one same-version concurrent %s writer", "now + 1, now)).toBeNull();"] },
    ],
  },
  {
    capabilityId: "workbench-project-timeline", operation: "POST /api/projects/:id/timeline", strategy: "idempotency_key",
    source: { path: "src/project-timeline/repository.ts", symbol: "ProjectTimelineRepository.insert", tokens: ["INSERT OR IGNORE INTO project_timeline_items", "return result.meta.changes === 1;"] },
    tests: [{ path: "test/worker/project-timeline.test.ts", tokens: ["workbench-project-timeline:query_or_idempotency:create-timeline-item — concurrent double-submit and lost-response retry converge on one item while cross-project reuse is rejected and members stay isolated", "expect(afterRetry?.count).toBe(1);"] }],
  },
  {
    capabilityId: "workbench-project-timeline", operation: "POST /api/projects/:id/timeline/:id/status", strategy: "conditional_write",
    source: { path: "src/project-timeline/repository.ts", symbol: "ProjectTimelineRepository.updateStatus", tokens: ["UPDATE project_timeline_items SET status = ?, updated_at = ? WHERE member_id = ? AND project_id = ? AND id = ? AND updated_at = ?", "if (write.meta.changes !== 1) return null;"] },
    tests: [{ path: "test/worker/project-timeline.test.ts", tokens: ["workbench-project-timeline:query_or_idempotency:transition-timeline-status — concurrent transitions converge on one winner, retries refuse stale versions and foreign members are locked out", "PROJECT_TIMELINE_VERSION_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-calendar", operation: "POST /api/calendar/events", strategy: "idempotency_key",
    source: { path: "src/calendar/repository.ts", symbol: "CalendarRepository.insert", tokens: ["INSERT OR IGNORE INTO calendar_events", "return result.meta.changes === 1;"] },
    tests: [{ path: "test/worker/calendar.test.ts", tokens: ["workbench-calendar:query_or_idempotency:create-calendar-event — duplicate clicks converge on one identical-time event while new-key modifications conflict and members stay isolated", "\"calendar-race-key\")).toBe(1);"] }],
  },
  {
    capabilityId: "workbench-calendar", operation: "DELETE /api/calendar/events/:id", strategy: "conditional_write",
    source: { path: "src/calendar/repository.ts", symbol: "CalendarRepository.updateStatus", tokens: ["UPDATE calendar_events SET status = ?, updated_at = ? WHERE member_id = ? AND id = ? AND updated_at = ?", "AND NOT EXISTS (SELECT 1 FROM focus_sessions f WHERE f.member_id = calendar_events.member_id AND f.calendar_event_id = calendar_events.id)"] },
    tests: [{ path: "test/worker/calendar.test.ts", tokens: ["workbench-calendar:query_or_idempotency:cancel-calendar-event — cancel and edit race to one winner, repeated cancel converges and foreign members see nothing", "CALENDAR_VERSION_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-focus", operation: "POST /api/focus", strategy: "idempotency_key",
    source: { path: "src/focus/service.ts", symbol: "FocusService.start", tokens: ["const replay = await this.repository.findByClientKey(memberId, normalized.clientKey);", "return { session: replay, created: false };", "FOCUS_CONFLICT"] },
    tests: [{ path: "test/worker/focus.test.ts", tokens: ["workbench-focus:query_or_idempotency:start-focus — two windows starting with different keys keep one active session and one calendar block, a retry stays idempotent, and members stay isolated", "expect([left.status, right.status].sort((a, b) => a - b)).toEqual([201, 409]);", "expect(replayed.session.calendarEventId).toBe(started.session.calendarEventId);"] }],
  },
  {
    capabilityId: "workbench-focus", operation: "POST /api/focus/:id/pause", strategy: "conditional_write",
    source: { path: "src/focus/repository.ts", symbol: "FocusRepository.update", tokens: ["WHERE member_id = ? AND id = ? AND updated_at = ?", "if (!terminal) return mapRow(await update.first<FocusRow>());"] },
    tests: [{ path: "test/worker/focus.test.ts", tokens: ["workbench-focus:query_or_idempotency:pause-focus — concurrent pauses accumulate elapsed time once, and a stale request cannot touch a newly started session", "expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);", "elapsedMs: 60_000, updatedAt: paused.updatedAt });"] }],
  },
  {
    capabilityId: "workbench-focus", operation: "POST /api/focus/:id/resume", strategy: "conditional_write",
    source: { path: "src/focus/repository.ts", symbol: "FocusRepository.update", tokens: ["WHERE member_id = ? AND id = ? AND updated_at = ?", "if (!terminal) return mapRow(await update.first<FocusRow>());"] },
    tests: [{ path: "test/worker/focus.test.ts", tokens: ["workbench-focus:query_or_idempotency:resume-focus — one concurrent resume sets the start time once, a completed session cannot restart, and cross-member resume is refused", "elapsedMs: 60_000 });"] }],
  },
  {
    capabilityId: "workbench-focus", operation: "POST /api/focus/:id/complete", strategy: "conditional_write",
    source: { path: "src/focus/repository.ts", symbol: "FocusRepository.update", tokens: ["WHERE member_id = ? AND id = ? AND updated_at = ?", "c.kind = 'focus' AND c.task_id = focus_sessions.task_id", "this.db.batch<FocusRow>"] },
    tests: [{ path: "test/worker/focus.test.ts", tokens: ["workbench-focus:query_or_idempotency:complete-focus — a complete/abandon race accepts exactly one terminal write and repeat completion accumulates no extra time", "expect([complete.status, abandon.status].sort((a, b) => a - b)).toEqual([200, 409]);"] }],
  },
  {
    capabilityId: "workbench-focus", operation: "POST /api/focus/:id/abandon", strategy: "conditional_write",
    source: { path: "src/focus/repository.ts", symbol: "FocusRepository.update", tokens: ["WHERE member_id = ? AND id = ? AND updated_at = ?", "c.kind = 'focus' AND c.task_id = focus_sessions.task_id", "this.db.batch<FocusRow>"] },
    tests: [{ path: "test/worker/focus.test.ts", tokens: ["workbench-focus:query_or_idempotency:abandon-focus — the abandon race accepts one terminal transition, retries never rewrite it, and other members are refused", "FOCUS_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-inbox", operation: "POST /api/inbox", strategy: "idempotency_key",
    source: { path: "src/inbox/repository.ts", symbol: "InboxRepository.insert", tokens: ["INSERT OR IGNORE INTO inbox_items", "result.meta.changes === 1", "this.db.prepare"] },
    tests: [{ path: "test/worker/inbox.test.ts", tokens: ["duplicate submissions and lost-response retries keep one capture and client keys stay member-scoped", "\"inbox_items\")).toBe(1);", "allows the same client key for different members but rejects a same-member replay"] }],
  },
  {
    capabilityId: "workbench-inbox", operation: "PATCH /api/inbox/:id", strategy: "conditional_write",
    source: { path: "src/inbox/repository.ts", symbol: "InboxRepository.updateStatus", tokens: ["AND updated_at = ? AND status IN ('inbox', 'archived')", "result.meta.changes !== 1"] },
    tests: [{ path: "test/worker/inbox.test.ts", tokens: ["concurrent archive yields one winner and a visible conflict, stale writes are rejected and repeats converge", "INBOX_VERSION_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-inbox", operation: "POST /api/inbox/:id/promote/task", strategy: "conditional_write",
    source: { path: "src/inbox/task-promotion.ts", symbol: "InboxTaskPromotion.promote", tokens: ["AND promoted_task_id IS NULL AND promoted_submission_id IS NULL", "WHERE changes() = 1", "results[2]!.meta.changes === 1"] },
    tests: [{ path: "test/worker/inbox.test.ts", tokens: ["concurrent promotion yields one linked task and replay, cross-member requests denied", "replaying the pre-promotion snapshot never writes a second task or audit", "audit_events"] }],
  },
  {
    capabilityId: "workbench-tasks", operation: "PATCH /api/tasks/:id", strategy: "conditional_write",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.update", tokens: ["const expected = requireExpectedVersion((input as Record<string, unknown> | null)?.expectedUpdatedAt);", "if (Date.parse(task.updatedAt) !== expected) throw conflict();"] },
    tests: [{ path: "test/worker/tasks.test.ts", tokens: ["refuses a detail update without the version it read and lets exactly one concurrent edit win", "TASK_VERSION_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-tasks", operation: "DELETE /api/tasks/:id", strategy: "convergent_delete",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.delete", tokens: ["INSERT INTO task_tombstones (member_id, task_id, deleted_at)", "ON CONFLICT(member_id, task_id) DO UPDATE SET deleted_at = excluded.deleted_at", "results[1]!.meta.changes > 0"] },
    tests: [{ path: "test/worker/tasks.test.ts", tokens: ["converges repeated deletion on one retained receipt and never exposes a tombstone as a live task", "SELECT COUNT(*) AS n FROM task_tombstones"] }],
  },
  {
    capabilityId: "workbench-admin-roles", operation: "POST /api/admin/roles", strategy: "idempotency_key",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.create", tokens: ["INSERT INTO role_operation_receipts", "ON CONFLICT(member_id, operation_id) DO NOTHING", "ROLE_OPERATION_CONFLICT", "role.create"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["replays a creation under its stable key as one role and one audit event", "SELECT COUNT(*) AS total FROM role_operation_receipts WHERE operation_id = 'role-create-1'", "keeps one role and one audit event when the same key is retried concurrently"] }],
  },
  {
    capabilityId: "workbench-admin-roles", operation: "PATCH /api/admin/roles/:id", strategy: "conditional_write",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.update", tokens: ["expectedAllowBits === undefined", "id = ? AND is_system = ? AND allow_bits = ? AND name = ? AND description = ?", "ROLE_UPDATE_CONFLICT"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["rejects an administrator whose permission matrix is stale instead of overwriting newer grants", "does not audit a stale previous mask when different updates race", "expectedAllowBits"] }],
  },
  {
    capabilityId: "workbench-admin-roles", operation: "POST /api/admin/roles/:id/members", strategy: "idempotency_key",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.assignMember", tokens: ["INSERT INTO role_members (role_id, member_id, created_at) VALUES (?, ?, ?) ON CONFLICT(role_id, member_id) DO NOTHING", "role.member_assigned", "prepareChangedRowAudit"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["converges repeated assignment and removal on one authorisation change and a live projection", "SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.member_assigned'", "keeps concurrent %s outcomes and audit count consistent"] }],
  },
  {
    capabilityId: "workbench-admin-roles", operation: "DELETE /api/admin/roles/:id/members", strategy: "convergent_delete",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.unassignMember", tokens: ["DELETE FROM role_members WHERE role_id = ? AND member_id = ?", "role.member_unassigned", "prepareChangedRowAudit"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["converges repeated assignment and removal on one authorisation change and a live projection", "SELECT COUNT(*) AS total FROM audit_events WHERE action = 'role.member_unassigned'"] }],
  },
  {
    capabilityId: "workbench-admin-members", operation: "PATCH /api/admin/members/:id/status", strategy: "conditional_write",
    source: { path: "src/members/repository.ts", symbol: "MembersRepository.updateContributorStatusWithAudit", tokens: ["AND role = 'contributor' AND status = ?", "expectedStatus", "prepareResourceWriteAudit"] },
    tests: [
      { path: "test/worker/admin-audit.test.ts", tokens: ["records one explicit status assignment and shrinks the disabled member's menu and deep links", "rejects a stale client precondition instead of silently re-writing the status", "MEMBER_STATUS_CONFLICT"] },
      { path: "test/worker/members.test.ts", tokens: ["binds the caller's status precondition in the member CAS and audits only the winner", "updateContributorStatusWithAudit"] },
    ],
  },
  {
    capabilityId: "workbench-admin-menus", operation: "POST /api/admin/menus", strategy: "idempotency_key",
    source: { path: "src/authorization/menus-repository.ts", symbol: "MenusRepository.create", tokens: ["const key = boundedKey(input.key);", "INSERT OR IGNORE INTO menu_operation_receipts (kind, operation_id, request_hash, actor_id, claim_id, response_json, created_at)", "if (inserted.meta.changes === 1 && receipt?.claim_id === claimId) return { menu, created: true };"] },
    tests: [{ path: "test/worker/admin-menus.test.ts", tokens: ["replays one creation receipt across a refreshed session with one menu and one audit", "round-trips form helpers through authorized HTTP and replays an identical creation", "SELECT count(*) AS count FROM menus WHERE key = 'reports'"] }],
  },
  {
    capabilityId: "workbench-admin-menus", operation: "PATCH /api/admin/menus/:id", strategy: "conditional_write",
    source: { path: "src/authorization/menus-repository.ts", symbol: "MenusRepository.update", tokens: ["JSON.stringify(menuSnapshot(current)) !== JSON.stringify(menuSnapshot(input.expected))", "AND is_system = 0 AND (${snapshotSql}) = ?", "MENU_PATH_DUPLICATE"] },
    tests: [{ path: "test/worker/admin-menus.test.ts", tokens: ["rejects stale browser snapshots without overwriting the winner", "keeps a snapshot-less legacy write from overwriting a concurrent winner", "lets one of two concurrent admin sessions reorder and projects it to a member session"] }],
  },
  {
    capabilityId: "workbench-admin-menus", operation: "DELETE /api/admin/menus/:id", strategy: "convergent_delete",
    source: { path: "src/authorization/menus-repository.ts", symbol: "MenusRepository.remove", tokens: ["MENU_NOT_FOUND", "INSERT OR IGNORE INTO menu_operation_receipts (kind, operation_id, request_hash, actor_id, claim_id, response_json, created_at)", "MENU_OPERATION_CONFLICT"] },
    tests: [
      { path: "test/worker/admin-menus.test.ts", tokens: ["converges racing deletes on one recorded receipt and one audit", "requires an acknowledged impact before removing a parent subtree and removes it once", "frees a deleted key instead of replaying a tombstoned creation receipt"] },
      { path: "test/unit/admin-menus-page.test.tsx", tokens: ["shows the nested impact before a parent deletion is confirmed"] },
    ],
  },
  {
    capabilityId: "workbench-knowledge-reader", operation: "PUT /api/knowledge/:id/note", strategy: "conditional_write",
    source: { path: "src/private-notes/repository.ts", symbol: "PrivateNotesRepository.update", tokens: ["WHERE owner_member_id = ? AND knowledge_item_id = ? AND id = ? AND updated_at = ?", "RETURNING id, owner_member_id, knowledge_item_id, title, body, citations_json, created_at, updated_at"] },
    tests: [
      { path: "test/worker/private-notes.test.ts", tokens: ["conflicts on a stale version and reuses a replayed intent without overwriting", "PRIVATE_NOTE_VERSION_CONFLICT"] },
      { path: "test/unit/private-notes-service.test.ts", tokens: ["compare-and-sets an update and rejects a stale expected version", "returns the stored note for a replayed save with no second write"] },
    ],
  },
  {
    capabilityId: "workbench-knowledge-reader", operation: "POST /api/knowledge/:id/note/shares", strategy: "idempotency_key",
    source: { path: "src/private-notes/repository.ts", symbol: "PrivateNotesRepository.share", tokens: ["ON CONFLICT(note_id, recipient_member_id) DO UPDATE SET created_at = excluded.created_at, revoked_at = NULL", "INNER JOIN members AS recipient ON recipient.id = ? AND recipient.status = 'active'", "PRIVATE_NOTE_SHARE_TARGET_INVALID"] },
    tests: [{ path: "test/worker/private-notes.test.ts", tokens: ["shares only with active members, keeps recipients read-only, and revokes access", "PRIVATE_NOTE_SHARE_TARGET_INVALID"] }],
  },
  {
    capabilityId: "workbench-knowledge-reader", operation: "DELETE /api/knowledge/:id/note/shares/:recipientId", strategy: "convergent_delete",
    source: { path: "src/private-notes/repository.ts", symbol: "PrivateNotesRepository.revokeShare", tokens: ["SET revoked_at = COALESCE(revoked_at, ?)", "// COALESCE keeps the first revoke timestamp, so a replay leaves exactly one", "PRIVATE_NOTE_SHARE_NOT_FOUND"] },
    tests: [{ path: "test/worker/private-notes.test.ts", tokens: ["A retried revoke converges: same 204, identical stable state, one row.", "PRIVATE_NOTE_SHARE_NOT_FOUND"] }],
  },
  {
    capabilityId: "workbench-knowledge-reader", operation: "GET /api/knowledge/:id#record-visit", strategy: "idempotency_key",
    source: { path: "src/recent-visits/repository.ts", symbol: "RecentVisitsRepository.record", tokens: ["INSERT INTO knowledge_visits (member_id, knowledge_item_id, last_visited_at, visit_count, visit_identity)", "visit_count = MIN(knowledge_visits.visit_count + 1, 2147483647)", "WHERE knowledge_visits.visit_identity <> excluded.visit_identity"] },
    tests: [{ path: "test/worker/recent-visits.test.ts", tokens: ["counts one reading per explicit visit identity, deduplicates a retry, and isolates members", "A lost response is retried with the same reading identity: one count."] }, { path: "test/unit/frontend-reader-visit-identity.test.ts", tokens: ["reuses one identity across a lost response and a fresh controller, then a new visit gets a new one", "x-visit-id"] }],
  },
  {
    capabilityId: "workbench-search", operation: "POST /api/saved-views", strategy: "idempotency_key",
    source: { path: "src/saved-views/repository.ts", symbol: "SavedViewsRepository.create", tokens: ["INSERT INTO saved_views (id, member_id, client_key, name, schema_version, filters_json, created_at, updated_at)", "if (isClientKeyConflict(error)) {", "findByClientKey(input.memberId, input.clientKey)"] },
    tests: [
      { path: "test/worker/saved-views.test.ts", tokens: ["replays a create by its client key and converges an owner-scoped delete", "SELECT count(*) AS count FROM saved_views WHERE member_id = 'member-a'"] },
      { path: "test/unit/saved-views-service.test.ts", tokens: ["replays a create that reuses its client key"] },
    ],
  },
  {
    capabilityId: "workbench-search", operation: "DELETE /api/saved-views/:id", strategy: "convergent_delete",
    source: { path: "src/saved-views/repository.ts", symbol: "SavedViewsRepository.delete", tokens: ["SELECT 1 AS recorded FROM saved_view_delete_receipts WHERE member_id = ? AND view_id = ? LIMIT 1", "INSERT OR IGNORE INTO saved_view_delete_receipts (member_id, view_id, deleted_at)", "WHERE changes() = 1"] },
    tests: [{ path: "test/worker/saved-views.test.ts", tokens: ["A retried delete of the same view still succeeds and removes nothing else.", "saved_view_delete_receipts"] }],
  },
  {
    capabilityId: "workbench-messages", operation: "POST /api/discussions/context", strategy: "idempotency_key",
    source: { path: "src/discussions/repository.ts", symbol: "DiscussionsRepository.ensureThread", tokens: ["INSERT OR IGNORE INTO discussion_threads", "VALUES (?, ?, ?, ?, 0, ?, ?)", "const thread = await this.findThreadByContext(input.context);"] },
    tests: [{ path: "test/worker/discussions.test.ts", tokens: ["converges repeated context thread creation on one row and always rejects a revoked target", "expect(new Set(concurrent.map(({ thread }) => thread.id)).size).toBe(1);", "expect(concurrent.filter(({ created: wasCreated }) => wasCreated)).toHaveLength(1);"] }],
  },
  {
    capabilityId: "workbench-tasks", operation: "PUT /api/tasks/:id/tags", strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.replaceTags", tokens: ["// Every statement checks the same parent version; it advances only after all", "DELETE FROM task_tags WHERE member_id = ? AND task_id = ? AND EXISTS (SELECT 1 FROM tasks WHERE ", "return version ? results.at(-1)!.meta.changes === 1 : true;"] },
    tests: [
      { path: "test/worker/task-related-writes-atomicity.test.ts", tokens: ["different tag replacements cannot both win the same version", "an empty tag replacement is versioned and rolls back after its DELETE if the parent update fails"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-admin-role-new", operation: "POST /api/admin/roles", strategy: "idempotency_key",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.create", tokens: ["INSERT INTO role_operation_receipts", "ON CONFLICT(member_id, operation_id) DO NOTHING", "ROLE_OPERATION_CONFLICT", "role.create"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["replays a creation under its stable key as one role and one audit event", "SELECT COUNT(*) AS total FROM role_operation_receipts WHERE operation_id = 'role-create-1'"] }],
  },
  {
    capabilityId: "workbench-admin-role-new", operation: "PATCH /api/admin/roles/:id", strategy: "conditional_write",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.update", tokens: ["expectedAllowBits === undefined", "id = ? AND is_system = ? AND allow_bits = ? AND name = ? AND description = ?", "ROLE_UPDATE_CONFLICT"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["rejects an administrator whose permission matrix is stale instead of overwriting newer grants", "expectedAllowBits"] }],
  },
  {
    capabilityId: "workbench-admin-role-new", operation: "POST /api/admin/roles/:id/members", strategy: "idempotency_key",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.assignMember", tokens: ["INSERT INTO role_members (role_id, member_id, created_at) VALUES (?, ?, ?) ON CONFLICT(role_id, member_id) DO NOTHING", "role.member_assigned", "prepareChangedRowAudit"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["converges repeated assignment and removal on one authorisation change and a live projection", "role.member_assigned"] }],
  },
  {
    capabilityId: "workbench-admin-role-new", operation: "DELETE /api/admin/roles/:id/members", strategy: "convergent_delete",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.unassignMember", tokens: ["DELETE FROM role_members WHERE role_id = ? AND member_id = ?", "role.member_unassigned", "prepareChangedRowAudit"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["converges repeated assignment and removal on one authorisation change and a live projection", "role.member_unassigned"] }],
  },
  {
    capabilityId: "workbench-admin-role-detail", operation: "POST /api/admin/roles", strategy: "idempotency_key",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.create", tokens: ["INSERT INTO role_operation_receipts", "ON CONFLICT(member_id, operation_id) DO NOTHING", "ROLE_OPERATION_CONFLICT", "role.create"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["replays a creation under its stable key as one role and one audit event", "SELECT COUNT(*) AS total FROM role_operation_receipts WHERE operation_id = 'role-create-1'"] }],
  },
  {
    capabilityId: "workbench-admin-role-detail", operation: "PATCH /api/admin/roles/:id", strategy: "conditional_write",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.update", tokens: ["expectedAllowBits === undefined", "id = ? AND is_system = ? AND allow_bits = ? AND name = ? AND description = ?", "ROLE_UPDATE_CONFLICT"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["rejects an administrator whose permission matrix is stale instead of overwriting newer grants", "expectedAllowBits"] }],
  },
  {
    capabilityId: "workbench-admin-role-detail", operation: "POST /api/admin/roles/:id/members", strategy: "idempotency_key",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.assignMember", tokens: ["INSERT INTO role_members (role_id, member_id, created_at) VALUES (?, ?, ?) ON CONFLICT(role_id, member_id) DO NOTHING", "role.member_assigned", "prepareChangedRowAudit"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["converges repeated assignment and removal on one authorisation change and a live projection", "role.member_assigned"] }],
  },
  {
    capabilityId: "workbench-admin-role-detail", operation: "DELETE /api/admin/roles/:id/members", strategy: "convergent_delete",
    source: { path: "src/authorization/roles-repository.ts", symbol: "RolesRepository.unassignMember", tokens: ["DELETE FROM role_members WHERE role_id = ? AND member_id = ?", "role.member_unassigned", "prepareChangedRowAudit"] },
    tests: [{ path: "test/worker/admin-roles.test.ts", tokens: ["converges repeated assignment and removal on one authorisation change and a live projection", "role.member_unassigned"] }],
  },
  {
    capabilityId: "workbench-inbox", operation: "POST /api/tasks", strategy: "idempotency_key",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.insert", tokens: ["INSERT OR IGNORE INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)", "return result.meta.changes === 1;"] },
    tests: [
      { path: "test/worker/tasks.test.ts", tokens: ["creates idempotently, lists, updates, transitions, and deletes", "expect(await replay.json()).toMatchObject({ created: false });"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["creates with a client id, replays the same id idempotently, and audits once"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["exposes no create branch: the entry opens the promoted target and only ever writes to it"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "PATCH /api/tasks/:id", strategy: "conditional_write",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.update", tokens: ["const expected = requireExpectedVersion((input as Record<string, unknown> | null)?.expectedUpdatedAt);", "if (Date.parse(task.updatedAt) !== expected) throw conflict();", "const updated = await this.repository.update(memberId, id, { ...normalized, updatedAt }, expected);"] },
    tests: [
      { path: "test/worker/tasks.test.ts", tokens: ["refuses a detail update without the version it read and lets exactly one concurrent edit win", "await expect(loser.json()).resolves.toMatchObject({ error: { code: \"TASK_VERSION_CONFLICT\" } });"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "DELETE /api/tasks/:id/links/:id", strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.deleteLink", tokens: ["DELETE FROM task_links WHERE member_id = ? AND task_id = ? AND id = ?", "return this.mutateRelation(statement, memberId, taskId, version);"] },
    tests: [
      { path: "test/worker/task-related-writes-atomicity.test.ts", tokens: ["a duplicate link no-op and an absent-link DELETE do not consume a version", "keeps cross-member requests out of both relation and version writes"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["await expect(service.removeLink(\"member-a\", \"task-1\", link.id, linked)).rejects.toMatchObject({ code: \"TASK_VERSION_CONFLICT\", status: 409 });"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "POST /api/tasks/:id/links", strategy: "idempotency_key",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.insertLink", tokens: ["\"INSERT OR IGNORE INTO task_links (id, task_id, member_id, knowledge_item_id, created_at) VALUES (?, ?, ?, ?, ?)\"", "ON CONFLICT DO NOTHING", "return this.mutateRelation(statement, link.memberId, link.taskId, version);"] },
    tests: [
      { path: "test/worker/task-related-writes-atomicity.test.ts", tokens: ["concurrent identical %s requests converge without a second version advance", "rechecks link capacity at insertion without consuming a version"] },
      { path: "test/worker/tasks.test.ts", tokens: ["rejects stale progress, tag, and link writes over HTTP while identical re-sends still succeed"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["links only visible knowledge, idempotently, and under the link limit"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "POST /api/tasks/:id/progress", strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.updateProgress", tokens: ["const condition = expectedUpdatedAt === undefined ? \"\" : \" AND updated_at = ?\";", "UPDATE tasks SET progress = ?, updated_at = ? WHERE member_id = ? AND id = ?", "return result.meta.changes === 1 ? this.findOwned(memberId, id) : null;"] },
    tests: [
      { path: "test/worker/tasks.test.ts", tokens: ["rejects stale progress, tag, and link writes over HTTP while identical re-sends still succeed", "await expect(staleProgress.json()).resolves.toMatchObject({ error: { code: \"TASK_VERSION_CONFLICT\" } });"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["rejects a stale progress, tag, or link write and still accepts an identical replay"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "POST /api/tasks/:id/status", strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.compareAndSetStatus", tokens: ["status_version = status_version + 1", "AND status = ?", "return result.meta.changes > 0;"] },
    tests: [
      { path: "test/worker/tasks.test.ts", tokens: ["refuses a status write without the status it replaces and reports one conflict shape", "lets one CAS winner define the logical event for concurrent identical status requests", "accepts identical status replays without adding an audit event"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["previousStatus: expectedStatus,", "compareAndSetStatus"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "PUT /api/tasks/:id/tags", strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.replaceTags", tokens: ["// Every statement checks the same parent version; it advances only after all", "DELETE FROM task_tags WHERE member_id = ? AND task_id = ? AND EXISTS (SELECT 1 FROM tasks WHERE ", "return version ? results.at(-1)!.meta.changes === 1 : true;"] },
    tests: [
      { path: "test/worker/task-related-writes-atomicity.test.ts", tokens: ["different tag replacements cannot both win the same version", "an empty tag replacement is versioned and rolls back after its DELETE if the parent update fails"] },
      { path: "test/worker/tasks.test.ts", tokens: ["rejects stale progress, tag, and link writes over HTTP while identical re-sends still succeed"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["replaces tags with dedupe and limits, keeps owner isolation on every path"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "POST /api/tasks/:id/subtasks", strategy: "idempotency_key",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.createSubtask", tokens: ["const existing = await this.repository.findSubtask(memberId, taskId, normalized.id);", "if (existing) return { subtask: existing, created: false };", "if ((await this.repository.listSubtasks(memberId, taskId)).some((item) => item.position === normalized.position)) throw versionConflict();"] },
    tests: [
      { path: "test/worker/task-subtask-ordering.test.ts", tokens: ["same-id concurrent creates and retries produce one row and preserve its version", "reports an occupied create position as conflict, not a missing task"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["creates member-owned subtasks idempotently", "rejects a stale subtask edit or dependency change and still accepts an identical replay"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "PATCH /api/tasks/:id/subtasks/:id", strategy: "conditional_write",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.updateSubtask", tokens: ["if (expected !== undefined && Date.parse(current.updatedAt) !== expected) throw versionConflict();", "const updated = await this.repository.updateSubtask(memberId, taskId, subtaskId, { ...normalized, updatedAt }, expected);"] },
    tests: [
      { path: "test/worker/task-subtask-ordering.test.ts", tokens: ["allows only one competing move against the same version", "rejects an occupied update position without changing any fields (%s)"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["rejects a stale subtask edit or dependency change and still accepts an identical replay"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "DELETE /api/tasks/:id/subtasks/:id", strategy: "conditional_write",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.deleteSubtask", tokens: ["if (!await this.repository.deleteSubtask(memberId, taskId, subtaskId, expected)) {", "if (expected !== undefined && await this.repository.findSubtask(memberId, taskId, subtaskId)) throw versionConflict();"] },
    tests: [
      { path: "test/worker/task-subtask-ordering.test.ts", tokens: ["keeps sparse ordering after delete, insert, move, and same-version retry", "does not reveal another member or task through a colliding subtask id"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["await expect(service.deleteSubtask(\"member-a\", \"task-1\", \"sub-1\", currentSubtask)).rejects.toMatchObject({ code: \"TASK_NOT_FOUND\", status: 404 });"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "POST /api/tasks/:id/dependencies", strategy: "idempotency_key",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.insertDependency", tokens: ["INSERT INTO task_dependencies (member_id, task_id, depends_on_task_id, created_at)", "ON CONFLICT(task_id, depends_on_task_id) DO NOTHING", "return this.mutateRelation(statement, input.memberId, input.taskId, version);"] },
    tests: [
      { path: "test/worker/task-dependency-atomicity.test.ts", tokens: ["concurrent identical adds converge without consuming a second version", "only one different dependency wins the same parent version"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["await expect(service.addDependency(\"member-a\", \"task-1\", \"task-2\", parent)).resolves.toMatchObject({ created: false });"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-inbox", operation: "DELETE /api/tasks/:id/dependencies/:id", strategy: "conditional_write",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.removeDependency", tokens: ["if (!existing) throw new AppError(\"TASK_DEPENDENCY_NOT_FOUND\", \"Task dependency not found\", 404);", "if (!await this.repository.deleteDependency(memberId, taskId, dependsOnTaskId, version)) {"] },
    tests: [
      { path: "test/worker/task-dependency-atomicity.test.ts", tokens: ["replays the same add without bumping the version, then permits versioned removal", "denies cross-member edges and writes without touching either owner"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["await expect(service.removeDependency(\"member-a\", \"task-1\", \"task-2\", current)).rejects.toMatchObject({ code: \"TASK_DEPENDENCY_NOT_FOUND\", status: 404 });"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-tasks", operation: "DELETE /api/tasks/:id/dependencies/:id", strategy: "conditional_write",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.removeDependency", tokens: ["if (!existing) throw new AppError(\"TASK_DEPENDENCY_NOT_FOUND\", \"Task dependency not found\", 404);", "if (!await this.repository.deleteDependency(memberId, taskId, dependsOnTaskId, version)) {"] },
    tests: [
      { path: "test/worker/task-dependency-atomicity.test.ts", tokens: ["replays the same add without bumping the version, then permits versioned removal", "denies cross-member edges and writes without touching either owner"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["await expect(service.removeDependency(\"member-a\", \"task-1\", \"task-2\", current)).rejects.toMatchObject({ code: \"TASK_DEPENDENCY_NOT_FOUND\", status: 404 });"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-tasks", operation: "DELETE /api/tasks/:id/subtasks/:id", strategy: "conditional_write",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.deleteSubtask", tokens: ["if (!await this.repository.deleteSubtask(memberId, taskId, subtaskId, expected)) {", "if (expected !== undefined && await this.repository.findSubtask(memberId, taskId, subtaskId)) throw versionConflict();"] },
    tests: [
      { path: "test/worker/task-subtask-ordering.test.ts", tokens: ["keeps sparse ordering after delete, insert, move, and same-version retry", "does not reveal another member or task through a colliding subtask id"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["await expect(service.deleteSubtask(\"member-a\", \"task-1\", \"sub-1\", currentSubtask)).rejects.toMatchObject({ code: \"TASK_NOT_FOUND\", status: 404 });"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-tasks", operation: "PATCH /api/tasks/:id/subtasks/:id", strategy: "conditional_write",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.updateSubtask", tokens: ["if (expected !== undefined && Date.parse(current.updatedAt) !== expected) throw versionConflict();", "const updated = await this.repository.updateSubtask(memberId, taskId, subtaskId, { ...normalized, updatedAt }, expected);"] },
    tests: [
      { path: "test/worker/task-subtask-ordering.test.ts", tokens: ["allows only one competing move against the same version", "rejects an occupied update position without changing any fields (%s)"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["rejects a stale subtask edit or dependency change and still accepts an identical replay"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-tasks", operation: "POST /api/tasks/:id/dependencies", strategy: "idempotency_key",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.insertDependency", tokens: ["INSERT INTO task_dependencies (member_id, task_id, depends_on_task_id, created_at)", "ON CONFLICT(task_id, depends_on_task_id) DO NOTHING", "return this.mutateRelation(statement, input.memberId, input.taskId, version);"] },
    tests: [
      { path: "test/worker/task-dependency-atomicity.test.ts", tokens: ["concurrent identical adds converge without consuming a second version", "only one different dependency wins the same parent version"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["await expect(service.addDependency(\"member-a\", \"task-1\", \"task-2\", parent)).resolves.toMatchObject({ created: false });"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-tasks", operation: "POST /api/tasks/:id/subtasks", strategy: "idempotency_key",
    source: { path: "src/tasks/service.ts", symbol: "TasksService.createSubtask", tokens: ["const existing = await this.repository.findSubtask(memberId, taskId, normalized.id);", "if (existing) return { subtask: existing, created: false };", "if ((await this.repository.listSubtasks(memberId, taskId)).some((item) => item.position === normalized.position)) throw versionConflict();"] },
    tests: [
      { path: "test/worker/task-subtask-ordering.test.ts", tokens: ["same-id concurrent creates and retries produce one row and preserve its version", "reports an occupied create position as conflict, not a missing task"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["creates member-owned subtasks idempotently", "rejects a stale subtask edit or dependency change and still accepts an identical replay"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-tasks", operation: "DELETE /api/tasks/:id/links/:linkId", strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.deleteLink", tokens: ["DELETE FROM task_links WHERE member_id = ? AND task_id = ? AND id = ?", "return this.mutateRelation(statement, memberId, taskId, version);"] },
    tests: [
      { path: "test/worker/task-related-writes-atomicity.test.ts", tokens: ["a duplicate link no-op and an absent-link DELETE do not consume a version", "keeps cross-member requests out of both relation and version writes"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["await expect(service.removeLink(\"member-a\", \"task-1\", link.id, linked)).rejects.toMatchObject({ code: \"TASK_VERSION_CONFLICT\", status: 409 });"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-tasks", operation: "POST /api/tasks/:id/links", strategy: "idempotency_key",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.insertLink", tokens: ["\"INSERT OR IGNORE INTO task_links (id, task_id, member_id, knowledge_item_id, created_at) VALUES (?, ?, ?, ?, ?)\"", "ON CONFLICT DO NOTHING", "return this.mutateRelation(statement, link.memberId, link.taskId, version);"] },
    tests: [
      { path: "test/worker/task-related-writes-atomicity.test.ts", tokens: ["concurrent identical %s requests converge without a second version advance", "rechecks link capacity at insertion without consuming a version"] },
      { path: "test/worker/tasks.test.ts", tokens: ["rejects stale progress, tag, and link writes over HTTP while identical re-sends still succeed"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["links only visible knowledge, idempotently, and under the link limit"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-tasks", operation: "POST /api/tasks/:id/progress", strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.updateProgress", tokens: ["const condition = expectedUpdatedAt === undefined ? \"\" : \" AND updated_at = ?\";", "UPDATE tasks SET progress = ?, updated_at = ? WHERE member_id = ? AND id = ?", "return result.meta.changes === 1 ? this.findOwned(memberId, id) : null;"] },
    tests: [
      { path: "test/worker/tasks.test.ts", tokens: ["rejects stale progress, tag, and link writes over HTTP while identical re-sends still succeed", "await expect(staleProgress.json()).resolves.toMatchObject({ error: { code: \"TASK_VERSION_CONFLICT\" } });"] },
      { path: "test/unit/tasks-service.test.ts", tokens: ["rejects a stale progress, tag, or link write and still accepts an identical replay"] },
      { path: "test/unit/frontend-inbox-task-operation-matrix.test.tsx", tokens: ["Inbox target editor $op journey", "checks the exact current result without replay"] },
    ],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/submissions/:id/resubmit", strategy: "idempotency_key",
    source: { path: "src/submissions/repository.ts", symbol: "SubmissionsRepository.createResubmissionWithSourceVersion", tokens: ["if (replay) return exactReplayOrThrow(replay, input);", "AND (prior.idempotency_key IS NULL OR prior.idempotency_key != ?)", "if (concurrent) return exactReplayOrThrow(concurrent, input);"] },
    tests: [
      { path: "test/worker/submissions.test.ts", tokens: ["replays one resubmission for one idempotency key and takes a new key as a new attempt", "supersedes_submission_id"] },
      { path: "test/unit/frontend-submission-resubmit-data.test.ts", tokens: ["reconciles an unknown attempt through the server's own supersede link", "keeps the key for a confirmed attempt and mints a new one only on an explicit restart"] },
    ],
  },
  {
    capabilityId: "workbench-submit", operation: "PATCH /api/submissions/drafts/:id", strategy: "conditional_write",
    source: { path: "src/submissions/repository.ts", symbol: "SubmissionsRepository.updateDraft", tokens: ["SET requested_space_id = ?, requested_collection_id = ?, requested_visibility = ?", "WHERE id = ? AND submitter_id = ? AND status = 'draft'", "if (results[0]?.meta.changes !== 1) return null;"] },
    tests: [
      { path: "test/unit/frontend-submission-draft-data.test.ts", tokens: ["re-reads a journaled update before repeating it and recreates a draft the server dropped", "distinguishes a matching record from a record for another destination"] },
      { path: "test/worker/submissions.test.ts", tokens: ["keeps a member's draft private, updatable, and listed by its own status"] },
    ],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets/from-url", strategy: "idempotency_key",
    source: { path: "src/assets/service.ts", symbol: "AssetService.createFromUrl", tokens: ["const replay = await this.repository.findByIdempotency(ownerId, idempotencyKey);", "if (replay) return replay;"] },
    tests: [
      { path: "test/unit/frontend-asset-url-alternative.test.tsx", tokens: ["journals the URL intent before the POST and reads an unknown outcome back by the same key", "/api/assets/resume"] },
      { path: "test/worker/m2-assets.test.ts", tokens: ["replays an idempotent upload and hides another member's asset"] },
    ],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets/:id/alternative", strategy: "idempotency_key",
    source: { path: "src/routes/member.ts", symbol: "routeMemberApi", tokens: ["await services.assets.assertAlternativeAllowed(member.memberId, decodePathId(assetAlternative[1]!));", "idempotencyKey: request.headers.get"] },
    tests: [
      { path: "test/worker/m2-assets.test.ts", tokens: ["lets the failed-parse owner submit bounded Markdown as a reviewable alternative", "rejects alternatives while parsing or after a successful parse"] },
      { path: "test/unit/frontend-asset-url-alternative.test.tsx", tokens: ["posts the snapshot URL and the alternative payload with their idempotency keys"] },
    ],
  },
  {
    capabilityId: "workbench-admin-assets", operation: "POST /api/admin/assets/orphans/reclaim", strategy: "idempotency_key",
    source: { path: "src/operations/receipts.ts", symbol: "AdminOperationReceipts.record", tokens: ["ON CONFLICT(kind, operation_id) DO NOTHING", "Operation ID was already used for a different request", "prepareChangedRowAudit"] },
    tests: [
      { path: "test/worker/m2-assets.test.ts", tokens: ["requires the confirmed object count and replays one recorded reclamation", "SELECT COUNT(*) AS total FROM admin_operation_receipts WHERE kind = 'asset.orphans.reclaim'"] },
      { path: "test/unit/frontend-admin-asset-hygiene.test.tsx", tokens: ["reports each object's outcome and retries an unknown outcome as the same operation"] },
    ],
  },
  {
    capabilityId: "workbench-admin-submission-detail", operation: "POST /api/admin/reparse-jobs/:id/publish", strategy: "idempotency_key",
    source: { path: "src/publication/service.ts", symbol: "PublicationService.resumeIntent", tokens: ["const recorded = await this.repository.findDecisionReceipt(intent.submissionId, operation.operationId);", "replayRecordedReceipt(recorded, intent.submissionId, operation)", "review.publish"] },
    tests: [
      { path: "test/worker/admin-review-decisions.test.ts", tokens: ["replays one publish decision from the queue and the detail surface and reflects it in the queue", "review_decision_receipts WHERE submission_id = ? AND kind = 'review.publish'"] },
      { path: "test/unit/frontend-admin-reparse.test.tsx", tokens: ["publishes under one operation number, mounts the chunk report, and replays the same number on retry"] },
    ],
  },
  {
    capabilityId: "workbench-admin-submission-detail", operation: "POST /api/admin/source-versions/:id/reparse", strategy: "idempotency_key",
    source: { path: "src/sources/reparse-service.ts", symbol: "SourceReparseService.create", tokens: ["const sourceFingerprint = await sourceReparseFingerprint(snapshot.sourceVersion);", "const existing = await this.repository.findJobByFingerprint(snapshot.sourceVersion.sourceId, sourceFingerprint);", "if (existing) return existing;"] },
    tests: [
      { path: "test/unit/source-reparse-service.test.ts", tokens: ["creates an idempotent queued job without changing a published revision"] },
      { path: "test/worker/m2-reparse.test.ts", tokens: ["stores bounded reparse jobs while preserving immutable source_versions"] },
    ],
  },
  {
    capabilityId: "workbench-admin-submission-detail", operation: "POST /api/admin/reparse-jobs/:id/promote", strategy: "idempotency_key",
    source: { path: "src/sources/reparse-service.ts", symbol: "SourceReparseService.promote", tokens: ["const existing = await this.repository.findPromotion(job.id);", "if (existing) return existing;", "const replay = await this.repository.findPromotion(job.id);"] },
    tests: [
      { path: "test/worker/m2-reparse.test.ts", tokens: ["exposes an admin reparse vertical slice without replacing the published source version", "expect(replayPromotion.status).toBe(201);"] },
      { path: "test/unit/source-reparse-service.test.ts", tokens: ["materializes an indexed candidate once without changing the original revision"] },
    ],
  },
  {
    capabilityId: "workbench-admin-recycle-bin", operation: "POST /api/admin/knowledge/:id/restore", strategy: "idempotency_key",
    source: { path: "src/publication/repository.ts", symbol: "PublicationRepository.recordLifecycleReceipt", tokens: ["INSERT INTO knowledge_lifecycle_operation_receipts (", "ON CONFLICT(knowledge_item_id, operation_id) DO NOTHING", "if (receipt.requestHash !== operation.requestHash) {"] },
    tests: [{ path: "test/worker/admin-knowledge-lifecycle.test.ts", tokens: ["replays one trash and one restore from their recorded operations and audits each transition once"] }],
  },
  {
    capabilityId: "workbench-admin-recycle-bin", operation: "POST /api/admin/knowledge/:id/purge", strategy: "idempotency_key",
    source: { path: "src/publication/repository.ts", symbol: "PublicationRepository.recordLifecycleReceipt", tokens: ["INSERT INTO knowledge_lifecycle_operation_receipts (", "ON CONFLICT(knowledge_item_id, operation_id) DO NOTHING", "if (receipt.requestHash !== operation.requestHash) {"] },
    tests: [{ path: "test/worker/admin-knowledge-lifecycle.test.ts", tokens: ["refuses a purge without the typed confirmation and replays a confirmed purge with its recorded count", "states the real retention window for trashed knowledge"] }],
  },
  {
    capabilityId: "workbench-admin-knowledge-item", operation: "POST /api/admin/knowledge/:id/trash", strategy: "idempotency_key",
    source: { path: "src/publication/repository.ts", symbol: "PublicationRepository.recordLifecycleReceipt", tokens: ["INSERT INTO knowledge_lifecycle_operation_receipts (", "ON CONFLICT(knowledge_item_id, operation_id) DO NOTHING", "if (receipt.requestHash !== operation.requestHash) {"] },
    tests: [{ path: "test/worker/admin-knowledge-lifecycle.test.ts", tokens: ["replays one trash and one restore from their recorded operations and audits each transition once"] }],
  },
  {
    capabilityId: "workbench-admin-knowledge-item", operation: "POST /api/admin/knowledge/:id/rollback", strategy: "idempotency_key",
    source: { path: "src/publication/repository.ts", symbol: "PublicationRepository.recordLifecycleReceipt", tokens: ["INSERT INTO knowledge_lifecycle_operation_receipts (", "ON CONFLICT(knowledge_item_id, operation_id) DO NOTHING", "if (receipt.requestHash !== operation.requestHash) {"] },
    tests: [{ path: "test/worker/admin-knowledge-lifecycle.test.ts", tokens: ["rolls back to a named previous revision, states which it replaced, and replays once"] }],
  },
  {
    capabilityId: "workbench-admin-knowledge-trash", operation: "POST /api/admin/knowledge/:id/restore", strategy: "idempotency_key",
    source: { path: "src/publication/repository.ts", symbol: "PublicationRepository.recordLifecycleReceipt", tokens: ["INSERT INTO knowledge_lifecycle_operation_receipts (", "ON CONFLICT(knowledge_item_id, operation_id) DO NOTHING", "if (receipt.requestHash !== operation.requestHash) {"] },
    tests: [{ path: "test/worker/admin-knowledge-lifecycle.test.ts", tokens: ["replays one trash and one restore from their recorded operations and audits each transition once"] }],
  },
  {
    capabilityId: "workbench-admin-knowledge-trash", operation: "POST /api/admin/knowledge/:id/purge", strategy: "idempotency_key",
    source: { path: "src/publication/repository.ts", symbol: "PublicationRepository.recordLifecycleReceipt", tokens: ["INSERT INTO knowledge_lifecycle_operation_receipts (", "ON CONFLICT(knowledge_item_id, operation_id) DO NOTHING", "if (receipt.requestHash !== operation.requestHash) {"] },
    tests: [{ path: "test/worker/admin-knowledge-lifecycle.test.ts", tokens: ["refuses a purge without the typed confirmation and replays a confirmed purge with its recorded count"] }],
  },
  {
    capabilityId: "workbench-submit", operation: "DELETE /api/submissions/drafts/:id", strategy: "convergent_delete",
    source: { path: "src/submissions/repository.ts", symbol: "SubmissionsRepository.discardDraft", tokens: ["DELETE FROM submissions WHERE id = ? AND submitter_id = ? AND status = 'draft'", "INSERT INTO submission_draft_discard_receipts (member_id, draft_id, discarded_at)", "ON CONFLICT(member_id, draft_id) DO UPDATE SET discarded_at = excluded.discarded_at", "results[2]?.results[0] === undefined"] },
    tests: [
      { path: "test/worker/submissions.test.ts", tokens: ["discards an owned draft, converges on a repeat, and never touches another owner's row"] },
      { path: "test/worker/m1-api.test.ts", tokens: ["discards an owned draft through DELETE and converges on a repeat", "keeps rejecting an empty draft body instead of reading it as a discard"] },
      { path: "test/unit/frontend-submit-pages.test.tsx", tokens: ["offers a confirmed discard beside the draft state and never claims an unconfirmed one"] },
    ],
  },
] as const satisfies readonly WorkbenchMutationStrategyBinding[]);

export const WORKBENCH_SOURCE_SIDE_EFFECT_BINDINGS = Object.freeze([
  {
    capabilityId: "workbench-review",
    operation: "GET /api/workbench/review#persist-snapshot",
    apiPath: "/api/workbench/review",
    source: { path: "src/workbench-review/service.ts", symbol: "WorkbenchReviewService.get", tokens: ["this.repository.refresh(memberId, period, range, now)"] },
    tests: [{ path: "test/worker/workbench-review.test.ts", tokens: ["round-trips real %s D1 snapshots without leaking either member", "SELECT member_id FROM workbench_review_snapshots", "rejects member overrides, unknown/duplicate period parameters and anonymous reads"] }],
  },
  {
    capabilityId: "workbench-knowledge-reader",
    operation: "GET /api/knowledge/:id#record-visit",
    apiPath: "/api/knowledge/:id",
    source: { path: "src/routes/library.ts", symbol: "routeLibraryApi", tokens: ["services.library.detail(scope, knowledgeItemId)", "services.recentVisits.record(scope, knowledgeItemId, visitIdentity)"] },
    tests: [{ path: "test/worker/recent-visits.test.ts", tokens: ["counts one reading per explicit visit identity, deduplicates a retry, and isolates members", "visitCount: 2"] }],
  },
] as const satisfies readonly WorkbenchSourceSideEffectBinding[]);

export const WORKBENCH_OPERATION_ROOTS = Object.freeze([
  { capabilityId: "workbench-graph", path: "frontend/pages/graph-page.tsx", symbol: "GraphRoute" },
  { capabilityId: "workbench-graph", path: "frontend/pages/graph-page.tsx", symbol: "GraphPage" },
  { capabilityId: "workbench-project-timeline", path: "frontend/app.tsx", symbol: "ProjectTimelineRoute" },
  { capabilityId: "workbench-inbox", path: "frontend/app.tsx", symbol: "InboxRoute" },
  { capabilityId: "workbench-goals", path: "frontend/app.tsx", symbol: "GoalsRoute" },
  { capabilityId: "workbench-projects", path: "frontend/app.tsx", symbol: "ProjectsRoute" },
  { capabilityId: "workbench-calendar", path: "frontend/app.tsx", symbol: "CalendarRoute" },
  { capabilityId: "workbench-today", path: "frontend/app.tsx", symbol: "TodayRoute" },
  { capabilityId: "workbench-focus", path: "frontend/app.tsx", symbol: "FocusRoute" },
  { capabilityId: "workbench-review", path: "frontend/app.tsx", symbol: "WorkbenchReviewRoute" },
  { capabilityId: "workbench-home", path: "frontend/app.tsx", symbol: "HomeRoute" },
  { capabilityId: "workbench-submit", path: "frontend/app.tsx", symbol: "SubmitRoute" },
  { capabilityId: "workbench-knowledge", path: "frontend/app.tsx", symbol: "KnowledgeRoute" },
  { capabilityId: "workbench-search", path: "frontend/app.tsx", symbol: "SearchRoute" },
  { capabilityId: "workbench-search", path: "frontend/lib/search-data.ts", symbol: "*" },
  { capabilityId: "workbench-agent", path: "frontend/app.tsx", symbol: "AgentRoute" },
  { capabilityId: "workbench-agent", path: "frontend/app.tsx", symbol: "AgentConversationRoute" },
  { capabilityId: "workbench-agent", path: "frontend/lib/agent-data.ts", symbol: "*" },
  { capabilityId: "workbench-agent", path: "frontend/lib/agent-turn-intent.ts", symbol: "*" },
  { capabilityId: "workbench-agent", path: "frontend/components/agent/agent-feedback.tsx", symbol: "AgentFeedback" },
  { capabilityId: "workbench-agent", path: "frontend/components/agent/agent-history-list.tsx", symbol: "AgentHistoryList" },
  { capabilityId: "workbench-my-submissions", path: "frontend/app.tsx", symbol: "MySubmissionsRoute" },
  { capabilityId: "workbench-tasks", path: "frontend/app.tsx", symbol: "TasksRoute" },
  { capabilityId: "workbench-tasks", path: "frontend/lib/tasks-data.ts", symbol: "*" },
  { capabilityId: "workbench-tasks", path: "frontend/pages/tasks/task-editor.tsx", symbol: "TaskEditor" },
  { capabilityId: "workbench-boards", path: "frontend/app.tsx", symbol: "BoardsRoute" },
  { capabilityId: "workbench-environments", path: "frontend/features/environments/environments-page.tsx", symbol: "EnvironmentsPage" },
  { capabilityId: "workbench-environments", path: "frontend/features/environments/environment-manager.ts", symbol: "getEnvironmentManager" },
  { capabilityId: "workbench-settings", path: "frontend/pages/settings-page.tsx", symbol: "SettingsPage" },
  { capabilityId: "workbench-admin", path: "frontend/pages/admin/admin-dashboard-route.tsx", symbol: "AdminDashboardRoute" },
  { capabilityId: "workbench-admin-submissions", path: "frontend/app.tsx", symbol: "ReviewQueueRoute" },
  { capabilityId: "workbench-admin-duplicates", path: "frontend/app.tsx", symbol: "AdminDuplicateRoute" },
  { capabilityId: "workbench-admin-duplicates", path: "frontend/lib/admin-duplicates-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-assets", path: "frontend/app.tsx", symbol: "AdminAssetsRoute" },
  { capabilityId: "workbench-admin-assets", path: "frontend/lib/admin-assets-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-members", path: "frontend/app.tsx", symbol: "AdminMembersRoute" },
  { capabilityId: "workbench-admin-members", path: "frontend/lib/admin-members-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-roles", path: "frontend/app.tsx", symbol: "AdminRolesRoute" },
  { capabilityId: "workbench-admin-roles", path: "frontend/lib/admin-roles-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-menus", path: "frontend/app.tsx", symbol: "AdminMenusRoute" },
  { capabilityId: "workbench-admin-menus", path: "frontend/lib/admin-menus-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-spaces", path: "frontend/app.tsx", symbol: "AdminSpacesRoute" },
  { capabilityId: "workbench-admin-spaces", path: "frontend/lib/admin-spaces-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-audit", path: "frontend/app.tsx", symbol: "AdminAuditRoute" },
  { capabilityId: "workbench-admin-analytics", path: "frontend/app.tsx", symbol: "AdminAnalyticsRoute" },
  { capabilityId: "workbench-notifications", path: "frontend/app.tsx", symbol: "NotificationsRoute" },
  { capabilityId: "workbench-notifications", path: "frontend/lib/notifications-data.ts", symbol: "*" },
  { capabilityId: "workbench-messages", path: "frontend/app.tsx", symbol: "MessagesRoute" },
  { capabilityId: "workbench-knowledge-reader", path: "frontend/app.tsx", symbol: "KnowledgeReaderRoute" },
  { capabilityId: "workbench-knowledge-reader", path: "frontend/app.tsx", symbol: "KnowledgeReaderSession" },
  { capabilityId: "workbench-knowledge-reader", path: "frontend/lib/graph-evidence.ts", symbol: "loadGraphCitation" },
  { capabilityId: "workbench-knowledge-reader", path: "frontend/lib/knowledge-reader-data.ts", symbol: "*" },
  { capabilityId: "workbench-message-thread", path: "frontend/app.tsx", symbol: "DiscussionThreadRoute" },
  { capabilityId: "workbench-admin-submission-detail", path: "frontend/pages/admin/review-detail-route.tsx", symbol: "ReviewDetailRoute" },
  { capabilityId: "workbench-admin-role-new", path: "frontend/app.tsx", symbol: "AdminRoleNewRoute" },
  { capabilityId: "workbench-admin-role-new", path: "frontend/pages/admin/create-role-page.tsx", symbol: "AdminRoleCreatePage" },
  { capabilityId: "workbench-admin-role-detail", path: "frontend/app.tsx", symbol: "AdminRoleDetailRoute" },
  { capabilityId: "workbench-admin-role-detail", path: "frontend/pages/admin/role-detail-page.tsx", symbol: "AdminRoleDetailPage" },
  { capabilityId: "workbench-admin-recycle-bin", path: "frontend/pages/admin/recycle-bin-route.tsx", symbol: "RecycleBinRoute" },
  { capabilityId: "workbench-admin-knowledge-trash", path: "frontend/pages/admin/recycle-bin-route.tsx", symbol: "RecycleBinRoute" },
  { capabilityId: "workbench-admin-knowledge-item", path: "frontend/pages/admin/knowledge-item-route.tsx", symbol: "AdminKnowledgeItemRoute" },
] as const satisfies readonly WorkbenchOperationRoot[]);

const INITIAL_DIMENSIONS = {
  entry: "proven",
  journey: "gap",
  api: "gap",
  persistence: "gap",
  isolation: "gap",
  query_or_idempotency: "gap",
  states: "gap",
  accessibility: "gap",
  evidence: "gap",
} as const satisfies WorkbenchMaturityCapability["dimensions"];

export const WORKBENCH_MATURITY_CAPABILITIES = Object.freeze([
  {
    id: "workbench-graph", routeId: "graph", pathname: "/graph", requiredRole: "contributor",
    journey: "Explore authorized knowledge and private work relationships, inspect evidence and explicitly promote selected nodes into work.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/graph-page.tsx", "frontend/lib/graph-data.ts", "frontend/lib/graph-actions.ts"], backendEvidence: ["src/routes/graph.ts", "src/graph/service.ts", "src/graph/repository.ts"], testEvidence: ["test/unit/frontend-workbench-maturity-routes.test.tsx", "test/unit/frontend-graph-a11y.test.tsx", "test/worker/graph.test.ts", "test/worker/graph-actions.test.ts"], ledgerIds: ["WB-GR-001"], gaps: ["Graph entry, read states, keyboard navigation and bounded member-scoped projections have local coverage. Cursor continuation, cross-linked citation edge cases and complete action replay journeys remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-project-timeline", routeId: "project-timeline", pathname: "/projects/:id/timeline", parentRouteId: "projects", routePattern: "/^\\/projects\\/[A-Za-z0-9_-]{1,128}\\/timeline$/u", requiredRole: "contributor",
    journey: "Open an owned project timeline, record decisions or actions and update their status.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/project-timeline-page.tsx", "frontend/lib/projects-data.ts", "frontend/components/timeline-create-form.tsx", "frontend/components/timeline-item-editor.tsx", "frontend/lib/timeline-create-intent.ts", "frontend/lib/planning-write-recovery.ts", "frontend/components/planning-write-recovery.tsx"], backendEvidence: ["src/planning-version.ts", "src/routes/project-timeline.ts", "src/project-timeline/service.ts", "src/project-timeline/repository.ts", "src/routes/projects.ts"], testEvidence: ["test/worker/project-timeline-edit.test.ts", "test/unit/frontend-timeline-edit-data.test.ts", "test/unit/frontend-timeline-edit.test.tsx", "test/worker/project-timeline-numbered-pages.test.ts", "test/unit/frontend-timeline-numbered-pages.test.tsx", "test/unit/frontend-timeline-numbered-data.test.ts", "test/unit/frontend-timeline-create-storage.test.ts", "test/unit/frontend-timeline-reload.test.tsx", "test/unit/frontend-planning-write-storage.test.ts", "test/unit/frontend-project-timeline-conflicts.test.tsx", "test/worker/project-timeline-conditional-writes.test.ts", "test/unit/frontend-project-timeline-recovery.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/unit/frontend-project-timeline-page.test.tsx", "test/unit/project-timeline-service.test.ts", "test/worker/project-timeline.test.ts"], ledgerIds: ["PRJ-001"], gaps: ["Private timeline read states are locally probed. Numbered pagination, project-switch stale guards, complete editing, stable create intent and conditional status convergence remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-inbox", routeId: "inbox", pathname: "/inbox", requiredRole: "contributor",
    journey: "Capture private material, archive it or promote it into an owned task.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/tasks/task-editor.tsx", "frontend/app.tsx", "frontend/pages/inbox-page.tsx", "frontend/lib/inbox-data.ts", "frontend/components/inbox-create-form.tsx", "frontend/lib/inbox-create-intent.ts", "frontend/lib/planning-write-recovery.ts", "frontend/components/planning-write-recovery.tsx"], backendEvidence: ["src/inbox/task-promotion.ts", "src/planning-version.ts", "src/routes/inbox.ts", "src/inbox/service.ts", "src/inbox/repository.ts"], testEvidence: ["test/worker/inbox-task-promotion.test.ts", "test/unit/frontend-inbox-promotion-data.test.ts", "test/unit/frontend-inbox-promotion-recovery.test.tsx", "test/worker/inbox-conditional-writes.test.ts", "test/unit/frontend-inbox-status-data.test.ts", "test/unit/frontend-inbox-status-recovery.test.tsx", "test/unit/frontend-inbox-create.test.tsx", "test/unit/frontend-inbox-create-intent.test.ts", "test/unit/frontend-inbox-create-data.test.ts", "test/unit/frontend-inbox-numbered-pages.test.tsx", "test/unit/frontend-inbox-numbered-data.test.ts", "test/worker/inbox-numbered-pages.test.ts", "test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/inbox.test.ts"], ledgerIds: ["INB-001"], gaps: ["Private entry, read recovery, empty state and cursor continuation are locally tested. Numbered pagination, stable frontend create intent, archive/promotion retry convergence and stale-response protection remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-goals", routeId: "goals", pathname: "/goals", requiredRole: "contributor",
    journey: "Create private goals and maintain their status and progress.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/components/goal-tasks-editor.tsx", "frontend/lib/goal-tasks-data.ts", "frontend/app.tsx", "frontend/pages/goals-page.tsx", "frontend/lib/goals-data.ts", "frontend/components/planning-create-form.tsx", "frontend/lib/planning-create-intent.ts"], backendEvidence: ["src/routes/goal-tasks.ts", "src/goal-tasks/service.ts", "src/goal-tasks/repository.ts", "src/planning-version.ts", "src/routes/goals.ts", "src/goals/service.ts", "src/goals/repository.ts"], testEvidence: ["test/worker/goal-tasks.test.ts", "test/unit/frontend-goal-tasks.test.tsx", "test/unit/frontend-goal-tasks-data.test.ts", "test/unit/frontend-planning-conflicts.test.tsx", "test/worker/planning-conditional-writes.test.ts", "test/unit/frontend-planning-numbered-pages.test.tsx", "test/worker/planning-numbered-pages.test.ts", "test/unit/frontend-planning-create-recovery.test.tsx", "test/unit/frontend-planning-create-storage.test.ts", "test/unit/frontend-planning-create-reload.test.tsx", "test/unit/frontend-planning-write-storage.test.ts", "test/unit/frontend-planning-write-recovery.test.tsx", "test/unit/frontend-planning-write-receipts.test.ts", "test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/goals.test.ts"], ledgerIds: ["GL-001"], gaps: ["Private entry, read recovery, empty state and cursor continuation are locally tested. Numbered pagination, editing and relationship journeys, stable create intent, conditional progress/status writes and stale-response protection remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-projects", routeId: "projects", pathname: "/projects", requiredRole: "contributor",
    journey: "Create private projects and inspect their goal/task summaries.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/components/project-relations-editor.tsx", "frontend/lib/project-relations-data.ts", "frontend/app.tsx", "frontend/pages/projects-page.tsx", "frontend/lib/projects-data.ts", "frontend/components/planning-create-form.tsx", "frontend/lib/planning-create-intent.ts"], backendEvidence: ["src/planning-version.ts", "src/routes/projects.ts", "src/projects/service.ts", "src/projects/repository.ts"], testEvidence: ["test/worker/project-relation-conditional-writes.test.ts", "test/unit/frontend-project-relations.test.tsx", "test/unit/frontend-project-relations-reload.test.tsx", "test/unit/frontend-project-relations-data.test.ts", "test/worker/project-relations.test.ts", "test/unit/frontend-planning-conflicts.test.tsx", "test/worker/planning-conditional-writes.test.ts", "test/unit/frontend-planning-numbered-pages.test.tsx", "test/worker/planning-numbered-pages.test.ts", "test/unit/frontend-planning-create-recovery.test.tsx", "test/unit/frontend-planning-create-storage.test.ts", "test/unit/frontend-planning-create-reload.test.tsx", "test/unit/frontend-planning-write-storage.test.ts", "test/unit/frontend-planning-write-recovery.test.tsx", "test/unit/frontend-planning-write-receipts.test.ts", "test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/projects.test.ts", "test/unit/frontend-project-summary-recovery.test.tsx"], ledgerIds: ["PRJ-001"], gaps: ["Private entry, read recovery, empty state and cursor continuation are locally tested. Numbered pagination, relationship editing, per-project summary recovery, stable create intent, status concurrency and stale-response protection remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-calendar", routeId: "calendar", pathname: "/calendar", requiredRole: "contributor",
    journey: "Schedule private events and cancel them within the calendar window.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/calendar-page.tsx", "frontend/components/calendar-range-filter.tsx", "frontend/components/calendar-create-form.tsx", "frontend/lib/calendar-create-intent.ts", "frontend/components/planning-write-recovery.tsx", "frontend/lib/calendar-data.ts", "frontend/lib/calendar-query.ts"], backendEvidence: ["src/planning-version.ts", "src/routes/calendar.ts", "src/calendar/service.ts", "src/calendar/repository.ts"], testEvidence: ["test/worker/calendar-write-journeys.test.ts", "test/unit/frontend-calendar-create-intent.test.ts", "test/unit/frontend-calendar-write-data.test.ts", "test/unit/frontend-calendar-write-journeys.test.tsx", "test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/calendar.test.ts", "test/worker/calendar-numbered-pages.test.ts", "test/unit/frontend-calendar-numbered-data.test.ts", "test/unit/frontend-calendar-numbered-pages.test.tsx", "scripts/calendar-query.test.mjs"], ledgerIds: ["CAL-001"], gaps: ["Private numbered range reads, URL recovery, local-time/DST boundaries, member-scoped stable create intent, conditional cancellation and read-only write recovery are locally tested. Editing UI and cross-module write journeys remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-today", routeId: "today", pathname: "/today", requiredRole: "contributor",
    journey: "Review today's owned tasks, inbox, projects and events and continue working.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/components/today-target-detail.tsx", "frontend/app.tsx", "frontend/pages/today-page.tsx", "frontend/lib/today-data.ts"], backendEvidence: ["src/routes/tasks.ts", "src/routes/calendar.ts", "src/routes/today.ts", "src/today/service.ts"], testEvidence: ["test/unit/frontend-today-data.test.ts", "test/unit/today-service.test.ts", "test/unit/frontend-today-targets.test.tsx", "test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/today.test.ts"], ledgerIds: ["TOD-001"], gaps: ["Private entry, bounded-count explanations, UTC calendar continuation, reauthorized task/event details, two-member target isolation, strict snapshot validation and whole-snapshot failure/read-only recovery are locally tested. Complete cross-day aggregation proof remains incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-focus", routeId: "focus", pathname: "/focus", requiredRole: "contributor",
    journey: "Start focus on an owned task, pause, resume and finish or abandon the session.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/components/focus-task-picker.tsx", "frontend/app.tsx", "frontend/pages/focus-page.tsx", "frontend/lib/focus-data.ts", "frontend/lib/focus-create-intent.ts", "frontend/lib/focus-transition-intent.ts"], backendEvidence: ["src/routes/focus.ts", "src/focus/service.ts", "src/focus/repository.ts", "src/routes/tasks.ts"], testEvidence: ["test/unit/frontend-focus-transition-intent.test.ts", "test/unit/frontend-focus-create-intent.test.ts", "test/unit/frontend-focus-data.test.ts", "test/unit/focus-service.test.ts", "test/unit/frontend-focus-task-selection.test.tsx", "test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/focus.test.ts", "test/worker/focus-calendar-repair-migration.test.ts"], ledgerIds: ["FOC-001"], gaps: ["Private selection, lifecycle, server snapshot CAS and elapsed display have local evidence. Focus-page starts persist immutable member-scoped tab intent before POST; unknown starts recover by owned receipt GET or explicit same-intent retry, with storage and authorization failure guards. Transitions persist member-scoped tab intent before POST and require the observed revision. Refresh reconciles the exact owned session, including terminal outcomes; unchanged results remain locked, acknowledged results only read, and explicit retries recheck the receipt before replaying the original version. Original normalized start title and duration are persisted independently of calendar edits, checked on replay and insert races, and matched by frontend POST/GET receipts. Legacy rows without original payload fail closed on replay. New starts and terminal transitions atomically persist their owned calendar block in a D1 batch; rollback, insert losers, terminal CAS losers and monotonic calendar revisions are locally tested. Calendar-side cancellation or task detachment cannot bypass focus lifecycle. A forward migration repairs only unique same-member/task terminal calendar links, preserving ambiguous and orphan rows; independent new calendar keys prevent historical orphans from blocking start retries. Tab journals survive refresh/navigation, not tab closure; active/paused server state can be reread, but unknown terminal intent is not recovered after closing the tab. Ambiguous history, release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-review", routeId: "review", pathname: "/review", requiredRole: "contributor",
    journey: "Inspect private daily or weekly review snapshots and continue from their source work.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/workbench-review-page.tsx", "frontend/lib/workbench-review-data.ts"], backendEvidence: ["src/routes/workbench-review.ts", "src/workbench-review/service.ts", "src/workbench-review/repository.ts"], testEvidence: ["test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/workbench-review.test.ts", "test/unit/frontend-review-period.test.tsx", "test/unit/frontend-workbench-review-data.test.ts", "test/unit/frontend-review-targets.test.tsx", "test/unit/workbench-review-service.test.ts", "tools/maintenance/parallel.test.ts"], ledgerIds: ["REV-001"], gaps: ["Private entry, period changes, explicit refresh, read recovery, deep receipts and reauthorized details have local App and two-member D1 evidence. UTC calendar days and Monday-start ISO weeks filter before sampling; task totals cover all qualifying current rows. Completion, update, due, capture and focus end timestamps define category membership. Focus attributes whole completed or abandoned sessions by end time, not prorated intervals. One SQL statement aggregates and upserts a member/period key on every read with a monotonic observation cutoff and revision, statement-owned receipts, concurrent identity convergence and rollback on failure. Samples are bounded to 20 and display 10; view-all links open current category lists, not period reports. These are current-state projections, not immutable historical audits. Maintenance tracking is locally tested; release and real-identity native-browser acceptance remain unproven."],
  },
  {
    id: "workbench-home", routeId: "home", pathname: "/", requiredRole: "contributor",
    journey: "Open the workbench and review the current capability summary.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/home-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/workspace-dashboard.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["WB-001", "WB-002"], gaps: ["The current server-navigation entry and a response-owned recent-item ready marker are fixture-proven. Home renders ready while recent data is pending, collapses recent failure to empty, hard-codes zero metrics, and has no retryable route error. The recent API is cursor-paged, but Home exposes no continuation control. Release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-submit", routeId: "submit", pathname: "/submit", requiredRole: "contributor",
    journey: "Submit knowledge for parsing and later review.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/submit-page.tsx", "frontend/app.tsx", "frontend/components/assets/asset-availability-panel.tsx", "frontend/lib/asset-availability.ts", "frontend/components/assets/asset-upload-panel.tsx", "frontend/lib/asset-upload-workflow.ts", "frontend/lib/asset-upload-data.ts", "frontend/lib/asset-upload-intent.ts", "frontend/lib/asset-upload-transport.ts", "frontend/lib/submission-draft-data.ts", "frontend/lib/submission-resubmit-data.ts", "frontend/lib/submission-comments-data.ts", "frontend/lib/submission-targets-data.ts"], backendEvidence: ["src/routes/member.ts", "src/assets/service.ts", "src/submissions/service.ts"], testEvidence: ["test/unit/frontend-submit-pages.test.tsx", "test/worker/submissions.test.ts", "test/worker/m1-api.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/unit/frontend-asset-availability.test.ts", "test/unit/frontend-submission-draft-data.test.ts", "test/unit/frontend-submission-resubmit-data.test.ts", "test/unit/frontend-submission-comments-data.test.ts", "test/unit/frontend-submission-targets.test.tsx", "test/unit/frontend-submission-loop-routes.test.tsx", "test/unit/frontend-asset-availability-route.test.tsx", "test/unit/frontend-asset-workflow.test.ts", "test/unit/frontend-asset-transport.test.ts", "test/unit/frontend-asset-url-alternative.test.tsx", "test/unit/frontend-asset-upload-route.test.tsx", "test/worker/m2-assets.test.ts"], ledgerIds: ["KB-001"], gaps: ["The current server-navigation entry, idle form, pending, retry-by-resubmit error, and success/empty transition are runtime-probed. The member submission loop adds draft, resubmit, URL-import and alternative-file surfaces: a draft write is journalled before it leaves and an unknown outcome is re-read by draft id (or the member's newest draft row) before it is ever repeated, and resubmit reuses one stable createIdempotencyKey across retries and a reload. A member tag picker is deliberately not wired: the submission, draft and resubmit payloads accept no tagIds (tags are attached at publication), so the control would render a field the write path drops. Discard is a DELETE because the API still rejects an empty or incomplete draft body rather than reading it as a discard intent (regression-tested in test/worker/m1-api.test.ts), and the member-side draft write itself remains a gap: it carries no server-side key, so only the client journal plus a newest-draft re-read converges a create or update. Source-level persistence and submitter-scoped idempotency exist, but complete browser, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-knowledge", routeId: "knowledge", pathname: "/knowledge", requiredRole: "contributor",
    journey: "Browse knowledge and open an authorized knowledge item.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/knowledge-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/library.ts", "src/library/repository.ts"], testEvidence: ["test/unit/frontend-user-read-pages.test.tsx", "test/worker/m1-library.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-005", "KB-006"], gaps: ["Current server-navigation entry plus primary-list loading, empty, retryable error, and response-owned ready marker are runtime-probed. Auxiliary recent, favorite, note, activity, and review failures remain collapsed or independent; complete browser/release evidence remains a gap."],
  },
  {
    id: "workbench-search", routeId: "search", pathname: "/search", requiredRole: "contributor",
    journey: "Search authorized knowledge and inspect result evidence.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/search-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/library.ts", "src/knowledge/search.ts"], testEvidence: ["test/unit/search.test.ts", "test/worker/m1-library.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-007"], gaps: ["Current server-navigation entry plus queried loading, empty, retryable error, and response-owned ready marker are runtime-probed. Degraded/filter restoration, result-open, release, and signed-browser journeys remain incomplete."],
  },
  {
    id: "workbench-agent", routeId: "agent", pathname: "/agent", requiredRole: "contributor",
    journey: "Ask the bounded knowledge Agent and inspect its cited response.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/agent-page.tsx", "frontend/app.tsx", "frontend/components/agent/agent-feedback.tsx", "frontend/components/agent/agent-history-list.tsx", "frontend/lib/agent-data.ts", "frontend/lib/agent-turn-intent.ts"], backendEvidence: ["src/routes/agent.ts", "src/agent/session-do.ts", "src/routes/library.ts", "src/chat/conversation-service.ts", "src/chat/repository.ts", "src/chat/feedback-service.ts", "src/chat/feedback-repository.ts", "src/chat/turn-receipts.ts"], testEvidence: ["test/unit/agent-tool-runner.test.ts", "test/worker/agent-session.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/unit/frontend-agent-cancellation-route.test.tsx", "test/unit/frontend-agent-data.test.ts", "test/unit/frontend-agent-turn-intent.test.ts", "test/worker/m1-api.test.ts"], ledgerIds: ["KB-009"], gaps: ["Current server-navigation entry, initial form/answer, and post-submit loading and retryable error are runtime-probed. There is no explicit empty-answer state; cited completion, cancellation recovery, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-my-submissions", routeId: "my-submissions", pathname: "/my-submissions", requiredRole: "contributor",
    journey: "Review the member's submissions, drafts, and statuses.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/my-submissions-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/frontend-user-read-pages.test.tsx", "test/worker/submissions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-002"], gaps: ["Current server-navigation entry plus loading, empty, retryable error, and response-owned ready marker are runtime-probed. Resubmission reuses the same submission idempotency key across retries and a reload, and the loop's draft, comment and target reads are wired; the member-side comment POST is deliberately not wired because no member operation-receipt endpoint exists (receipts exist only under /api/admin), so a retried comment could duplicate and the member view stays read-only. Complete status recovery remains incomplete; release and signed-browser evidence remain absent."],
  },
  {
    id: "workbench-tasks", routeId: "tasks", pathname: "/tasks", requiredRole: "contributor",
    journey: "Create, filter, update, and remove private workspace tasks.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/tasks/tasks-page.tsx", "frontend/pages/tasks/task-editor.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/tasks.ts", "src/tasks/service.ts"], testEvidence: ["test/unit/frontend-tasks-route.test.tsx", "test/unit/frontend-task-editor-route.test.tsx", "test/unit/frontend-tasks-data.test.ts", "test/worker/tasks.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["TSK-001", "TSK-002"], gaps: ["Current permitted/revoked server projections, forbidden direct route, and loading, empty, retryable error, and response-owned ready marker are runtime-probed. The detail update now requires the version the client read and deletion converges on a version-conditional tombstone receipt, both locally proven; the remaining child operations, release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-boards", routeId: "boards", pathname: "/boards", requiredRole: "contributor",
    journey: "View task status columns and move a task between them.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/boards/boards-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/tasks.ts", "src/tasks/service.ts"], testEvidence: ["test/unit/frontend-boards-route.test.tsx", "test/worker/tasks.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["BRD-001", "BRD-002"], gaps: ["Current server-navigation entry and exhaustive four-column loading, empty, retryable error, and response-owned ready fixtures are runtime-probed. Server conditional-write convergence, optimistic rollback and arrow-key movement are now locally proven; drag journeys, release and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-environments", routeId: "environments", pathname: "/environments", requiredRole: "contributor",
    journey: "Manage private environment metadata without claiming that a VM is running.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/features/environments/environments-page.tsx", "frontend/features/environments/environment-manager.ts"],
    backendEvidence: ["src/routes/environments.ts", "src/environments/service.ts", "src/environments/repository.ts"],
    testEvidence: ["scripts/browser-vm-environments-page.test.mjs", "test/worker/environments.test.ts"],
    ledgerIds: ["WB-ENVIRONMENTS"], gaps: ["Private environment metadata management, its numbered and versioned write receipts, and the page's explicit runtime-not-published state are locally implemented. The VM engine and images are deliberately out of scope by decision: the six pinned artifacts total roughly 66 MiB and the repository pins grant no redistribution permission, so shipping them would require a licence inventory and a signed release manifest. Release and real-identity acceptance of the metadata surface remain open."],
  },
  {
    id: "workbench-settings", routeId: "settings", pathname: "/settings", requiredRole: "contributor",
    journey: "Review account information and change supported workbench settings.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/settings-page.tsx", "frontend/components/shell/app-shell.tsx"], backendEvidence: ["src/identity/session.ts"], testEvidence: ["test/unit/settings-page.test.tsx", "test/unit/workspace-shell.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["WB-SETTINGS"], gaps: ["The account-menu entry and page-owned session email are runtime-probed. The page has no route-owned loading, empty, retryable error, persistence, or save-pending boundary; release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin", routeId: "admin", pathname: "/admin", requiredRole: "admin",
    journey: "Review administration summary metrics and enter a governance area.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/admin-dashboard-page.tsx", "frontend/pages/admin/admin-dashboard-route.tsx", "frontend/components/admin/maintenance-status-panel.tsx", "frontend/lib/admin-maintenance-data.ts", "frontend/app.tsx"], backendEvidence: ["src/routes/admin.ts", "src/maintenance/control.ts", "src/submissions/repository.ts", "src/assets/repository.ts", "src/members/repository.ts"], testEvidence: ["test/unit/frontend-admin-dashboard-route.test.tsx", "test/unit/frontend-admin-maintenance.test.tsx", "test/worker/admin-maintenance-control.test.ts", "test/worker/submissions.test.ts", "test/worker/m2-assets.test.ts", "test/worker/members.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-001"], gaps: ["Authorized list totals, independent loading/zero/error/retry, bounded reads and stale-result protection are runtime-probed. The maintenance surface deliberately renders read-only status, capacity, phase, epoch, window, active, records, limit, remaining and alert and names the two operations endpoints for the runbook instead of wiring controls: without a configured MAINTENANCE_CONTROL_TOKEN every control call answers 503 MAINTENANCE_CONTROL_UNAVAILABLE, so a button could only fail, and begin-drain/resume stay deliberately unreachable client writes. Cross-page mutation reconciliation, site-analytics date-range consistency, release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin-submissions", routeId: "admin-submissions", pathname: "/admin/submissions", requiredRole: "admin",
    journey: "Review submitted knowledge and make a publication decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/review-queue-page.tsx", "frontend/components/review/review-batch-owner.tsx", "frontend/lib/admin-batch-review-data.ts", "frontend/app.tsx"], backendEvidence: ["src/routes/admin-review.ts", "src/review/service.ts"], testEvidence: ["test/unit/frontend-moderation-pagination-routes.test.tsx", "test/unit/frontend-admin-review-data.test.ts", "test/unit/frontend-review-batch.test.tsx", "test/worker/m1-publication.test.ts", "test/worker/admin-knowledge-lifecycle.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"], gaps: ["Current admin server-navigation and queue-to-detail navigation, exact-query read retry without POST replay, 401/403 content clearing, synchronous in-flight locks and stale-navigation protection are locally tested. End-to-end decision completion across publication, indexing and notifications, server idempotency, release and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-duplicates", routeId: "admin-duplicates", pathname: "/admin/duplicates", requiredRole: "admin",
    journey: "Review duplicate candidates and apply a decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/duplicate-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/duplicates/service.ts"], testEvidence: ["test/unit/frontend-admin-duplicates.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-003"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned ready marker are runtime-probed. The initial error has no retry action; decision convergence, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-assets", routeId: "admin-assets", pathname: "/admin/assets", requiredRole: "admin",
    journey: "Review source assets, inspect previews, and retry failed parsing.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/asset-queue-page.tsx", "frontend/components/assets/asset-hygiene-panel.tsx", "frontend/lib/admin-asset-hygiene-data.ts", "frontend/app.tsx"], backendEvidence: ["src/assets/service.ts", "src/routes/admin.ts"], testEvidence: ["test/unit/frontend-admin-assets-data.test.ts", "test/unit/frontend-admin-asset-hygiene.test.tsx", "test/worker/m2-assets.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-004"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned asset marker are runtime-probed. Initial-load read recovery and duplicate-click suppression are locally tested; parse-progress, full recovery, release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-admin-members", routeId: "admin-members", pathname: "/admin/members", requiredRole: "admin",
    journey: "List members and update an allowed member's status.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/members-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/members/service.ts"], testEvidence: ["test/unit/frontend-admin-pages.test.tsx", "test/worker/members.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-005"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned member marker are runtime-probed. Initial-load read recovery and duplicate-click suppression are locally tested; the status change is a caller-expectedStatus conditional write, repeats converge, and disabling a member shrinks its menu and deep links. Audit navigation, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-roles", routeId: "admin-roles", pathname: "/admin/roles", requiredRole: "admin",
    journey: "Manage role permission assignments and memberships.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/roles-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/authorization/roles-repository.ts"], testEvidence: ["test/worker/admin-roles.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-006"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned role marker are runtime-probed. Initial-load read recovery and duplicate-click suppression are locally tested; listing now rejects contributors and revoked admins, a forged or elevated contributor session is refused on the menu and role surfaces, and navigation no longer discloses the admin group to an elevated mask. Cross-session role projection, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin-menus", routeId: "admin-menus", pathname: "/admin/menus", requiredRole: "admin",
    journey: "Manage server-owned navigation menu hierarchy and availability.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/menus-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/authorization/menus-repository.ts"], testEvidence: ["test/unit/admin-menus-page.test.tsx", "test/worker/admin-menus.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-007"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned menu marker are runtime-probed. Initial-load read recovery and duplicate-click suppression are locally tested; creation replays one recorded receipt across a refreshed session, the whole-tree snapshot compare-and-set admits one concurrent writer, deletion converges on a recorded receipt, and the winning reorder is projected to a member session. Release and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-spaces", routeId: "admin-spaces", pathname: "/admin/spaces", requiredRole: "admin",
    journey: "Create and govern knowledge spaces and collections.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/spaces-page.tsx", "frontend/components/admin/tag-admin-panel.tsx", "frontend/lib/admin-tags-data.ts", "frontend/app.tsx"], backendEvidence: ["src/spaces/service.ts"], testEvidence: ["test/unit/spaces-service.test.ts", "test/worker/spaces.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-008"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned space marker are runtime-probed. Cursor paging, write recovery, versioned space and collection editors, and actor-keyed collection creation receipts are locally tested. Keys and draft intent are not persisted across editor unmount; space creation still lacks a replay key. Archive/content impact, migration 0056 release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-admin-audit", routeId: "admin-audit", pathname: "/admin/audit", requiredRole: "admin",
    journey: "Filter redacted audit events and inspect their related entities.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/audit-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/audit/repository.ts"], testEvidence: ["test/unit/audit.test.ts", "test/worker/admin-audit.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-009"], gaps: ["Current admin server-navigation entry and loading state are runtime-probed. Empty and ready fixtures expose an incompatible raw-page versus {generation,page} destructure in AdminAuditRoute and are explicit gaps; initial error has no retry action. Related navigation, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin-analytics", routeId: "admin-analytics", pathname: "/admin/analytics", requiredRole: "admin",
    journey: "Inspect analytical trends, rankings, and visitors across a date range.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/analytics-page.tsx", "frontend/lib/admin-analytics-data.ts", "frontend/app.tsx"], backendEvidence: ["src/analytics/repository.ts", "src/routes/admin.ts"], testEvidence: ["test/unit/frontend-admin-analytics-route.test.tsx", "test/unit/frontend-admin-analytics-data.test.ts", "test/worker/analytics.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-010"], gaps: ["Initial retry, bounded date/page reads, strict response validation, stale-result and authorization recovery are locally tested. Single-transaction overview reads and cross-page post-write reconciliation are locally tested. Release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-notifications", routeId: "notifications", pathname: "/notifications", requiredRole: "contributor",
    journey: "Review, filter, and mark workspace notifications as read.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/notifications/notifications-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/notifications.ts", "src/notifications/service.ts"], testEvidence: ["test/unit/frontend-notifications-route.test.tsx", "test/worker/notifications.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["NTF-001", "NTF-003", "NTF-004"], gaps: ["Current server-navigation entry plus loading, empty, retryable error, and response-owned notification marker are runtime-probed. Opening a revoked-target notification still commits the read with a redacted body while the unread total converges, and the route renders an explicit revoked state; release and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-messages", routeId: "messages", pathname: "/messages", requiredRole: "contributor",
    journey: "Find a contextual discussion and reply to its current authorized thread.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/messages/messages-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/discussions.ts", "src/discussions/service.ts"], testEvidence: ["test/unit/frontend-discussion-route.test.tsx", "test/worker/discussions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["MSG-001", "MSG-002", "MSG-004"], gaps: ["Current server-navigation entry plus loading, empty, retryable error, and response-owned thread link are runtime-probed. A revoked context shrinks the thread out of the list, direct hits stay refused, and the page renders an explicit recoverable revoked state instead of error or empty; release and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-knowledge-reader", routeId: "knowledge-reader", pathname: "/knowledge/:id", parentRouteId: "knowledge", routePattern: "/^\\/knowledge\\/[A-Za-z0-9_-]+$/u", requiredRole: "contributor",
    journey: "Open an authorized knowledge item and inspect its reader content.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/knowledge-reader-page.tsx", "frontend/app-routes.ts", "frontend/lib/knowledge-derivatives-data.ts", "frontend/lib/use-knowledge-derivatives.ts", "frontend/lib/knowledge-derivative-draft-intent.ts", "frontend/lib/reader-visit-intent.ts"], backendEvidence: ["src/routes/library.ts", "src/library/service.ts"], testEvidence: ["test/unit/frontend-knowledge-citation-route.test.tsx", "test/unit/frontend-knowledge-reader-data.test.ts", "test/unit/frontend-knowledge-reader-derivatives-data.test.tsx", "test/unit/frontend-knowledge-reader-derivatives-surface.test.tsx", "test/unit/frontend-reader-visit-identity.test.ts", "test/unit/frontend-reader-content-headings.test.tsx", "test/worker/m1-library.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-006"], gaps: ["The current knowledge owner entry plus direct loading, retryable error, and response-owned reader marker are runtime-probed without a duplicate global entry; the route harness isolates DOM sanitization. Private notes, shares, favorite receipts and per-visit-identity reads now re-authorize with member isolation, stale-version conflicts and convergent revokes locally proven; related/backlink/revision journeys, release, and signed-browser acceptance remain gaps. Trash/restore reversibility is now backed by raw row-count evidence instead of assertion: the trash path only flips knowledge_items.status, so member private notes, note shares, favorites, visits, task links and research runs survive the window unchanged (a note keeps its id and updatedAt), owner-side note reads now apply the same item readability the note write already enforced, so a trashed item's note is hidden while trashed and returns identically after restore, and favorite removal refuses with 404 FAVORITE_NOT_FOUND before claiming any receipt instead of silently deleting an edge that restore could never bring back."],
  },
  {
    id: "workbench-message-thread", routeId: "message-thread", pathname: "/messages/:id", parentRouteId: "messages", routePattern: "/^\\/messages\\/[A-Za-z0-9_-]{1,128}$/u", requiredRole: "contributor",
    journey: "Open an authorized contextual discussion thread and read its messages.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/messages/thread-page.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/discussions.ts", "src/discussions/service.ts"], testEvidence: ["test/unit/frontend-discussion-route.test.tsx", "test/worker/discussions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["MSG-002", "MSG-004"], gaps: ["The current messages owner entry plus direct loading, empty, retryable error, and response-owned private-message marker are runtime-probed without a duplicate global entry. Runtime target re-authorization is source-audited; context 403 removes private thread content but renders a generic retryable error. A denied context renders an explicit revoked state instead of a generic retryable error, private messages stay out of the DOM across refresh and back navigation, and the context entry deep-links to its canonical thread route; release and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-submission-detail", routeId: "admin-submission-detail", pathname: "/admin/submissions/:id", parentRouteId: "admin-submissions", routePattern: "/^\\/admin\\/submissions\\/[A-Za-z0-9_-]+$/u", requiredRole: "admin",
    journey: "Open a reviewable submission and make an authorized publication decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/review-detail-route.tsx", "frontend/components/review/review-source-panel.tsx", "frontend/components/review/review-chunk-panel.tsx", "frontend/lib/admin-reparse-data.ts", "frontend/lib/admin-chunk-data.ts", "frontend/app-routes.ts"], backendEvidence: ["src/routes/admin-review.ts", "src/review/service.ts"], testEvidence: ["test/unit/frontend-review-detail-route.test.tsx", "test/unit/frontend-admin-review-data.test.ts", "test/unit/frontend-admin-reparse.test.tsx", "test/unit/source-reparse-service.test.ts", "test/worker/m2-reparse.test.ts", "test/worker/admin-review-decisions.test.ts", "test/worker/m1-publication.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"], gaps: ["Review-queue discovery and return navigation, same-object retry, explicit 404/401/403 states, response ID matching, read cancellation and stale-result protection are locally tested. Malformed 200 previews fail closed instead of masquerading as not-found. Same-tick decision clicks are locally serialized; server decision idempotency, publication/index/notification convergence, release and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-role-new", routeId: "admin-role-new", pathname: "/admin/roles/new", parentRouteId: "admin-roles", routePattern: "/^\\/admin\\/roles\\/new$/u", requiredRole: "admin",
    journey: "Open the governance list, create a role from its draft form and return to the list.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/create-role-page.tsx", "frontend/pages/admin/roles-page.tsx", "frontend/lib/admin-roles-controller.ts", "frontend/lib/admin-role-draft.ts", "frontend/app.tsx"], backendEvidence: ["src/routes/admin-roles.ts", "src/authorization/roles-repository.ts"], testEvidence: ["test/unit/frontend-admin-role-routes.test.tsx", "test/unit/frontend-admin-role-confirmation.test.tsx", "test/worker/admin-roles.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-006"],
    gaps: ["The role-creation route is registered, reachable from the governance list and reuses the shared role controller, so route discovery, the create form, blocked-write and read-required surfaces have local coverage: creation replays one member-scoped receipt, the create form keeps its draft and blocked intent, and the route returns to the list on success. Cross-session role projection, real-identity and signed-browser acceptance of role creation remain unproven."],
  },
  {
    id: "workbench-admin-role-detail", routeId: "admin-role-detail", pathname: "/admin/roles/:id", parentRouteId: "admin-roles", routePattern: "/^\\/admin\\/roles\\/[A-Za-z0-9_-]+$/u", requiredRole: "admin",
    journey: "Open one role from the governance list and edit its permission bitmap or member assignment.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/role-detail-page.tsx", "frontend/pages/admin/roles-page.tsx", "frontend/lib/admin-roles-controller.ts", "frontend/lib/admin-role-write-intent.ts", "frontend/app.tsx"], backendEvidence: ["src/routes/admin-roles.ts", "src/authorization/roles-repository.ts"], testEvidence: ["test/unit/frontend-admin-role-routes.test.tsx", "test/unit/frontend-admin-role-recovery.test.tsx", "test/worker/admin-roles.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-006"],
    gaps: ["The parameterized role-detail route is registered, resolves through the roles list and shares the role controller, so discovery, permission editing, assignment confirmations and blocked-write/read-required surfaces have local coverage: update, assign and unassign each converge locally and the editor restores its write intent across a reload. Cross-session role projection, real-identity and signed-browser acceptance of role editing remain unproven."],
  },
  {
    id: "workbench-admin-recycle-bin", routeId: "admin-recycle-bin", pathname: "/admin/knowledge/trash", requiredRole: "admin",
    journey: "Review trashed knowledge in the recycle bin, restore an item or purge it, and inspect the retained revision evidence.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/recycle-bin-route.tsx", "frontend/pages/admin/recycle-bin-page.tsx", "frontend/lib/admin-knowledge-trash-data.ts", "frontend/app.tsx"], backendEvidence: ["src/routes/admin-review.ts", "src/publication/service.ts"], testEvidence: ["test/unit/frontend-recycle-bin-page.test.tsx", "test/worker/admin-knowledge-lifecycle.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"],
    gaps: ["The recycle bin is seeded as a system menu row (migration 0072) and its fixed path plus page kind are registered, so /admin/knowledge/trash is reachable from the governance menu and renders the trashed-item list with retained revision evidence; restore and purge are frozen client operations whose body carries the operation number and whose receipts replay server-side. Retention windows, purge authority, cross-session projection, release and signed-browser acceptance remain unproven. The seeded row is gated by the same knowledge:review capability the review menu carries, and because an active administrator cannot lack that bit by schema construction, the refusal evidence is the mask filter over the real seeded rows plus the shell gate rather than a two-administrator fixture."],
  },
  {
    id: "workbench-admin-knowledge-trash", routeId: "admin-knowledge-trash", pathname: "/admin/knowledge/trash", parentRouteId: "admin-recycle-bin", routePattern: "/^\\/admin\\/knowledge\\/trash$/u", requiredRole: "admin",
    journey: "Resolve the /admin/knowledge/trash path to the knowledge recycle-bin page kind before the item detail pattern matches it.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app-routes.ts", "frontend/pages/admin/recycle-bin-route.tsx"], backendEvidence: ["src/routes/admin-review.ts"], testEvidence: ["test/unit/frontend-app-routes.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"],
    gaps: ["The fixed-path branch is registered for /admin/knowledge/trash and must win over the item detail pattern, so the recycle bin is inventoried as its own page kind in addition to the menu route that owns the same path. Release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin-knowledge-item", routeId: "admin-knowledge-item", pathname: "/admin/knowledge/:id", parentRouteId: "admin-recycle-bin", routePattern: "/^\\/admin\\/knowledge\\/[A-Za-z0-9_-]+$/u", requiredRole: "admin",
    journey: "Open one knowledge item by id from the lifecycle surfaces and inspect or moderate its governed revisions.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/knowledge-item-route.tsx", "frontend/pages/admin/knowledge-item-page.tsx", "frontend/lib/admin-knowledge-item-data.ts", "frontend/app-routes.ts"], backendEvidence: ["src/routes/admin-review.ts", "src/library/repository.ts"], testEvidence: ["test/unit/frontend-knowledge-item-page.test.tsx", "test/worker/admin-knowledge-lifecycle.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"],
    gaps: ["The parameterized item route and its in-page entries from the recycle bin are registered, and the server route matcher and the client router both know /admin/knowledge/:id, so opening one item renders its governed revision evidence plus the trash and rollback operations that are journaled with an operation number and replayed from a lifecycle receipt. Replacement authority, cross-session projection, release and signed-browser acceptance remain unproven. The item page deliberately has no navigation row: /admin/knowledge/:id is the administrative address reached from a trash row, and because no endpoint reads a single trashed item, opening a still-trashed item states that it is not active and that the bin handles it — the useful path is restore first, then open."],
  },
] as const satisfies readonly WorkbenchMaturityCapability[]);

// Kept as a separately frozen, one-to-one ledger so Task 1's fail-closed AST
// contract remains stable. scripts/workbench-domain-audit.mjs rejects missing,
// duplicate, or unknown capability IDs before joining these records.
export const WORKBENCH_MATURITY_DOMAIN_EVIDENCE = Object.freeze([
  {
    id: "workbench-graph", apiPaths: ["/api/graph", "/api/graph/suggestions", "/api/tasks", "/api/focus", "/api/projects/:id/timeline"],
    persistencePaths: ["src/graph/repository.ts", "src/tasks/repository.ts", "src/focus/repository.ts", "src/project-timeline/repository.ts"],
    ownerPredicate: "routeGraphApi passes authenticated member.memberId to GraphProjectionService; GraphProjectionRepository.listTasks binds t.member_id = ?.", pagination: "not_applicable",
    mutations: ["POST /api/tasks — gap: complete graph action replay is not bound to domain evidence", "POST /api/focus — gap: complete graph action replay is not bound to domain evidence", "POST /api/projects/:id/timeline — gap: complete graph action replay is not bound to domain evidence"], mutationSafety: "mixed",
  },
  {
    id: "workbench-project-timeline", apiPaths: ["/api/projects/:id", "/api/projects/:id/timeline", "/api/projects/:id/timeline/:id", "/api/projects/:id/timeline/:id/status"],
    persistencePaths: ["src/projects/repository.ts", "src/project-timeline/repository.ts", "migrations/0046_workbench_project_timeline.sql"],
    ownerPredicate: "routeProjectTimelineApi passes authenticated member.memberId to ProjectTimelineService; ProjectTimelineRepository.listOwned binds member_id = ? and project_id = ?.", pagination: "cursor",
    mutations: ["PATCH /api/projects/:id/timeline/:id — proven: member/project/item/version conditional content write shares the status version; retries conflict rather than replay success", "POST /api/projects/:id/timeline — proven: stable client key with INSERT OR IGNORE against UNIQUE(member_id, client_key) replay", "POST /api/projects/:id/timeline/:id/status — proven: expectedUpdatedAt compare-and-set shares the timeline item version"], mutationSafety: "mixed",
  },
  {
    id: "workbench-inbox", apiPaths: ["/api/inbox", "/api/inbox/:id", "/api/inbox/:id/promote/task", "/api/tasks", "/api/tasks/:id", "/api/tasks/:id/links", "/api/tasks/:id/links/:id", "/api/tasks/:id/status", "/api/tasks/:id/progress", "/api/tasks/:id/tags", "/api/tasks/:id/dependencies/:id", "/api/tasks/:id/subtasks/:id", "/api/tasks/:id/dependencies", "/api/tasks/:id/subtasks"],
    persistencePaths: ["src/inbox/task-promotion.ts", "src/inbox/repository.ts", "migrations/0038_workbench_inbox.sql", "src/tasks/repository.ts", "migrations/0032_workspace_tasks.sql", "migrations/0066_task_delete_tombstones.sql"],
    ownerPredicate: "routeInboxApi passes authenticated member.memberId to InboxService; InboxRepository.listOwned binds member_id = ?.", pagination: "cursor",
    mutations: ["DELETE /api/tasks/:id — gap: the operation is receipt-proven at the HTTP boundary and from the list entry, but the shared task editor exposes no delete control, so this entry cannot initiate a delete, and the trash/restore/purge lifecycle model is still unapproved", "DELETE /api/tasks/:id/dependencies/:id — proven: version-guarded dependency delete in the relation batch; a repeat removal is answered 404 and consumes no version", "DELETE /api/tasks/:id/subtasks/:id — proven: version-guarded subtask delete; a stale name conflicts and a repeat is resolved as 404", "PATCH /api/tasks/:id/subtasks/:id — proven: subtask updated_at compare-and-set with an atomic position-occupancy guard; a stale or occupied move conflicts", "POST /api/tasks/:id/dependencies — proven: natural-key ON CONFLICT DO NOTHING plus a service replay returns the existing edge as created:false", "POST /api/tasks/:id/subtasks — proven: stable client subtask id with findSubtask replay converges a double submit on one row", "POST /api/inbox — proven: stable tab-scoped client key with INSERT OR IGNORE replay under a member-scoped unique index", "PATCH /api/inbox/:id — proven: tab-scoped expectedUpdatedAt compare-and-set; stale and repeated retries converge", "POST /api/inbox/:id/promote/task — proven: single-batch compare-and-set on updated_at with a null promoted receipt; a replay returns the existing task", "DELETE /api/tasks/:id/links/:id — proven: version-guarded relation delete and parent version consumption in one batch; a replay consumes no version", "PATCH /api/tasks/:id — proven: mandatory expectedUpdatedAt with a member-scoped updated_at compare-and-set; an identical resend returns the task", "POST /api/tasks — proven: stable client task id with INSERT OR IGNORE plus a member-scoped findOwned replay converges a double submit on one task", "POST /api/tasks/:id/links — proven: natural-key INSERT OR IGNORE with a findLink replay converges identical link adds", "POST /api/tasks/:id/progress — proven: parent-version guarded absolute progress write; a resend of the stored value is an inert success", "POST /api/tasks/:id/status — proven: expected-status compare-and-set advances status_version; an already-at-target write is a convergent no-op", "PUT /api/tasks/:id/tags — proven: one atomic batch where every statement carries the same parent-version guard; an identical tag set returns before any write"], mutationSafety: "mixed",
  },
  {
    id: "workbench-goals", apiPaths: ["/api/goals/:id/tasks", "/api/goals/:id/tasks/:id", "/api/goals", "/api/goals/:id/status", "/api/goals/:id/progress"],
    persistencePaths: ["src/goal-tasks/repository.ts", "migrations/0053_goal_tasks.sql", "src/goals/repository.ts", "migrations/0039_workbench_goals.sql"],
    ownerPredicate: "routeGoalsApi passes authenticated member.memberId to GoalsService; GoalsRepository.listOwned binds member_id = ?.", pagination: "cursor",
    mutations: ["POST /api/goals/:id/tasks — proven: owned edge and shared goal version change atomically; stale retries conflict", "DELETE /api/goals/:id/tasks/:id — proven: owned edge and shared goal version change atomically; stale retries conflict", "POST /api/goals — proven: member-scoped clientKey unique index with INSERT OR IGNORE plus findByClientKey replay", "POST /api/goals/:id/status — proven: shared goal version conditional write; one concurrent status writer wins and stale retries conflict", "POST /api/goals/:id/progress — proven: shared goal version conditional write; out-of-order and racing progress writers conflict instead of overwriting"], mutationSafety: "mixed",
  },
  {
    id: "workbench-projects", apiPaths: ["/api/projects", "/api/projects/:id/summary", "/api/projects/:id/status", "/api/projects/:id/goals", "/api/projects/:id/goals/:id", "/api/projects/:id/tasks", "/api/projects/:id/tasks/:id"],
    persistencePaths: ["src/projects/repository.ts", "migrations/0040_workbench_projects.sql"],
    ownerPredicate: "routeProjectsApi passes authenticated member.memberId to ProjectsService; ProjectsRepository.listOwned and summary bind member_id = ?.", pagination: "cursor",
    mutations: ["POST /api/projects — proven: member-scoped clientKey unique index with INSERT OR IGNORE replay; a retry returns the original project", "POST /api/projects/:id/status — proven: project version conditional write; one concurrent status writer wins and a refresh reads the authoritative state", "POST /api/projects/:id/goals — proven: goal edge insert and shared project version consumption in one D1 batch; stale intents conflict", "DELETE /api/projects/:id/goals/:id — proven: goal edge delete and project version consumption in one D1 batch; a repeated delete converges", "POST /api/projects/:id/tasks — proven: task edge insert and shared project version consumption in one D1 batch; stale intents conflict", "DELETE /api/projects/:id/tasks/:id — proven: task edge delete and project version consumption in one D1 batch; a repeated delete converges"], mutationSafety: "mixed",
  },
  {
    id: "workbench-calendar", apiPaths: ["/api/calendar/events", "/api/calendar/events/:id"],
    persistencePaths: ["src/calendar/repository.ts", "migrations/0042_workbench_calendar.sql"],
    ownerPredicate: "routeCalendarApi passes authenticated member.memberId to CalendarService; CalendarRepository.listOwned and listNumbered bind member_id = ?.", pagination: "numbered",
    mutations: ["POST /api/calendar/events — proven: stable client key with INSERT OR IGNORE against UNIQUE(member_id, client_key) replay", "DELETE /api/calendar/events/:id — proven: expectedUpdatedAt compare-and-set converges repeated cancellation and refuses focus-owned events"], mutationSafety: "mixed",
  },
  {
    id: "workbench-today", apiPaths: ["/api/today", "/api/tasks/:id", "/api/calendar/events/:id"],
    persistencePaths: ["src/today/service.ts", "src/tasks/repository.ts", "src/inbox/repository.ts", "src/projects/repository.ts", "src/calendar/repository.ts"],
    ownerPredicate: "routeTodayApi passes authenticated principal.memberId to TodayService.get; all four private aggregates receive the same memberId.", pagination: "not_applicable", mutations: [], mutationSafety: "not_applicable",
  },
  {
    id: "workbench-focus", apiPaths: ["/api/tasks", "/api/tasks/:id", "/api/focus", "/api/focus/current", "/api/focus/:id", "/api/focus/:id/pause", "/api/focus/:id/resume", "/api/focus/:id/complete", "/api/focus/:id/abandon"],
    persistencePaths: ["src/focus/repository.ts", "migrations/0043_workbench_focus.sql"],
    ownerPredicate: "routeFocusApi passes authenticated principal.memberId to FocusService; FocusRepository.findOpen and update bind member_id = ?.", pagination: "not_applicable",
    mutations: ["POST /api/focus — proven: stable client start key replayed through INSERT OR IGNORE; one winner and one calendar block", "POST /api/focus/:id/pause — proven: expectedUpdatedAt compare-and-set on focus_sessions.updated_at; a replay returns the same paused receipt", "POST /api/focus/:id/resume — proven: expectedUpdatedAt compare-and-set; one concurrent resume wins and a replay stays inert", "POST /api/focus/:id/complete — proven: expectedUpdatedAt compare-and-set plus atomic calendar completion in one D1 batch", "POST /api/focus/:id/abandon — proven: expectedUpdatedAt compare-and-set plus atomic calendar cancellation in one D1 batch"], mutationSafety: "mixed",
  },
  {
    id: "workbench-review", apiPaths: ["/api/workbench/review"],
    persistencePaths: ["src/workbench-review/repository.ts", "migrations/0044_workbench_review.sql", "src/workbench-review/service.ts"],
    ownerPredicate: "routeWorkbenchReviewApi passes authenticated principal.memberId to WorkbenchReviewService.get; WorkbenchReviewRepository.refresh binds memberId into the member-scoped period key and every aggregate predicates member_id = b.member.", pagination: "not_applicable",
    mutations: ["GET /api/workbench/review#persist-snapshot — proven: member/period/period_key idempotency_key deduplicates identity; one atomic aggregate/upsert refreshes current content with monotonic observation and revision, not immutable replay bytes"], mutationSafety: "idempotency_key",
  },
  {
    id: "workbench-home",
    apiPaths: ["/api/knowledge/recent"],
    persistencePaths: ["src/recent-visits/repository.ts", "migrations/0024_m4_knowledge_visits.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; RecentVisitsRepository predicates knowledge_visits.member_id = ? with scope.memberId.",
    pagination: "cursor",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-submit",
    apiPaths: ["/api/submissions", "/api/submissions/drafts", "/api/submissions/drafts/:id", "/api/submissions/:id/resubmit", "/api/submissions/:id/comments", "/api/assets/availability", "/api/assets", "/api/assets/resume", "/api/assets/from-url", "/api/assets/:id", "/api/assets/:id/cancel", "/api/assets/:id/submit", "/api/assets/:id/alternative", "/api/assets/:id/original", "/api/assets/:id/parsed", "/api/spaces", "/api/spaces/:id/collections"],
    persistencePaths: ["src/submissions/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "src/assets/repository.ts", "migrations/0073_submission_draft_discard_receipts.sql"],
    ownerPredicate: "routeMemberApi derives authenticated member.memberId for submissions and assets; SubmissionsRepository scopes replay by submitter_id; AssetsRepository scopes asset reads and upload-key recovery by owner_id.",
    pagination: "not_applicable",
    mutations: ["POST /api/submissions — proven: submitter-scoped Idempotency-Key replay", "POST /api/assets — proven: owner-scoped upload key replay; client verifies the persisted file hash", "POST /api/assets/:id — proven: conditional parse-job claim; not automatic retry", "POST /api/assets/:id/cancel — proven: owner-scoped conditional deletion; repeat may return 404, not convergent success", "POST /api/assets/:id/submit — proven: owned asset and persisted review-key replay", "POST /api/assets/from-url — proven: owner-scoped idempotency key replays the first asset without a second fetch", "POST /api/assets/:id/alternative — proven: failed-parse gate plus the submitter-scoped idempotency key replays the recorded submission", "POST /api/submissions/:id/resubmit — proven: submitter-scoped idempotency key replays the recorded resubmission and a concurrent loser re-reads the same key", "PATCH /api/submissions/drafts/:id — proven: owner and draft-status scoped update; a repeated identical patch re-applies the same columns and converges", "DELETE /api/submissions/drafts/:id — proven: owner-and-draft-status scoped delete with a member-scoped receipt; a retried discard converges instead of a second 404", "POST /api/submissions/drafts — gap: the draft insert writes idempotency_key as NULL, so the submitter partial unique index cannot deduplicate it and a repeated or racing create inserts a second draft row; only the client journal plus a newest-draft re-read converges it"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-knowledge",
    apiPaths: ["/api/knowledge", "/api/knowledge/recent", "/api/knowledge/favorites", "/api/knowledge/research-runs", "/api/knowledge/notes", "/api/knowledge/review"],
    persistencePaths: ["src/library/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; LibraryRepository authorization binds scope.memberId before applying revision visibility predicates.",
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-search",
    apiPaths: ["/api/knowledge/search", "/api/saved-views", "/api/saved-views/:id"],
    persistencePaths: ["src/library/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; LibraryRepository search binds scope.memberId through the authorized member CTE before visibility filtering.",
    pagination: "numbered",
    mutations: ["POST /api/saved-views — proven: unique member client_key receipt replays a create to the recorded view", "DELETE /api/saved-views/:id — proven: owner-scoped delete receipt lets a retried 204 succeed and touch nothing else"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-agent",
    apiPaths: ["/api/knowledge/chat", "/api/knowledge/chat/conversations", "/api/knowledge/chat/conversations/:id", "/api/knowledge/chat/conversations/:id/scope", "/api/knowledge/chat/conversations/:id/cancel", "/api/knowledge/chat/conversations/:id/feedback"],
    persistencePaths: ["src/chat/repository.ts", "src/chat/feedback-repository.ts", "src/chat/turn-receipts.ts", "migrations/0052_chat_turn_requests.sql", "migrations/0019_m5_chat_conversations.sql", "migrations/0020_m5_chat_cancel.sql", "migrations/0021_m5_chat_feedback.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; ChatConversationService and ChatRepository bind owner_member_id to scope.memberId for conversation reads and writes.",
    pagination: "cursor",
    mutations: ["PATCH /api/knowledge/chat/conversations/:id/scope — gap: no expected version is supplied", "POST /api/knowledge/chat/conversations/:id/cancel — gap: no replay key is supplied", "POST /api/knowledge/chat/conversations/:id/feedback — proven: conversation/member conflict-target upsert prevents duplicate rows for identical feedback retries; no cross-tab ordering guarantee"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-my-submissions",
    apiPaths: ["/api/submissions/mine"],
    persistencePaths: ["src/submissions/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: "routeMemberApi passes authenticated member.memberId to SubmissionsService.listOwn; SubmissionsRepository predicates submissions.submitter_id = ? for both items and total.",
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-tasks",
    apiPaths: ["/api/tasks", "/api/tasks/:id", "/api/tasks/:id/status", "/api/tasks/:id/progress", "/api/tasks/:id/tags", "/api/tasks/:id/links", "/api/tasks/:id/links/:linkId", "/api/tasks/:id/dependencies/:id", "/api/tasks/:id/subtasks/:id", "/api/tasks/:id/dependencies", "/api/tasks/:id/subtasks"],
    persistencePaths: ["src/tasks/repository.ts", "migrations/0032_workspace_tasks.sql", "migrations/0033_numbered_pagination_indexes.sql", "migrations/0036_workbench_notifications.sql", "migrations/0066_task_delete_tombstones.sql"],
    ownerPredicate: "routeTasksApi passes authenticated member.memberId to TasksService; TasksRepository predicates tasks.member_id = ? and task child tables by member_id.",
    pagination: "numbered",
    mutations: ["DELETE /api/tasks/:id/dependencies/:id — proven: version-guarded dependency delete in the relation batch; a repeat removal is answered 404 and consumes no version", "DELETE /api/tasks/:id/subtasks/:id — proven: version-guarded subtask delete; a stale name conflicts and a repeat is resolved as 404", "PATCH /api/tasks/:id/subtasks/:id — proven: subtask updated_at compare-and-set with an atomic position-occupancy guard; a stale or occupied move conflicts", "POST /api/tasks/:id/dependencies — proven: natural-key ON CONFLICT DO NOTHING plus a service replay returns the existing edge as created:false", "POST /api/tasks/:id/subtasks — proven: stable client subtask id with findSubtask replay converges a double submit on one row", "POST /api/tasks — proven: stable client task id with INSERT OR IGNORE replay", "POST /api/tasks/:id/status — proven: expected-status conditional write", "DELETE /api/tasks/:id — proven: member/task-keyed tombstone receipt replays the original delete outcome once", "DELETE /api/tasks/:id/links/:linkId — proven: version-guarded relation delete and parent version consumption in one batch; a replay consumes no version", "PATCH /api/tasks/:id — proven: mandatory expectedUpdatedAt with a member-scoped updated_at compare-and-set", "POST /api/tasks/:id/links — proven: natural-key INSERT OR IGNORE with a findLink replay converges identical link adds", "POST /api/tasks/:id/progress — proven: parent-version guarded absolute progress write; a resend of the stored value is an inert success", "PUT /api/tasks/:id/tags — proven: one atomic batch where every statement carries the same parent-version guard; an identical tag set returns before any write"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-boards",
    apiPaths: ["/api/tasks", "/api/tasks/:id/status"],
    persistencePaths: ["src/tasks/repository.ts", "migrations/0032_workspace_tasks.sql", "migrations/0033_numbered_pagination_indexes.sql", "migrations/0036_workbench_notifications.sql"],
    ownerPredicate: "routeTasksApi passes authenticated member.memberId to TasksService; board lists and status updates remain predicates on tasks.member_id = ?.",
    pagination: "numbered",
    mutations: ["POST /api/tasks/:id/status — proven: repository compares the previously read status before update"],
    mutationSafety: "conditional_write",
  },
  {
    id: "workbench-environments",
    apiPaths: ["/api/environments", "/api/environments/:id"],
    persistencePaths: ["src/environments/repository.ts", "migrations/0047_browser_environments.sql", "migrations/0048_browser_environment_operations.sql"],
    ownerPredicate: "routeEnvironmentsApi derives memberId from authenticated principal.memberId; EnvironmentsRepository.list predicates member_id = ? for items and totals.",
    pagination: "numbered",
    mutations: ["POST /api/environments — gap: full runtime and cross-refresh recovery remain unverified", "PATCH /api/environments/:id — gap: full runtime and cross-refresh recovery remain unverified", "DELETE /api/environments/:id — gap: full runtime and cross-refresh recovery remain unverified"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-settings",
    apiPaths: ["/api/session"],
    persistencePaths: ["src/identity/session.ts", "migrations/0002_github_auth.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-admin",
    apiPaths: ["/api/admin/submissions", "/api/admin/assets", "/api/admin/members"],
    persistencePaths: ["src/submissions/repository.ts", "src/assets/repository.ts", "src/members/repository.ts", "migrations/0001_phase1_control_plane.sql", "migrations/0003_m1_knowledge_loop.sql", "migrations/0005_m2_asset_ingestion.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-admin-submissions",
    apiPaths: ["/api/admin/submissions", "/api/admin/submissions/batch-review", "/api/admin/submissions/:id/publish", "/api/admin/submissions/:id/request-revision", "/api/admin/submissions/:id/reject"],
    persistencePaths: ["src/submissions/repository.ts", "src/publication/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["POST /api/admin/submissions/batch-review — gap: the batch envelope carries no identity of its own and items are applied independently, so an item sent without both operationId and expectedUpdatedAt is deliberately unprotected and a retried batch re-applies it", "POST /api/admin/submissions/:id/publish — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/request-revision — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/reject — gap: no client replay key or expected version is supplied"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-duplicates",
    apiPaths: ["/api/admin/duplicates", "/api/admin/duplicates/:submissionId/decision"],
    persistencePaths: ["src/duplicates/repository.ts", "migrations/0027_duplicate_candidates.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["POST /api/admin/duplicates/:submissionId/decision — proven: decision = pending compare-and-set with same-reviewer replay"],
    mutationSafety: "conditional_write",
  },
  {
    id: "workbench-admin-assets",
    apiPaths: ["/api/admin/assets", "/api/admin/assets/capacity", "/api/admin/assets/orphans", "/api/admin/assets/orphans/reclaim", "/api/admin/assets/:id/preview", "/api/admin/assets/:id/retry"],
    persistencePaths: ["src/assets/repository.ts", "migrations/0005_m2_asset_ingestion.sql", "migrations/0033_numbered_pagination_indexes.sql", "migrations/0071_admin_operation_receipts.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["POST /api/admin/assets/orphans/reclaim — proven: an admin_operation_receipts row keyed by (kind, operationId) claims the reclaim, replays its recorded response and conflicts when the request hash differs", "POST /api/admin/assets/:id/retry — gap: read-before-reset is not an atomic conditional write"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-members",
    apiPaths: ["/api/admin/members", "/api/admin/members/:id/status"],
    persistencePaths: ["src/members/repository.ts", "migrations/0001_phase1_control_plane.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["PATCH /api/admin/members/:id/status — proven: caller expectedStatus compare-and-set in the UPDATE predicate; stale or racing writes conflict"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-roles",
    apiPaths: ["/api/admin/roles", "/api/admin/roles/:id", "/api/admin/roles/:id/members"],
    persistencePaths: ["src/authorization/roles-repository.ts", "migrations/0029_workspace_rbac.sql", "migrations/0064_role_operation_receipts.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: ["POST /api/admin/roles — proven: member-scoped operationId receipt with ON CONFLICT DO NOTHING create and request-hash replay", "PATCH /api/admin/roles/:id — proven: expected allow_bits precondition in the UPDATE predicate; a stale matrix conflicts", "POST /api/admin/roles/:id/members — proven: guarded role_members INSERT ON CONFLICT DO NOTHING with a changed-row audit replay", "DELETE /api/admin/roles/:id/members — proven: idempotent role_members DELETE converges on not-assigned with a changed-row audit"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-menus",
    apiPaths: ["/api/admin/menus", "/api/admin/menus/:id"],
    persistencePaths: ["src/authorization/menus-repository.ts", "migrations/0029_workspace_rbac.sql", "migrations/0031_workspace_menu_hierarchy.sql", "migrations/0067_menu_operation_receipts.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: ["POST /api/admin/menus — proven: natural menu key claims one recorded creation receipt under a whole-tree compare-and-set", "PATCH /api/admin/menus/:id — proven: whole-tree snapshot compare-and-set with an optional browser baseline admits one writer", "DELETE /api/admin/menus/:id — proven: the removed row id keys a delete receipt that replays after the row is gone"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-spaces",
    apiPaths: ["/api/admin/spaces", "/api/admin/spaces/:id", "/api/admin/spaces/:id/collections", "/api/admin/collections", "/api/admin/collections/:id", "/api/admin/tags"],
    persistencePaths: ["src/spaces/repository.ts", "migrations/0001_phase1_control_plane.sql", "migrations/0056_admin_collection_creation_requests.sql"],
    ownerPredicate: null,
    pagination: "cursor",
    mutations: ["POST /api/admin/spaces — gap: the visible server-generated create has no client idempotency key", "POST /api/admin/tags — gap: tag creation has no client key or receipt; a lost-response retry collides on the per-space slug unique key and answers 409 TAG_SLUG_CONFLICT, which the panel surfaces as a real conflict and settles by an explicit re-read instead of replaying the created tag", "PATCH /api/admin/spaces/:id — gap: browser snapshot version and SQL CAS are locally tested, but unknown intent is not persisted across unmount and legacy clients may omit the version", "POST /api/admin/collections — gap: mounted editor keys replay an immutable actor-scoped D1 receipt, but the key is not persisted across refresh or unmount and legacy clients may omit it", "PATCH /api/admin/collections/:id — gap: browser snapshot version and SQL CAS are locally tested, but unknown intent is not persisted across unmount and legacy clients may omit the version"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-audit",
    apiPaths: ["/api/admin/audit-events"],
    persistencePaths: ["src/audit/repository.ts", "migrations/0001_phase1_control_plane.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-admin-analytics",
    apiPaths: ["/api/admin/analytics/overview"],
    persistencePaths: ["src/analytics/repository.ts", "migrations/0026_site_analytics.sql", "migrations/0030_site_analytics_dimensions.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-notifications",
    apiPaths: ["/api/notifications", "/api/notifications/summary", "/api/notifications/:id/read", "/api/notifications/read"],
    persistencePaths: ["src/notifications/repository.ts", "migrations/0036_workbench_notifications.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: "routeNotificationsApi passes authenticated member.memberId as recipientMemberId; NotificationsRepository predicates recipient_member_id = ? for items, total, and writes.",
    pagination: "numbered",
    mutations: ["POST /api/notifications/:id/read — proven: recipient-scoped read_at IS NULL conditional write", "POST /api/notifications/read — proven: bounded recipient-scoped unread selection"],
    mutationSafety: "conditional_write",
  },
  {
    id: "workbench-messages",
    apiPaths: ["/api/discussions", "/api/discussions/context"],
    persistencePaths: ["src/discussions/authorization.ts", "src/discussions/repository.ts", "migrations/0037_workbench_discussions.sql"],
    ownerPredicate: "routeDiscussionsApi passes authenticated member.memberId as actorMemberId; DiscussionTargetAuthorization rechecks task ownership or current knowledge visibility before listing or writing.",
    pagination: "cursor",
    mutations: ["POST /api/discussions/context — proven: unique context key with INSERT OR IGNORE replay converges concurrent creates on one row"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-knowledge-reader",
    apiPaths: ["/api/knowledge/:id", "/api/knowledge/citations/:citationId", "/api/knowledge/:id/revisions/:revisionId", "/api/knowledge/:id/favorite", "/api/knowledge/favorites/operations/:operationId", "/api/knowledge/:id/note", "/api/knowledge/:id/note/shares", "/api/knowledge/:id/note/shares/:recipientId", "/api/knowledge/:id/related", "/api/knowledge/:id/backlinks", "/api/knowledge/:id/summary", "/api/knowledge/:id/faq", "/api/knowledge/:id/timeline", "/api/knowledge/:id/brief", "/api/knowledge/:id/comparison", "/api/knowledge/:id/mindmap", "/api/knowledge/:id/report", "/api/knowledge/:id/flashcards", "/api/knowledge/:id/quiz", "/api/knowledge/:id/research-runs", "/api/knowledge/:id/research-runs/:runId/approve", "/api/knowledge/:id/research-runs/:runId/pause", "/api/knowledge/:id/research-runs/:runId/cancel", "/api/knowledge/:id/research-runs/:runId/queries", "/api/knowledge/:id/research-runs/:runId/draft"],
    persistencePaths: ["src/library/repository.ts", "src/favorites/repository.ts", "src/private-notes/repository.ts", "src/recent-visits/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0012_m5_private_notes.sql", "migrations/0023_m4_knowledge_favorites.sql", "migrations/0024_m4_knowledge_visits.sql", "migrations/0061_knowledge_favorite_operations.sql", "migrations/0065_workbench_write_convergence.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; reader, favorite, private-note, and visit repositories bind scope.memberId and re-authorize the current knowledge revision.",
    pagination: "not_applicable",
    mutations: ["PUT /api/knowledge/:id/favorite — proven: a member-scoped operation number replays its recorded receipt and applies its effect once", "DELETE /api/knowledge/:id/favorite — gap: the removal is readability-gated now (404 FAVORITE_NOT_FOUND before any receipt is claimed) and same-number replay of the recorded removal receipt is proven locally, but cross-refresh unknown-result recovery and real-identity acceptance remain unproven", "PUT /api/knowledge/:id/note — proven: expected updated_at compare-and-set plus a stable client note id replay the committed write", "POST /api/knowledge/:id/note/shares — proven: natural-key share upsert revives the same row instead of adding one", "DELETE /api/knowledge/:id/note/shares/:recipientId — proven: COALESCE revoke keeps the first timestamp so a retried delete stays converged", "GET /api/knowledge/:id#record-visit — proven: stable x-visit-id header collapses a retried reading into one counted visit", "POST /api/knowledge/:id/summary — gap: knowledge derivation generation is a non-idempotent write with no replay key or uncertain-outcome convergence", "POST /api/knowledge/:id/faq — gap: knowledge derivation generation is a non-idempotent write with no replay key or uncertain-outcome convergence", "POST /api/knowledge/:id/timeline — gap: knowledge derivation generation is a non-idempotent write with no replay key or uncertain-outcome convergence", "POST /api/knowledge/:id/brief — gap: knowledge derivation generation is a non-idempotent write with no replay key or uncertain-outcome convergence", "POST /api/knowledge/:id/comparison — gap: knowledge derivation generation is a non-idempotent write with no replay key or uncertain-outcome convergence", "POST /api/knowledge/:id/mindmap — gap: knowledge derivation generation is a non-idempotent write with no replay key or uncertain-outcome convergence", "POST /api/knowledge/:id/report — gap: run-bound report generation is a non-idempotent write with no replay key or uncertain-outcome convergence", "POST /api/knowledge/:id/flashcards — gap: knowledge derivation generation is a non-idempotent write with no replay key or uncertain-outcome convergence", "POST /api/knowledge/:id/quiz — gap: knowledge derivation generation is a non-idempotent write with no replay key or uncertain-outcome convergence", "POST /api/knowledge/:id/research-runs — gap: research-run start is a read-then-write with no client key or expected state", "POST /api/knowledge/:id/research-runs/:runId/approve — gap: research-run approval is a read-then-write with no expected run state or replay key", "POST /api/knowledge/:id/research-runs/:runId/pause — gap: research-run pause is a read-then-write with no expected run state or replay key", "POST /api/knowledge/:id/research-runs/:runId/cancel — gap: research-run cancellation is a read-then-write with no expected run state or replay key", "POST /api/knowledge/:id/research-runs/:runId/queries — gap: recorded research query is a non-idempotent append with no client key", "POST /api/knowledge/:id/research-runs/:runId/draft — gap: the draft write documents no idempotency key and is recovered only by a frozen-request journal"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-message-thread",
    apiPaths: ["/api/discussions/:id", "/api/discussions/:id/messages", "/api/discussions/messages"],
    persistencePaths: ["src/discussions/authorization.ts", "src/discussions/repository.ts", "migrations/0037_workbench_discussions.sql"],
    ownerPredicate: "routeDiscussionsApi passes authenticated member.memberId as actorMemberId; DiscussionTargetAuthorization rechecks the thread context before message reads and sends.",
    pagination: "cursor",
    mutations: ["POST /api/discussions/messages — proven: author_member_id plus client_key uniquely replays a send"],
    mutationSafety: "idempotency_key",
  },
  {
    id: "workbench-admin-submission-detail",
    apiPaths: ["/api/admin/submissions/:id", "/api/admin/submissions/:id/publish", "/api/admin/submissions/:id/request-revision", "/api/admin/submissions/:id/reject", "/api/admin/submissions/:id/comments", "/api/admin/submissions/:id/comments/requests/:id", "/api/admin/reparse-jobs/:id/publish", "/api/admin/reparse-jobs/:id/candidate", "/api/admin/reparse-jobs/:id/promote", "/api/admin/source-versions/:id/reparse", "/api/admin/knowledge/:id/revisions/:rev/chunks/:id/status"],
    persistencePaths: ["src/publication/repository.ts", "src/submissions/repository.ts", "src/review-comments/repository.ts", "src/sources/reparse-repository.ts", "src/library/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0022_m4_review_comments.sql", "migrations/0069_review_decision_receipts.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: ["POST /api/admin/reparse-jobs/:id/publish — proven: the promoted submission id plus the item operation number replays the recorded review.publish receipt and a different request hash conflicts", "POST /api/admin/source-versions/:id/reparse — proven: the source-version fingerprint deduplicates the job, so a repeat returns the existing queued job instead of inserting a second one", "PATCH /api/admin/reparse-jobs/:id/candidate — gap: a blind status-guarded value write with no operation number or expected version; two racing corrections both write and a lost response writes again", "POST /api/admin/reparse-jobs/:id/promote — proven: the natural key reparse:<jobId> plus findPromotion replays the committed promotion and a racing loser re-reads it", "PATCH /api/admin/knowledge/:id/revisions/:rev/chunks/:id/status — gap: a blind value write with no operation number or expected version; a retry rewrites the same chunk and its FTS rows without a recorded receipt", "POST /api/admin/submissions/:id/publish — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/request-revision — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/reject — gap: no client replay key or expected version is supplied", "PUT /api/admin/submissions/:id/comments/requests/:id — gap: session-scoped exact recovery is implemented; cross-refresh recovery and release acceptance remain unverified"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-role-new",
    apiPaths: ["/api/admin/roles", "/api/admin/roles/:id", "/api/admin/roles/:id/members"],
    persistencePaths: ["src/authorization/roles-repository.ts", "migrations/0029_workspace_rbac.sql", "migrations/0064_role_operation_receipts.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: ["POST /api/admin/roles — proven: member-scoped operationId receipt with ON CONFLICT DO NOTHING create and request-hash replay", "PATCH /api/admin/roles/:id — proven: expected allow_bits precondition in the UPDATE predicate; a stale matrix conflicts", "POST /api/admin/roles/:id/members — proven: guarded role_members INSERT ON CONFLICT DO NOTHING with a changed-row audit replay", "DELETE /api/admin/roles/:id/members — proven: idempotent role_members DELETE converges on not-assigned with a changed-row audit"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-role-detail",
    apiPaths: ["/api/admin/roles", "/api/admin/roles/:id", "/api/admin/roles/:id/members"],
    persistencePaths: ["src/authorization/roles-repository.ts", "migrations/0029_workspace_rbac.sql", "migrations/0064_role_operation_receipts.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: ["POST /api/admin/roles — proven: member-scoped operationId receipt with ON CONFLICT DO NOTHING create and request-hash replay", "PATCH /api/admin/roles/:id — proven: expected allow_bits precondition in the UPDATE predicate; a stale matrix conflicts", "POST /api/admin/roles/:id/members — proven: guarded role_members INSERT ON CONFLICT DO NOTHING with a changed-row audit replay", "DELETE /api/admin/roles/:id/members — proven: idempotent role_members DELETE converges on not-assigned with a changed-row audit"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-recycle-bin",
    apiPaths: ["/api/admin/knowledge/trash", "/api/admin/knowledge/:id/restore", "/api/admin/knowledge/:id/purge"],
    persistencePaths: ["src/publication/repository.ts", "migrations/0070_knowledge_lifecycle_operation_receipts.sql", "migrations/0072_knowledge_recycle_bin_menu.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["POST /api/admin/knowledge/:id/restore — proven: a knowledge_lifecycle_operation_receipts row keyed by (knowledge_item_id, operationId) replays the recorded restore and conflicts on a different request hash; the trash path only flips knowledge_items.status, so member notes, shares, favorites, visits, task links and research runs survive the round trip unchanged (raw row-count evidence)", "POST /api/admin/knowledge/:id/purge — proven: the confirmed purge replays its recorded receipt and refuses an unconfirmed or hash-mismatched retry, and it now explicitly deletes the cascade-free member relations (notes, task links, research runs) in the same guarded batch before the item delete, so its destruction is explicit rather than aborting on a foreign-key conflict"],
    mutationSafety: "idempotency_key",
  },
  {
    id: "workbench-admin-knowledge-trash",
    apiPaths: ["/api/admin/knowledge/trash", "/api/admin/knowledge/:id/restore", "/api/admin/knowledge/:id/purge"],
    persistencePaths: ["src/publication/repository.ts", "migrations/0070_knowledge_lifecycle_operation_receipts.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["POST /api/admin/knowledge/:id/restore — proven: a knowledge_lifecycle_operation_receipts row keyed by (knowledge_item_id, operationId) replays the recorded restore and conflicts on a different request hash; the trash path only flips knowledge_items.status, so member notes, shares, favorites, visits, task links and research runs survive the round trip unchanged (raw row-count evidence)", "POST /api/admin/knowledge/:id/purge — proven: the confirmed purge replays its recorded receipt and refuses an unconfirmed or hash-mismatched retry, and it now explicitly deletes the cascade-free member relations (notes, task links, research runs) in the same guarded batch before the item delete, so its destruction is explicit rather than aborting on a foreign-key conflict"],
    mutationSafety: "idempotency_key",
  },
  {
    id: "workbench-admin-knowledge-item",
    apiPaths: ["/api/knowledge/:id", "/api/admin/knowledge/:id/trash", "/api/admin/knowledge/:id/rollback"],
    persistencePaths: ["src/publication/repository.ts", "migrations/0070_knowledge_lifecycle_operation_receipts.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: ["POST /api/admin/knowledge/:id/trash — proven: a knowledge_lifecycle_operation_receipts row keyed by (knowledge_item_id, operationId) replays the recorded trash and conflicts on a different request hash", "POST /api/admin/knowledge/:id/rollback — proven: the rollback receipt replays the recorded revision replacement once and conflicts on a different request hash"],
    mutationSafety: "idempotency_key",
  },
] as const satisfies readonly WorkbenchMaturityDomainEvidence[]);
