import { Checkbox as BeuiCheckbox } from "../motion/checkbox";

/**
 * The app's one checkbox: beUI's `motion/checkbox`, re-exported so call sites
 * keep a `checked` / `onCheckedChange` contract instead of binding a native
 * `input[type=checkbox]`. The payload renders a `button[role=checkbox]` with
 * `aria-checked` and the animated tick, so a selection is announced by its role
 * and state rather than by a form control.
 *
 * The payload spreads no arbitrary props, so the `data-*` hooks the suites and
 * the layout use settle on one wrapper element around it. Everything else —
 * the visible `label`, the `description` under it, `aria-label` and
 * `aria-describedby` — goes to the payload, which names the control from the
 * text it renders.
 */
export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Visible label beside the box; also the control's accessible name. */
  label?: string;
  /** Supporting text under the label, announced as the description. */
  description?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  [key: `data-${string}`]: string | number | boolean | undefined;
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  ...data
}: CheckboxProps) {
  return (
    <span {...data}>
      <BeuiCheckbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        label={label}
        description={description}
        id={id}
        className={className}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
      />
    </span>
  );
}
