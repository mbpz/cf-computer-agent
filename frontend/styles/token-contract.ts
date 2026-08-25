export const FRONTEND_TOKEN_NAMES = Object.freeze([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
] as const);

export const FRONTEND_TOKEN_POLICY = Object.freeze({
  lightSelector: ":root",
  darkSelector: ".dark",
  reducedMotionMedia: "(prefers-reduced-motion: reduce)",
  forbidDecorativeGradients: true,
} as const);
