import { useEffect, useRef, useState } from "react";
import { Checks } from "@phosphor-icons/react";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DataTable } from "../../components/data-table";
import { Input } from "../../components/ui/input";
import { AppliedFilters, type AppliedFilter } from "../../components/ui/applied-filters";
import { FilterSelect } from "../../components/ui/filter-select";
import { FilterDisclosure } from "../../components/ui/filter-disclosure";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { SupportedPageSize } from "../../lib/numbered-page";
import type { TaskItem } from "../../lib/tasks-data";
import type { TaskFilterState, TaskPriority, TaskStatus } from "./task-types";
import { taskFilterKey, taskPriorityKey, taskStatusKey } from "./tasks-model";
import { contextDiscussionHref } from "../messages/discussion-model";

type Pagination = { page: number; pageSize: 20 | 50 | 100; total: number; totalPages: number };
export type TasksPageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: readonly TaskItem[]; pagination: Pagination };

export function TasksPage({ state, filters, locale, pending = false, localLoadError, actionError, actionPendingId, onRetry, onFilterChange, onTextFilterChange, onLoadMore, onPageChange, onPageSizeChange, onStatusChange, onDelete, onCreate, onOpen }: {
  state: TasksPageState;
  filters: TaskFilterState;
  locale: LocaleRuntime;
  pending?: boolean;
  localLoadError?: string;
  actionError?: string;
  actionPendingId?: string | null;
  onCreate?: () => void;
  onOpen?: (id: string) => void;
  onRetry?: () => void;
  onFilterChange?: (filters: TaskFilterState) => void;
  onTextFilterChange?: (filters: TaskFilterState) => void;
  onLoadMore?: () => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: SupportedPageSize) => void;
  onStatusChange?: (id: string, status: TaskStatus) => void;
  onDelete?: (id: string) => void;
}) {
  type DeleteConfirmation = { task: TaskItem; items: readonly TaskItem[]; filters: string; page: number; pageSize: number };
  const [confirmation, setConfirmation] = useState<DeleteConfirmation | null>(null);
  const confirmationRef = useRef<DeleteConfirmation | null>(null);
  const filterKey = taskFilterKey(filters);
  const deleteBlocked = pending || !!localLoadError || actionPendingId != null || !onDelete;
  const validConfirmation = !!confirmation && state.kind === "ready" && !deleteBlocked
    && confirmation.items === state.items && state.items.includes(confirmation.task)
    && confirmation.filters === filterKey && confirmation.page === state.pagination.page && confirmation.pageSize === state.pagination.pageSize;
  const cancelDelete = () => { confirmationRef.current = null; setConfirmation(null); };
  useEffect(() => { if (confirmation && !validConfirmation) cancelDelete(); }, [confirmation, validConfirmation]);
  useEffect(() => () => { confirmationRef.current = null; }, []);
  const requestDelete = (task: TaskItem) => {
    if (confirmationRef.current || deleteBlocked || state.kind !== "ready" || !state.items.includes(task)) return;
    const next = { task, items: state.items, filters: filterKey, page: state.pagination.page, pageSize: state.pagination.pageSize };
    confirmationRef.current = next; setConfirmation(next);
  };
  const confirmDelete = () => {
    if (!validConfirmation || !confirmation || confirmationRef.current !== confirmation) return;
    // Consume before invoking the caller: repeated confirmation cannot replay the delete.
    cancelDelete(); onDelete?.(confirmation.task.id);
  };
  // Every applied condition stays visible as removable text; removing one applies the rest at once.
  const appliedFilters: AppliedFilter[] = [];
  if (filters.q) appliedFilters.push({ id: "q", label: `${frontendText(locale, "TASKS_SEARCH")}: ${filters.q}`, onRemove: () => onFilterChange?.({ ...filters, q: undefined }) });
  if (filters.status) appliedFilters.push({ id: "status", label: `${frontendText(locale, "TASKS_STATUS")}: ${filters.status}`, onRemove: () => onFilterChange?.({ ...filters, status: undefined }) });
  if (filters.priority) appliedFilters.push({ id: "priority", label: `${frontendText(locale, "TASKS_PRIORITY")}: ${filters.priority}`, onRemove: () => onFilterChange?.({ ...filters, priority: undefined }) });
  if (filters.tag) appliedFilters.push({ id: "tag", label: `${frontendText(locale, "TASKS_TAG")}: ${filters.tag}`, onRemove: () => onFilterChange?.({ ...filters, tag: undefined }) });
  if (filters.due) appliedFilters.push({ id: "due", label: `${frontendText(locale, "TASKS_DUE")}: ${filters.due}`, onRemove: () => onFilterChange?.({ ...filters, due: undefined }) });
  return <><section className="flex flex-col space-y-5 lg:h-full lg:min-h-0" inert={validConfirmation} aria-hidden={validConfirmation || undefined}>
    <PageHeader
      icon={<Checks size={22} weight="duotone" className="text-primary" data-icon="tasks" aria-hidden="true" />}
      title={frontendText(locale, "TASKS_TITLE")}
      description={frontendText(locale, "TASKS_DESCRIPTION")}
      actions={onCreate && <Button disabled={Boolean(actionPendingId)} onClick={onCreate}>{frontendText(locale, "TASKS_NEW")}</Button>}
    />
    <FilterDisclosure label={frontendText(locale, "COMMON_FILTERS")} appliedCount={appliedFilters.length} rowClassName="flex flex-wrap items-center gap-2">
      <Input aria-label={frontendText(locale, "TASKS_SEARCH")} value={filters.q ?? ""} onChange={(event) => onTextFilterChange?.({ ...filters, q: event.currentTarget.value || undefined })} placeholder={frontendText(locale, "TASKS_SEARCH")} />
      <FilterSelect label={frontendText(locale, "TASKS_STATUS")} ariaLabel={frontendText(locale, "TASKS_STATUS")} value={filters.status ?? ""} onChange={(value) => onFilterChange?.({ ...filters, status: (value || undefined) as TaskStatus | undefined })} options={[{ value: "", label: "All" }, { value: "todo", label: "todo" }, { value: "doing", label: "doing" }, { value: "blocked", label: "blocked" }, { value: "done", label: "done" }, { value: "canceled", label: "canceled" }]} />
      <FilterSelect label={frontendText(locale, "TASKS_PRIORITY")} ariaLabel={frontendText(locale, "TASKS_PRIORITY")} value={filters.priority ?? ""} onChange={(value) => onFilterChange?.({ ...filters, priority: (value || undefined) as TaskPriority | undefined })} options={[{ value: "", label: "All" }, { value: "low", label: "low" }, { value: "medium", label: "medium" }, { value: "high", label: "high" }]} />
      <Input aria-label={frontendText(locale, "TASKS_TAG")} value={filters.tag ?? ""} onChange={(event) => onTextFilterChange?.({ ...filters, tag: event.currentTarget.value || undefined })} placeholder={frontendText(locale, "TASKS_TAG")} />
      <FilterSelect label={frontendText(locale, "TASKS_DUE")} ariaLabel={frontendText(locale, "TASKS_DUE")} value={filters.due ?? ""} onChange={(value) => onFilterChange?.({ ...filters, due: (value || undefined) as TaskFilterState["due"] })} options={[{ value: "", label: "All" }, { value: "today", label: "today" }, { value: "overdue", label: "overdue" }, { value: "none", label: "none" }]} />
    </FilterDisclosure>
    <AppliedFilters ariaLabel={frontendText(locale, "COMMON_APPLIED_FILTERS")} clearLabel={frontendText(locale, "COMMON_CLEAR_FILTERS")} filters={appliedFilters} onClear={() => onFilterChange?.({})} />
    {state.kind === "loading" && <PageState kind="loading" title={frontendText(locale, "TASKS_LOADING")} />}
    {state.kind === "error" && <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></PageState>}
    {state.kind === "ready" && <>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {localLoadError && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{localLoadError}</span><Button type="button" size="sm" variant="outline" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></div>}
    <DataTable
      locale={locale}
      rows={state.items}
      rowId={(task) => task.id}
      ariaLabel={frontendText(locale, "TASKS_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "TASKS_EMPTY")} />}
      loading={pending}
      pagination={state.pagination}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      hasMore={!localLoadError && state.pagination.page < state.pagination.totalPages}
      onLoadMore={onLoadMore}
      fill
      rowHeight={72}
      columns={[
        { key: "task", header: frontendText(locale, "TASKS_COLUMN_TASK"), cellClassName: "whitespace-normal", cell: (task) => <div className="py-1"><p className="line-clamp-1 font-medium">{task.title}</p>{task.notes && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{task.notes}</p>}</div> },
        { key: "status", header: frontendText(locale, "TASKS_STATUS"), width: "200px", cell: (task) => <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{frontendText(locale, taskStatusKey(task.status))}</Badge><Badge variant="outline">{frontendText(locale, taskPriorityKey(task.priority))}</Badge></div> },
        { key: "due", header: frontendText(locale, "TASKS_DUE"), width: "180px", cell: (task) => {
          if (!task.dueAt) return "—";
          const date = new Date(task.dueAt);
          if (!Number.isFinite(date.getTime())) return task.dueAt;
          // Same two-way locale switch the other surfaces use; a fixed tag cannot throw.
          return <time dateTime={task.dueAt}>{new Intl.DateTimeFormat(locale?.locale === "zh-CN" ? "zh-CN" : "en", { dateStyle: "medium" }).format(date)}</time>;
        } },
        { key: "actions", header: frontendText(locale, "TASKS_COLUMN_ACTIONS"), width: "360px", cell: (task) => {
          const trimmedTitle = task.title.trim();
          const taskLabel = trimmedTitle ? `${trimmedTitle} (${task.id})` : task.id;
          const statusAction = frontendText(locale, task.status === "done" ? "TASKS_REOPEN" : "TASKS_COMPLETE");
          return <div className="flex flex-wrap gap-2">
            <a href={contextDiscussionHref({ kind: "task", id: task.id })} className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium transition hover:bg-accent hover:text-accent-foreground">{frontendText(locale, "MESSAGES_DISCUSS")}</a>
            {onOpen && <Button variant="outline" size="sm" disabled={Boolean(actionPendingId)} aria-label={`${frontendText(locale, "TASKS_EDIT")}: ${task.title ? `${task.title} (${task.id})` : task.id}`} onClick={() => onOpen(task.id)}>{frontendText(locale, "TASKS_EDIT")}</Button>}
            <Button aria-label={`${statusAction}: ${taskLabel}`} size="sm" variant="outline" disabled={validConfirmation || actionPendingId != null} onClick={() => { if (!confirmationRef.current) onStatusChange?.(task.id, task.status === "done" ? "todo" : "done"); }}>{statusAction}</Button>
            <Button aria-label={`${frontendText(locale, "TASKS_DELETE")}: ${taskLabel}`} size="sm" variant="destructive" disabled={validConfirmation || deleteBlocked} onClick={() => requestDelete(task)}>{frontendText(locale, "TASKS_DELETE")}</Button>
          </div>;
        } },
      ]}
    /></>}
  </section><ConfirmAction open={validConfirmation} title={frontendText(locale, "TASKS_DELETE_CONFIRM_TITLE")}
    description={`${confirmation?.task.title.trim() ? `${confirmation.task.title.trim()} (${confirmation.task.id})` : confirmation?.task.id || ""} — ${frontendText(locale, "TASKS_DELETE_IMPACT")}`}
    cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, "TASKS_DELETE_CONFIRM")} destructive
    onCancel={cancelDelete} onConfirm={confirmDelete} /></>;
}
