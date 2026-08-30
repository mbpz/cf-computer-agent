import type { TaskItem } from "../../lib/tasks-data";
import type { FrontendPageMetadata, FrontendPageRequest, SupportedPageSize } from "../../lib/numbered-page";

export const BOARD_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export type BoardTargetStatus = TaskItem["status"];
export type BoardPagination = Record<BoardStatus, FrontendPageRequest>;

export type BoardColumnState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: readonly TaskItem[]; pagination: FrontendPageMetadata; pending: boolean; loadError?: boolean };

export type BoardColumnStates = Record<BoardStatus, BoardColumnState>;

const transitions: Record<BoardStatus, readonly BoardTargetStatus[]> = {
  todo: ["doing", "done", "canceled"],
  doing: ["todo", "blocked", "done", "canceled"],
  blocked: ["todo", "doing", "done", "canceled"],
  done: ["todo"],
};

export function boardStatusTargets(status: BoardStatus): readonly BoardTargetStatus[] {
  return transitions[status];
}

export function parseBoardSearch(search: string): BoardPagination {
  const params = new URLSearchParams(search);
  return Object.fromEntries(BOARD_STATUSES.map((status) => [status, parseColumnPage(params, status)])) as unknown as BoardPagination;
}

export function writeBoardColumnSearch(search: string, status: BoardStatus, next: FrontendPageRequest): string {
  assertPageRequest(next);
  const params = new URLSearchParams(search);
  const pageKey = `${status}Page`;
  const pageSizeKey = `${status}PageSize`;
  params.delete(pageKey);
  params.delete(pageSizeKey);
  if (next.page !== 1) params.set(pageKey, String(next.page));
  if (next.pageSize !== 20) params.set(pageSizeKey, String(next.pageSize));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function visibleBoardItems(status: BoardStatus, items: readonly TaskItem[]): readonly TaskItem[] {
  return items.filter((item) => item.status === status);
}

function parseColumnPage(params: URLSearchParams, status: BoardStatus): FrontendPageRequest {
  const page = parsePositiveInteger(params.getAll(`${status}Page`), 1);
  const parsedPageSize = parsePositiveInteger(params.getAll(`${status}PageSize`), 20);
  const pageSize: SupportedPageSize = parsedPageSize === 50 || parsedPageSize === 100 ? parsedPageSize : 20;
  const offset = (page - 1) * pageSize;
  return { page: Number.isSafeInteger(offset) && offset < 10_000 ? page : 1, pageSize };
}

function parsePositiveInteger(values: readonly string[], fallback: number): number {
  if (values.length !== 1 || !/^[1-9]\d*$/u.test(values[0]!)) return fallback;
  const parsed = Number(values[0]);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function assertPageRequest(value: FrontendPageRequest): void {
  const offset = (value.page - 1) * value.pageSize;
  if (!Number.isSafeInteger(value.page) || value.page < 1 || ![20, 50, 100].includes(value.pageSize)
    || !Number.isSafeInteger(offset) || offset >= 10_000) throw new Error("BOARD_PAGE_REQUEST_INVALID");
}
