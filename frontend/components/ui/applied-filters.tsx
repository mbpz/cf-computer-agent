import { Button } from "./button";
import { cn } from "../../lib/utils";

export interface AppliedFilter {
  id: string;
  label: string;
  onRemove: () => void;
}

/**
 * The applied conditions of a list, as removable text with a clear-all entry, per the
 * design research §4.3. Renders nothing when no condition is applied, so pages can drop
 * it in unconditionally.
 */
export function AppliedFilters({ filters, onClear, clearLabel, ariaLabel, className }: {
  filters: readonly AppliedFilter[];
  onClear: () => void;
  clearLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  if (filters.length === 0) return null;
  return (
    <div data-applied-filters role="group" aria-label={ariaLabel} className={cn("flex flex-wrap items-center gap-2 text-sm", className)}>
      {filters.map((filter) => (
        <span key={filter.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
          {filter.label}
          <button type="button" aria-label={`${clearLabel}: ${filter.label}`} onClick={filter.onRemove} className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full">×</button>
        </span>
      ))}
      <Button variant="ghost" size="sm" data-filters-clear onClick={onClear}>{clearLabel}</Button>
    </div>
  );
}
