import * as React from "react";
import {
  Alert as BeuiAlert,
  AlertAction,
  AlertClose as BeuiAlertClose,
  AlertContent,
  AlertIcon,
  AlertDescription as BeuiAlertDescription,
  AlertTitle as BeuiAlertTitle,
  type AlertCloseProps as BeuiAlertCloseProps,
  type AlertProps as BeuiAlertProps,
  type AlertVariant as BeuiAlertVariant,
} from "../motion/alert";

export { AlertAction, AlertContent, AlertIcon };
export type { AlertActionProps, AlertContentProps, AlertIconProps } from "../motion/alert";

/**
 * The app's single Alert, rendered by beUI's `motion/alert`: one animated,
 * presence-gated feedback surface for errors, warnings and notices. The variant
 * names, `AlertTitle`/`AlertDescription` and the `role` default are unchanged so
 * all importers keep working; the adapter maps the old variant names onto
 * beUI's and keeps every call site's children in the alert's text column, which
 * beUI expresses with `AlertContent` and this repo's 25 call sites compose as
 * plain siblings.
 */
const VARIANT = {
  default: "default",
  destructive: "destructive",
  info: "info",
  success: "success",
  warning: "warning",
} as const satisfies Record<string, BeuiAlertVariant>;

export type AlertVariantName = keyof typeof VARIANT;

export interface AlertProps extends Omit<BeuiAlertProps, "variant" | "role" | "children"> {
  variant?: AlertVariantName;
  role?: "alert" | "status";
  children?: React.ReactNode;
}

export function Alert({ variant = "default", role, children, ...props }: AlertProps) {
  // `AlertIcon` and `AlertClose` belong to the row; everything else is the
  // message column, which is what a bare `<AlertTitle/>`/`<AlertDescription/>`
  // pair has always been.
  let icon: React.ReactNode = null;
  let close: React.ReactNode = null;
  const column: React.ReactNode[] = [];
  for (const child of React.Children.toArray(children)) {
    if (React.isValidElement(child) && child.type === AlertIcon) icon = child;
    else if (React.isValidElement(child) && child.type === AlertClose) close = child;
    else column.push(child);
  }

  return (
    <BeuiAlert variant={VARIANT[variant]} role={role ?? "alert"} {...props}>
      {icon}
      <AlertContent>{column}</AlertContent>
      {close}
    </BeuiAlert>
  );
}

export const AlertTitle = ({ className, ...props }: React.ComponentProps<"div">) => (
  <BeuiAlertTitle className={className} {...props} />
);

export const AlertDescription = ({ className, ...props }: React.ComponentProps<"div">) => (
  // beUI tones the description down to muted text. Every destructive alert in
  // this repo reads as one red message, so the description inherits the alert's
  // colour again when the surface is destructive.
  <BeuiAlertDescription
    className={`[[data-variant=destructive]_&]:text-destructive ${className ?? ""}`}
    {...props}
  />
);

export interface AlertCloseProps extends Omit<BeuiAlertCloseProps, "aria-label"> {
  /** Localized accessible name for the dismiss control. */
  label: string;
}

export const AlertClose = ({ label, ...props }: AlertCloseProps) => (
  <BeuiAlertClose aria-label={label} {...props} />
);
