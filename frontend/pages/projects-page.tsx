import { usePlanningStatusConfirmation } from "../components/planning-status-confirmation";
import type { ReactNode } from "react";
import type { FrontendPageMetadata } from "../lib/numbered-page";
import { PlanningCreateForm, type PlanningCreateCallbacks } from "../components/planning-create-form";
import { FolderSimple, Plus, Archive, CheckCircle, ArrowRight } from "@phosphor-icons/react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { Project, ProjectStatus, ProjectSummary } from "../lib/projects-data";
import { DataTable } from "../components/data-table";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";

export type ProjectsPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly Project[]; summaries: Readonly<Record<string, ProjectSummary>>; nextCursor?: string; pagination?: FrontendPageMetadata };

export function ProjectsPage({ locale, state, pending = false, actionError, onRetry, onCreate, createMemberId, onCreateReadback, onCreateDenied, onCreateLock, createLocked = false, onStatusChange, onLoadMore, onOpenTimeline, onRetrySummary, summaryPending = [], relationEditor, relationProjectId, onManageRelations }: {
  locale: LocaleRuntime; state: ProjectsPageState; pending?: boolean; actionError?: string;
  relationEditor?: ReactNode; relationProjectId?: string; onManageRelations?: (project: Project) => void;
  onRetry?: () => void; createLocked?: boolean;
  onRetrySummary?: (project: Project) => void; summaryPending?: readonly string[];
  onStatusChange?: (project: Project, status: ProjectStatus) => void; onLoadMore?: () => void; onOpenTimeline?: (project: Project) => void;
} & PlanningCreateCallbacks) {
  const statusConfirmation = usePlanningStatusConfirmation({
    kind: "PROJECTS", locale, items: state.kind === "ready" ? state.items : undefined,
    pagination: state.kind === "ready" ? state.pagination : undefined, memberId: createMemberId,
    blocked: pending || createLocked || !!relationProjectId, onStatusChange,
  });
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "PROJECTS_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "PROJECTS_RETRY")}</Button></PageState>;
  // A confirmation, an open relations editor, a create lock or an in-flight write all hold the list still.
  const listBlocked = statusConfirmation.open || !!relationProjectId || createLocked || pending;
  return <><section className="space-y-5" inert={statusConfirmation.open} aria-hidden={statusConfirmation.open || undefined}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><FolderSimple size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "PROJECTS_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "PROJECTS_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "PROJECTS_PRIVATE_BADGE")}</Badge></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "PROJECTS_CREATE_TITLE")}</CardTitle></CardHeader><CardContent><PlanningCreateForm isSubmitBlocked={statusConfirmation.isOpen} createMemberId={createMemberId} kind="PROJECTS" locale={locale} pending={pending || !!relationProjectId || statusConfirmation.open} onCreate={onCreate} onCreateReadback={onCreateReadback} onCreateDenied={onCreateDenied} onCreateLock={onCreateLock} /></CardContent></Card>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {relationEditor}
    <DataTable
      locale={locale}
      rows={state.items}
      rowId={(project) => project.id}
      ariaLabel={frontendText(locale, "PROJECTS_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "PROJECTS_EMPTY")} />}
      loading={pending}
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
  </section>{statusConfirmation.dialog}</>;
}
