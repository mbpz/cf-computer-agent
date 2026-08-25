import * as React from "react";
import { cn } from "../../lib/utils";

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  currentPage: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
  previousLabel?: string;
  nextLabel?: string;
}

export function Pagination({ className, currentPage, pageCount, onPageChange, previousLabel = "Previous page", nextLabel = "Next page", ...props }: PaginationProps) {
  const safePageCount = Number.isSafeInteger(pageCount) ? Math.max(0, Math.min(pageCount, 50)) : 0;
  const safeCurrentPage = safePageCount ? Math.min(Math.max(Number.isSafeInteger(currentPage) ? currentPage : 1, 1), safePageCount) : 0;
  if (!safePageCount) return null;
  const pages = Array.from({ length: safePageCount }, (_, index) => index + 1);
  return <nav aria-label="Pagination" className={cn("flex items-center gap-1", className)} {...props}>
    <button type="button" aria-label={previousLabel} disabled={safeCurrentPage <= 1} onClick={() => onPageChange?.(safeCurrentPage - 1)} className="rounded-md border px-3 py-1.5 text-sm disabled:pointer-events-none disabled:opacity-50">Previous</button>
    <ol className="flex items-center gap-1" role="list">{pages.map((page) => <li key={page}><button type="button" aria-label={`Page ${page}`} aria-current={page === safeCurrentPage ? "page" : undefined} onClick={() => onPageChange?.(page)} className="min-w-9 rounded-md border px-2 py-1.5 text-sm aria-[current=page]:bg-accent aria-[current=page]:font-semibold">{page}</button></li>)}</ol>
    <button type="button" aria-label={nextLabel} disabled={safeCurrentPage >= safePageCount} onClick={() => onPageChange?.(safeCurrentPage + 1)} className="rounded-md border px-3 py-1.5 text-sm disabled:pointer-events-none disabled:opacity-50">Next</button>
  </nav>;
}
