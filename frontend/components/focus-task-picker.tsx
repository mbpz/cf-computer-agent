import { useEffect, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { loadTasks, type TaskItem, type TaskPage } from "../lib/tasks-data";
import type { FrontendPageRequest } from "../lib/numbered-page";
import { DataPagination } from "./data-pagination";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function FocusTaskPicker({locale, onSelect, onDenied, onClose}: {
  locale: LocaleRuntime; onSelect: (task: TaskItem) => void; onDenied: () => void; onClose: () => void;
}) {
  const [query, setQuery] = useState<FrontendPageRequest & {q: string}>({page: 1, pageSize: 20, q: ""});
  const [draft, setDraft] = useState("");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{kind: "loading" | "error"} | {kind: "ready"; page: TaskPage}>({kind: "loading"});
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({kind: "loading"});
    void loadTasks({q: query.q}, query, fetch, controller.signal).then(page => {
      if (page.pagination.page !== query.page || page.pagination.pageSize !== query.pageSize || new Set(page.items.map(item => item.id)).size !== page.items.length) throw new Error("TASK_PAGE_MISMATCH");
      if (active) setState({kind: "ready", page});
    }).catch(error => {
      if (!active) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) onDenied();
      else setState({kind: "error"});
    });
    return () => {active = false; controller.abort();};
  }, [query, retry, onDenied]);
  return <section aria-label={frontendText(locale, "FOCUS_CHOOSE_TASK")} className="space-y-3 rounded-md border p-3">
    <form className="flex gap-2" onSubmit={event => {event.preventDefault(); setState({kind: "loading"}); setQuery({...query, page: 1, q: draft.trim()});}}>
      <Input aria-label={frontendText(locale, "FOCUS_SEARCH_TASKS")} value={draft} maxLength={200} onChange={event => setDraft(event.currentTarget.value)} />
      <Button type="submit" variant="secondary">{frontendText(locale, "FOCUS_SEARCH_TASKS")}</Button>
    </form>
    {state.kind === "loading" && <p role="status">{frontendText(locale, "FOCUS_TASKS_LOADING")}</p>}
    {state.kind === "error" && <div role="alert"><p>{frontendText(locale, "COMMON_UNABLE_TO_LOAD")}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>{frontendText(locale, "FOCUS_TASKS_RETRY")}</Button></div>}
    {state.kind === "ready" && <>
      {state.page.items.length === 0 && <p>{frontendText(locale, "FOCUS_TASKS_EMPTY")}</p>}
      <ul className="space-y-1">{state.page.items.map(task => <li key={task.id}><Button variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => onSelect(task)}>{task.title}</Button></li>)}</ul>
      <DataPagination locale={locale} {...state.page.pagination} maxPage={Math.ceil(10000 / query.pageSize)} onPageChange={page => {setState({kind: "loading"}); setQuery({...query, page});}} onPageSizeChange={pageSize => {setState({kind: "loading"}); setQuery({...query, pageSize, page: 1});}} />
    </>}
    <Button variant="outline" onClick={onClose}>{frontendText(locale, "FOCUS_PICKER_CLOSE")}</Button>
  </section>;
}
