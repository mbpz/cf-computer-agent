import { useCallback, useEffect, useRef, useState } from "react";
import { Command, MagnifyingGlass } from "@phosphor-icons/react";
import { useToast } from "../../lib/use-toast";
import type { ThemeMode } from "../../lib/theme";
import type { SessionSnapshot } from "../../contracts/api";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { defaultCommands, type CommandPaletteItem } from "../../lib/command-palette";
import { Button } from "../ui/button";
import {
  CommandPalette as BeuiCommandPalette,
  type CommandItem,
} from "../motion/command-palette";

/**
 * The shell's ⌘K command palette, rendered by beUI's `motion/command-palette`
 * with the documented local patches (see that file's header):
 *
 * - the palette owns its own portal, focus cadence, scroll lock and Escape, so
 *   the previous `ui/dialog` surface is no longer involved;
 * - `dataAttributes` carries `data-command-id` onto each option button, the
 *   hook the shell and workspace suites select rows by;
 * - `nativeEnter` keeps the shell's Enter guard: a focused option button keeps
 *   its native activation instead of the panel consuming the key;
 * - every accessible name comes from the existing `SHELL_COMMAND_*` keys.
 */
export function CommandPalette({ session, locale, onNavigate, onToggleTheme, onLogout, logoutPending = false, logoutError = null }: {
  session: SessionSnapshot;
  locale: Pick<LocaleRuntime, "t" | "locale">;
  onNavigate: (path: string) => void;
  onToggleTheme?: () => ThemeMode | void;
  onLogout?: () => void;
  logoutPending?: boolean;
  logoutError?: string | null;
}) {
  const toast = useToast();
  const logoutFromPalette = useRef(false);
  const [open, setOpen] = useState(false);
  // The payload owns the overlay; the shell still promises the trigger its
  // focus back when the palette closes (the old dialog's focus scope did this).
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const setPaletteOpen = (next: boolean) => {
    if (next) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else if (restoreFocusRef.current?.isConnected) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
    setOpen(next);
  };
  const commands = defaultCommands(session).filter((command) => command.action !== "logout" || (onLogout && !logoutPending));

  const execute = useCallback((command: CommandPaletteItem) => {
    setPaletteOpen(false);
    if (command.action === "logout") {
      if (!logoutPending) {
        logoutFromPalette.current = true;
        onLogout?.();
      }
      return;
    }
    if (command.action === "toggle-theme") {
      // The palette closes before the result is on screen, so confirm it here.
      const next = onToggleTheme?.();
      if (next) toast.show({ status: "info", duration: 2000, title: `${frontendText(locale, "SHELL_THEME")}: ${frontendText(locale, next === "dark" ? "SHELL_THEME_DARK" : next === "light" ? "SHELL_THEME_LIGHT" : "SHELL_THEME_SYSTEM")}` });
      return;
    }
    if (command.href) onNavigate(command.href);
  }, [locale, logoutPending, onLogout, onNavigate, onToggleTheme, toast]);

  // The palette filters and ranks on the payload's fuzzy model, so the items
  // carry the already-localized label plus the same id/keywords the repo's
  // `filterCommands` model exposes.
  const items: CommandItem[] = commands.map((command) => ({
    id: command.id,
    label: frontendText(locale, command.labelKey),
    group: frontendText(locale, "SHELL_GROUP_WORKSPACE"),
    keywords: [command.labelKey, command.id, ...command.keywords],
    icon: Command,
    dataAttributes: { "data-command-id": command.id },
    onSelect: () => execute(command),
  }));

  useEffect(() => {
    // A failed sign-out renders inside the account menu, which is not mounted
    // when the palette started it; surface it where the user actually is.
    if (!logoutError || !logoutFromPalette.current) return;
    logoutFromPalette.current = false;
    toast.show({ status: "error", duration: 8000, title: logoutError });
  }, [logoutError, toast]);

  return <>
    <Button type="button" variant="outline" size="sm" data-command-palette-trigger aria-label={frontendText(locale, "SHELL_COMMAND_PALETTE")} onClick={() => setPaletteOpen(true)} className="hidden min-w-36 justify-between gap-3 text-muted-foreground xl:inline-flex">
      <span className="flex items-center gap-2"><MagnifyingGlass size={16} aria-hidden="true" />{frontendText(locale, "SHELL_COMMAND_PALETTE")}</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘ / Ctrl K</kbd>
    </Button>
    <Button type="button" variant="ghost" size="icon" data-command-palette-mobile-trigger aria-label={frontendText(locale, "SHELL_COMMAND_PALETTE")} title={frontendText(locale, "SHELL_COMMAND_PALETTE")} onClick={() => setPaletteOpen(true)} className="shrink-0 xl:hidden"><MagnifyingGlass size={18} aria-hidden="true" /></Button>
    <BeuiCommandPalette
      items={items}
      open={open}
      onOpenChange={setPaletteOpen}
      shortcut="k"
      placeholder={frontendText(locale, "SHELL_COMMAND_PLACEHOLDER")}
      emptyMessage={frontendText(locale, "SHELL_COMMAND_EMPTY")}
      closeLabel={frontendText(locale, "SHELL_COMMAND_CLOSE")}
      dialogLabel={frontendText(locale, "SHELL_COMMAND_PALETTE")}
      listLabel={frontendText(locale, "SHELL_COMMAND_PALETTE")}
      resultsGroup={frontendText(locale, "SHELL_GROUP_WORKSPACE")}
      nativeEnter
      rowClassName="max-lg:min-h-11"
      footer={<div className="flex items-center gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground"><span>↑↓ {frontendText(locale, "SHELL_COMMAND_NAVIGATE")}</span><span>↵ {frontendText(locale, "SHELL_COMMAND_EXECUTE")}</span><span>Esc {frontendText(locale, "SHELL_COMMAND_CLOSE")}</span></div>}
    />
  </>;
}
