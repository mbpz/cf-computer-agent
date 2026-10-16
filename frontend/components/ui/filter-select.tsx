import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../motion/select";
import { cn } from "../../lib/utils";

/**
 * The one filter control for page toolbars, built on beUI's Select so every queue and
 * list filters with the same surface and keyboard behaviour. The applied value is also
 * rendered as removable text by AppliedFilters, which is what the design research asks
 * for in §4.3: filters live in a consistent position and stay visible after applying.
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
    <label className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      {label}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-9 w-auto min-w-32 rounded-full">
          {/* beUI's trigger does not forward aria-label, so the accessible name rides
              inside it, keeping the historical landmark names the tests assert. */}
          <span className="sr-only">{ariaLabel}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}
