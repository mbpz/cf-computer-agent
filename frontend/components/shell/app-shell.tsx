import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, CaretDown, ChartLine, DotsThree, Files, GearSix, House, MagnifyingGlass, Moon, NotePencil, Scroll, ShieldCheck, SidebarSimple, Sparkle, Stack, Sun, UploadSimple, UsersThree } from "@phosphor-icons/react";
import { ROUTES, requiredCapability, type FrontendCapability } from "../../contracts/routes";
import type { SessionSnapshot } from "../../contracts/api";
import type { FrontendLocale } from "../../lib/i18n";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { cn } from "../../lib/utils";
import { resolveFrontendAccess } from "../../lib/auth-boundary";
import { matchRoute } from "../../lib/router";
import { applyTheme, readTheme, type ThemeMode } from "../../lib/theme";
import { loadNavigation, mergeRequiredWorkspaceNavigation, type NavigationDataNode } from "../../lib/navigation-data";
import { Badge } from "../ui/badge";
import { menuAvailability, type MenuAvailability } from "../../../shared/workspace-route-capabilities";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

interface LocaleRuntime {
  readonly locale: FrontendLocale;
  t(key: string): string;
  setLocale(next: string): boolean;
}

export interface AppShellProps {
  session: SessionSnapshot;
  pathname: string;
  contentScrollKey?: string;
  locale: LocaleRuntime;
  children: ReactNode;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  logoutPending?: boolean;
  logoutError?: string | null;
}

function hasCapability(session: SessionSnapshot, capability: FrontendCapability | null) {
  return capability === null || session.capabilities.includes(capability);
}

function displayValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() && value !== "undefined" && value !== "null" ? value : fallback;
}

