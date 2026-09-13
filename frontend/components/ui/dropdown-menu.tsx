import * as React from "react";
import { cn } from "../../lib/utils";
import { menuKeyAction } from "../../lib/menu-keyboard";

type CloseReason = "trigger" | "outside" | "escape" | "selection";
const ENABLED_MENU_ITEM_SELECTOR = "[role^='menuitem']:not([aria-disabled='true']):not([disabled])";

interface DropdownMenuContextValue {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  setOpen(next: boolean, reason: CloseReason): void;
  keyboardOpeningRef: React.RefObject<boolean>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext() {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenu components must be used inside DropdownMenu");
  return context;
}

export function DropdownMenu({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  menuId,
}: {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  menuId?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const keyboardOpeningRef = React.useRef(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const isControlled = controlledOpen !== undefined;

  const setOpen = React.useCallback((next: boolean, reason: CloseReason) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next && reason === "escape") triggerRef.current?.focus();
  }, [isControlled, onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    const dismissOutside = (event: PointerEvent | FocusEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      setOpen(false, "outside");
    };
    const dismissAfterFocus = (event: FocusEvent) => {
      const target = event.target;
      queueMicrotask(() => {
        if (active && document.activeElement === target) dismissOutside(event);
      });
    };
    // A blur can temporarily leave focus on body between pointerdown and click.
    // Only dismiss when a pointer or new focus actually lands outside the menu.
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissAfterFocus);
    return () => {
      active = false;
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissAfterFocus);
    };
  }, [open, setOpen]);

  React.useEffect(() => {
    if (!open || !keyboardOpeningRef.current) return;
    keyboardOpeningRef.current = false;
    contentRef.current?.querySelector<HTMLElement>(ENABLED_MENU_ITEM_SELECTOR)?.focus();
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open || event.defaultPrevented || event.key !== "Escape") return;
    event.preventDefault();
    setOpen(false, "escape");
  };

  return <DropdownMenuContext.Provider value={{ open, triggerRef, contentRef, setOpen, keyboardOpeningRef }}><div data-menu-id={menuId} className="relative" onKeyDown={handleKeyDown}>{children}</div></DropdownMenuContext.Provider>;
}

export function DropdownMenuTrigger({ className, onClick, onKeyDown, type, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, triggerRef, setOpen, keyboardOpeningRef } = useDropdownMenuContext();
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) setOpen(!open, "trigger");
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || open || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    keyboardOpeningRef.current = true;
    setOpen(true, "trigger");
  };
  return <button ref={triggerRef as React.RefObject<HTMLButtonElement | null>} {...props} type={type ?? "button"} aria-haspopup="menu" aria-expanded={open} className={cn("cursor-pointer rounded-md p-2 hover:bg-accent", className)} onClick={handleClick} onKeyDown={handleKeyDown} />;
}

export function DropdownMenuContent({ className, onKeyDown, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, contentRef, setOpen } = useDropdownMenuContext();
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const action = menuKeyAction(event.key);
    if (!action) return;
    event.preventDefault();
    if (action === "close") {
      setOpen(false, "escape");
      return;
    }
    const content = contentRef.current;
    if (!content) return;
    const items = Array.from(content.querySelectorAll<HTMLElement>(ENABLED_MENU_ITEM_SELECTOR));
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const index = action === "first" ? 0 : action === "last" ? items.length - 1 : (current + (action === "next" ? 1 : -1) + items.length) % items.length;
    items[index]?.focus();
  };
  if (!open) return null;
  return <div ref={contentRef} {...props} role="menu" className={cn("absolute right-0 z-20 mt-2 min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md", className)} onKeyDown={handleKeyDown} />;
}

export function DropdownMenuItem({ className, closeOnSelect = true, disabled = false, onClick, role = "menuitem", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { closeOnSelect?: boolean }) {
  const { setOpen } = useDropdownMenuContext();
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
    if (!event.defaultPrevented && closeOnSelect) setOpen(false, "selection");
  };
  return <button {...props} type="button" role={role} tabIndex={-1} aria-disabled={disabled ? "true" : undefined} disabled={disabled} className={cn("flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent", className)} onClick={handleClick} />;
}
