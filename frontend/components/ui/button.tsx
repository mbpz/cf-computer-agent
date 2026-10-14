import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { cn } from "../../lib/utils";
import { SPRING_PRESS } from "../../lib/ease";
import { useHoverCapable } from "../../lib/hooks/use-hover-capable";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    const reduce = useReducedMotion();
    const canHover = useHoverCapable();
    // Press feedback is pointer-only: keyboard activation keeps the static
    // surface so focus and Enter/Space never look like a tap.
    return (
      <motion.button
        ref={ref}
        type={type}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        whileHover={reduce || !canHover ? undefined : { scale: 1.015 }}
        transition={SPRING_PRESS}
        className={cn(buttonVariants({ variant, size, className }))}
        {...(props as HTMLMotionProps<"button">)}
      />
    );
  },
);
Button.displayName = "Button";
