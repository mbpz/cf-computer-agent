import { Alert, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DataTable } from "../../components/data-table";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { SortableList, SortableListGroup, SortableListItem } from "../../components/motion/sortable-list";
import { Loader } from "../../components/motion/loader";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { SupportedPageSize } from "../../lib/numbered-page";
import type { TaskItem } from "../../lib/tasks-data";
import { taskPriorityKey, taskStatusKey } from "../tasks/tasks-model";
import { BOARD_STATUSES, adjacentBoardStatus, boardStatusTargets, visibleBoardItems, type BoardColumnStates, type BoardStatus, type BoardTargetStatus } from "./board-model";

export interface BoardUnknownMove { task: Pick<TaskItem, "id" | "title">; source: BoardStatus; target: BoardTargetStatus }

export function BoardsPage({ locale, columns, actionError, actionNotice, actionPendingId = null, unknownMove = null, recovering = false, recordBlocked = false, onRetry, onLoadMore, onPageChange, onPageSizeChange, onStatusChange, onCheckMove, onRetryMove, onDiscardRecord }: {
  locale: LocaleRuntime;
  columns: BoardColumnStates;
  actionError?: string;
  actionNotice?: string;
  actionPendingId?: string | null;
  unknownMove?: BoardUnknownMove | null;
  recordBlocked?: boolean;
  onDiscardRecord?: () => void;
  recovering?: boolean;
  onRetry: (status: BoardStatus) => void;
  onLoadMore?: (status: BoardStatus) => void;
  onPageChange?: (status: BoardStatus, page: number) => void;
  onPageSizeChange?: (status: BoardStatus, pageSize: SupportedPageSize) => void;
  onStatusChange: (task: TaskItem, status: BoardTargetStatus) => void;
  onCheckMove?: () => void;
  onRetryMove?: () => void;
}) {
  const movesLocked = Boolean(actionPendingId) || unknownMove !== null || recovering || recordBlocked;
  return <section className="flex flex-col space-y-5 lg:h-full lg:min-h-0">
    <PageHeader title={frontendText(locale, "BOARDS_TITLE")} description={frontendText(locale, "BOARDS_DESCRIPTION")} />
    {recordBlocked && <Alert variant="destructive" data-board-move-record-blocked="">
      <AlertTitle>{frontendText(locale, "BOARDS_MOVE_RECORD_BLOCKED")}</AlertTitle>
      <div className="mt-3"><Button variant="outline" onClick={onDiscardRecord}>{frontendText(locale, "BOARDS_MOVE_RECORD_DISCARD")}</Button></div>
    </Alert>}
    {unknownMove && <Alert variant="destructive" data-board-move-unknown="">
      <AlertTitle>{frontendText(locale, "BOARDS_MOVE_UNKNOWN").replace("{title}", unknownMove.task.title.trim() || unknownMove.task.id).replace("{status}", frontendText(locale, taskStatusKey(unknownMove.target)))}</AlertTitle>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" disabled={recovering} onClick={onCheckMove}>{frontendText(locale, "BOARDS_MOVE_CHECK")}</Button>
        <Button variant="outline" disabled={recovering} onClick={onRetryMove}>{frontendText(locale, "BOARDS_MOVE_RETRY")}</Button>
      </div>
    </Alert>}
    {actionError && <Alert variant="destructive"><AlertTitle>{actionError}</AlertTitle></Alert>}
    {actionNotice && <p role="status" className="text-sm">{actionNotice}</p>}
    {/* The columns are a beUI sortable stack with reordering switched off: the workflow
        order is the fixed `BOARD_STATUSES` tuple, every move goes through the status API
        receipt, and no handle is rendered, so nothing can start a drag. Each row is the
        column itself (`data-board-column` rides the row), which is why the row keeps the
        column's own geometry. */}
    <SortableList
      items={BOARD_STATUSES.map((status) => ({ id: status }))}
      getItemLabel={(item) => frontendText(locale, taskStatusKey(item.id))}
      label={frontendText(locale, "BOARDS_TITLE")}
      instructions={null}
      labels={{ handle: "{label}", undo: frontendText(locale, "BOARDS_TITLE"), movedToPosition: "{label}", previousOrderRestored: "" }}
      disabled
      showUndo={false}
      className="w-full max-w-none lg:min-h-0 lg:flex-1"
    >
      <SortableListGroup data-board-columns="" className="flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-2 space-y-0 lg:min-h-0 lg:flex-1 lg:items-stretch xl:grid xl:grid-cols-4 xl:overflow-visible">
        {BOARD_STATUSES.map((status) => <BoardColumn key={status} status={status} state={columns[status]} locale={locale} actionPendingId={actionPendingId} movesLocked={movesLocked} onRetry={onRetry} onLoadMore={onLoadMore} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onStatusChange={onStatusChange} />)}
      </SortableListGroup>
    </SortableList>
  </section>;
}

