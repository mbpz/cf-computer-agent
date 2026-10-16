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
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { PageState } from "../components/ui/page-state";
import { loadPlanningIntent } from "../lib/planning-create-intent";
import { loadPlanningDraft } from "../lib/planning-draft";

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
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "PROJECTS_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "PROJECTS_RETRY")}</Button></PageState>;
  // A confirmation, an open relations editor, a create lock or an in-flight write all hold the list still.
  const listBlocked = statusConfirmation.open || !!relationProjectId || createLocked || pending;
  const changePage = (page: number) => { if (listBlocked) return; onPageChange?.(page); };
  const changePageSize = (pageSize: SupportedPageSize) => { if (listBlocked) return; onPageSizeChange?.(pageSize); };
  return <>{statusConfirmation.dialog}<Dialog open={createOpen} onOpenChange={next => { if (!next) setCreateOpen(false); }}>
    <DialogContent role="dialog" data-projects-create-dialog aria-labelledby={createTitleId} aria-describedby={createDescriptionId} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogTitle id={createTitleId}>{frontendText(locale, "PROJECTS_CREATE_TITLE")}</DialogTitle>
      <p id={createDescriptionId} className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "PROJECTS_DESCRIPTION")}</p>
      <div className="mt-4"><PlanningCreateForm isSubmitBlocked={statusConfirmation.isOpen} createMemberId={createMemberId} kind="PROJECTS" locale={locale} pending={pending || !!relationProjectId || statusConfirmation.open} onCreate={onCreate} onCreateReadback={onCreateReadback} onCreateDenied={onCreateDenied} onCreateLock={locked => { setCreateComposerLocked(locked); onCreateLock?.(locked); }} onCreated={() => setCreateOpen(false)} /></div>
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Button type="button" data-projects-create-cancel variant="outline" onClick={() => setCreateOpen(false)}>{frontendText(locale, "COMMON_CANCEL")}</Button></div>
    </DialogContent>
  </Dialog><section className="flex flex-col space-y-5 lg:h-full lg:min-h-0" inert={statusConfirmation.open ? true : undefined} aria-hidden={statusConfirmation.open || undefined}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><FolderSimple size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "PROJECTS_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "PROJECTS_DESCRIPTION")}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{frontendText(locale, "PROJECTS_PRIVATE_BADGE")}</Badge><Button type="button" data-projects-create-open aria-haspopup="dialog" aria-expanded={createOpen} disabled={createBlocked} onClick={() => setCreateOpen(true)}><Plus size={16} weight="bold" className="mr-1" aria-hidden="true" />{frontendText(locale, "PROJECTS_CREATE_TITLE")}</Button></div></div>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {relationEditor}
    <DataTable
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
            {summary ? <><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-md bg-muted/60 p-2"><div className="font-semibold">{summary.goalCount}</div><div className="text-muted-foreground">{frontendText(locale, "PROJECTS_GOALS")}</div></div><div className="rounded-md bg-muted/60 p-2"><div className="font-semibold">{summary.taskCount}</div><div className="text-muted-foreground">{frontendText(locale, "PROJECTS_TASKS")}</div></div><div className="rounded-md bg-muted/60 p-2"><div className="font-semibold">{summary.completedTaskCount}/{summary.taskCount}</div><div className="text-muted-foreground">{frontendText(locale, "PROJECTS_DONE")}</div></div></div>{summary.goals.length > 0 && <p className="line-clamp-1 text-xs text-muted-foreground">{frontendText(locale, "PROJECTS_LINKED_GOAL")}: {summary.goals.map((goal) => goal.title).join(" · ")}</p>}</> : <div role="alert" className="space-y-2 text-sm text-muted-foreground"><p>{frontendText(locale, "PROJECTS_SUMMARY_FAILED")}</p><Button type="button" variant="outline" size="sm" data-summary-retry disabled={listBlocked || summaryPending.includes(project.id)} onClick={() => onRetrySummary?.(project)}>{frontendText(locale, "PROJECTS_SUMMARY_RETRY")}</Button></div>}
          </div>;
        } },
        { key: "actions", header: frontendText(locale, "PROJECTS_COLUMN_ACTIONS"), width: "340px", cellClassName: "whitespace-normal", cell: (project) => <div className="flex flex-wrap gap-2 py-1">
          <Button type="button" size="sm" variant="outline" id={`manage-relations-${project.id}`} aria-expanded={relationProjectId === project.id} aria-controls={relationProjectId === project.id ? "project-relations-editor" : undefined} disabled={listBlocked} onClick={() => onManageRelations?.(project)}>{frontendText(locale, "RELATIONS_MANAGE")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={listBlocked} onClick={() => onOpenTimeline?.(project)}><ArrowRight size={14} className="mr-1" />{frontendText(locale, "PROJECTS_TIMELINE")}</Button>
          {project.status !== "completed" && project.status !== "archived" && <Button type="button" size="sm" disabled={statusConfirmation.unavailable || listBlocked} onClick={() => statusConfirmation.request(project, "completed")}><CheckCircle size={14} className="mr-1" />{frontendText(locale, "PROJECTS_COMPLETE")}</Button>}
          {project.status !== "archived" && <Button type="button" size="sm" variant="outline" disabled={statusConfirmation.unavailable || listBlocked} onClick={() => statusConfirmation.request(project, "archived")}><Archive size={14} className="mr-1" />{frontendText(locale, "PROJECTS_ARCHIVE")}</Button>}
          {project.status === "archived" && <Button type="button" size="sm" variant="outline" disabled={statusConfirmation.unavailable || listBlocked} onClick={() => statusConfirmation.request(project, "active")}>{frontendText(locale, "PROJECTS_RESTORE")}</Button>}
        </div> },
      ]}
    />
  </section></>;
}
