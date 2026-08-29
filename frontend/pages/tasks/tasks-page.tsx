import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DataPagination } from "../../components/data-pagination";
import { Input } from "../../components/ui/input";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { TaskItem } from "../../lib/tasks-data";
import type { TaskFilterState, TaskPriority, TaskStatus } from "./task-types";
import { taskPriorityKey, taskStatusKey } from "./tasks-model";

type Pagination = { page: number; pageSize: 20 | 50 | 100; total: number; totalPages: number };
export type TasksPageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: readonly TaskItem[]; pagination: Pagination };

export function TasksPage({ state, filters, locale, pending = false, localError, actionPendingId, onRetry, onFilterChange, onPageChange, onPageSizeChange, onStatusChange, onDelete }: {
  state: TasksPageState;
  filters: TaskFilterState;
  locale?: LocaleRuntime;
  pending?: boolean;
  localError?: string;
  actionPendingId?: string | null;
  onRetry?: () => void;
  onFilterChange?: (filters: TaskFilterState) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: 20 | 50 | 100) => void;
  onStatusChange?: (id: string, status: TaskStatus) => void;
  onDelete?: (id: string) => void;
}) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "TASKS_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></PageState>;
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "TASKS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "TASKS_DESCRIPTION")}</p></div>
    <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      <Input aria-label={frontendText(locale, "TASKS_SEARCH")} value={filters.q ?? ""} onChange={(event) => onFilterChange?.({ ...filters, q: event.currentTarget.value || undefined })} placeholder={frontendText(locale, "TASKS_SEARCH")} />
      <FilterSelect label={frontendText(locale, "TASKS_STATUS")} value={filters.status ?? ""} onChange={(value) => onFilterChange?.({ ...filters, status: (value || undefined) as TaskStatus | undefined })} options={["todo", "doing", "blocked", "done", "canceled"]} />
      <FilterSelect label={frontendText(locale, "TASKS_PRIORITY")} value={filters.priority ?? ""} onChange={(value) => onFilterChange?.({ ...filters, priority: (value || undefined) as TaskPriority | undefined })} options={["low", "medium", "high"]} />
      <Input aria-label={frontendText(locale, "TASKS_TAG")} value={filters.tag ?? ""} onChange={(event) => onFilterChange?.({ ...filters, tag: event.currentTarget.value || undefined })} placeholder={frontendText(locale, "TASKS_TAG")} />
      <FilterSelect label={frontendText(locale, "TASKS_DUE")} value={filters.due ?? ""} onChange={(value) => onFilterChange?.({ ...filters, due: (value || undefined) as TaskFilterState["due"] })} options={["today", "overdue", "none"]} />
    </div>
    {localError && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{localError}</span><Button type="button" size="sm" variant="outline" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></div>}
    {state.items.length ? <div className="space-y-3">{state.items.map((task) => {
      const taskLabel = task.title.trim() || task.id;
      const statusAction = frontendText(locale, task.status === "done" ? "TASKS_REOPEN" : "TASKS_COMPLETE");
      return <Card key={task.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{task.title}</p><Badge variant="outline">{frontendText(locale, taskStatusKey(task.status))}</Badge><Badge variant="outline">{frontendText(locale, taskPriorityKey(task.priority))}</Badge></div>{task.notes && <p className="mt-1 truncate text-sm text-muted-foreground">{task.notes}</p>}</div><div className="flex flex-wrap gap-2"><Button aria-label={`${statusAction}: ${taskLabel}`} size="sm" variant="outline" disabled={actionPendingId === task.id} onClick={() => onStatusChange?.(task.id, task.status === "done" ? "todo" : "done")}>{statusAction}</Button><Button aria-label={`${frontendText(locale, "TASKS_DELETE")}: ${taskLabel}`} size="sm" variant="destructive" disabled={actionPendingId === task.id} onClick={() => onDelete?.(task.id)}>{frontendText(locale, "TASKS_DELETE")}</Button></div></CardContent></Card>;
    })}</div> : <PageState kind="empty" title={frontendText(locale, "TASKS_EMPTY")} />}
    <DataPagination {...state.pagination} pending={pending} onPageChange={(page) => onPageChange?.(page)} onPageSizeChange={(size) => onPageSizeChange?.(size)} />
  </section>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <select aria-label={label} className="h-10 rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.currentTarget.value)}><option value="">{label}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}