function BoardColumn({ status, state, locale, actionPendingId, movesLocked, onRetry, onLoadMore, onPageChange, onPageSizeChange, onStatusChange }: {
  status: BoardStatus;
  state: BoardColumnStates[BoardStatus];
  locale: LocaleRuntime;
  actionPendingId: string | null;
  movesLocked: boolean;
  onRetry: (status: BoardStatus) => void;
  onLoadMore?: (status: BoardStatus) => void;
  onPageChange?: (status: BoardStatus, page: number) => void;
  onPageSizeChange?: (status: BoardStatus, pageSize: SupportedPageSize) => void;
  onStatusChange: (task: TaskItem, status: BoardTargetStatus) => void;
}) {
  const heading = frontendText(locale, taskStatusKey(status));
  return <SortableListItem id={status} data-board-column={status} className="flex w-72 shrink-0 snap-start flex-col items-stretch gap-3 rounded-lg border bg-muted/20 p-3 lg:min-h-0 xl:w-auto xl:min-w-0">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{heading}</h2>{state.kind === "ready" && <Badge variant="secondary" data-board-column-total={String(state.pagination.total)}>{state.pagination.total}</Badge>}</div>
    {state.kind === "loading" && <div data-page-state="loading" aria-busy="true" className="flex items-center justify-center py-6"><Loader variant="dots" size={20} label={frontendText(locale, "BOARDS_COLUMN_LOADING")} /></div>}
    {state.kind === "error" && <PageState kind="error" title={frontendText(locale, "BOARDS_COLUMN_ERROR")}><Button className="mt-3" variant="outline" onClick={() => onRetry(status)}>{frontendText(locale, "BOARDS_RETRY")}</Button></PageState>}
    {state.kind === "ready" && <ReadyColumn status={status} state={state} locale={locale} actionPendingId={actionPendingId} movesLocked={movesLocked} onRetry={onRetry} onLoadMore={onLoadMore} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onStatusChange={onStatusChange} />}
  </SortableListItem>;
}

function ReadyColumn({ status, state, locale, actionPendingId, movesLocked, onRetry, onLoadMore, onPageChange, onPageSizeChange, onStatusChange }: {
  status: BoardStatus;
  state: Extract<BoardColumnStates[BoardStatus], { kind: "ready" }>;
  locale: LocaleRuntime;
  actionPendingId: string | null;
  movesLocked: boolean;
  onRetry: (status: BoardStatus) => void;
  onLoadMore?: (status: BoardStatus) => void;
  onPageChange?: (status: BoardStatus, page: number) => void;
  onPageSizeChange?: (status: BoardStatus, pageSize: SupportedPageSize) => void;
  onStatusChange: (task: TaskItem, status: BoardTargetStatus) => void;
}) {
  const items = visibleBoardItems(status, state.items);
  const statusLabel = frontendText(locale, taskStatusKey(status));
  const writeLocked = movesLocked || state.pending;
  const taskCard = (task: TaskItem) => {
    const title = task.title.trim() || task.id;
    return <div className="space-y-2 py-1">
      <div data-board-task={task.id} data-optimistic={actionPendingId === task.id || undefined} tabIndex={writeLocked ? -1 : 0} aria-keyshortcuts="ArrowLeft ArrowRight" onKeyDown={(event) => {
        if (writeLocked || event.target !== event.currentTarget) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = adjacentBoardStatus(status, event.key === "ArrowRight" ? "right" : "left");
        if (next) onStatusChange(task, next);
      }} className="space-y-1">
        <h3 className="line-clamp-2 break-words text-sm font-medium">{title}</h3>
        <Badge variant="outline">{frontendText(locale, taskPriorityKey(task.priority))}</Badge>
      </div>
      <Select value="" onValueChange={(value) => onStatusChange(task, value as BoardTargetStatus)} disabled={writeLocked}>
        <SelectTrigger aria-label={frontendText(locale, "BOARDS_MOVE_TASK").replace("{title}", title).replace("{status}", statusLabel)}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="" disabled>{frontendText(locale, "BOARDS_MOVE_TO")}</SelectItem>
          {boardStatusTargets(status).map((target) => <SelectItem key={target} value={target}>{frontendText(locale, taskStatusKey(target))}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>;
  };
  return <>
    {state.loadError && <Alert variant="destructive"><AlertTitle>{frontendText(locale, "BOARDS_COLUMN_ERROR")}</AlertTitle><Button className="mt-3" variant="outline" onClick={() => onRetry(status)}>{frontendText(locale, "BOARDS_RETRY")}</Button></Alert>}
    <div aria-busy={state.pending || undefined} className="flex flex-col lg:min-h-0 lg:flex-1">
      <DataTable
        locale={locale}
        rows={items}
        rowId={(task) => task.id}
        ariaLabel={`${frontendText(locale, "BOARDS_COLUMN_LIST")}: ${statusLabel}`}
        emptyState={<PageState kind="empty" title={frontendText(locale, "BOARDS_COLUMN_EMPTY")} />}
        loading={state.pending}
        pagination={state.pagination}
        onPageChange={onPageChange ? (page: number) => onPageChange(status, page) : undefined}
        onPageSizeChange={onPageSizeChange ? (pageSize: SupportedPageSize) => onPageSizeChange(status, pageSize) : undefined}
        hasMore={state.pagination.page < state.pagination.totalPages}
        onLoadMore={() => onLoadMore?.(status)}
        fill
        rowHeight={140}
        columns={[
          { key: "task", header: frontendText(locale, "TASKS_TITLE"), cellClassName: "whitespace-normal", cell: taskCard },
        ]}
      />
    </div>
  </>;
}
