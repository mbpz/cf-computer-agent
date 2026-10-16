import { useId, useState } from "react";
import { usePlanningStatusConfirmation } from "../components/planning-status-confirmation";
import type { FrontendPageMetadata, SupportedPageSize } from "../lib/numbered-page";
import { DataTable } from "../components/data-table";
import { PlanningCreateForm, type PlanningCreateCallbacks } from "../components/planning-create-form";
import { Target, Plus, Archive, CheckCircle } from "@phosphor-icons/react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { Goal, GoalStatus } from "../lib/goals-data";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { PageState } from "../components/ui/page-state";
import { loadPlanningIntent } from "../lib/planning-create-intent";
import { loadPlanningDraft } from "../lib/planning-draft";

export type GoalsPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly Goal[]; pagination?: FrontendPageMetadata };

export function GoalsPage({ locale, state, pending = false, actionError, onRetry, onCreate, createMemberId, onCreateReadback, onCreateDenied, onCreateLock, createLocked = false, onStatusChange, onManageTasks, onProgressChange, onLoadMore, onPageChange, onPageSizeChange }: {
  locale: LocaleRuntime; state: GoalsPageState; pending?: boolean; actionError?: string;
  onManageTasks?: (goal: Goal, trigger: HTMLButtonElement) => void; onRetry?: () => void; createLocked?: boolean;
  onStatusChange?: (goal: Goal, status: GoalStatus) => void; onProgressChange?: (goal: Goal, progress: number) => void; onLoadMore?: () => void;
  onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void;
} & PlanningCreateCallbacks) {
  const statusConfirmation = usePlanningStatusConfirmation({
    kind: "GOALS", locale, items: state.kind === "ready" ? state.items : undefined,
    pagination: state.kind === "ready" ? state.pagination : undefined, memberId: createMemberId,
    blocked: pending || createLocked, onStatusChange,
  });
  const controlsBlocked = pending || createLocked || statusConfirmation.open;
  // Closed on a plain visit. A record that is not a clean empty draft may be an unresolved write
  // or an unreadable composer record: reopen the composer so its recovery controls are in reach
  // instead of silently hidden behind the trigger (mirrors InboxPage).
  const [createOpen, setCreateOpen] = useState(() => !createMemberId || loadPlanningIntent(createMemberId, "GOALS").kind !== "empty" || loadPlanningDraft(createMemberId, "GOALS").kind === "blocked");
  const [createComposerLocked, setCreateComposerLocked] = useState(false);
  const createTitleId = useId();
  const createDescriptionId = useId();
  const createBlocked = pending || createLocked || createComposerLocked;
  const changePage = (page: number) => { if (controlsBlocked) return; onPageChange?.(page); };
  const changePageSize = (pageSize: SupportedPageSize) => { if (controlsBlocked) return; onPageSizeChange?.(pageSize); };
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "GOALS_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "GOALS_RETRY")}</Button></PageState>;
  return <>{statusConfirmation.dialog}<Dialog open={createOpen} onOpenChange={next => { if (!next) setCreateOpen(false); }}>
    <DialogContent role="dialog" data-goals-create-dialog aria-labelledby={createTitleId} aria-describedby={createDescriptionId} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogTitle id={createTitleId}>{frontendText(locale, "GOALS_CREATE_TITLE")}</DialogTitle>
      <p id={createDescriptionId} className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "GOALS_DESCRIPTION")}</p>
      <div className="mt-4"><PlanningCreateForm isSubmitBlocked={statusConfirmation.isOpen} createMemberId={createMemberId} kind="GOALS" locale={locale} pending={pending || statusConfirmation.open} onCreate={onCreate} onCreateReadback={onCreateReadback} onCreateDenied={onCreateDenied} onCreateLock={locked => { setCreateComposerLocked(locked); onCreateLock?.(locked); }} onCreated={() => setCreateOpen(false)} /></div>
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Button type="button" data-goals-create-cancel variant="outline" onClick={() => setCreateOpen(false)}>{frontendText(locale, "COMMON_CANCEL")}</Button></div>
    </DialogContent>
  </Dialog><section className="flex flex-col space-y-5 lg:h-full lg:min-h-0" inert={statusConfirmation.open ? true : undefined} aria-hidden={statusConfirmation.open || undefined}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><Target size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "GOALS_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "GOALS_DESCRIPTION")}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{frontendText(locale, "GOALS_PRIVATE_BADGE")}</Badge><Button type="button" data-goals-create-open aria-haspopup="dialog" aria-expanded={createOpen} disabled={createBlocked} onClick={() => setCreateOpen(true)}><Plus size={16} weight="bold" className="mr-1" aria-hidden="true" />{frontendText(locale, "GOALS_CREATE_TITLE")}</Button></div></div>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    <DataTable
      locale={locale}
      rows={state.items}
      rowId={(goal) => goal.id}
      ariaLabel={frontendText(locale, "GOALS_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "GOALS_EMPTY")} />}
      loading={pending}
      pagination={state.pagination}
      onPageChange={onPageChange ? changePage : undefined}
      onPageSizeChange={onPageSizeChange ? changePageSize : undefined}
      fill
      className="lg:min-h-0 lg:flex-1"
      hasMore={!!state.pagination && state.pagination.page < state.pagination.totalPages}
      onLoadMore={onLoadMore}
      rowHeight={104}
      columns={[
        { key: "goal", header: frontendText(locale, "GOALS_COLUMN_GOAL"), cellClassName: "whitespace-normal", cell: (goal) => <div className="min-w-0"><h2 className="truncate font-medium">{goal.title}</h2>{goal.description && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{goal.description}</p>}</div> },
        { key: "status", header: frontendText(locale, "GOALS_COLUMN_STATUS"), width: "140px", cell: (goal) => <Badge variant={goal.status === "completed" ? "success" : goal.status === "archived" ? "outline" : "secondary"}>{frontendText(locale, `GOALS_STATUS_${goal.status.toUpperCase()}`)}</Badge> },
        { key: "progress", header: frontendText(locale, "GOALS_COLUMN_PROGRESS"), width: "200px", cellClassName: "whitespace-normal", cell: (goal) => <div className="space-y-2"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{frontendText(locale, "GOALS_PROGRESS")}</span><span>{goal.progress}%</span></div><input aria-label={`${frontendText(locale, "GOALS_PROGRESS")} ${goal.title}`} type="range" min="0" max="100" step="1" value={goal.progress} disabled={statusConfirmation.open || createLocked || pending || goal.status === "archived"} onChange={(event) => !statusConfirmation.isOpen() && onProgressChange?.(goal, Number(event.currentTarget.value))} className="w-full accent-primary" /></div> },
        { key: "actions", header: frontendText(locale, "GOALS_COLUMN_ACTIONS"), width: "300px", cellClassName: "whitespace-normal", cell: (goal) => <div className="flex flex-wrap gap-2">{onManageTasks && <Button id={`manage-goal-tasks-${goal.id}`} type="button" size="sm" variant="outline" disabled={statusConfirmation.open || createLocked || pending} onClick={event => onManageTasks(goal, event.currentTarget)}>{frontendText(locale, "GOALS_TASK_LINKS")}</Button>}{goal.status !== "completed" && goal.status !== "archived" && <Button type="button" size="sm" disabled={statusConfirmation.unavailable || statusConfirmation.open || createLocked || pending} onClick={() => statusConfirmation.request(goal, "completed")}><CheckCircle size={14} className="mr-1" />{frontendText(locale, "GOALS_COMPLETE")}</Button>}{goal.status !== "archived" && <Button type="button" size="sm" variant="outline" disabled={statusConfirmation.unavailable || statusConfirmation.open || createLocked || pending} onClick={() => statusConfirmation.request(goal, "archived")}><Archive size={14} className="mr-1" />{frontendText(locale, "GOALS_ARCHIVE")}</Button>}{goal.status === "archived" && <Button type="button" size="sm" variant="outline" disabled={statusConfirmation.unavailable || statusConfirmation.open || createLocked || pending} onClick={() => statusConfirmation.request(goal, "active")}>{frontendText(locale, "GOALS_RESTORE")}</Button>}</div> },
      ]}
    />
  </section></>;
}
