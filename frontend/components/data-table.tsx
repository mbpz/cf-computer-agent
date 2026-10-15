import { useEffect, type ReactNode } from "react";
import { DataPagination } from "./data-pagination";
import { Table } from "./motion/table";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { useListMode } from "../lib/list-mode";
import type { SupportedPageSize } from "../lib/numbered-page";
import { cn } from "../lib/utils";

/** One rendered column; `cell` always owns the row markup so page contracts stay put. */
export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Extra classes for body cells, e.g. `whitespace-normal` to wrap multi-line content. */
  cellClassName?: string;
  align?: "left" | "center" | "right";
  width?: string;
}

/** Server page metadata for the desktop footer pager. */
export interface DataTablePage {
  page: number;
  pageSize: SupportedPageSize;
  total: number;
  totalPages: number;
}

export interface DataTableProps<T> {
  /** The loaded window, oldest row first. */
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  /** Stable identity per row; survives sorts and page changes. */
  rowId: (row: T, index: number) => string;
  /** Localized accessible name for the table. */
  ariaLabel: string;
  /** Localized node rendered once nothing has been loaded. */
  emptyState: ReactNode;
  /** A page request is in flight. */
  loading?: boolean;
  /** Desktop: page metadata, so the footer pager can render totals and ranges. */
  pagination?: DataTablePage;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: SupportedPageSize) => void;
  /** Mobile: more pages remain, so the feed keeps loading on scroll. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  locale: LocaleRuntime;
  rowHeight?: number;
  /**
   * Desktop only: fill the parent's height so the table header stays put, the
   * body scrolls and the pager is pinned. Mobile keeps the page scroll.
   */
  fill?: boolean;
  /** Viewport cap used when the desktop table does not fill its parent. */
  maxHeight?: number;
  /** Keeps a short page from collapsing the table to its header. */
  minHeight?: number;
  className?: string;
}

const HEADER_HEIGHT = 45;

/**
 * Server-paginated list surface with two shapes over the same rows: desktop gets
 * the pager (page changes replace the window), narrow viewports keep appending
 * through `onLoadMore`. The caller owns both state paths.
 */
export function DataTable<T>({ rows, columns, rowId, ariaLabel, emptyState, loading = false, pagination, onPageChange, onPageSizeChange, hasMore = false, onLoadMore, locale, rowHeight = 56, fill = false, maxHeight = 560, minHeight = 200, className }: DataTableProps<T>) {
  const desktop = useListMode() === "desktop";
  const height = Math.min(maxHeight, Math.max(minHeight, HEADER_HEIGHT + rows.length * rowHeight));
  const fills = desktop && fill;
  const feed = !desktop && hasMore && onLoadMore ? onLoadMore : undefined;
  // Only mounted while it has something to announce: an always-present empty
  // live region adds noise to the accessibility tree for every list. The feed
  // copy belongs to narrow viewports, where the pager is not rendered at all.
  const statusText = desktop ? ""
    : loading && rows.length > 0 ? frontendText(locale, "LIST_LOADING_MORE")
      : !hasMore && rows.length > 0 ? frontendText(locale, "LIST_END_OF_LIST") : "";

  // A page shorter than the viewport leaves nothing to scroll, so the near-bottom
  // trigger can never fire: pull the next page until the feed fills or ends.
  useEffect(() => {
    if (!feed || loading || rows.length === 0) return;
    // Content already overflows the viewport: the scroll trigger can fire on its own.
    if (height <= HEADER_HEIGHT + rows.length * rowHeight) return;
    feed();
  }, [feed, loading, rows.length, height]);

  return <div data-list-mode={desktop ? "desktop" : "mobile"} className={cn(fills ? "flex h-full min-h-0 flex-1 flex-col" : "space-y-2", className)}>
    <Table
      data={[...rows]}
      columns={columns.map((column) => ({ key: column.key, header: column.header, align: column.align, width: column.width, cellClassName: column.cellClassName, cell: (row: T) => column.cell(row) }))}
      getRowId={(row, index) => rowId(row, index)}
      rowHeight={rowHeight}
      {...(fills ? { fill: true } : { height })}
      virtualize={false}
      loading={loading}
      emptyState={emptyState}
      ariaLabel={ariaLabel}
      onEndReached={feed}
    />
    {desktop && pagination && onPageChange && onPageSizeChange && <DataPagination locale={locale} {...pagination} visibleCount={rows.length} pending={loading} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} className={cn(fills && "shrink-0")} />}
    {statusText ? <p role="status" className="sr-only">{statusText}</p> : null}
  </div>;
}
