import { useNotificationSummary } from "../../lib/use-notification-summary";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Bell, BookOpen, CalendarBlank, CaretDown, ChartLine, ChatCircle, Check, Checks, DotsThree, Files, FolderSimple, GearSix, House, Kanban, MagnifyingGlass, Moon, NotePencil, Scroll, ShieldCheck, SidebarSimple, Sparkle, Stack, Sun, Target, Timer, Trash, UploadSimple, UsersThree } from "@phosphor-icons/react";
import { ROUTES } from "../../contracts/routes";
import type { SessionSnapshot } from "../../contracts/api";
import type { FrontendLocale } from "../../lib/i18n";
import { Button } from "../ui/button";
import { AnimatedSidebar, AnimatedSidebarMenu, AnimatedSidebarMenuButton, AnimatedSidebarMenuItem, AnimatedSidebarMenuSub, AnimatedSidebarProvider } from "../motion/animated-sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "../motion/popover";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { cn } from "../../lib/utils";
import { resolveFrontendAccess } from "../../lib/auth-boundary";
import { matchRoute } from "../../lib/router";
import { routeAccessAllowed } from "../../lib/route-access";
// The single forbidden surface, shared by the shell and the admin area.
import { AdminForbiddenPage } from "../../pages/admin/admin-forbidden-page";
import { applyTheme, readTheme, type ThemeMode } from "../../lib/theme";
import { loadNavigation, mergeRequiredWorkspaceNavigation, type NavigationDataNode } from "../../lib/navigation-data";
import { Badge } from "../ui/badge";
import { WORKSPACE_ROUTE_CAPABILITIES, menuAvailability as resolveMenuAvailability, routeCapability, type MenuAvailability, type WorkspaceRouteCapability } from "../../../shared/workspace-route-capabilities";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Breadcrumb as BreadcrumbNav, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "../motion/breadcrumb";
import { collaborationQuickLinks, isCollaborationPath } from "./navigation-policy";
import { CommandPalette } from "./command-palette";
import { motion, useReducedMotion } from "motion/react";
import { useHoverCapable } from "../../lib/hooks/use-hover-capable";
import { menuKeyAction } from "../../lib/menu-keyboard";
import { EASE_OUT, SPRING_LAYOUT, SPRING_PRESS } from "../../lib/ease";

interface LocaleRuntime {
  readonly locale: FrontendLocale;
  t(key: string): string;
  setLocale(next: string): boolean;
}

type ShellMenuId = "account-desktop" | "account-mobile" | "language" | null;

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

function displayValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() && value !== "undefined" && value !== "null" ? value : fallback;
}