export function AppShell({ session, pathname, contentScrollKey = pathname, locale, children, onNavigate, onLogout, logoutPending = false, logoutError = null }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "knowledge-base": true, admin: true, governance: true });
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [serverNavigation, setServerNavigation] = useState<NavigationDataNode[] | null>(null);
  const contentScrollRef = useRef<HTMLElement>(null);
  const previousContentScrollKeyRef = useRef(contentScrollKey);
  useEffect(() => {
    const stored = readTheme(window.localStorage);
    setTheme(stored);
    applyTheme(stored, document, window.localStorage);
  }, []);
  useEffect(() => {
    let active = true;
    setServerNavigation(null);
    void loadNavigation().then((tree) => { if (active) setServerNavigation(tree); }).catch(() => { if (active) setServerNavigation(null); });
    return () => { active = false; };
  }, [session.member.id, session.member.role, session.permissionMask]);
  useEffect(() => {
    if (previousContentScrollKeyRef.current !== contentScrollKey) contentScrollRef.current?.scrollTo({ top: 0 });
    previousContentScrollKeyRef.current = contentScrollKey;
  }, [contentScrollKey]);
  const mergedNavigation = serverNavigation ? mergeRequiredWorkspaceNavigation(serverNavigation, session) : null;
  const workspaceRoutes = mergedNavigation
    ? mergedNavigation.filter((node) => node.groupName === "workspace").flatMap(toNavigationNodes)
    : navigationTree("workspace", session);
  const adminRoutes = mergedNavigation
    ? mergedNavigation.filter((node) => node.groupName === "admin").flatMap(toNavigationNodes)
    : navigationTree("admin", session);
  const memberLabel = displayValue(session.member.email, locale.t("COMMON_VALUE_UNAVAILABLE"));
  const navigate = (path: string) => onNavigate?.(path);
  const access = resolveFrontendAccess({ session, requiredCapability: matchRoute(pathname)?.capability ?? requiredCapability(pathname) });

  return (
    <div data-shell-root className="min-h-screen bg-background text-foreground lg:h-dvh lg:overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">{locale.t("SHELL_SKIP_MAIN")}</a>
      <aside data-shell-sidebar data-shell-sidebar-state={collapsed ? "collapsed" : "expanded"} className={cn("fixed inset-y-0 left-0 z-40 hidden border-r bg-card transition-[width] duration-200 lg:block", collapsed ? "w-16" : "w-64")}>
        <div className="flex h-full min-h-0 flex-col p-3">
          <div className={cn("mb-8 flex shrink-0 items-start gap-2", collapsed ? "justify-center" : "justify-between") }>
            <div className={cn("min-w-0 px-2", collapsed && "sr-only")}><p className="truncate text-xs font-semibold tracking-[0.18em] text-muted-foreground">MEMORY GARDEN</p><p className="mt-2 truncate text-sm font-medium">{locale.t("APP_BRAND_EYEBROW")}</p></div>
            <Button type="button" variant="ghost" size="icon" data-shell-collapse-toggle aria-expanded={!collapsed} aria-label={locale.t(collapsed ? "SHELL_EXPAND_SIDEBAR" : "SHELL_COLLAPSE_SIDEBAR")} onClick={() => setCollapsed((value) => !value)}>
              <SidebarSimple size={18} aria-hidden="true" />
            </Button>
          </div>
          <TooltipProvider><nav data-shell-sidebar-scroll aria-label={locale.t("SHELL_PRIMARY_NAVIGATION")} className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain scroll-p-1 p-1">
            <NavGroup title={locale.t("SHELL_GROUP_WORKSPACE")} nodes={workspaceRoutes} pathname={pathname} locale={locale} onNavigate={navigate} collapsed={collapsed} expanded={expanded} onToggle={(id) => setExpanded((value) => ({ ...value, [id]: !value[id] }))} />
            {adminRoutes.length > 0 && <NavGroup title={locale.t("SHELL_GROUP_ADMIN")} nodes={adminRoutes} pathname={pathname} locale={locale} onNavigate={navigate} collapsed={collapsed} expanded={expanded} onToggle={(id) => setExpanded((value) => ({ ...value, [id]: !value[id] }))} />}
          </nav></TooltipProvider>
          {collapsed
            ? <CollapsedAccountControls memberLabel={memberLabel} session={session} locale={locale} theme={theme} onThemeChange={setTheme} onNavigate={navigate} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} />
            : <div data-shell-account-footer className="shrink-0 border-t pt-3"><AccountControls memberLabel={memberLabel} session={session} locale={locale} theme={theme} onThemeChange={setTheme} onNavigate={navigate} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} /></div>}
        </div>
      </aside>
      <div className={cn("transition-[padding] duration-200 lg:flex lg:h-dvh lg:min-h-0 lg:flex-col", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        <header data-shell-topbar className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
          <div className="flex min-w-0 items-center gap-3"><span className="text-sm font-semibold lg:hidden">MEMORY GARDEN</span><Breadcrumb pathname={pathname} locale={locale} /></div>
          <div data-shell-topbar-actions className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger aria-label={locale.t("SHELL_LANGUAGE_LABEL")}><span aria-hidden="true">{locale.locale === "zh-CN" ? "中" : "EN"}</span></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => locale.setLocale("en")}>{locale.t("SHELL_LANGUAGE_EN")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => locale.setLocale("zh-CN")}>{locale.t("SHELL_LANGUAGE_ZH_CN")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div data-shell-mobile-scroll data-shell-mobile-focus-viewport className="max-h-dvh shrink-0 overflow-y-auto overscroll-contain lg:hidden"><MobileNavigation nodes={[...workspaceRoutes, ...adminRoutes]} pathname={pathname} locale={locale} onNavigate={navigate} memberLabel={memberLabel} session={session} theme={theme} onThemeChange={setTheme} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} /></div>
        <main ref={contentScrollRef} data-shell-content-scroll id="main-content" className="min-h-[calc(100vh-4rem)] scroll-p-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"><div className="mx-auto w-full max-w-[1440px] p-4 lg:px-6 lg:py-5">{access.kind === "forbidden" ? <section role="alert" className="mx-auto max-w-xl rounded-lg border border-destructive/40 bg-destructive/5 p-6"><h1 className="text-xl font-semibold">{locale.t("PAGE_FORBIDDEN_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{locale.t("PAGE_FORBIDDEN_DESCRIPTION")}</p></section> : children}</div></main>
      </div>
    </div>
  );
}

interface NavigationNode { id: string; route?: typeof ROUTES[number]; path?: string; labelKey: string; icon?: string | null; availability: MenuAvailability; disabledReason?: "not_implemented"; children?: NavigationNode[]; }

function NavGroup({ title, nodes, pathname, locale, onNavigate, collapsed, expanded, onToggle }: { title: string; nodes: NavigationNode[]; pathname: string; locale: LocaleRuntime; onNavigate: (path: string) => void; collapsed: boolean; expanded: Record<string, boolean>; onToggle: (id: string) => void }) {
  return <div data-nav-group><p className={cn("mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground", collapsed && "sr-only")}>{title}</p><div className="space-y-1">{nodes.map((node) => <NavNode key={node.id} node={node} pathname={pathname} locale={locale} onNavigate={onNavigate} collapsed={collapsed} expanded={expanded} onToggle={onToggle} depth={1} />)}</div></div>;
}

function NavNode({ node, pathname, locale, onNavigate, collapsed, expanded, onToggle, depth }: { node: NavigationNode; pathname: string; locale: LocaleRuntime; onNavigate: (path: string) => void; collapsed: boolean; expanded: Record<string, boolean>; onToggle: (id: string) => void; depth: number }) {
  const label = locale.t(node.labelKey);
  const path = node.path ?? node.route?.path ?? null;
  const unavailable = node.availability === "coming_soon";
  const unavailableLabel = `${label}（${locale.t("NAV_COMING_SOON")}）`;
  const active = Boolean(path && (pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)))) || Boolean(node.children?.some((child) => isNodeActive(child, pathname)));
  const hasChildren = Boolean(node.children?.length);
  const unavailableButton = <button type="button" aria-disabled="true" onClick={(event) => event.preventDefault()} className={cn("flex min-w-0 flex-1 cursor-not-allowed items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground opacity-70", collapsed && "justify-center px-0")}><NavIcon path={path} /><span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>{label}</span>{!collapsed && <Badge variant="outline" className="shrink-0 text-[10px]">{locale.t("NAV_COMING_SOON")}</Badge>}</button>;
  const content = path && unavailable
    ? collapsed ? <Tooltip><TooltipTrigger asChild>{unavailableButton}</TooltipTrigger><TooltipContent>{unavailableLabel}</TooltipContent></Tooltip> : unavailableButton
    : path ? <a href={path} aria-current={pathname === path ? "page" : undefined} title={collapsed ? label : undefined} onClick={(event) => { event.preventDefault(); onNavigate(path); }} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground", pathname === path && "bg-accent font-medium text-accent-foreground", collapsed && "justify-center px-0")}><NavIcon path={path} /><span className={cn("truncate", collapsed && "sr-only")}>{label}</span></a>
      : <button type="button" aria-expanded={expanded[node.id] ?? false} onClick={() => onToggle(node.id)} title={collapsed ? label : undefined} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground", active && "text-foreground", collapsed && "justify-center px-0")}><NavIcon path={path} /><span className={cn("truncate", collapsed && "sr-only")}>{label}</span></button>;
  return <div data-nav-node data-nav-depth={depth} data-nav-availability={node.availability}><div className="flex items-center">{content}{hasChildren && !collapsed && <button type="button" className="mr-1 rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`${label} ${expanded[node.id] ? "collapse" : "expand"}`} aria-expanded={expanded[node.id] ?? false} onClick={() => onToggle(node.id)}><CaretDown size={14} className={cn("transition-transform", !expanded[node.id] && "-rotate-90")} aria-hidden="true" /></button>}</div>{hasChildren && (expanded[node.id] ?? false) && !collapsed && depth < 4 && <div className="ml-4 space-y-1 border-l pl-2">{node.children!.map((child) => <NavNode key={child.id} node={child} pathname={pathname} locale={locale} onNavigate={onNavigate} collapsed={collapsed} expanded={expanded} onToggle={onToggle} depth={depth + 1} />)}</div>}</div>;
}

function isNodeActive(node: NavigationNode, pathname: string): boolean { const path = node.path ?? node.route?.path; return Boolean(path && (pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)))) || Boolean(node.children?.some((child) => isNodeActive(child, pathname))); }

