import { RadioGroup, RadioGroupItem } from "./motion/radio";
import { cn } from "../lib/utils";

/**
 * The review period is one choice between two named periods, so it is a beUI radio
 * group rather than a listbox: `role="radiogroup"` with two `role="radio"` controls,
 * the selected one carrying `aria-checked`. The group is named by the same i18n key the
 * old listbox carried, so both locales keep their landmark.
 *
 * `data-review-period` marks each choice for the route suites; the value handed to
 * `onChange` is the store's own enum, never a derived date range.
 */
export function ReviewPeriodControl({ ariaLabel, dailyLabel, weeklyLabel, value, onChange, disabled, className }: {
  ariaLabel: string;
  dailyLabel: string;
  weeklyLabel: string;
  value: "daily" | "weekly";
  onChange: (period: "daily" | "weekly") => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <RadioGroup
      aria-label={ariaLabel}
      orientation="horizontal"
      value={value}
      onValueChange={(next) => onChange(next === "weekly" ? "weekly" : "daily")}
      className={cn("items-center gap-4", className)}
    >
      <RadioGroupItem value="daily" label={dailyLabel} disabled={disabled} data-review-period="daily" />
      <RadioGroupItem value="weekly" label={weeklyLabel} disabled={disabled} data-review-period="weekly" />
    </RadioGroup>
  );
}
