import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./components/shell/app-shell";
import { AdminDashboardPage } from "./pages/admin/admin-dashboard-page";
import { AdminForbiddenPage } from "./pages/admin/admin-forbidden-page";
import { ReviewQueuePage } from "./pages/admin/review-queue-page";
import { ReviewDetailRoute } from "./pages/admin/review-detail-route";
import { AssetQueuePage } from "./pages/admin/asset-queue-page";
import { MembersPage } from "./pages/admin/members-page";
import { SpacesPage } from "./pages/admin/spaces-page";
import { AuditPage } from "./pages/admin/audit-page";
import { AgentPage } from "./pages/agent-page";
import { HomePage } from "./pages/home-page";
import { KnowledgePage } from "./pages/knowledge-page";
import { KnowledgeReaderPage } from "./pages/knowledge-reader-page";
import { SearchPage } from "./pages/search-page";
import { SubmitPage } from "./pages/submit-page";
import { MySubmissionsPage } from "./pages/my-submissions-page";
import { createKnowledgeRequestController, type KnowledgePageResult } from "./lib/knowledge-data";
import { postLogout } from "./lib/logout";
import { createLocaleRuntime, frontendText, type LocaleRuntime } from "./lib/i18n";
import { sessionSnapshot } from "./lib/session";
import { pageKindForPath } from "./app-routes";

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [session, setSession] = useState<Awaited<ReturnType<typeof sessionSnapshot>> | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [localeTick, setLocaleTick] = useState(0);
  const locale = useMemo(() => createLocaleRuntime({ navigatorLanguage: navigator.language, storage: window.localStorage }), []);
  useEffect(() => locale.subscribe(() => setLocaleTick((tick) => tick + 1)), [locale]);
  void localeTick;

  useEffect(() => {
    let active = true;
    sessionSnapshot().then((value) => { if (active) setSession(value); }).catch((error: unknown) => { if (active) setSessionError(error instanceof Error ? error.message : "SESSION_UNAVAILABLE"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (sessionError) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">{frontendText(locale, "APP_SIGN_IN_REQUIRED")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "APP_SIGN_IN_DESCRIPTION")}</p><a className="mt-6 inline-flex text-sm font-medium text-primary hover:underline" href="/auth/github">{frontendText(locale, "APP_SIGN_IN_GITHUB")}</a></main>;
  if (!session) return <main aria-busy="true" className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">{frontendText(locale, "APP_LOADING_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "APP_LOADING_DESCRIPTION")}</p></main>;

  const navigate = (path: string) => { window.history.pushState({}, "", path); setPathname(path); };
  const logout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError(null);
    try {
      await postLogout(session.logoutUrl);
      window.location.href = "/auth/github";
    } catch {
      setLogoutError(frontendText(locale, "SHELL_LOGOUT_FAILED"));
      setLogoutPending(false);
    }
  };
  const kind = pageKindForPath(pathname);
  const page = renderPage(kind, pathname, locale);
  return <AppShell session={session} pathname={pathname} locale={locale} onNavigate={navigate} onLogout={logout} logoutPending={logoutPending} logoutError={logoutError}>{page}</AppShell>;
}

function renderPage(kind: ReturnType<typeof pageKindForPath>, pathname: string, locale: LocaleRuntime) {
  switch (kind) {
    case "home": return <HomePage locale={locale} state={{ kind: "ready", total: 0, pending: 0, published: 0 }} />;
    case "knowledge": return <KnowledgeRoute locale={locale} />;
    case "knowledge-reader": return <KnowledgeReaderPage locale={locale} revision={{ id: pathname.split("/").pop() || "", title: frontendText(locale, "KNOWLEDGE_TITLE"), markdown: frontendText(locale, "KNOWLEDGE_READER_LOADING") }} renderMarkdown={(markdown) => markdown} />;
    case "search": return <SearchPage locale={locale} state={{ kind: "ready", degraded: false, results: [] }} />;
    case "agent": return <AgentPage locale={locale} scope="all" state={{ kind: "ready", answer: frontendText(locale, "AGENT_DEFAULT_ANSWER"), confidence: "low", citations: [] }} />;
    case "submit": return <SubmitPage locale={locale} draft={{ mode: "markdown", title: "", content: "" }} state={{ kind: "idle" }} />;
    case "my-submissions": return <MySubmissionsPage locale={locale} state={{ kind: "ready", items: [], nextCursor: null }} />;
    case "admin": return <AdminDashboardPage locale={locale} metrics={{ pending: 0, assets: 0, members: 0 }} />;
    case "admin-submissions": return <ReviewQueuePage locale={locale} state={{ kind: "ready", items: [], nextCursor: null }} />;
    case "admin-submission-detail": return <ReviewDetailRoute locale={locale} id={pathname.split("/").pop() || ""} />;
    case "admin-assets": return <AssetQueuePage locale={locale} assets={[]} />;
    case "admin-members": return <MembersPage locale={locale} members={[]} />;
    case "admin-spaces": return <SpacesPage locale={locale} spaces={[]} />;
    case "admin-audit": return <AuditPage locale={locale} state={{ kind: "ready", events: [], nextCursor: null }} />;
    case "not-found": return <NotFoundPage locale={locale} />;
    default: return <AdminForbiddenPage />;
  }
}

function NotFoundPage({ locale }: { locale: LocaleRuntime }) {
  return <section className="mx-auto max-w-xl py-16"><h1 className="text-2xl font-semibold">{frontendText(locale, "PAGE_NOT_FOUND_TITLE")}</h1><p className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "PAGE_NOT_FOUND_DESCRIPTION")}</p><a className="mt-6 inline-flex text-sm font-medium text-primary hover:underline" href="/">{frontendText(locale, "PAGE_RETURN_HOME")}</a></section>;
}

function KnowledgeRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: readonly { id: string; title?: string; summary?: string; publishedAt?: string; tags?: string[] }[]; nextCursor: string | null; pending?: boolean } | { kind: "error"; message: string }>({ kind: "loading" });
  const controllerRef = useRef<ReturnType<typeof createKnowledgeRequestController> | null>(null);
  const mergePage = useCallback((page: KnowledgePageResult, append: boolean) => {
    setState((previous) => ({
      kind: "ready",
      items: append && previous.kind === "ready" ? [...previous.items, ...page.items] : page.items,
      nextCursor: page.nextCursor,
      pending: false,
    }));
  }, []);
  useEffect(() => {
    const controller = createKnowledgeRequestController();
    controllerRef.current = controller;
    const first = controller.request(null);
    void first.promise.then(({ generation, page }) => {
      if (controller.isCurrent(generation)) mergePage(page, false);
    }).catch((error: unknown) => {
      if (controller.isCurrent(first.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState({ kind: "error", message: frontendText(locale, "KNOWLEDGE_ERROR") });
    });
    return () => { controller.cancel(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [locale, mergePage]);
  const loadMore = () => {
    if (state.kind !== "ready" || state.pending || !state.nextCursor || !controllerRef.current) return;
    const controller = controllerRef.current;
    const next = controller.request(state.nextCursor);
    setState((previous) => previous.kind === "ready" ? { ...previous, pending: true } : previous);
    void next.promise.then(({ generation, page }) => {
      if (controller.isCurrent(generation)) mergePage(page, true);
    }).catch((error: unknown) => {
      if (controller.isCurrent(next.generation) && !(error instanceof DOMException && error.name === "AbortError")) setState((previous) => previous.kind === "ready" ? { ...previous, pending: false } : previous);
    });
  };
  return <KnowledgePage locale={locale} state={state} onLoadMore={loadMore} />;
}