function toNavigationNode(node: NavigationDataNode): NavigationNode {
  const route = node.path ? ROUTES.find((item) => item.path === node.path) : undefined;
  return { id: node.id, route, path: node.path ?? undefined, labelKey: node.labelKey, icon: node.icon, availability: node.availability, disabledReason: node.disabledReason, children: node.children.map(toNavigationNode) };
}

function toNavigationNodes(node: NavigationDataNode): NavigationNode[] {
  return node.path === null ? node.children.map(toNavigationNode) : [toNavigationNode(node)];
}

function navigationTree(group: "workspace" | "admin", session: SessionSnapshot): NavigationNode[] {
  const route = (path: string) => ROUTES.find((item) => item.path === path);
  const allowed = (path: string) => { const value = route(path); return value && hasCapability(session, value.capability) ? value : undefined; };
  if (group === "workspace") {
    const knowledge = allowed("/knowledge");
    const item = (path: string, labelKey?: string): NavigationNode | false => { const value = allowed(path); return value ? { id: path, route: value, labelKey: labelKey ?? value.labelKey, ...menuAvailability(path) } : false; };
    return [item("/"), knowledge && { id: "knowledge-base", route: knowledge, labelKey: "NAV_KNOWLEDGE_BASE", ...menuAvailability("/knowledge"), children: [item("/search", "NAV_KNOWLEDGE_SEARCH"), item("/agent", "NAV_KNOWLEDGE_AGENT")].filter(Boolean) as NavigationNode[] }, item("/submit"), item("/my-submissions"), item("/tasks"), item("/boards"), item("/notifications"), item("/messages")].filter(Boolean) as NavigationNode[];
  }
  const admin = allowed("/admin");
  if (!admin) return [];
  const children: NavigationNode[] = ["/admin/submissions", "/admin/duplicates", "/admin/assets"].map((path) => allowed(path)).filter(Boolean).map((item) => ({ id: item!.path, route: item!, labelKey: item!.labelKey, ...menuAvailability(item!.path) }));
  const governance: NavigationNode[] = ["/admin/members", "/admin/roles", "/admin/menus", "/admin/spaces", "/admin/audit", "/admin/analytics"].map((path) => allowed(path)).filter(Boolean).map((item) => ({ id: item!.path, route: item!, labelKey: item!.labelKey, ...menuAvailability(item!.path) }));
  if (governance.length) children.push({ id: "governance", labelKey: "SHELL_GROUP_GOVERNANCE", availability: "ready", children: governance });
  return [{ id: "admin", route: admin, labelKey: admin.labelKey, ...menuAvailability(admin.path), children }];
}

