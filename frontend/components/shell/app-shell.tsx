import type { ReactNode } from "react";
import { ROUTES, requiredCapability, type FrontendCapability } from "../../contracts/routes";
import type { SessionSnapshot } from "../../contracts/api";
import type { FrontendLocale } from "../../lib/i18n";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { cn } from "../../lib/utils";
import { resolveFrontendAccess } from "../../lib/auth-boundary";

interface LocaleRuntime {
  readonly locale: FrontendLocale;
  t(key: string): string;
  setLocale(next: string): boolean;
}

export interface AppShellProps {
  session: SessionSnapshot;
  pathname: string;
  locale: LocaleRuntime;
  children: ReactNode;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
}

function hasCapability(session: SessionSnapshot, capability: FrontendCapability | null) {
  return capability === null || session.capabilities.includes(capability);
}

function displayValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() && value !== "undefined" && value !== "null" ? value : fallback;
}

export function AppShell({ session, pathname, locale, children, onNavigate, onLogout }: AppShellProps) {
  const routes = ROUTES.filter((route) => hasCapability(session, route.capability));
  const workspaceRoutes = routes.filter((route) => route.group === "workspace");
  const adminRoutes = routes.filter((route) => route.group === "admin");
  const memberLabel = displayValue(session.member.email, locale.t("COMMON_VALUE_UNAVAILABLE"));
  const navigate = (path: string) => onNavigate?.(path);
  const access = resolveFrontendAccess({ session, requiredCapability: requiredCapability(pathname) });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">{locale.t("SHELL_SKIP_MAIN")}</a>
      <aside data-shell-sidebar className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card lg:block">
        <div className="flex h-full flex-col p-4">
          <div className="mb-8 px-2"><p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">MEMORY GARDEN</p><p className="mt-2 text-sm font-medium">{locale.t("APP_BRAND_EYEBROW")}</p></div>
          <nav aria-label={locale.t("SHELL_PRIMARY_NAVIGATION")} className="space-y-6">
            <NavGroup title={locale.t("SHELL_GROUP_WORKSPACE")} routes={workspaceRoutes} pathname={pathname} locale={locale} onNavigate={navigate} />
            {adminRoutes.length > 0 && <NavGroup title={locale.t("SHELL_GROUP_ADMIN")} routes={adminRoutes} pathname={pathname} locale={locale} onNavigate={navigate} />}
          </nav>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header data-shell-topbar className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-8">
          <div className="flex items-center gap-3"><span className="text-sm font-semibold lg:hidden">MEMORY GARDEN</span><span className="hidden text-sm text-muted-foreground lg:inline">{locale.t("SHELL_CONTEXT_TITLE")}</span></div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger aria-label={locale.t("SHELL_LANGUAGE_LABEL")}><span aria-hidden="true">{locale.locale === "zh-CN" ? "中" : "EN"}</span></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => locale.setLocale("en")}>{locale.t("SHELL_LANGUAGE_EN")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => locale.setLocale("zh-CN")}>{locale.t("SHELL_LANGUAGE_ZH_CN")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger aria-label={memberLabel}>{memberLabel}</DropdownMenuTrigger>
              <DropdownMenuContent><DropdownMenuItem onClick={onLogout}>{locale.t("SHELL_LOGOUT")}</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="lg:hidden"><MobileNavigation routes={routes} pathname={pathname} locale={locale} onNavigate={navigate} /></div>
        <main id="main-content" className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl p-4 lg:p-8">{access.kind === "forbidden" ? <section role="alert" className="mx-auto max-w-xl rounded-lg border border-destructive/40 bg-destructive/5 p-6"><h1 className="text-xl font-semibold">{locale.t("PAGE_FORBIDDEN_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{locale.t("PAGE_FORBIDDEN_DESCRIPTION")}</p></section> : children}</main>
      </div>
    </div>
  );
}

function NavGroup({ title, routes, pathname, locale, onNavigate }: { title: string; routes: readonly typeof ROUTES[number][]; pathname: string; locale: LocaleRuntime; onNavigate: (path: string) => void }) {
  return <div><p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p><div className="space-y-1">{routes.map((route) => <a key={route.path} href={route.path} aria-current={pathname === route.path ? "page" : undefined} onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate(route.path); } }} className={cn("block rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground", pathname === route.path && "bg-accent font-medium text-accent-foreground")}>{locale.t(route.labelKey)}</a>)}</div></div>;
}

function MobileNavigation({ routes, pathname, locale, onNavigate }: { routes: readonly typeof ROUTES[number][]; pathname: string; locale: LocaleRuntime; onNavigate: (path: string) => void }) {
  return <Sheet><details className="border-b bg-card"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">{locale.t("SHELL_OPEN_NAVIGATION")}</summary><SheetContent><SheetHeader><SheetTitle>{locale.t("SHELL_WORKSPACE_NAVIGATION")}</SheetTitle></SheetHeader><SheetClose aria-label={locale.t("SHELL_CLOSE_NAVIGATION")}>×</SheetClose><nav className="mt-6 space-y-1">{routes.map((route) => <a key={route.path} href={route.path} aria-current={pathname === route.path ? "page" : undefined} onClick={() => onNavigate(route.path)} className="block rounded-md px-2 py-2 text-sm hover:bg-accent">{locale.t(route.labelKey)}</a>)}</nav></SheetContent></details></Sheet>;
}
