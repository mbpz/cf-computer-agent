import * as React from "react";
import { frontendPaginationLabels, type DataPaginationLocalization } from "../lib/i18n";
import { cn } from "../lib/utils";
import type { SupportedPageSize } from "../lib/numbered-page";
import { Pagination } from "./ui/pagination";
import { Select, SelectOption } from "./ui/select";

interface DataPaginationBaseProps extends React.HTMLAttributes<HTMLDivElement> {
  page?: number;
  pageSize?: SupportedPageSize;
  total?: number;
  totalPages?: number;
  visibleCount?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: SupportedPageSize) => void;
  pending?: boolean;
}

export type DataPaginationProps = DataPaginationBaseProps & DataPaginationLocalization;

const pageSizes: readonly SupportedPageSize[] = [20, 50, 100];

export function DataPagination({ className, page: rawPage, pageSize: rawPageSize, total: rawTotal, totalPages: rawTotalPages, visibleCount = 0, onPageChange, onPageSizeChange, pending = false, locale, labels: suppliedLabels, ...props }: DataPaginationProps) {
  const labels = suppliedLabels ?? frontendPaginationLabels(locale);
  const page = Number.isSafeInteger(rawPage) && rawPage! > 0 ? rawPage! : 1;
  const pageSize = pageSizes.includes(rawPageSize as SupportedPageSize) ? rawPageSize! : 20;
  const fallbackTotal = Number.isSafeInteger(visibleCount) && visibleCount > 0 ? visibleCount : 0;
  const total = Number.isSafeInteger(rawTotal) && rawTotal! >= 0 ? rawTotal! : fallbackTotal;
  const totalPages = Number.isSafeInteger(rawTotalPages) && rawTotalPages! >= 0
    ? rawTotalPages!
    : total === 0 ? 0 : Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const hasVisibleRows = total > 0 && offset < total;
  const rangeStart = hasVisibleRows ? offset + 1 : 0;
  const rangeEnd = hasVisibleRows ? Math.min(page * pageSize, total) : 0;
  const previousPage = page > totalPages ? Math.max(1, totalPages) : page - 1;
  return <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t pt-3", className)} {...props}>
    <p className="text-sm text-muted-foreground">{labels.totalLabel} <span className="font-medium text-foreground">{total}</span><span aria-hidden="true"> · </span>{labels.rangeLabel} <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span></p>
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-muted-foreground"><span className="hidden lg:inline">{labels.pageSizeLabel}</span><Select aria-label={labels.pageSizeLabel} className="w-[4.75rem]" disabled={pending} value={String(pageSize)} onChange={(event) => onPageSizeChange(Number(event.currentTarget.value) as SupportedPageSize)}>{pageSizes.map((size) => <SelectOption key={size} value={size}>{size}</SelectOption>)}</Select></label>
      <div data-pagination-desktop="true" className="hidden sm:flex"><Pagination currentPage={page} pageCount={totalPages} disabled={pending} onPageChange={onPageChange} labels={labels} /></div>
      <div data-pagination-mobile="true" className="flex items-center gap-2 sm:hidden">
        <button type="button" aria-label={labels.previousLabel} disabled={pending || page <= 1} onClick={() => onPageChange(previousPage)} className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"><span aria-hidden="true">‹</span></button>
        <span aria-live="polite" className="min-w-14 text-center text-sm text-muted-foreground">{labels.mobileSummary(totalPages === 0 ? 0 : page, totalPages)}</span>
        <button type="button" aria-label={labels.nextLabel} disabled={pending || totalPages === 0 || page >= totalPages} onClick={() => onPageChange(page + 1)} className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"><span aria-hidden="true">›</span></button>
      </div>
    </div>
  </div>;
}