export function AppShell({ session, pathname, contentScrollKey = pathname, locale, children, onNavigate, onLogout, logoutPending = false, logoutError = null }: AppShellProps) {
  const reduceMotion = useReducedMotion();
  const canHover = useHoverCapable();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "knowledge-base": true, admin: true, governance: true });
  const [activeMenu, setActiveMenu] = useState<ShellMenuId>(null);
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
  useEffect(() => setActiveMenu(null), [pathname]);
  const mergedNavigation = serverNavigation ? mergeRequiredWorkspaceNavigation(serverNavigation, session) : null;
  const workspaceRoutes = mergedNavigation
    ? mergedNavigation.filter((node) => node.groupName === "workspace").flatMap(toNavigationNodes)
    : navigationTree("workspace", session);
  const adminRoutes = mergedNavigation
    ? mergedNavigation.filter((node) => node.groupName === "admin").flatMap(toNavigationNodes)
    : navigationTree("admin", session);
  const memberLabel = displayValue(session.member.email, locale.t("COMMON_VALUE_UNAVAILABLE"));
  const collaborationLinks = collaborationQuickLinks(session);
  const notificationSummary = useNotificationSummary(
    JSON.stringify([session.member.id, session.member.role, session.permissionMask, [...session.capabilities].sort()]),
    pathname, !logoutPending && collaborationLinks.some(link => link.path === "/notifications"),
  );
  const unreadState = notificationSummary.state;
  const unreadLabel = unreadState.kind === "ready" ? `${locale.t("NOTIFICATIONS_UNREAD_COUNT")} ${unreadState.unread}`
    : locale.t(unreadState.kind === "loading" ? "SHELL_UNREAD_LOADING" : unreadState.kind === "forbidden" ? "NOTIFICATIONS_FORBIDDEN" : "SHELL_UNREAD_ERROR");
  const sidebarWorkspaceRoutes = withoutCollaborationRoutes(workspaceRoutes);
  const navigate = (path: string) => onNavigate?.(path);
  const changeTheme = (mode: ThemeMode) => {
    setTheme(mode);
    applyTheme(mode, document, window.localStorage);
  };
  const toggleTheme = (): ThemeMode => {
    const next: ThemeMode = document.documentElement.classList.contains("dark") ? "light" : "dark";
    changeTheme(next);
    return next;
  };
  const access = resolveFrontendAccess({ session, route: matchRoute(pathname) });

  return (
    <div data-shell-root className="min-h-screen bg-background text-foreground lg:h-dvh lg:overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">{locale.t("SHELL_SKIP_MAIN")}</a>
      <AnimatedSidebarProvider
        open={!collapsed}
        onOpenChange={(next) => setCollapsed(!next)}
        breakpoint="lg"
        keyboardShortcut={false}
        style={{ "--sidebar-width": "16rem", "--sidebar-width-icon": "4rem" }}
        className="min-h-screen lg:h-full lg:min-h-0"
      >
        <AnimatedSidebar
          data-shell-sidebar
          data-shell-sidebar-state={collapsed ? "collapsed" : "expanded"}
          ariaLabel={locale.t("SHELL_WORKSPACE_NAVIGATION")}
          mobilePanel={false}
          mobileCloseLabel={locale.t("SHELL_CLOSE_NAVIGATION")}
          collapsible="icon"
          className="fixed inset-y-0 left-0 z-40 h-full border-r material-chrome"
          panelClassName="min-h-0 bg-transparent border-r-0 p-3"
        >
          <div className={cn("mb-4 flex min-h-12 shrink-0 items-center gap-2", collapsed ? "justify-center" : "justify-between") }>
            <div className={cn("min-w-0 px-2", collapsed && "sr-only")}><p className="truncate text-sm font-semibold">{locale.t("APP_BRAND_EYEBROW")}</p><p className="mt-1 truncate text-xs text-muted-foreground">{locale.t("NAV_KNOWLEDGE_BASE")}</p></div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" data-shell-collapse-toggle aria-expanded={!collapsed} title={locale.t(collapsed ? "SHELL_EXPAND_SIDEBAR" : "SHELL_COLLAPSE_SIDEBAR")} aria-label={locale.t(collapsed ? "SHELL_EXPAND_SIDEBAR" : "SHELL_COLLAPSE_SIDEBAR")} onClick={() => setCollapsed((value) => !value)}>
              <SidebarSimple size={18} aria-hidden="true" />
            </Button>
          </div>
          <TooltipProvider><nav data-shell-sidebar-scroll data-navigation-source={serverNavigation ? "server" : "fallback"} aria-label={locale.t("SHELL_PRIMARY_NAVIGATION")} className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain scroll-p-1 p-1">
            <NavGroup title={locale.t("SHELL_GROUP_WORKSPACE")} nodes={sidebarWorkspaceRoutes} pathname={pathname} locale={locale} onNavigate={navigate} collapsed={collapsed} expanded={expanded} canHover={canHover} onToggle={(id) => setExpanded((value) => ({ ...value, [id]: !value[id] }))} />
            {adminRoutes.length > 0 && <NavGroup title={locale.t("SHELL_GROUP_ADMIN")} nodes={adminRoutes} pathname={pathname} locale={locale} onNavigate={navigate} collapsed={collapsed} expanded={expanded} canHover={canHover} onToggle={(id) => setExpanded((value) => ({ ...value, [id]: !value[id] }))} />}
          </nav></TooltipProvider>
          {collapsed
            ? <div data-shell-collapsed-account-controls className="shrink-0 border-t pt-3"><AccountMenu variant="collapsed" memberLabel={memberLabel} session={session} locale={locale} theme={theme} activeMenu={activeMenu} onActiveMenuChange={setActiveMenu} onThemeChange={changeTheme} onNavigate={navigate} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} /></div>
            : <div data-shell-account-footer className="shrink-0 border-t pt-3"><AccountMenu variant="expanded" memberLabel={memberLabel} session={session} locale={locale} theme={theme} activeMenu={activeMenu} onActiveMenuChange={setActiveMenu} onThemeChange={changeTheme} onNavigate={navigate} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} /></div>}
        </AnimatedSidebar>
        <div className={cn("min-w-0 flex-1 transition-[padding] duration-200 ease-[var(--ease-out)] lg:flex lg:h-dvh lg:min-h-0 lg:flex-col", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        <header data-shell-topbar className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b material-chrome px-4 lg:px-6">
          <div className="hidden min-w-0 items-center gap-3 lg:flex"><Breadcrumb pathname={pathname} locale={locale} onNavigate={navigate} /></div>
          <div data-shell-topbar-actions className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <CommandPalette session={session} locale={locale} onNavigate={navigate} onToggleTheme={toggleTheme} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} />
            <motion.nav layoutRoot data-shell-collaboration-navigation aria-label={locale.t("SHELL_COLLABORATION_NAVIGATION")} className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap">
              {collaborationLinks.map((link) => <Fragment key={link.path}><motion.a data-route-id={routeCapability(link.path)?.id} href={link.path} title={locale.t(link.labelKey)} aria-label={locale.t(link.labelKey)} aria-current={isCollaborationActive(pathname, link.activePrefix) ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigate(link.path); }} whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={SPRING_PRESS} className={cn("relative flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors sm:text-sm", isCollaborationActive(pathname, link.activePrefix) ? "font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>{isCollaborationActive(pathname, link.activePrefix) && <motion.span aria-hidden="true" layoutId="shell-collab-active" transition={SPRING_LAYOUT} className="absolute inset-0 rounded-md bg-accent" />}<NavIcon path={link.icon} className="relative z-10" /><span className="relative z-10 hidden sm:inline sm:max-w-28 sm:truncate lg:max-w-none">{locale.t(link.labelKey)}</span>{link.path === "/notifications" && <span data-notification-summary data-state={unreadState.kind} role="status" aria-live="polite" aria-label={unreadLabel} title={unreadLabel} className="relative z-10 rounded bg-muted px-1 text-xs tabular-nums">{unreadState.kind === "ready" ? unreadState.unread : unreadState.kind === "loading" ? "…" : "—"}</span>}</motion.a>{link.path === "/notifications" && unreadState.kind === "error" && <Button data-notification-summary-retry variant="ghost" size="sm" aria-label={locale.t("SHELL_UNREAD_RETRY")} onClick={notificationSummary.retry}>{locale.t("COMMON_RETRY")}</Button>}</Fragment>)}
            </motion.nav>
            <Popover open={activeMenu === "language"} onOpenChange={(open) => setActiveMenu(open ? "language" : null)} side="bottom" align="end">
              <PopoverTrigger ariaHaspopup="menu">
                <Button type="button" variant="ghost" size="icon" aria-label={locale.t("SHELL_LANGUAGE_LABEL")} className="rounded-md"><span aria-hidden="true">{locale.locale === "zh-CN" ? "中" : "EN"}</span></Button>
              </PopoverTrigger>
              {activeMenu === "language" && <PopoverContent role="menu" data-menu-id="language" className="w-48 p-1">
                <button type="button" role="menuitemradio" aria-checked={locale.locale === "en"} onClick={() => { locale.setLocale("en"); setActiveMenu(null); }} className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent max-lg:min-h-11">{locale.t("SHELL_LANGUAGE_EN")}{locale.locale === "en" && <Check size={16} className="ml-auto" aria-hidden="true" />}</button>
                <button type="button" role="menuitemradio" aria-checked={locale.locale === "zh-CN"} onClick={() => { locale.setLocale("zh-CN"); setActiveMenu(null); }} className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent max-lg:min-h-11">{locale.t("SHELL_LANGUAGE_ZH_CN")}{locale.locale === "zh-CN" && <Check size={16} className="ml-auto" aria-hidden="true" />}</button>
              </PopoverContent>}
            </Popover>
          </div>
        </header>
        <div data-shell-mobile-scroll data-shell-mobile-focus-viewport className="max-h-dvh shrink-0 overflow-y-auto overscroll-contain lg:hidden"><MobileNavigation nodes={[...sidebarWorkspaceRoutes, ...adminRoutes]} pathname={pathname} locale={locale} onNavigate={navigate} memberLabel={memberLabel} session={session} theme={theme} activeMenu={activeMenu} onActiveMenuChange={setActiveMenu} onThemeChange={changeTheme} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} /></div>
        <div className="flex min-h-0 flex-1">
          <main ref={contentScrollRef} data-shell-content-scroll id="main-content" className="min-h-[calc(100vh-4rem)] scroll-p-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain min-w-0 flex-1"><div className="mx-auto w-full max-w-[1440px] p-4 lg:h-full lg:px-6 lg:py-5">{access.kind === "forbidden" ? <AdminForbiddenPage title={locale.t("PAGE_FORBIDDEN_TITLE")} description={locale.t("PAGE_FORBIDDEN_DESCRIPTION")} /> : <motion.div key={pathname} className="lg:h-full" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE_OUT }}>{children}</motion.div>}</div></main>
        </div>
        </div>
      </AnimatedSidebarProvider>
    </div>
  );
}

