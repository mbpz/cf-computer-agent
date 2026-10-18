import * as React from "react";
import { Input as BeuiInput, type InputClassNames, type InputProps as BeuiInputProps } from "../motion/input";

export type { InputClassNames };

/**
 * The app's one single-line field: beUI's `motion/input`, re-exported under the
 * name the call sites already import. The value is a `string` and the change is
 * `onChange(value)`, so a field no longer carries a native `change` event; the
 * label, optional icons, the error line and the shake all come from the payload.
 *
 * The payload draws the 44px field shell, so `className` lands on the field's
 * column (the label/field/error stack) — the place a call site sets width or
 * spacing. `Textarea` keeps the same tokens for the multi-line case beUI does
 * not ship.
 */
export interface InputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "defaultValue" | "onChange"
  > {
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Truthy error triggers a shake, red border and (if a string) a message. */
  error?: string | boolean;
  /** Reserve one message line so validation does not shift nearby content. */
  reserveErrorLine?: boolean;
  success?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  classNames?: InputClassNames;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <BeuiInput ref={ref} {...(props as BeuiInputProps)} />
));
Input.displayName = "Input";
