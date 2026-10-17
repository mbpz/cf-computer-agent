import * as React from "react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

export type PageToken = number | "ellipsis";

export interface PaginationLabels {
  navigationLabel: string;
  previousLabel: string;
  nextLabel: string;
  pageLabel(page: number): string;
}

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
  labels: PaginationLabels;
  disabled?: boolean;
  maxPage?: number;
}

/**
 * The pager chip: beUI's button surface (via `ui/button`) at the square the footer
 * needs, so the pager, the page-size field and every other button share one look.
 * `size-9` is the design lock's `--radius`-scaled square, not a new scale.
 */
const PAGE_LINK_CLASS = "size-9 shrink-0 rounded-lg px-0 text-sm";
const PAGE_LINK_ACTIVE_CLASS = "border-primary bg-accent font-semibold";

export const PaginationContent = React.forwardRef<HTMLOListElement, React.OlHTMLAttributes<HTMLOListElement>>(({ className, ...props }, ref) => <ol ref={ref} role="list" className={cn("flex items-center gap-1", className)} {...props} />);
PaginationContent.displayName = "PaginationContent";

export const PaginationItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement>>((props, ref) => <li ref={ref} {...props} />);
PaginationItem.displayName = "PaginationItem";

export interface PaginationLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { isActive?: boolean; }
export const PaginationLink = React.forwardRef<HTMLButtonElement, PaginationLinkProps>(({ className, type = "button", isActive = false, "aria-current": _ariaCurrent, ...props }, ref) => <Button ref={ref} type={type} variant="outline" size="icon" aria-current={isActive ? "page" : undefined} className={cn(PAGE_LINK_CLASS, isActive && PAGE_LINK_ACTIVE_CLASS, className)} {...props} />);
PaginationLink.displayName = "PaginationLink";

export const PaginationEllipsis = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} aria-hidden="true" className={cn("flex size-9 items-center justify-center text-sm text-muted-foreground", className)}>…</span>;

export const PaginationPrevious = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ children, ...props }, ref) => <PaginationLink ref={ref} {...props}>{children ?? <span aria-hidden="true">‹</span>}</PaginationLink>);
PaginationPrevious.displayName = "PaginationPrevious";

export const PaginationNext = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ children, ...props }, ref) => <PaginationLink ref={ref} {...props}>{children ?? <span aria-hidden="true">›</span>}</PaginationLink>);
PaginationNext.displayName = "PaginationNext";

export function Pagination({ className, currentPage, pageCount, onPageChange, labels, disabled = false, maxPage, ...props }: PaginationProps) {
  const safePageCount = Number.isSafeInteger(pageCount) && pageCount > 0 ? pageCount : 0;
  if (!safePageCount) return null;
  const safeCurrentPage = Number.isSafeInteger(currentPage) ? Math.max(currentPage, 1) : 1;
  const tokens = visiblePageTokens(safeCurrentPage, safePageCount);
  const lastAllowedPage = Number.isSafeInteger(maxPage) && maxPage! > 0 ? Math.min(safePageCount, maxPage!) : safePageCount;
  const previousPage = Math.min(lastAllowedPage, safeCurrentPage - 1);
  return <nav aria-label={labels.navigationLabel} className={cn("flex items-center gap-1", className)} {...props}>
    <PaginationPrevious aria-label={labels.previousLabel} disabled={disabled || safeCurrentPage <= 1} onClick={() => onPageChange?.(previousPage)}><span aria-hidden="true">‹</span><span className="sr-only">{labels.previousLabel}</span></PaginationPrevious>
    <PaginationContent>{tokens.map((token, index) => token === "ellipsis"
      ? <PaginationItem key={`ellipsis-${index}`}><PaginationEllipsis /></PaginationItem>
      : <PaginationItem key={token}><PaginationLink aria-label={labels.pageLabel(token)} isActive={safeCurrentPage <= safePageCount && token === safeCurrentPage} disabled={disabled || token > lastAllowedPage} onClick={() => onPageChange?.(token)}>{token}</PaginationLink></PaginationItem>)}</PaginationContent>
    <PaginationNext aria-label={labels.nextLabel} disabled={disabled || safeCurrentPage >= lastAllowedPage} onClick={() => onPageChange?.(safeCurrentPage + 1)}><span aria-hidden="true">›</span><span className="sr-only">{labels.nextLabel}</span></PaginationNext>
  </nav>;
}
