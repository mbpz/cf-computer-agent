import * as React from "react";
import { cn } from "../../lib/utils";
import { menuKeyAction } from "../../lib/menu-keyboard";

type CloseReason = "trigger" | "outside" | "escape" | "selection";

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
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      setOpen(false, "outside");
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, setOpen]);

  React.useEffect(() => {
    if (!open || !keyboardOpeningRef.current) return;
    keyboardOpeningRef.current = false;
    contentRef.current?.querySelector<HTMLElement>("[role='menuitem']:not([aria-disabled='true']):not([disabled])")?.focus();
  }, [open]);

  const handleBlur = () => {
    queueMicrotask(() => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof Node)) return;
      if (triggerRef.current?.contains(activeElement) || contentRef.current?.contains(activeElement)) return;
      setOpen(false, "outside");
    });
  };

  return <DropdownMenuContext.Provider value={{ open, triggerRef, contentRef, setOpen, keyboardOpeningRef }}><div data-menu-id={menuId} className="relative" onBlur={handleBlur}>{children}</div></DropdownMenuContext.Provider>;
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
    const items = Array.from(content.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true']):not([disabled])"));
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const index = action === "first" ? 0 : action === "last" ? items.length - 1 : (current + (action === "next" ? 1 : -1) + items.length) % items.length;
    items[index]?.focus();
  };
  if (!open) return null;
  return <div ref={contentRef} {...props} role="menu" className={cn("absolute right-0 z-20 mt-2 min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md", className)} onKeyDown={handleKeyDown} />;
}

export function DropdownMenuItem({ className, disabled = false, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useDropdownMenuContext();
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
    if (!event.defaultPrevented) setOpen(false, "selection");
  };
  return <button {...props} type="button" role="menuitem" tabIndex={-1} aria-disabled={disabled ? "true" : undefined} disabled={disabled} className={cn("flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent", className)} onClick={handleClick} />;
}
