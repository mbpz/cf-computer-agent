import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

export type SortState = {
  key: string;
  direction: SortDirection;
};

export type TableColumn<T> = {
  /** Stable key; also the default object property read for the cell + sort value. */
  key: string;
  /** Header content. */
  header: ReactNode;
  /** Allow clicking the header to sort by this column. */
  sortable?: boolean;
  /** Cell text alignment. */
  align?: "left" | "center" | "right";
  /** Column width as a CSS length, e.g. "160px" or "20%". Omit to share remaining space equally. */
  width?: string;
  /** Custom cell renderer. Falls back to `row[key]`. */
  cell?: (row: T) => ReactNode;
  /** Extra classes for this column's body cells, e.g. to wrap instead of truncate. */
  cellClassName?: string;
  /** Render an inline text input for this column's cells (ignored when `cell` is set). */
  editable?: boolean;
  /** Value used for sorting. Falls back to `row[key]`. */
  sortValue?: (row: T) => string | number;
};

export type InsertPosition = "before" | "after";

export interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  /** Stable id per row, required for correct selection across sorts. Defaults to row index. */
  getRowId?: (row: T, index: number) => string;
  /** Render a leading checkbox column with select-all in the header. */
  selectable?: boolean;
  selectedRowIds?: string[];
  defaultSelectedRowIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Allow dragging the right edge of a header to resize that column. */
  resizable?: boolean;
  /** Minimum column width in px when resizing. */
  minColumnWidth?: number;
  onColumnResize?: (key: string, width: number) => void;
  /** Allow dragging a header grip to reorder columns. */
  reorderable?: boolean;
  onColumnOrderChange?: (keys: string[]) => void;
  /** Called when an `editable` cell changes. */
  onCellEdit?: (rowId: string, columnKey: string, value: string) => void;
  /** When set, non-sortable headers become editable inputs for the column name. */
  onColumnRename?: (columnKey: string, value: string) => void;
  /** Enables the row menu (Insert before / after). Receives the target index. */
  onInsertRow?: (index: number, position: InsertPosition) => void;
  /** Enables Delete in the row menu. */
  onDeleteRow?: (rowId: string, index: number) => void;
  /** Enables the column menu (Insert before / after). Receives the target column index. */
  onInsertColumn?: (index: number, position: InsertPosition) => void;
  /** Enables Delete in the column menu. */
  onDeleteColumn?: (columnKey: string, index: number) => void;
  /** Fixed row height in px — required for virtualization. */
  rowHeight?: number;
  /** Scroll viewport height in px. Ignored when `fill` is set. */
  height?: number;
  /**
   * Fill the parent's height instead of a fixed viewport: the header stays put
   * and the body scrolls inside. The parent must be a flex/grid item with a
   * resolved height.
   */
  fill?: boolean;
  /** Rows rendered above/below the viewport. */
  overscan?: number;
  /**
   * Window the body through the virtualizer. Off for bounded server windows:
   * every loaded row renders, so row content stays reachable for assistive
   * tech, find-in-page and print, and the DOM does not depend on measured sizes.
   */
  virtualize?: boolean;
  /** Fires when the viewport scrolls near the bottom — load the next page. */
  onEndReached?: () => void;
  /** Currently fetching — shows skeleton rows and pauses `onEndReached`. */
  loading?: boolean;
  /** How many skeleton rows to show while loading more (default 3). */
  skeletonRows?: number;
  emptyState?: ReactNode;
  /** Accessible name for the table element; callers keep this localized. */
  ariaLabel?: string;
  className?: string;
}

/** A data row paired with its stable id. */
export type TableRow<T> = { row: T; id: string };

/** Ref map from column key to its header cell, shared across the resize/reorder hooks. */
export type HeaderCellRefs = {
  current: Record<string, HTMLTableCellElement | null>;
};
