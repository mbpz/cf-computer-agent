import { Alert, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DataPagination } from "../../components/data-pagination";
import { PageState } from "../../components/ui/page-state";
import { Select, SelectOption } from "../../components/ui/select";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { SupportedPageSize } from "../../lib/numbered-page";
import type { TaskItem } from "../../lib/tasks-data";
import { taskPriorityKey, taskStatusKey } from "../tasks/tasks-model";
import { BOARD_STATUSES, boardStatusTargets, visibleBoardItems, type BoardColumnStates, type BoardStatus } from "./board-model";

export function BoardsPage({ locale, columns, actionError, actionPendingId = null, onRetry, onPageChange, onPageSizeChange, onStatusChange }: {
  locale: LocaleRuntime;
  columns: BoardColumnStates;
  actionError?: string;
  actionPendingId?: string | null;
  onRetry: (status: BoardStatus) => void;
  onPageChange: (status: BoardStatus, page: number) => void;
  onPageSizeChange: (status: BoardStatus, pageSize: SupportedPageSize) => void;
  onStatusChange: (task: TaskItem, status: BoardStatus) => void;
}) {
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "BOARDS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "BOARDS_DESCRIPTION")}</p></div>
    {actionError && <Alert variant="destructive"><AlertTitle>{actionError}</AlertTitle></Alert>}
    <div className="grid items-start gap-4 xl:grid-cols-4">
      {BOARD_STATUSES.map((status) => <BoardColumn key={status} status={status} state={columns[status]} locale={locale} actionPendingId={actionPendingId} onRetry={onRetry} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onStatusChange={onStatusChange} />)}
    </div>
  </section>;
}

function BoardColumn({ status, state, locale, actionPendingId, onRetry, onPageChange, onPageSizeChange, onStatusChange }: {
  status: BoardStatus;
  state: BoardColumnStates[BoardStatus];
  locale: LocaleRuntime;
  actionPendingId: string | null;
  onRetry: (status: BoardStatus) => void;
  onPageChange: (status: BoardStatus, page: number) => void;
  onPageSizeChange: (status: BoardStatus, pageSize: SupportedPageSize) => void;
  onStatusChange: (task: TaskItem, status: BoardStatus) => void;
}) {
  const heading = frontendText(locale, taskStatusKey(status));
  return <article data-board-column={status} className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-3">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{heading}</h2>{state.kind === "ready" && <Badge variant="secondary">{state.pagination.total}</Badge>}</div>
    {state.kind === "loading" && <div><span className="sr-only">{frontendText(locale, "BOARDS_COLUMN_LOADING")}</span><PageState kind="loading" title={frontendText(locale, "BOARDS_COLUMN_LOADING")} /></div>}
    {state.kind === "error" && <PageState kind="error" title={frontendText(locale, "BOARDS_COLUMN_ERROR")}><Button className="mt-3" variant="outline" onClick={() => onRetry(status)}>{frontendText(locale, "BOARDS_RETRY")}</Button></PageState>}
    {state.kind === "ready" && <ReadyColumn status={status} state={state} locale={locale} actionPendingId={actionPendingId} onRetry={onRetry} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onStatusChange={onStatusChange} />}
  </article>;
}

function ReadyColumn({ status, state, locale, actionPendingId, onRetry, onPageChange, onPageSizeChange, onStatusChange }: {
  status: BoardStatus;
  state: Extract<BoardColumnStates[BoardStatus], { kind: "ready" }>;
  locale: LocaleRuntime;
  actionPendingId: string | null;
  onRetry: (status: BoardStatus) => void;
  onPageChange: (status: BoardStatus, page: number) => void;
  onPageSizeChange: (status: BoardStatus, pageSize: SupportedPageSize) => void;
  onStatusChange: (task: TaskItem, status: BoardStatus) => void;
}) {
  const items = visibleBoardItems(status, state.items);
  return <>
    {state.loadError && <Alert variant="destructive"><AlertTitle>{frontendText(locale, "BOARDS_COLUMN_ERROR")}</AlertTitle><Button className="mt-3" variant="outline" onClick={() => onRetry(status)}>{frontendText(locale, "BOARDS_RETRY")}</Button></Alert>}
    <div className="space-y-3" aria-busy={state.pending || undefined}>
      {items.length === 0 ? <PageState kind="empty" title={frontendText(locale, "BOARDS_COLUMN_EMPTY")} /> : items.map((task) => <TaskCard key={task.id} task={task} status={status} locale={locale} disabled={Boolean(actionPendingId) || state.pending} optimistic={actionPendingId === task.id} onStatusChange={onStatusChange} />)}
    </div>
    <DataPagination aria-label={`${frontendText(locale, "BOARDS_COLUMN_PAGINATION")}: ${frontendText(locale, taskStatusKey(status))}`} locale={locale} {...state.pagination} visibleCount={items.length} pending={state.pending} onPageChange={(page) => onPageChange(status, page)} onPageSizeChange={(pageSize) => onPageSizeChange(status, pageSize)} />
  </>;
}

function TaskCard({ task, status, locale, disabled, optimistic, onStatusChange }: {
  task: TaskItem;
  status: BoardStatus;
  locale: LocaleRuntime;
  disabled: boolean;
  optimistic: boolean;
  onStatusChange: (task: TaskItem, status: BoardStatus) => void;
}) {
  const title = task.title.trim() || task.id;
  const actionLabel = frontendText(locale, "BOARDS_MOVE_TASK")
    .replace("{title}", title)
    .replace("{status}", frontendText(locale, taskStatusKey(status)));
  return <Card data-board-task={task.id} data-optimistic={optimistic || undefined}>
    <CardContent className="space-y-3 p-3">
      <div className="space-y-1"><h3 className="break-words text-sm font-medium">{title}</h3><Badge variant="outline">{frontendText(locale, taskPriorityKey(task.priority))}</Badge></div>
      <Select aria-label={actionLabel} value="" disabled={disabled} onChange={(event) => onStatusChange(task, event.currentTarget.value as BoardStatus)}>
        <SelectOption value="" disabled>{frontendText(locale, "BOARDS_MOVE_TO")}</SelectOption>
        {boardStatusTargets(status).map((target) => <SelectOption key={target} value={target}>{frontendText(locale, taskStatusKey(target))}</SelectOption>)}
      </Select>
    </CardContent>
  </Card>;
}