function ThemeButton({ mode, current, onSelect, icon, label }: { mode: ThemeMode; current: ThemeMode; onSelect: (mode: ThemeMode) => void; icon?: ReactNode; label: string }) { return <button type="button" aria-pressed={current === mode} className={cn("flex items-center justify-center gap-1 rounded border px-1 py-1 text-[11px] hover:bg-accent", current === mode && "border-primary bg-primary/10")} onClick={() => { onSelect(mode); applyTheme(mode, document, window.localStorage); }}>{icon}{label}</button>; }
function initials(value: string): string { const parts = value.split(/[@.\s_-]+/u).filter(Boolean); return (parts.slice(0, 2).map((part) => part[0]).join("") || "MG").toUpperCase(); }

function Breadcrumb({ pathname, locale }: { pathname: string; locale: LocaleRuntime }) {
  const match = matchRoute(pathname);
  const label = match ? locale.t(match.labelKey) : locale.t("SHELL_CONTEXT_TITLE");
  return <nav data-breadcrumb aria-label={locale.t("SHELL_BREADCRUMB")} className="hidden min-w-0 items-center gap-2 text-sm lg:flex"><a href="/" className="text-muted-foreground hover:text-foreground">{locale.t("NAV_HOME")}</a>{pathname !== "/" && <><span aria-hidden="true" className="text-muted-foreground">/</span><span className="truncate font-medium">{label}</span></>}</nav>;
}

