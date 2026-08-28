import * as React from "react";
import { cn } from "../../lib/utils";

export type PageToken = number | "ellipsis";

export function visiblePageTokens(currentPage: number, pageCount: number): PageToken[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) return [];
  const page = Number.isSafeInteger(currentPage) ? Math.min(Math.max(currentPage, 1), pageCount) : 1;
  const keep = new Set([1, pageCount, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pageCount));
  const pages = [...keep].sort((left, right) => left - right);
  const tokens: PageToken[] = [];
  pages.forEach((value, index) => {
    if (index > 0 && value - pages[index - 1]! > 1) tokens.push("ellipsis");
    tokens.push(value);
  });
  return tokens;
}

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  currentPage: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
  previousLabel?: string;
  nextLabel?: string;
  paginationLabel?: string;
  disabled?: boolean;
}

export const PaginationContent = React.forwardRef<HTMLOListElement, React.OlHTMLAttributes<HTMLOListElement>>(({ className, ...props }, ref) => <ol ref={ref} role="list" className={cn("flex items-center gap-1", className)} {...props} />);
PaginationContent.displayName = "PaginationContent";

export const PaginationItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement>>((props, ref) => <li ref={ref} {...props} />);
PaginationItem.displayName = "PaginationItem";

export interface PaginationLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { isActive?: boolean; }
export const PaginationLink = React.forwardRef<HTMLButtonElement, PaginationLinkProps>(({ className, type = "button", isActive = false, ...props }, ref) => <button ref={ref} type={type} aria-current={isActive ? "page" : props["aria-current"]} className={cn("inline-flex size-9 items-center justify-center rounded-md border border-input bg-background text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-[current=page]:border-primary aria-[current=page]:bg-accent aria-[current=page]:font-semibold", className)} {...props} />);
PaginationLink.displayName = "PaginationLink";

export const PaginationEllipsis = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span aria-hidden="true" className={cn("flex size-9 items-center justify-center text-sm text-muted-foreground", className)} {...props}>…<span className="sr-only">More pages</span></span>;

export const PaginationPrevious = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ children, ...props }, ref) => <PaginationLink ref={ref} {...props}>{children ?? <><span aria-hidden="true">‹</span><span className="sr-only">Previous page</span></>}</PaginationLink>);
PaginationPrevious.displayName = "PaginationPrevious";

export const PaginationNext = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ children, ...props }, ref) => <PaginationLink ref={ref} {...props}>{children ?? <><span aria-hidden="true">›</span><span className="sr-only">Next page</span></>}</PaginationLink>);
PaginationNext.displayName = "PaginationNext";

export function Pagination({ className, currentPage, pageCount, onPageChange, previousLabel = "Previous page", nextLabel = "Next page", paginationLabel = "Pagination", disabled = false, ...props }: PaginationProps) {
  const safePageCount = Number.isSafeInteger(pageCount) && pageCount > 0 ? pageCount : 0;
  if (!safePageCount) return null;
  const safeCurrentPage = Number.isSafeInteger(currentPage) ? Math.min(Math.max(currentPage, 1), safePageCount) : 1;
  const tokens = visiblePageTokens(safeCurrentPage, safePageCount);
  return <nav aria-label={paginationLabel} className={cn("flex items-center gap-1", className)} {...props}>
    <PaginationPrevious aria-label={previousLabel} disabled={disabled || safeCurrentPage <= 1} onClick={() => onPageChange?.(safeCurrentPage - 1)}><span aria-hidden="true">‹</span><span className="sr-only">{previousLabel}</span></PaginationPrevious>
    <PaginationContent>{tokens.map((token, index) => token === "ellipsis"
      ? <PaginationItem key={`ellipsis-${index}`}><PaginationEllipsis /></PaginationItem>
      : <PaginationItem key={token}><PaginationLink aria-label={`Page ${token}`} isActive={token === safeCurrentPage} disabled={disabled} onClick={() => onPageChange?.(token)}>{token}</PaginationLink></PaginationItem>)}</PaginationContent>
    <PaginationNext aria-label={nextLabel} disabled={disabled || safeCurrentPage >= safePageCount} onClick={() => onPageChange?.(safeCurrentPage + 1)}><span aria-hidden="true">›</span><span className="sr-only">{nextLabel}</span></PaginationNext>
  </nav>;
}
