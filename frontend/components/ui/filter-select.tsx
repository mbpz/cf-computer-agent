import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../motion/select";
import { cn } from "../../lib/utils";

/**
 * The one filter control for page toolbars, built on beUI's Select so every queue
 * and list filters with the same surface and keyboard behaviour. The applied value
 * is also rendered as removable text by AppliedFilters, which is what the design
 * research asks for in §4.3: filters live in a consistent position and stay
 * visible after applying.
 *
 * The visible caption is a `<span>`, not a `<label>`: a wrapping label would name
 * the trigger with the caption ("Status") instead of the historical filter name
 * ("Asset status"), and the accessible name is what the filter landmarks and the
 * suites select by.
 */
export function FilterSelect({ label, ariaLabel, value, options, onChange, disabled, className }: {
  /** Visible label text next to the control. */
  label: string;
  /** Accessible name of the trigger; keep the historical names so tests and users keep their landmark. */
  ariaLabel: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      {label}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        {/* The trigger stands at the shared field height (44px, the same floor
            `motion/select` enforces below `lg`), so a filter row and the fields it
            sits beside are one row. Its corner radius is the payload's own morph. */}
        <SelectTrigger className="h-11 w-auto min-w-32 max-w-64">
          {/* beUI's trigger does not forward aria-label, so the accessible name rides
              inside it, keeping the historical landmark names the tests assert. */}
          <span className="sr-only">{ariaLabel}</span>
          <SelectValue className="min-w-0 truncate" />
        </SelectTrigger>
        {/* Enum filters can be long (the audit action list runs past 40 entries): the
            panel scrolls instead of running the viewport, on the payload's own hook. */}
        <SelectContent className="max-h-80 overflow-y-auto">
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </span>
  );
}
