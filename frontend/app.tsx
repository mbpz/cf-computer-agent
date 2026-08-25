import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/shell/app-shell";
import { AdminDashboardPage } from "./pages/admin/admin-dashboard-page";
import { AdminForbiddenPage } from "./pages/admin/admin-forbidden-page";
import { ReviewQueuePage } from "./pages/admin/review-queue-page";
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
import { apiFetch } from "./lib/api";
import { createLocaleRuntime } from "./lib/i18n";
import { sessionSnapshot } from "./lib/session";
import { pageKindForPath } from "./app-routes";

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [session, setSession] = useState<Awaited<ReturnType<typeof sessionSnapshot>> | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
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

  if (sessionError) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Sign-in required</h1><p className="mt-2 text-sm text-muted-foreground">Your session is unavailable. Sign in again to continue.</p><a className="mt-6 inline-flex text-sm font-medium text-primary hover:underline" href="/auth/github">Continue with GitHub</a></main>;
  if (!session) return <main aria-busy="true" className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Loading workspace</h1><p className="mt-2 text-sm text-muted-foreground">Checking your current sign-in status.</p></main>;

  const navigate = (path: string) => { window.history.pushState({}, "", path); setPathname(path); };
  const kind = pageKindForPath(pathname);
  const page = renderPage(kind, pathname);
  return <AppShell session={session} pathname={pathname} locale={locale} onNavigate={navigate} onLogout={() => { window.location.href = session.logoutUrl; }}>{page}</AppShell>;
}

function renderPage(kind: ReturnType<typeof pageKindForPath>, pathname: string) {
  switch (kind) {
    case "home": return <HomePage state={{ kind: "ready", total: 0, pending: 0, published: 0 }} />;
    case "knowledge": return <KnowledgeRoute />;
    case "knowledge-reader": return <KnowledgeReaderPage revision={{ id: pathname.split("/").pop() || "", title: "Knowledge", markdown: "Loading revision…" }} renderMarkdown={(markdown) => markdown} />;
    case "search": return <SearchPage state={{ kind: "ready", degraded: false, results: [] }} />;
    case "agent": return <AgentPage scope="all" state={{ kind: "ready", answer: "Ask a question to search the published knowledge.", confidence: "low", citations: [] }} />;
    case "submit": return <SubmitPage draft={{ mode: "markdown", title: "", content: "" }} state={{ kind: "idle" }} />;
    case "my-submissions": return <MySubmissionsPage state={{ kind: "ready", items: [], nextCursor: null }} />;
    case "admin": return <AdminDashboardPage metrics={{ pending: 0, assets: 0, members: 0 }} />;
    case "admin-submissions": return <ReviewQueuePage state={{ kind: "ready", items: [], nextCursor: null }} />;
    case "admin-assets": return <AssetQueuePage assets={[]} />;
    case "admin-members": return <MembersPage members={[]} />;
    case "admin-spaces": return <SpacesPage spaces={[]} />;
    case "admin-audit": return <AuditPage state={{ kind: "ready", events: [], nextCursor: null }} />;
    case "not-found": return <NotFoundPage />;
    default: return <AdminForbiddenPage />;
  }
}

function NotFoundPage() {
  return <section className="mx-auto max-w-xl py-16"><h1 className="text-2xl font-semibold">Page not found</h1><p className="mt-2 text-sm text-muted-foreground">This address does not match a workspace route.</p><a className="mt-6 inline-flex text-sm font-medium text-primary hover:underline" href="/">Return home</a></section>;
}

function KnowledgeRoute() {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; items: readonly { id: string; title?: string; summary?: string; publishedAt?: string; tags?: string[] }[]; nextCursor: string | null } | { kind: "error"; message: string }>({ kind: "loading" });
  useEffect(() => { let active = true; apiFetch<{ items?: unknown[]; nextCursor?: string | null }>("/api/knowledge?limit=20").then((data) => { if (!active) return; const items = Array.isArray(data.items) ? data.items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object").map((item) => ({ id: typeof item.id === "string" ? item.id : "unknown", title: typeof item.title === "string" ? item.title : undefined, summary: typeof item.summary === "string" ? item.summary : undefined, publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : undefined, tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [] })) : []; setState({ kind: "ready", items, nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null }); }).catch(() => { if (active) setState({ kind: "error", message: "Unable to load knowledge." }); }); return () => { active = false; }; }, []);
  return <KnowledgePage state={state} />;
}
