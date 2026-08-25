import * as React from "react";
import { cn } from "../../lib/utils";
import { menuKeyAction } from "../../lib/menu-keyboard";

export const DropdownMenu = ({ children }: { children: React.ReactNode }) => {
  const ref = React.useRef<HTMLDetailsElement>(null);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDetailsElement>) => {
    const action = menuKeyAction(event.key);
    if (!action) return;
    event.preventDefault();
    const root = ref.current;
    if (!root) return;
    if (action === "close") {
      root.open = false;
      root.querySelector<HTMLElement>("summary")?.focus();
      return;
    }
    const items = Array.from(root.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])"));
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const index = action === "first" ? 0 : action === "last" ? items.length - 1 : (current + (action === "next" ? 1 : -1) + items.length) % items.length;
    items[index]?.focus();
  };
  return <details ref={ref} className="relative" onKeyDown={onKeyDown}>{children}</details>;
};
export const DropdownMenuTrigger = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <summary className={cn("cursor-pointer list-none rounded-md p-2 hover:bg-accent", className)} {...props} />;
export const DropdownMenuContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div role="menu" className={cn("absolute right-0 z-20 mt-2 min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md", className)} {...props} />;
export const DropdownMenuItem = ({ className, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" role="menuitem" tabIndex={-1} aria-disabled={disabled ? "true" : undefined} disabled={disabled} className={cn("flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent", className)} {...props} />;
