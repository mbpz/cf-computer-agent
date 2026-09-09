import { useMemo, useState, type MouseEvent } from "react";
import { CaretRight, X } from "@phosphor-icons/react";
import type { SessionSnapshot } from "../../contracts/api";
import { ROUTES } from "../../contracts/routes";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { routeAccessAllowed } from "../../lib/route-access";
import { moduleForPath, WORKBENCH_MODULES } from "../../../shared/workbench-modules";
import { WORKSPACE_ROUTE_CAPABILITIES } from "../../../shared/workspace-route-capabilities";
import { Button } from "../ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { cn } from "../../lib/utils";

export function ContextRail({ pathname, locale, collapsed = false, onClose, session }: {
  pathname: string;
  locale: LocaleRuntime;
  collapsed?: boolean;
  onClose?: () => void;
  onNavigate?: (path: string) => void;
  session?: SessionSnapshot;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentModule = moduleForPath(pathname) ?? WORKBENCH_MODULES.find((module) => module.entryPath !== "/" && pathname.startsWith(`${module.entryPath}/`));
  const modules = useMemo(() => WORKBENCH_MODULES.filter((module) => {
    if (module.adminOnly && session?.member.role !== "admin") return false;
    const route = ROUTES.find((item) => item.path === module.entryPath);
    return !route || !session || routeAccessAllowed(session, route);
  }), [session]);
  const children = currentModule ? WORKSPACE_ROUTE_CAPABILITIES.filter((route) => route.moduleKey === currentModule.key && route.path !== currentModule.entryPath && (!session || routeAccessAllowed(session, route))) : [];
  const go = (event: MouseEvent<HTMLAnchorElement>, path: string) => { if (!onNavigate) return; event.preventDefault(); onNavigate(path); };
  const content = <div data-context-rail-content className={cn("flex min-h-0 flex-col gap-6", collapsed && "items-center") }>
    <div className={cn("flex items-center justify-between gap-2", collapsed && "justify-center")}>
      {!collapsed && <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{frontendText(locale, "SHELL_CONTEXT_TITLE")}</p><p className="mt-1 font-semibold">{currentModule ? frontendText(locale, currentModule.labelKey) : frontendText(locale, "MODULE_WORKBENCH")}</p></div>}
      <Button type="button" variant="ghost" size="icon" aria-label={frontendText(locale, "SHELL_CONTEXT_COLLAPSE")} onClick={onClose}><CaretRight size={16} className={cn(!collapsed && "rotate-180")} aria-hidden="true" /></Button>
    </div>
    <nav aria-label={frontendText(locale, "SHELL_MODULE_NAVIGATION")} className="space-y-1">
      {modules.map((module) => <a key={module.key} href={module.entryPath} onClick={(event) => go(event, module.entryPath)} aria-current={currentModule?.key === module.key ? "page" : undefined} title={collapsed ? frontendText(locale, module.labelKey) : undefined} className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground", currentModule?.key === module.key && "bg-accent font-medium text-accent-foreground", collapsed && "justify-center px-0")}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{!collapsed && frontendText(locale, module.labelKey)}</a>)}
    </nav>
    {!collapsed && children.length > 0 && <div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{frontendText(locale, "SHELL_CONTEXT_ACTIONS")}</p><nav aria-label={frontendText(locale, "SHELL_CONTEXT_ACTIONS")} className="space-y-1">{children.map((route) => <a key={route.id} href={route.path} onClick={(event) => go(event, route.path)} aria-current={pathname === route.path ? "page" : undefined} className="block rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">{frontendText(locale, route.labelKey)}</a>)}</nav></div>}
    {!collapsed && currentModule && <a href={currentModule.entryPath} onClick={(event) => go(event, currentModule.entryPath)} className="mt-auto flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">{frontendText(locale, "SHELL_OPEN_MODULE")}<CaretRight size={14} aria-hidden="true" /></a>}
  </div>;

  return <>
    <aside data-context-rail data-context-rail-state={collapsed ? "collapsed" : "expanded"} className={cn("hidden w-56 shrink-0 border-l bg-card/40 p-4 xl:block", collapsed && "w-14 px-2")}>
      {content}
    </aside>
    <div className="fixed bottom-4 right-4 z-30 xl:hidden"><Button type="button" variant="outline" size="sm" aria-label={frontendText(locale, "SHELL_OPEN_CONTEXT")} onClick={() => setMobileOpen(true)}>{frontendText(locale, "SHELL_OPEN_CONTEXT")}</Button></div>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="right" className="flex min-h-0 flex-col p-4"><div className="flex items-center justify-between"><SheetHeader><SheetTitle>{frontendText(locale, "SHELL_CONTEXT_TITLE")}</SheetTitle></SheetHeader><SheetClose aria-label={frontendText(locale, "SHELL_CLOSE_CONTEXT")}><X size={18} aria-hidden="true" /></SheetClose></div><div className="min-h-0 flex-1 overflow-y-auto pt-5">{content}</div></SheetContent></Sheet>
  </>;
}
