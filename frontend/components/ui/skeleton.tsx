import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * The app's one block-shaped placeholder. The pulse is opacity-only, in the same
 * language as beUI's `motion/loader`, and it is gated by Tailwind's own
 * `motion-safe` variant — so a reduced-motion session gets a solid bar with no
 * animation runtime, and no JS animation is spent on a bar that has no shape to
 * animate. The global keyframe override in `styles/globals.css` remains the
 * backstop. `aria-busy`, the class merge and every attribute passthrough are
 * unchanged, so call sites cannot tell the difference.
 *
 * Busy surfaces use the installed beUI loader directly (`ui/page-state.tsx`
 * renders `motion/loader`); table placeholders use beUI's row-shaped
 * `motion/table/skeleton-rows`.
 */
export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div aria-busy="true" className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} {...props} />
);
