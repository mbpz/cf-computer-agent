import { useEffect, type ReactNode } from "react";
import { Table } from "./motion/table";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
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

export interface DataTableProps<T> {
  /** Every page appended so far, oldest first. */
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  /** Stable identity per row; survives appends and reorders. */
  rowId: (row: T, index: number) => string;
  /** Localized accessible name for the table. */
  ariaLabel: string;
  /** Localized node rendered once nothing has been loaded. */
  emptyState: ReactNode;
  /** Any page request in flight. */
  loading?: boolean;
  /** More server pages remain for this list. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  locale?: LocaleRuntime;
  /** Overrides the shared announcement while a later page is in flight. */
  loadingMoreLabel?: string;
  /** Overrides the shared note shown once the last page has been appended. */
  endOfListLabel?: string;
  rowHeight?: number;
  /** Viewport cap; the body scrolls past it and asks for the next page. */
  maxHeight?: number;
  /** Keeps a short first page from collapsing the table to its header. */
  minHeight?: number;
  className?: string;
}

const HEADER_HEIGHT = 45;

/**
 * Server-paginated list surface. Rows accumulate: `onLoadMore` appends the next
 * page instead of replacing the current one, and the caller keeps owning page
 * state, permissions and write recovery.
 */
export function DataTable<T>({ rows, columns, rowId, ariaLabel, emptyState, loading = false, hasMore = false, onLoadMore, locale, loadingMoreLabel, endOfListLabel, rowHeight = 56, maxHeight = 560, minHeight = 200, className }: DataTableProps<T>) {
  const contentHeight = HEADER_HEIGHT + rows.length * rowHeight;
  const height = Math.min(maxHeight, Math.max(minHeight, contentHeight));
  // Only mounted while it has something to announce: an always-present empty
  // live region adds noise to the accessibility tree for every list.
  const statusText = loading && rows.length > 0
    ? loadingMoreLabel ?? frontendText(locale, "LIST_LOADING_MORE")
    : !hasMore && rows.length > 0 ? endOfListLabel ?? frontendText(locale, "LIST_END_OF_LIST") : "";

  // A page shorter than the viewport leaves nothing to scroll, so the near-bottom
  // trigger can never fire: pull the next page until the list fills or ends.
  useEffect(() => {
    if (!hasMore || loading || !onLoadMore || rows.length === 0 || contentHeight >= height) return;
    onLoadMore();
  }, [hasMore, loading, onLoadMore, rows.length, contentHeight, height]);

  return <div className={cn("space-y-2", className)}>
    <Table
      data={[...rows]}
      columns={columns.map((column) => ({ key: column.key, header: column.header, align: column.align, width: column.width, cellClassName: column.cellClassName, cell: (row: T) => column.cell(row) }))}
      getRowId={(row, index) => rowId(row, index)}
      rowHeight={rowHeight}
      height={height}
      virtualize={false}
      loading={loading}
      emptyState={emptyState}
      ariaLabel={ariaLabel}
      onEndReached={hasMore && onLoadMore ? onLoadMore : undefined}
    />
    {statusText ? <p role="status" className="sr-only">{statusText}</p> : null}
  </div>;
}
