import {
  AnimatedBadge,
  type AnimatedBadgeProps,
  type AnimatedBadgeSize,
  type AnimatedBadgeStatus,
} from "../motion/animated-badge";

/**
 * The app's single Badge, rendered by beUI's `motion/animated-badge`, so every
 * status pill in tables, headers and cards is the same surface. The historical
 * variant names map onto beUI's status palette, which keeps all importers
 * unchanged; the icon roll and the layout animation come from the source and
 * degrade to a static swap under `useReducedMotion`.
 */
const VARIANT = {
  // beUI's "info" is the primary-tinted status, which is what "default" meant.
  default: "info",
  secondary: "neutral",
  // beUI has one neutral status; "outline" was the other unemphatic pill.
  outline: "neutral",
  success: "success",
  warning: "warning",
  destructive: "danger",
} as const satisfies Record<string, AnimatedBadgeStatus>;

const SIZE = { sm: "sm", md: "md" } as const satisfies Record<string, AnimatedBadgeSize>;

export type BadgeVariantName = keyof typeof VARIANT;
export type BadgeSizeName = keyof typeof SIZE;

export interface BadgeProps extends Omit<AnimatedBadgeProps, "status" | "size"> {
  variant?: BadgeVariantName;
  /** Default "sm": the compact pill the tables and headers were laid out for. */
  size?: BadgeSizeName;
}

export const Badge = ({ variant = "default", size = "sm", className, ...props }: BadgeProps) => (
  <AnimatedBadge status={VARIANT[variant]} size={SIZE[size]} className={className} {...props} />
);
