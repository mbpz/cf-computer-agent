import * as React from "react";
import { Button as BeuiButton, type ButtonProps as BeuiButtonProps, type ButtonSize, type ButtonVariant } from "../motion/button/base";
import { cn } from "../../lib/utils";

/**
 * The app's single Button, rendered by beUI's `motion/button/base`, so dialogs,
 * tables and pages share one button surface. The historical variant and size names
 * map onto beUI's, which keeps all importers unchanged; link-shaped buttons use
 * beUI's `ButtonLink` directly.
 */
const VARIANT = {
  default: "primary",
  secondary: "secondary",
  outline: "outline",
  ghost: "ghost",
  // beUI has no destructive variant: the primary surface plus the destructive
  // palette keeps the existing destructive look (cn lets the palette win).
  destructive: "primary",
} as const satisfies Record<string, ButtonVariant>;

const SIZE = { default: "md", md: "md", sm: "sm", lg: "lg", icon: "icon" } as const satisfies Record<string, ButtonSize>;

export type ButtonVariantName = keyof typeof VARIANT;
export type ButtonSizeName = keyof typeof SIZE;

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style" | "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"> {
  variant?: ButtonVariantName;
  size?: ButtonSizeName;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
    <BeuiButton
      ref={ref}
      type={type}
      variant={VARIANT[variant]}
      size={SIZE[size]}
      // beUI's button ships no focus ring; the app's keyboard contract needs one, so
      // the adapter adds it rather than forking the component.
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variant === "destructive" && "bg-destructive text-white hover:bg-destructive/90",
        className,
      )}
      {...(props as BeuiButtonProps)}
    />
  ),
);
Button.displayName = "Button";
