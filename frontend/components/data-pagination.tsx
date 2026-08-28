import * as React from "react";
import { cn } from "../lib/utils";
import type { SupportedPageSize } from "../lib/numbered-page";
import { Pagination } from "./ui/pagination";
import { Select, SelectOption } from "./ui/select";

export interface DataPaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  page: number;
  pageSize: SupportedPageSize;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: SupportedPageSize) => void;
  pending?: boolean;
  totalLabel?: string;
  rangeLabel?: string;
  pageSizeLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
}

const pageSizes: readonly SupportedPageSize[] = [20, 50, 100];

export function DataPagination({ className, page, pageSize, total, totalPages, onPageChange, onPageSizeChange, pending = false, totalLabel = "Total", rangeLabel = "Visible", pageSizeLabel = "Rows per page", previousLabel = "Previous page", nextLabel = "Next page", ...props }: DataPaginationProps) {
  const offset = (page - 1) * pageSize;
  const hasVisibleRows = total > 0 && offset < total;
  const rangeStart = hasVisibleRows ? offset + 1 : 0;
  const rangeEnd = hasVisibleRows ? Math.min(page * pageSize, total) : 0;
  const previousPage = page > totalPages ? Math.max(1, totalPages) : page - 1;
  return <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t pt-3", className)} {...props}>
    <p className="text-sm text-muted-foreground">{totalLabel} <span className="font-medium text-foreground">{total}</span><span aria-hidden="true"> · </span>{rangeLabel} <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span></p>
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-muted-foreground"><span className="hidden lg:inline">{pageSizeLabel}</span><Select aria-label={pageSizeLabel} className="w-[4.75rem]" disabled={pending} value={String(pageSize)} onChange={(event) => { const next = Number(event.currentTarget.value) as SupportedPageSize; onPageSizeChange(next); if (page !== 1) onPageChange(1); }}>{pageSizes.map((size) => <SelectOption key={size} value={size}>{size}</SelectOption>)}</Select></label>
      <div data-pagination-desktop="true" className="hidden sm:flex"><Pagination currentPage={page} pageCount={totalPages} disabled={pending} onPageChange={onPageChange} previousLabel={previousLabel} nextLabel={nextLabel} /></div>
      <div data-pagination-mobile="true" className="flex items-center gap-2 sm:hidden">
        <button type="button" aria-label={previousLabel} disabled={pending || page <= 1} onClick={() => onPageChange(previousPage)} className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"><span aria-hidden="true">‹</span></button>
        <span aria-live="polite" className="min-w-14 text-center text-sm text-muted-foreground">{totalPages === 0 ? "0 / 0" : `${page} / ${totalPages}`}</span>
        <button type="button" aria-label={nextLabel} disabled={pending || totalPages === 0 || page >= totalPages} onClick={() => onPageChange(page + 1)} className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"><span aria-hidden="true">›</span></button>
      </div>
    </div>
  </div>;
}