interface NavigationNode { id: string; route?: typeof ROUTES[number]; path?: string; labelKey: string; icon?: string | null; availability: MenuAvailability; disabledReason?: "not_implemented"; children?: NavigationNode[]; }

function menuAvailability(path: string) {
  return resolveMenuAvailability(path) ?? { availability: "coming_soon" as const, disabledReason: "not_implemented" as const };
}

function NavGroup({ title, nodes, pathname, locale, onNavigate, collapsed, expanded, onToggle, canHover }: { title: string; nodes: NavigationNode[]; pathname: string; locale: LocaleRuntime; onNavigate: (path: string) => void; collapsed: boolean; expanded: Record<string, boolean>; onToggle: (id: string) => void; canHover: boolean }) {
  const rows = nodes.map((node) => <NavNode key={node.id} node={node} pathname={pathname} locale={locale} onNavigate={onNavigate} collapsed={collapsed} expanded={expanded} onToggle={onToggle} canHover={canHover} depth={1} />);
  return <div data-nav-group><p className={cn("mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground", collapsed && "sr-only")}>{title}</p>
    {/* The payload's shared-layout hover pill is mouse polish, so it is only
        mounted where a real hover exists (`useHoverCapable`). Touch keeps the
        same rows without a pill that would stick after a tap. */}
    {canHover ? <AnimatedSidebarMenu className="space-y-1">{rows}</AnimatedSidebarMenu> : <ul className="space-y-1">{rows}</ul>}
  </div>;
}

