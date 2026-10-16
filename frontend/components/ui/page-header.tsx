import { useId, type ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * The app's one page header: a title, at most one line of context, an optional status
 * note and the page's actions. Pages stop copying className strings for this, per
 * docs/product/2026-10-15-authenticated-workspace-design-research.md §4.2. This is a
 * project composition, not a beUI component.
 */
export function PageHeader({ title, description, status, icon, actions, className }: {
  title: ReactNode;
  /** One line of context: current scope, filter range or object state. */
  description?: ReactNode;
  /** Real, visible state such as read-only, private or archived. Never colour alone. */
  status?: ReactNode;
  /** Optional leading glyph from the project's icon family (Phosphor). */
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          {icon}
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-.02em] text-foreground" aria-describedby={descriptionId}>{title}</h1>
        </div>
        {description ? <p id={descriptionId} className="max-w-[70ch] text-sm text-muted-foreground">{description}</p> : null}
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
