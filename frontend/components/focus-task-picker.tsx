import { useEffect, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { DataTable } from "./data-table";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { loadTasks, type TaskItem, type TaskPage } from "../lib/tasks-data";
import { listPageSize, type FrontendPageRequest, type SupportedPageSize } from "../lib/numbered-page";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function FocusTaskPicker({locale, onSelect, onDenied, onClose}: {
  locale: LocaleRuntime; onSelect: (task: TaskItem) => void; onDenied: () => void; onClose: () => void;
}) {
  const [query, setQuery] = useState<{ q: string }>({ q: "" });
  const [draft, setDraft] = useState("");
  const [retry, setRetry] = useState(0);
  // The picker owns its window: the desktop pager replaces it, the mobile feed appends to it.
  const [request, setRequest] = useState<FrontendPageRequest>({ page: 1, pageSize: listPageSize });
  const [state, setState] = useState<{kind: "loading" | "error"} | {kind: "ready"; items: readonly TaskItem[]; pagination: TaskPage["pagination"]}>({kind: "loading"});
  const [loadingMore, setLoadingMore] = useState(false);
  const read = (target: FrontendPageRequest, q: string, signal: AbortSignal) => loadTasks({q}, target, fetch, signal);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({kind: "loading"});
    void read(request, query.q, controller.signal).then(page => {
      if (page.pagination.page !== request.page || page.pagination.pageSize !== request.pageSize || new Set(page.items.map(item => item.id)).size !== page.items.length) throw new Error("TASK_PAGE_MISMATCH");
      if (active) setState({kind: "ready", items: page.items, pagination: page.pagination});
    }).catch(error => {
      if (!active) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) onDenied();
      else setState({kind: "error"});
    });
    return () => {active = false; controller.abort();};
  }, [query, retry, request, onDenied]);
  // Later pages append to the loaded window; the picker keeps one query at a time.
  const loadMore = () => {
    if (state.kind !== "ready" || loadingMore || state.pagination.page >= state.pagination.totalPages) return;
    const controller = new AbortController();
    setLoadingMore(true);
    void read({ page: state.pagination.page + 1, pageSize: state.pagination.pageSize }, query.q, controller.signal).then(page => {
      setState((current) => current.kind === "ready" ? { kind: "ready", items: [...current.items, ...page.items], pagination: page.pagination } : current);
    }).catch(error => {
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) onDenied();
    }).finally(() => setLoadingMore(false));
  };
  // Page changes replace the window, so the picker never shows two pages at once.
  const changePage = (page: number) => { if (state.kind !== "ready" || loadingMore) return; setRequest({ page, pageSize: state.pagination.pageSize }); };
  const changePageSize = (pageSize: SupportedPageSize) => { if (state.kind !== "ready" || loadingMore) return; setRequest({ page: 1, pageSize }); };
  return <section aria-label={frontendText(locale, "FOCUS_CHOOSE_TASK")} className="space-y-3 rounded-md border p-3">
    <form className="flex gap-2" onSubmit={event => {event.preventDefault(); setState({kind: "loading"}); setQuery({ q: draft.trim() });}}>
      <Input aria-label={frontendText(locale, "FOCUS_SEARCH_TASKS")} value={draft} maxLength={200} onChange={event => setDraft(event.currentTarget.value)} />
      <Button type="submit" variant="secondary">{frontendText(locale, "FOCUS_SEARCH_TASKS")}</Button>
    </form>
    {state.kind === "loading" && <p role="status">{frontendText(locale, "FOCUS_TASKS_LOADING")}</p>}
    {state.kind === "error" && <div role="alert"><p>{frontendText(locale, "COMMON_UNABLE_TO_LOAD")}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>{frontendText(locale, "FOCUS_TASKS_RETRY")}</Button></div>}
    {state.kind === "ready" && <DataTable
      locale={locale}
      rows={state.items}
      rowId={(task) => task.id}
      ariaLabel={frontendText(locale, "FOCUS_CHOOSE_TASK")}
      emptyState={<p>{frontendText(locale, "FOCUS_TASKS_EMPTY")}</p>}
      loading={loadingMore}
      pagination={state.pagination}
      onPageChange={changePage}
      onPageSizeChange={changePageSize}
      hasMore={state.pagination.page < state.pagination.totalPages}
      onLoadMore={loadMore}
      rowHeight={56}
      columns={[{ key: "task", header: frontendText(locale, "FOCUS_CHOOSE_TASK"), cellClassName: "whitespace-normal", cell: (task) => <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => onSelect(task)}>{task.title}</Button> }]}
    />}
    <Button variant="outline" onClick={onClose}>{frontendText(locale, "FOCUS_PICKER_CLOSE")}</Button>
  </section>;
}