function NavNode({ node, pathname, locale, onNavigate, collapsed, expanded, onToggle, canHover, depth }: { node: NavigationNode; pathname: string; locale: LocaleRuntime; onNavigate: (path: string) => void; collapsed: boolean; expanded: Record<string, boolean>; onToggle: (id: string) => void; canHover: boolean; depth: number }) {
  const label = locale.t(node.labelKey);
  const path = node.path ?? node.route?.path ?? null;
  const unavailable = node.availability === "coming_soon";
  const unavailableLabel = `${label}（${locale.t("NAV_COMING_SOON")}）`;
  const hasChildren = Boolean(node.children?.length);
  const open = Boolean((expanded[node.id] ?? false) && !collapsed && depth < 4);
  const rowClass = cn("min-h-9 min-w-0 flex-1 rounded-md px-2.5 py-2 text-sm", pathname === path && "text-accent-foreground", collapsed && "justify-center px-0");
  // A destination the registry marks `coming_soon` stays in the tab order (its
  // tooltip and `aria-disabled` contract need it there), so it is a real row
  // drawn by the app's one Button; the payload row's `disabled` would drop it
  // out of the tab order.
  const unavailableButton = <Button type="button" variant="ghost" size="md" aria-disabled="true" onClick={(event) => event.preventDefault()} className={cn("h-9 min-w-0 flex-1 cursor-not-allowed justify-start gap-3 rounded-md px-2.5 py-2 text-left font-normal hover:bg-transparent hover:text-muted-foreground", collapsed && "justify-center px-0")}><NavIcon path={path} /><span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>{label}</span>{!collapsed && <Badge variant="outline" className="shrink-0 text-[10px]">{locale.t("NAV_COMING_SOON")}</Badge>}</Button>;
  const row = path && unavailable
    ? collapsed ? <Tooltip><TooltipTrigger asChild>{unavailableButton}</TooltipTrigger><TooltipContent>{unavailableLabel}</TooltipContent></Tooltip> : unavailableButton
    : path
      ? <AnimatedSidebarMenuButton data-route-id={routeCapability(path)?.id} href={path} isActive={pathname === path} icon={<NavIcon path={path} />} onSelect={(event) => { event.preventDefault(); onNavigate(path); }} title={collapsed ? label : undefined} className={rowClass}>{label}</AnimatedSidebarMenuButton>
      : <AnimatedSidebarMenuButton ariaExpanded={expanded[node.id] ?? false} icon={<NavIcon path={path} />} onSelect={() => onToggle(node.id)} className={rowClass}>{label}</AnimatedSidebarMenuButton>;
  return <AnimatedSidebarMenuItem data-nav-node data-nav-depth={depth} data-nav-availability={node.availability}>
    <div className="flex items-center">
      {row}
      {hasChildren && path && !collapsed && <Button type="button" variant="ghost" size="icon" className="mr-1" aria-label={`${label} ${expanded[node.id] ? "collapse" : "expand"}`} aria-expanded={expanded[node.id] ?? false} onClick={() => onToggle(node.id)}><CaretDown size={14} className={cn("transition-transform", !expanded[node.id] && "-rotate-90")} aria-hidden="true" /></Button>}
    </div>
    {hasChildren && open && <AnimatedSidebarMenuSub open className="ml-4 pl-2">{node.children!.map((child) => <NavNode key={child.id} node={child} pathname={pathname} locale={locale} onNavigate={onNavigate} collapsed={collapsed} expanded={expanded} onToggle={onToggle} canHover={canHover} depth={depth + 1} />)}</AnimatedSidebarMenuSub>}
  </AnimatedSidebarMenuItem>;
}

