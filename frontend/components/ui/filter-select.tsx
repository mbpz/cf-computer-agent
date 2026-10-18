import { useRef, useState } from "react";
import { Combobox, ComboboxContent, ComboboxItem, ComboboxList, ComboboxTrigger } from "../motion/combobox";
import { cn } from "../../lib/utils";

/**
 * The one filter control for page toolbars, built on beUI's `combobox` so every queue
 * and list filters with the same surface and keyboard behaviour. The applied value is
 * also rendered as removable text by AppliedFilters, which is what the design research
 * asks for in §4.3: filters live in a consistent position and stay visible after
 * applying.
 *
 * The visible caption is a `<span>`, not a `<label>`: a wrapping label would name the
 * trigger with the caption ("Status") instead of the historical filter name
 * ("Asset status"), and the accessible name is what the filter landmarks and the suites
 * select by.
 *
 * The trigger is a real `button[aria-haspopup="listbox"]` carrying that name in an
 * `.sr-only` span, and the panel stays inside the field (`inline`), because the search
 * filter row goes into a bottom sheet on mobile and the suites address the options from
 * the trigger's parent. Both are §17 patches on the payload, recorded in
 * `components/motion/combobox/trigger.tsx` and `.../content.tsx`.
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
  const selected = options.find((option) => option.value === value) ?? options[0];
  const rootRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  return (
    <span ref={rootRef} className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      {label}
      <Combobox value={value} onValueChange={onChange} disabled={disabled} className="w-auto min-w-0" open={open} onOpenChange={(next) => {
        if (next) {
          const bounds = rootRef.current?.getBoundingClientRect();
          setAlignEnd(Boolean(bounds && bounds.right + 224 > window.innerWidth));
        }
        setOpen(next);
      }}>
        {/* The trigger stands at the shared field height (44px, the same floor the other
            fields enforce below `lg`), so a filter row and the fields it sits beside are
            one row. */}
        <ComboboxTrigger
          keyboard="trigger"
          label={ariaLabel}
          render={<button type="button" disabled={disabled} className="h-11 w-auto min-w-32 max-w-64" />}
        >
          <span className="min-w-0 truncate">{selected?.label}</span>
        </ComboboxTrigger>
        {/* Enum filters can be long (the audit action list runs past 40 entries): the panel
            scrolls instead of running the viewport. */}
        <ComboboxContent inline className={cn("min-w-0", alignEnd && "left-auto right-0")}>
          <ComboboxList className="max-h-80 overflow-y-auto">
            {options.map((option) => <ComboboxItem key={option.value} value={option.value}>{option.label}</ComboboxItem>)}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </span>
  );
}
