import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Command, MagnifyingGlass } from "@phosphor-icons/react";
import type { SessionSnapshot } from "../../contracts/api";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { defaultCommands, filterCommands, type CommandPaletteItem } from "../../lib/command-palette";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

export function CommandPalette({ session, locale, onNavigate, onToggleTheme, onLogout, logoutPending = false }: {
  session: SessionSnapshot;
  locale: Pick<LocaleRuntime, "t" | "locale">;
  onNavigate: (path: string) => void;
  onToggleTheme?: () => void;
  onLogout?: () => void;
  logoutPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const commands = useMemo(() => defaultCommands(session).filter((command) => command.action !== "logout" || (onLogout && !logoutPending)), [session, onLogout, logoutPending]);
  const filtered = filterCommands(commands, query, (key) => frontendText(locale, key));
  const activeCommand = filtered[activeIndex];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setActiveIndex((index) => Math.min(index, Math.max(filtered.length - 1, 0))), [filtered.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open, query]);

  const execute = (command: CommandPaletteItem) => {
    setOpen(false);
    if (command.action === "logout") { if (!logoutPending) onLogout?.(); return; }
    if (command.action === "toggle-theme") { onToggleTheme?.(); return; }
    if (command.href) onNavigate(command.href);
  };

  return <>
    <Button type="button" variant="outline" size="sm" data-command-palette-trigger aria-label={frontendText(locale, "SHELL_COMMAND_PALETTE")} onClick={() => setOpen(true)} className="hidden min-w-36 justify-between gap-3 text-muted-foreground xl:inline-flex">
      <span className="flex items-center gap-2"><MagnifyingGlass size={16} aria-hidden="true" />{frontendText(locale, "SHELL_COMMAND_PALETTE")}</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘ / Ctrl K</kbd>
    </Button>
    <Button type="button" variant="ghost" size="icon" data-command-palette-mobile-trigger aria-label={frontendText(locale, "SHELL_COMMAND_PALETTE")} title={frontendText(locale, "SHELL_COMMAND_PALETTE")} onClick={() => setOpen(true)} className="shrink-0 xl:hidden"><MagnifyingGlass size={18} aria-hidden="true" /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl overflow-hidden p-0" onKeyDown={(event) => {
        if (event.target !== inputRef.current) return;
        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0))); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
        if (event.key === "Enter" && filtered[activeIndex]) { event.preventDefault(); execute(filtered[activeIndex]); }
      }}>
        <div className="border-b p-4"><DialogTitle className="sr-only">{frontendText(locale, "SHELL_COMMAND_PALETTE")}</DialogTitle><div className="relative"><MagnifyingGlass size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input ref={inputRef} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={listId} aria-activedescendant={activeCommand ? `${listId}-${activeCommand.id}` : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder={frontendText(locale, "SHELL_COMMAND_PLACEHOLDER")} aria-label={frontendText(locale, "SHELL_COMMAND_PLACEHOLDER")} className="h-11 pl-10" /></div></div>
        <div ref={listRef} id={listId} role="listbox" aria-label={frontendText(locale, "SHELL_COMMAND_PALETTE")} className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {filtered.length ? filtered.map((command, index) => <button key={command.id} id={`${listId}-${command.id}`} data-command-id={command.id} type="button" role="option" aria-selected={index === activeIndex} onFocus={() => setActiveIndex(index)} onMouseEnter={() => setActiveIndex(index)} onClick={() => execute(command)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm ${index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}><Command size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{frontendText(locale, command.labelKey)}</span>{command.href && <span className="text-xs text-muted-foreground">{command.href}</span>}</button>) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">{frontendText(locale, "SHELL_COMMAND_EMPTY")}</p>}
        </div>
        <div className="flex items-center gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground"><span>↑↓ {frontendText(locale, "SHELL_COMMAND_NAVIGATE")}</span><span>↵ {frontendText(locale, "SHELL_COMMAND_EXECUTE")}</span><span>Esc {frontendText(locale, "SHELL_COMMAND_CLOSE")}</span></div>
      </DialogContent>
    </Dialog>
  </>;
}