function withoutCollaborationRoutes(nodes: NavigationNode[]): NavigationNode[] {
  return nodes.filter((node) => !isCollaborationPath(node.path ?? node.route?.path)).map((node) => ({ ...node, children: node.children ? withoutCollaborationRoutes(node.children) : undefined }));
}

function isCollaborationActive(pathname: string, activePrefix: string): boolean {
  return pathname === activePrefix || pathname.startsWith(`${activePrefix}/`);
}

function toNavigationNode(node: NavigationDataNode): NavigationNode {
  const route = node.path ? ROUTES.find((item) => item.path === node.path) : undefined;
  return { id: node.id, route, path: node.path ?? undefined, labelKey: node.labelKey, icon: node.icon, availability: node.availability, disabledReason: node.disabledReason, children: node.children.map(toNavigationNode) };
}

function toNavigationNodes(node: NavigationDataNode): NavigationNode[] {
  return node.path === null ? node.children.map(toNavigationNode) : [toNavigationNode(node)];
}

function navigationTree(group: "workspace" | "admin", session: SessionSnapshot): NavigationNode[] {
  const route = (path: string) => ROUTES.find((item) => item.path === path);
  const allowed = (path: string) => { const value = route(path); return value && routeAccessAllowed(session, value) ? value : undefined; };
  if (group === "workspace") {
    const knowledge = allowed("/knowledge");
    const item = (path: string, labelKey?: string): NavigationNode | false => { const value = allowed(path); return value ? { id: path, route: value, labelKey: labelKey ?? value.labelKey, ...menuAvailability(path) } : false; };
    // The knowledge family's children come from the shared registry's
    // `parentRouteId` — the same nesting the seeded menu rows carry (see
    // migrations/0074_knowledge_family_menu_nesting.sql) — so the fallback tree
    // and the server tree cannot drift. The seed relabels the two read-only
    // children (0031), so those nested labels are kept here.
    const knowledgeChildLabels: Readonly<Record<string, string>> = { search: "NAV_KNOWLEDGE_SEARCH", agent: "NAV_KNOWLEDGE_AGENT" };
    const registered: readonly WorkspaceRouteCapability[] = WORKSPACE_ROUTE_CAPABILITIES;
    const knowledgeChildren = registered
      .filter((route) => route.parentRouteId === "knowledge")
      .map((route) => item(route.path, knowledgeChildLabels[route.id]))
      .filter(Boolean) as NavigationNode[];
    return [item("/"), item("/graph"), item("/today"), item("/focus"), item("/review"), knowledge && { id: "knowledge-base", route: knowledge, labelKey: "NAV_KNOWLEDGE_BASE", ...menuAvailability("/knowledge"), children: knowledgeChildren }, item("/tasks"), item("/environments"), item("/goals"), item("/projects"), item("/calendar"), item("/boards"), item("/notifications"), item("/messages")].filter(Boolean) as NavigationNode[];
  }
  const admin = allowed("/admin");
  if (!admin) return [];
  const children: NavigationNode[] = ["/admin/submissions", "/admin/duplicates", "/admin/assets", "/admin/knowledge/trash"].map((path) => allowed(path)).filter(Boolean).map((item) => ({ id: item!.path, route: item!, labelKey: item!.labelKey, ...menuAvailability(item!.path) }));
  const governance: NavigationNode[] = ["/admin/members", "/admin/roles", "/admin/menus", "/admin/spaces", "/admin/audit", "/admin/analytics"].map((path) => allowed(path)).filter(Boolean).map((item) => ({ id: item!.path, route: item!, labelKey: item!.labelKey, ...menuAvailability(item!.path) }));
  if (governance.length) children.push({ id: "governance", labelKey: "SHELL_GROUP_GOVERNANCE", availability: "ready", children: governance });
  return [{ id: "admin", route: admin, labelKey: admin.labelKey, ...menuAvailability(admin.path), children }];
}

function initials(value: string): string { const parts = value.split(/[@.\s_-]+/u).filter(Boolean); return (parts.slice(0, 2).map((part) => part[0]).join("") || "MG").toUpperCase(); }

/** The shell trail, rendered by beUI's breadcrumb primitives: `data-breadcrumb`
 * and the navigation name stay put, and the labels come from the existing keys.
 * Visibility lives on the topbar wrapper alone (the trail is a desktop
 * affordance), and the home crumb navigates through the shell like every other
 * chrome link instead of reloading the document. */