function NavIcon({ path }: { path: string }) {
  const props = { size: 18, weight: "regular" as const, "aria-hidden": true };
  if (path === "/") return <House {...props} />;
  if (path === "/knowledge") return <BookOpen {...props} />;
  if (path === "/submit") return <UploadSimple {...props} />;
  if (path === "/search") return <MagnifyingGlass {...props} />;
  if (path === "/agent") return <Sparkle {...props} />;
  if (path === "/my-submissions") return <Files {...props} />;
  if (path === "/admin") return <ShieldCheck {...props} />;
  if (path === "/admin/submissions") return <NotePencil {...props} />;
  if (path === "/admin/assets") return <Stack {...props} />;
  if (path === "/admin/members") return <UsersThree {...props} />;
  if (path === "/admin/roles") return <ShieldCheck {...props} />;
  if (path === "/admin/menus") return <DotsThree {...props} />;
  if (path === "/admin/spaces") return <Stack {...props} />;
  if (path === "/admin/audit") return <Scroll {...props} />;
  if (path === "/admin/analytics") return <ChartLine {...props} />;
  return <DotsThree {...props} />;
}

function AccountControls({ memberLabel, session, locale, theme, onThemeChange, onNavigate, onLogout, logoutPending, logoutError }: { memberLabel: string; session: SessionSnapshot; locale: LocaleRuntime; theme: ThemeMode; onThemeChange: (mode: ThemeMode) => void; onNavigate: (path: string) => void; onLogout?: () => void; logoutPending: boolean; logoutError: string | null }) {
  return <div data-shell-account-controls className="space-y-3 px-2 pb-2"><div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initials(memberLabel)}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{memberLabel}</p><p className="text-xs text-muted-foreground">{session.member.role === "admin" ? locale.t("SHELL_ADMIN_ROLE") : locale.t("SHELL_MEMBER_ROLE")}</p></div></div><button type="button" onClick={() => onNavigate("/settings")} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"><GearSix size={16} aria-hidden="true" />{locale.t("SHELL_SETTINGS")}</button><div><p className="mb-2 text-xs font-medium text-muted-foreground">{locale.t("SHELL_THEME")}</p><div className="grid grid-cols-3 gap-1"><ThemeButton mode="light" current={theme} onSelect={onThemeChange} icon={<Sun size={14} aria-hidden="true" />} label={locale.t("SHELL_THEME_LIGHT")} /><ThemeButton mode="dark" current={theme} onSelect={onThemeChange} icon={<Moon size={14} aria-hidden="true" />} label={locale.t("SHELL_THEME_DARK")} /><ThemeButton mode="system" current={theme} onSelect={onThemeChange} label={locale.t("SHELL_THEME_SYSTEM")} /></div></div>{logoutError && <p role="alert" className="text-xs text-destructive">{logoutError}</p>}<button type="button" disabled={logoutPending} onClick={onLogout} className="flex min-h-10 w-full items-center rounded-md px-2 text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-70">{logoutPending ? locale.t("SHELL_LOGGING_OUT") : locale.t("SHELL_LOGOUT")}</button></div>;
}

