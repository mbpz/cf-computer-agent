import { useId, useState } from "react";
import { usePlanningStatusConfirmation } from "../components/planning-status-confirmation";
import type { ReactNode } from "react";
import type { FrontendPageMetadata, SupportedPageSize } from "../lib/numbered-page";
import { PlanningCreateForm, type PlanningCreateCallbacks } from "../components/planning-create-form";
import { FolderSimple, Plus, Archive, CheckCircle, ArrowRight } from "@phosphor-icons/react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { Project, ProjectStatus, ProjectSummary } from "../lib/projects-data";
import { DataTable } from "../components/data-table";
import { OverflowActions, type OverflowActionItem } from "../components/motion/overflow-actions";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { PageHeader } from "../components/ui/page-header";
import { PageState } from "../components/ui/page-state";
import { loadPlanningIntent } from "../lib/planning-create-intent";
import { loadPlanningDraft } from "../lib/planning-draft";
import { SharedLayoutBg } from "../components/motion/shared-layout-bg";

export type ProjectsPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly Project[]; summaries: Readonly<Record<string, ProjectSummary>>; nextCursor?: string; pagination?: FrontendPageMetadata };

export function ProjectsPage({ locale, state, pending = false, actionError, onRetry, onCreate, createMemberId, onCreateReadback, onCreateDenied, onCreateLock, createLocked = false, onStatusChange, onLoadMore, onOpenTimeline, onRetrySummary, summaryPending = [], relationEditor, relationProjectId, onManageRelations, onPageChange, onPageSizeChange }: {
  locale: LocaleRuntime; state: ProjectsPageState; pending?: boolean; actionError?: string;
  relationEditor?: ReactNode; relationProjectId?: string; onManageRelations?: (project: Project) => void;
  onRetry?: () => void; createLocked?: boolean;
  onRetrySummary?: (project: Project) => void; summaryPending?: readonly string[];
  onStatusChange?: (project: Project, status: ProjectStatus) => void; onLoadMore?: () => void; onOpenTimeline?: (project: Project) => void;
  onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void;
} & PlanningCreateCallbacks) {
  const statusConfirmation = usePlanningStatusConfirmation({
    kind: "PROJECTS", locale, items: state.kind === "ready" ? state.items : undefined,
    pagination: state.kind === "ready" ? state.pagination : undefined, memberId: createMemberId,
    blocked: pending || createLocked || !!relationProjectId, onStatusChange,
  });
  // See GoalsPage: closed on a plain visit, auto-opened only for an unresolved stored record.
  const [createOpen, setCreateOpen] = useState(() => !createMemberId || loadPlanningIntent(createMemberId, "PROJECTS").kind !== "empty" || loadPlanningDraft(createMemberId, "PROJECTS").kind === "blocked");
  const [createComposerLocked, setCreateComposerLocked] = useState(false);
  const createTitleId = useId();
  const createDescriptionId = useId();
  const createBlocked = pending || createLocked || !!relationProjectId || createComposerLocked;
  // A confirmation, an open relations editor, a create lock or an in-flight write all hold the list still.
  const listBlocked = statusConfirmation.open || !!relationProjectId || createLocked || pending;
  const changePage = (page: number) => { if (listBlocked) return; onPageChange?.(page); };
  const changePageSize = (pageSize: SupportedPageSize) => { if (listBlocked) return; onPageSizeChange?.(pageSize); };
  return <>{state.kind === "ready" && <>{statusConfirmation.dialog}<Dialog open={createOpen} onOpenChange={next => { if (!next) setCreateOpen(false); }}>
    <DialogContent variant="morph" role="dialog" data-projects-create-dialog dismissLabel={frontendText(locale, "COMMON_DISMISS")} aria-labelledby={createTitleId} aria-describedby={createDescriptionId} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogTitle id={createTitleId}>{frontendText(locale, "PROJECTS_CREATE_TITLE")}</DialogTitle>
      <p id={createDescriptionId} className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "PROJECTS_DESCRIPTION")}</p>
      <div className="mt-4"><PlanningCreateForm isSubmitBlocked={statusConfirmation.isOpen} createMemberId={createMemberId} kind="PROJECTS" locale={locale} pending={pending || !!relationProjectId || statusConfirmation.open} onCreate={onCreate} onCreateReadback={onCreateReadback} onCreateDenied={onCreateDenied} onCreateLock={locked => { setCreateComposerLocked(locked); onCreateLock?.(locked); }} onCreated={() => setCreateOpen(false)} /></div>
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Button type="button" data-projects-create-cancel variant="outline" onClick={() => setCreateOpen(false)}>{frontendText(locale, "COMMON_CANCEL")}</Button></div>
    </DialogContent>
  </Dialog></>}<section className="flex flex-col space-y-5 lg:h-full lg:min-h-0" inert={statusConfirmation.open && state.kind === "ready" ? true : undefined} aria-hidden={statusConfirmation.open && state.kind === "ready" || undefined}>
    <PageHeader
      title={frontendText(locale, "PROJECTS_TITLE")}
      description={frontendText(locale, "PROJECTS_DESCRIPTION")}
      status={frontendText(locale, "PROJECTS_PRIVATE_BADGE")}
      icon={<FolderSimple size={22} weight="duotone" className="text-primary" />}
      actions={<Button type="button" data-projects-create-open aria-haspopup="dialog" aria-expanded={createOpen} disabled={createBlocked} onClick={() => setCreateOpen(true)}><Plus size={16} weight="bold" className="mr-1" aria-hidden="true" />{frontendText(locale, "PROJECTS_CREATE_TITLE")}</Button>}
    />
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {relationEditor}
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "PROJECTS_LOADING")} />
      : state.kind === "error" ? <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "PROJECTS_RETRY")}</Button></PageState>
      : <DataTable
      locale={locale}
      rows={state.items}
      rowId={(project) => project.id}
      ariaLabel={frontendText(locale, "PROJECTS_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "PROJECTS_EMPTY")} />}
      loading={pending}
      pagination={state.pagination}
      onPageChange={onPageChange ? changePage : undefined}
      onPageSizeChange={onPageSizeChange ? changePageSize : undefined}
      fill
      className="lg:min-h-0 lg:flex-1"
      hasMore={!!state.pagination && state.pagination.page < state.pagination.totalPages}
      onLoadMore={listBlocked ? undefined : onLoadMore}
      rowHeight={160}
      columns={[
        { key: "project", header: frontendText(locale, "PROJECTS_COLUMN_PROJECT"), cellClassName: "whitespace-normal", cell: (project) => <div data-project-id={project.id} className="min-w-0 py-1">
          <h2 className="line-clamp-1 font-medium">{project.title}</h2>
          {project.description && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{project.description}</p>}
        </div> },
        { key: "status", header: frontendText(locale, "PROJECTS_COLUMN_STATUS"), width: "150px", cell: (project) => <Badge variant={project.status === "completed" ? "success" : project.status === "archived" ? "outline" : "secondary"}>{frontendText(locale, `PROJECTS_STATUS_${project.status.toUpperCase()}`)}</Badge> },
        { key: "summary", header: frontendText(locale, "PROJECTS_COLUMN_PROGRESS_SUMMARY"), width: "320px", cellClassName: "whitespace-normal", cell: (project) => {
          const summary = Object.hasOwn(state.summaries, project.id) ? state.summaries[project.id] : undefined;
          return <div className="space-y-2 py-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{frontendText(locale, "PROJECTS_PROGRESS")}</span><span>{project.progress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${project.progress}%` }} /></div>
            {summary ? <><SharedLayoutBg as="ul" className="grid grid-cols-3 gap-2 text-center text-xs" inset={6}><li className="rounded-md bg-muted/60 p-2"><div className="font-semibold">{summary.goalCount}</div><div className="text-muted-foreground">{frontendText(locale, "PROJECTS_GOALS")}</div></li><li className="rounded-md bg-muted/60 p-2"><div className="font-semibold">{summary.taskCount}</div><div className="text-muted-foreground">{frontendText(locale, "PROJECTS_TASKS")}</div></li><li className="rounded-md bg-muted/60 p-2"><div className="font-semibold">{summary.completedTaskCount}/{summary.taskCount}</div><div className="text-muted-foreground">{frontendText(locale, "PROJECTS_DONE")}</div></li></SharedLayoutBg>{summary.goals.length > 0 && <p className="line-clamp-1 text-xs text-muted-foreground">{frontendText(locale, "PROJECTS_LINKED_GOAL")}: {summary.goals.map((goal) => goal.title).join(" · ")}</p>}</> : <div role="alert" className="space-y-2 text-sm text-muted-foreground"><p>{frontendText(locale, "PROJECTS_SUMMARY_FAILED")}</p><Button type="button" variant="outline" size="sm" data-summary-retry disabled={listBlocked || summaryPending.includes(project.id)} onClick={() => onRetrySummary?.(project)}>{frontendText(locale, "PROJECTS_SUMMARY_RETRY")}</Button></div>}
          </div>;
        } },
        { key: "actions", header: frontendText(locale, "PROJECTS_COLUMN_ACTIONS"), width: "420px", cellClassName: "whitespace-normal", cell: (project) => {
          // One beUI rail (slug: overflow-actions) per row. All four (or five)
          // controls stay primary: the project suites address each by its
          // visible name and read its `disabled`/`aria-expanded` state, and a
          // disclosure would change that interaction model. Archive keeps
          // `tone="destructive"`; the relation toggle keeps its `id`, its
          // `aria-expanded` and its `aria-controls` hook.
          const actions: OverflowActionItem[] = [
            { id: "relations", label: frontendText(locale, "RELATIONS_MANAGE"), disabled: listBlocked, attributes: { id: `manage-relations-${project.id}`, "aria-expanded": relationProjectId === project.id, "aria-controls": relationProjectId === project.id ? "project-relations-editor" : undefined }, onClick: () => onManageRelations?.(project) },
            { id: "timeline", label: frontendText(locale, "PROJECTS_TIMELINE"), icon: <ArrowRight size={14} />, disabled: listBlocked, onClick: () => onOpenTimeline?.(project) },
          ];
          if (project.status !== "completed" && project.status !== "archived") actions.push({ id: "complete", label: frontendText(locale, "PROJECTS_COMPLETE"), icon: <CheckCircle size={14} />, disabled: statusConfirmation.unavailable || listBlocked, onClick: () => statusConfirmation.request(project, "completed") });
          if (project.status !== "archived") actions.push({ id: "archive", label: frontendText(locale, "PROJECTS_ARCHIVE"), icon: <Archive size={14} />, tone: "destructive", disabled: statusConfirmation.unavailable || listBlocked, onClick: () => statusConfirmation.request(project, "archived") });
          if (project.status === "archived") actions.push({ id: "restore", label: frontendText(locale, "PROJECTS_RESTORE"), disabled: statusConfirmation.unavailable || listBlocked, onClick: () => statusConfirmation.request(project, "active") });
          return <div className="py-1"><OverflowActions size="sm" primaryActions={actions} openLabel={frontendText(locale, "COMMON_MORE_ACTIONS")} closeLabel={frontendText(locale, "COMMON_FEWER_ACTIONS")} /></div>;
        } },
      ]}
    />}
  </section></>;
}