function Breadcrumb({ pathname, locale, onNavigate }: { pathname: string; locale: LocaleRuntime; onNavigate?: (path: string) => void }) {
  const match = matchRoute(pathname);
  const label = match ? locale.t(match.labelKey) : locale.t("SHELL_CONTEXT_TITLE");
  return <BreadcrumbNav data-breadcrumb aria-label={locale.t("SHELL_BREADCRUMB")} className="min-w-0">
    {/* The trail is bounded — home plus the current route — so the ancestor
        disclosure has nothing to hide; collapsing it would only add an untranslated
        accessible name. */}
    <BreadcrumbList maxItems={Infinity} className="min-w-0 flex-nowrap text-sm">
      <BreadcrumbItem><BreadcrumbLink href="/" onClick={(event) => { event.preventDefault(); onNavigate?.("/"); }}>{locale.t("NAV_HOME")}</BreadcrumbLink></BreadcrumbItem>
      {pathname !== "/" ? <BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbPage className="truncate">{label}</BreadcrumbPage></BreadcrumbItem> : null}
    </BreadcrumbList>
  </BreadcrumbNav>;
}

function NavIcon({ path, className }: { path: string | null; className?: string }) {
  const props = { size: 18, weight: "regular" as const, "aria-hidden": true, className };
  if (path === "/tasks") return <Checks {...props} />;
  if (path === "/boards") return <Kanban {...props} />;
  if (path === "/notifications") return <Bell {...props} />;
  if (path === "/messages") return <ChatCircle {...props} />;
  if (path === "/graph") return <ChartLine {...props} />;
  if (path === "/") return <House {...props} />;
  if (path === "/knowledge") return <BookOpen {...props} />;
  if (path === "/submit") return <UploadSimple {...props} />;
  if (path === "/search") return <MagnifyingGlass {...props} />;
  if (path === "/agent") return <Sparkle {...props} />;
  if (path === "/my-submissions") return <Files {...props} />;
  if (path === "/goals") return <Target {...props} />;
  if (path === "/projects") return <FolderSimple {...props} />;
  if (path === "/calendar") return <CalendarBlank {...props} />;
  if (path === "/today") return <CalendarBlank {...props} />;
  if (path === "/focus") return <Timer {...props} />;
  if (path === "/review") return <Check {...props} />;
  if (path === "/admin") return <ShieldCheck {...props} />;
  if (path === "/admin/submissions") return <NotePencil {...props} />;
  if (path === "/admin/assets") return <Stack {...props} />;
  if (path === "/admin/knowledge/trash") return <Trash {...props} />;
  if (path === "/admin/members") return <UsersThree {...props} />;
  if (path === "/admin/roles") return <ShieldCheck {...props} />;
  if (path === "/admin/menus") return <DotsThree {...props} />;
  if (path === "/admin/spaces") return <Stack {...props} />;
  if (path === "/admin/audit") return <Scroll {...props} />;
  if (path === "/admin/analytics") return <ChartLine {...props} />;
  return <DotsThree {...props} />;
}