function CollapsedAccountControls({ memberLabel, session, locale, theme, onThemeChange, onNavigate, onLogout, logoutPending, logoutError }: { memberLabel: string; session: SessionSnapshot; locale: LocaleRuntime; theme: ThemeMode; onThemeChange: (mode: ThemeMode) => void; onNavigate: (path: string) => void; onLogout?: () => void; logoutPending: boolean; logoutError: string | null }) {
  return <div data-shell-collapsed-account-controls className="shrink-0 border-t pt-3"><DropdownMenu><DropdownMenuTrigger data-shell-collapsed-account-trigger aria-label={memberLabel} tabIndex={0} className="grid size-10 place-items-center rounded-full bg-primary p-0 text-sm font-semibold text-primary-foreground"><span aria-hidden="true">{initials(memberLabel)}</span></DropdownMenuTrigger><DropdownMenuContent data-shell-collapsed-account-menu className="bottom-0 left-full right-auto z-50 ml-3 w-72 p-0"><AccountControls memberLabel={memberLabel} session={session} locale={locale} theme={theme} onThemeChange={onThemeChange} onNavigate={onNavigate} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} /></DropdownMenuContent></DropdownMenu></div>;
}

function MobileNavigation({ nodes, pathname, locale, onNavigate, memberLabel, session, theme, onThemeChange, onLogout, logoutPending, logoutError }: { nodes: NavigationNode[]; pathname: string; locale: LocaleRuntime; onNavigate: (path: string) => void; memberLabel: string; session: SessionSnapshot; theme: ThemeMode; onThemeChange: (mode: ThemeMode) => void; onLogout?: () => void; logoutPending: boolean; logoutError: string | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return <Sheet open={open} onOpenChange={setOpen}><details open={open} className="border-b bg-card"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium" onClick={(event) => { event.preventDefault(); setOpen((current) => !current); }}>{locale.t("SHELL_OPEN_NAVIGATION")}</summary><SheetContent className="flex min-h-0 flex-col p-0"><div data-shell-mobile-scroll data-shell-mobile-focus-viewport className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-p-1 p-4"><div className="flex items-start justify-between"><SheetHeader><SheetTitle>{locale.t("SHELL_WORKSPACE_NAVIGATION")}</SheetTitle></SheetHeader><SheetClose aria-label={locale.t("SHELL_CLOSE_NAVIGATION")}>×</SheetClose></div><nav className="mt-6 space-y-1">{flattenNavigation(nodes).map((route) => { const path = route.path ?? route.route!.path; return route.availability === "coming_soon" ? <button key={path} type="button" disabled aria-disabled="true" className="flex min-h-10 w-full cursor-not-allowed items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-muted-foreground opacity-70"><NavIcon path={path} /><span className="min-w-0 flex-1 truncate">{locale.t(route.labelKey)}</span><Badge variant="outline">{locale.t("NAV_COMING_SOON")}</Badge></button> : <a key={path} href={path} aria-current={pathname === path ? "page" : undefined} onClick={(event) => { event.preventDefault(); setOpen(false); onNavigate(path); }} className="flex min-h-10 items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"><NavIcon path={path} />{locale.t(route.labelKey)}</a>; })}</nav></div><div data-shell-mobile-account-footer className="shrink-0 border-t pt-3"><AccountControls memberLabel={memberLabel} session={session} locale={locale} theme={theme} onThemeChange={onThemeChange} onNavigate={(path) => { setOpen(false); onNavigate(path); }} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} /></div></SheetContent></details></Sheet>;
}

function flattenNavigation(nodes: NavigationNode[]): NavigationNode[] { return nodes.flatMap((node) => [ ...(node.path || node.route ? [node] : []), ...(node.children ? flattenNavigation(node.children) : []) ]); }