function AccountMenu({ variant, memberLabel, session, locale, theme, activeMenu, onActiveMenuChange, onThemeChange, onNavigate, onLogout, logoutPending, logoutError }: { variant: "expanded" | "collapsed" | "mobile"; memberLabel: string; session: SessionSnapshot; locale: LocaleRuntime; theme: ThemeMode; activeMenu: ShellMenuId; onActiveMenuChange: (menu: ShellMenuId) => void; onThemeChange: (mode: ThemeMode) => void; onNavigate: (path: string) => void; onLogout?: () => void; logoutPending: boolean; logoutError: string | null }) {
  const roleLabel = session.member.role === "admin" ? locale.t("SHELL_ADMIN_ROLE") : locale.t("SHELL_MEMBER_ROLE");
  const compact = variant === "collapsed";
  const menuId = variant === "mobile" ? "account-mobile" : "account-desktop";
  const open = activeMenu === menuId;
  const triggerRef = useRef<HTMLButtonElement>(null);
  // ArrowDown/ArrowUp on the trigger opens the menu and lands on the first/last
  // row, the contract the previous menu adapter had.
  const focusOnOpen = useRef<"first" | "last" | null>(null);
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    const mode = focusOnOpen.current;
    focusOnOpen.current = null;
    const frame = requestAnimationFrame(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>(`[data-menu-id="${menuId}"] [role^="menuitem"]:not([aria-disabled="true"]):not([disabled])`));
      (mode === "last" ? items.at(-1) : items[0])?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, menuId]);
  // Closing from a row unmounts that row under the focus, so the trigger takes
  // focus back the way the previous menu adapter did; the payload's own close
  // (Escape / outside pointer) already restores it.
  const close = () => { onActiveMenuChange(null); triggerRef.current?.focus(); };
  const selectTheme = (mode: ThemeMode) => { onThemeChange(mode); close(); };
  const selectSettings = () => { close(); onNavigate("/settings"); };
  const triggerLabel = `${locale.t("SHELL_ACCOUNT_MENU_WITH_MEMBER")}${memberLabel}`;
  const themeClass = (mode: ThemeMode) => cn(theme === mode && "bg-accent font-medium text-accent-foreground");
  const selectedThemeIndicator = (mode: ThemeMode) => theme === mode ? <Check data-theme-selected-indicator className="ml-auto" size={16} weight="bold" aria-hidden="true" /> : null;
  const triggerClass = compact
    ? "grid size-10 place-items-center rounded-full bg-primary p-0 text-sm font-semibold text-primary-foreground"
    : "flex min-w-0 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent";
  const contentClass = compact
    ? "w-[min(18rem,calc(100vw-5rem))] max-w-[calc(100vw-5rem)] p-2"
    : "w-[min(18rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-2";
  const itemClass = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent max-lg:min-h-11";
  // The menu's roving focus lives at the shell (the payload owns dismissal and
  // returns focus on Escape); `menuKeyAction` is the same map the rest of the
  // app's menus use, so Home/End/arrows behave identically here.
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const action = menuKeyAction(event.key);
    if (action === null || action === "close") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role^='menuitem']:not([aria-disabled='true']):not([disabled])"));
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = action === "first" ? 0
      : action === "last" ? items.length - 1
        : action === "next" ? Math.min(current + 1, items.length - 1)
          : Math.max(current - 1, 0);
    event.preventDefault();
    items[next]?.focus();
  };
  return <Popover open={open} onOpenChange={(next) => onActiveMenuChange(next ? menuId : null)} side="top" align="start" className={compact ? "w-auto" : "w-full"}>
    <PopoverTrigger ariaHaspopup="menu">
      <Button ref={triggerRef} type="button" variant="ghost" data-account-trigger data-account-trigger-variant={variant} aria-label={triggerLabel} tabIndex={0} className={triggerClass} onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        focusOnOpen.current = event.key === "ArrowDown" ? "first" : "last";
        if (!open) { onActiveMenuChange(menuId); return; }
        const items = Array.from(document.querySelectorAll<HTMLElement>(`[data-menu-id="${menuId}"] [role^="menuitem"]:not([aria-disabled="true"]):not([disabled])`));
        (focusOnOpen.current === "last" ? items.at(-1) : items[0])?.focus();
        focusOnOpen.current = null;
      }}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"><span aria-hidden="true">{initials(memberLabel)}</span></span>{!compact && <span className="min-w-0"><span className="block truncate text-sm font-medium">{memberLabel}</span><span className="block text-xs text-muted-foreground">{roleLabel}</span></span>}</Button>
    </PopoverTrigger>
    {open && <PopoverContent role="menu" data-account-menu data-menu-id={menuId} className={contentClass} onKeyDown={onMenuKeyDown}>
      <div data-account-summary className="mb-2 flex min-w-0 items-center gap-3 border-b px-2 pb-3 pt-1"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initials(memberLabel)}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{memberLabel}</p><p className="text-xs text-muted-foreground">{roleLabel}</p></div></div>
      <button type="button" role="menuitem" data-account-settings data-route-id="settings" onClick={selectSettings} className={itemClass}><GearSix size={16} aria-hidden="true" />{locale.t("SHELL_SETTINGS")}</button>
      <div className="my-2 border-t pt-2">
        <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{locale.t("SHELL_THEME")}</p>
        <button type="button" role="menuitemradio" aria-checked={theme === "light"} data-theme-option="light" className={cn(itemClass, themeClass("light"))} onClick={() => selectTheme("light")}><Sun size={16} aria-hidden="true" />{locale.t("SHELL_THEME_LIGHT")}{selectedThemeIndicator("light")}</button>
        <button type="button" role="menuitemradio" aria-checked={theme === "dark"} data-theme-option="dark" className={cn(itemClass, themeClass("dark"))} onClick={() => selectTheme("dark")}><Moon size={16} aria-hidden="true" />{locale.t("SHELL_THEME_DARK")}{selectedThemeIndicator("dark")}</button>
        <button type="button" role="menuitemradio" aria-checked={theme === "system"} data-theme-option="system" className={cn(itemClass, themeClass("system"))} onClick={() => selectTheme("system")}>{locale.t("SHELL_THEME_SYSTEM")}{selectedThemeIndicator("system")}</button>
      </div>
      {logoutError && <p role="alert" className="px-2 py-1 text-xs text-destructive">{logoutError}</p>}
      <button type="button" role="menuitem" data-account-logout disabled={logoutPending} onClick={onLogout} className={cn(itemClass, "mt-1 min-h-10 text-destructive hover:bg-destructive/10 disabled:opacity-50")}>{logoutPending ? locale.t("SHELL_LOGGING_OUT") : locale.t("SHELL_LOGOUT")}</button>
    </PopoverContent>}
  </Popover>;
}

function MobileNavigation({ nodes, pathname, locale, onNavigate, memberLabel, session, theme, activeMenu, onActiveMenuChange, onThemeChange, onLogout, logoutPending, logoutError }: { nodes: NavigationNode[]; pathname: string; locale: LocaleRuntime; onNavigate: (path: string) => void; memberLabel: string; session: SessionSnapshot; theme: ThemeMode; activeMenu: ShellMenuId; onActiveMenuChange: (menu: ShellMenuId) => void; onThemeChange: (mode: ThemeMode) => void; onLogout?: () => void; logoutPending: boolean; logoutError: string | null }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => setOpen(false), [pathname]);
  return <Sheet open={open} onOpenChange={setOpen}><details open={open} className="border-b bg-card"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium" onClick={(event) => { event.preventDefault(); setOpen((current) => !current); }}>{locale.t("SHELL_OPEN_NAVIGATION")}</summary><SheetContent ariaLabel={locale.t("SHELL_WORKSPACE_NAVIGATION")} className="flex min-h-0 flex-col p-0"><div data-shell-mobile-scroll data-shell-mobile-focus-viewport className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-p-1 p-4"><div className="flex items-start justify-between"><SheetHeader><SheetTitle>{locale.t("SHELL_WORKSPACE_NAVIGATION")}</SheetTitle></SheetHeader><SheetClose aria-label={locale.t("SHELL_CLOSE_NAVIGATION")}>×</SheetClose></div><nav className="mt-6 space-y-1">{flattenNavigation(nodes).map(({ node: route, depth }) => { const path = route.path ?? route.route!.path; return route.availability === "coming_soon" ? <Button key={path} type="button" variant="ghost" size="md" disabled aria-disabled="true" data-nav-node data-nav-depth={depth} className={cn("h-auto min-h-10 w-full cursor-not-allowed justify-start gap-3 rounded-md px-2 py-2 text-left font-normal hover:bg-transparent hover:text-muted-foreground disabled:opacity-70", depth > 0 && "pl-6")}><NavIcon path={path} /><span className="min-w-0 flex-1 truncate">{locale.t(route.labelKey)}</span><Badge variant="outline">{locale.t("NAV_COMING_SOON")}</Badge></Button> : <motion.a key={path} data-route-id={routeCapability(path)?.id} data-nav-node data-nav-depth={depth} href={path} aria-current={pathname === path ? "page" : undefined} onClick={(event) => { event.preventDefault(); setOpen(false); onNavigate(path); }} whileTap={reduce ? undefined : { scale: 0.985 }} transition={SPRING_PRESS} className={cn("relative flex min-h-10 items-center gap-3 rounded-md px-2 py-2 text-sm", depth > 0 && "pl-6", pathname === path ? "font-medium text-accent-foreground" : "hover:bg-accent")}>{pathname === path && <motion.span aria-hidden="true" layoutId="shell-mobile-active" transition={SPRING_LAYOUT} className="absolute inset-0 rounded-md bg-accent" />}<NavIcon path={path} className="relative z-10" /><span className="relative z-10">{locale.t(route.labelKey)}</span></motion.a>; })}</nav></div><div data-shell-mobile-account-footer className="shrink-0 border-t pt-3"><AccountMenu variant="mobile" memberLabel={memberLabel} session={session} locale={locale} theme={theme} activeMenu={activeMenu} onActiveMenuChange={onActiveMenuChange} onThemeChange={onThemeChange} onNavigate={(path) => { setOpen(false); onNavigate(path); }} onLogout={onLogout} logoutPending={logoutPending} logoutError={logoutError} /></div></SheetContent></details></Sheet>;
}

/**
 * Flattens the tree for the mobile drawer while keeping each row's *visible*
 * indentation depth: a node with no path (a pure group, such as the admin
 * `governance` group) renders no row of its own, so its children must not be
 * indented under a parent the member cannot see. The drawer still lists every
 * destination - nesting only changes the indentation, so nothing becomes
 * unreachable behind a disclosure.
 */
function flattenNavigation(nodes: NavigationNode[], depth = 0): { node: NavigationNode; depth: number }[] {
  return nodes.flatMap((node) => {
    const visible = Boolean(node.path || node.route);
    return [
      ...(visible ? [{ node, depth }] : []),
      ...(node.children ? flattenNavigation(node.children, visible ? depth + 1 : depth) : []),
    ];
  });
}
