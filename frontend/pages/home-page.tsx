import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { WorkbenchSummary } from "../lib/workbench-data";

export type WorkbenchHomeState =
  | { kind: "loading" }
  | { kind: "ready"; summary: WorkbenchSummary }
  | { kind: "error"; message: string };

/** Compatibility boundary for older embeds; the app uses WorkbenchHomeState. */
export type LegacyHomeState = {
  kind: "ready";
  total: number;
  pending: number;
  published: number;
  recent?: readonly { id: string; title: string; summary?: string }[];
};

export type HomeState = WorkbenchHomeState | LegacyHomeState;

const ACTIVITY_LABEL_KEYS: Record<string, string> = {
  "knowledge.published": "WORKBENCH_ACTIVITY_KNOWLEDGE_PUBLISHED",
  "knowledge.rolled_back": "WORKBENCH_ACTIVITY_KNOWLEDGE_ROLLED_BACK",
  "knowledge.restored": "WORKBENCH_ACTIVITY_KNOWLEDGE_RESTORED",
  "knowledge.downloaded": "WORKBENCH_ACTIVITY_KNOWLEDGE_DOWNLOADED",
  "submission.created": "WORKBENCH_ACTIVITY_SUBMISSION_CREATED",
  "submission.draft_saved": "WORKBENCH_ACTIVITY_SUBMISSION_DRAFT_SAVED",
  "submission.rejected": "WORKBENCH_ACTIVITY_SUBMISSION_REJECTED",
  "submission.revision_requested": "WORKBENCH_ACTIVITY_SUBMISSION_REVISION_REQUESTED",
  "submission.resubmitted": "WORKBENCH_ACTIVITY_SUBMISSION_RESUBMITTED",
};

function textWithCount(locale: LocaleRuntime | undefined, key: string, count: number): string {
  return frontendText(locale, key).replace("{count}", String(count));
}

function toDateLabel(value: string, locale: LocaleRuntime | undefined): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale?.locale ?? "en", { month: "short", day: "numeric" });
}

function legacySummary(state: LegacyHomeState): WorkbenchSummary {
  return {
    taskCount: state.total,
    overdueTaskCount: state.pending,
    recentKnowledge: (state.recent ?? []).map((item) => ({ id: item.id, title: item.title, summary: item.summary ?? "" })),
    recentActivity: [],
    quickActions: [
      { id: "create-knowledge", href: "/submit", labelKey: "HOME_QUICK_SUBMIT" },
      { id: "search-knowledge", href: "/search", labelKey: "HOME_OPEN_SEARCH" },
      { id: "ask-ai", href: "/agent", labelKey: "HOME_OPEN_AGENT" },
    ],
  };
}

export function HomePage({ state, locale, onRetry }: { state: HomeState; locale?: LocaleRuntime; onRetry?: () => void }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}><button type="button" onClick={onRetry} className="mt-3 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">{frontendText(locale, "COMMON_RETRY")}</button></PageState>;

  const summary = "summary" in state ? state.summary : legacySummary(state);
  if (!("summary" in state)) return <LegacyHomePage locale={locale} summary={summary} />;

  return (
    <section className="space-y-6" aria-labelledby="workbench-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">{frontendText(locale, "APP_BRAND_EYEBROW")}</p>
          <h1 id="workbench-title" className="mt-2 text-3xl font-semibold tracking-tight">{frontendText(locale, "WORKBENCH_TITLE")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{frontendText(locale, "WORKBENCH_DESCRIPTION")}</p>
        </div>
        <a href="/submit" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
          {frontendText(locale, "WORKBENCH_OPEN_CAPTURE")}
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
          <CardHeader>
            <CardTitle>{frontendText(locale, "WORKBENCH_CAPTURE_TITLE")}</CardTitle>
            <p className="text-sm text-muted-foreground">{frontendText(locale, "WORKBENCH_CAPTURE_DESCRIPTION")}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a href="/submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">{frontendText(locale, "WORKBENCH_QUICK_SUBMIT")}</a>
            <a href="/agent" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">{frontendText(locale, "WORKBENCH_QUICK_AI")}</a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{frontendText(locale, "WORKBENCH_TASKS_TITLE")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{textWithCount(locale, "WORKBENCH_TASKS_COUNT", summary.taskCount)}</p>
            </div>
            <a href="/tasks" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "WORKBENCH_OPEN_TASKS")}</a>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold tabular-nums">{summary.taskCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">{textWithCount(locale, "WORKBENCH_OVERDUE", summary.overdueTaskCount)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <CardTitle>{frontendText(locale, "WORKBENCH_KNOWLEDGE_TITLE")}</CardTitle>
            <a href="/knowledge" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "HOME_OPEN_KNOWLEDGE")}</a>
          </CardHeader>
          <CardContent>
            {summary.recentKnowledge.length ? (
              <div className="divide-y">
                {summary.recentKnowledge.map((item) => (
                  <a key={item.id} href={`/knowledge/${encodeURIComponent(item.id)}`} className="block py-3 first:pt-0 last:pb-0 hover:text-primary">
                    <p className="font-medium">{item.title || frontendText(locale, "KNOWLEDGE_UNTITLED")}</p>
                    {item.summary && <p className="mt-1 text-xs text-muted-foreground">{toDateLabel(item.summary, locale)}</p>}
                  </a>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">{frontendText(locale, "HOME_RECENT_EMPTY")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{frontendText(locale, "WORKBENCH_ACTIVITY_TITLE")}</CardTitle></CardHeader>
          <CardContent>
            {summary.recentActivity.length ? (
              <div className="space-y-4">
                {summary.recentActivity.map((item) => {
                  const label = frontendText(locale, ACTIVITY_LABEL_KEYS[item.label] ?? "WORKBENCH_ACTIVITY_UNKNOWN");
                  const content = <div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{toDateLabel(item.createdAt, locale)}</p></div>;
                  return item.href ? <a key={item.id} href={item.href} className="block hover:text-primary">{content}</a> : <div key={item.id}>{content}</div>;
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground">{frontendText(locale, "WORKBENCH_ACTIVITY_EMPTY")}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{frontendText(locale, "WORKBENCH_QUICK_ACTIONS")}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {summary.quickActions.map((action) => <a key={action.id} href={action.href} className="rounded-md border px-3 py-3 text-sm font-medium hover:bg-accent">{frontendText(locale, action.labelKey)}</a>)}
        </CardContent>
      </Card>
    </section>
  );
}

function LegacyHomePage({ locale, summary }: { locale?: LocaleRuntime; summary: WorkbenchSummary }) {
  return <section className="space-y-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">{frontendText(locale, "APP_BRAND_EYEBROW")}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{frontendText(locale, "HOME_TITLE")}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{frontendText(locale, "HOME_DESCRIPTION")}</p></div><a href="/submit" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">{frontendText(locale, "HOME_QUICK_SUBMIT")}</a></div><div className="grid gap-4 md:grid-cols-3">{[[frontendText(locale, "HOME_TOTAL_SUBMISSIONS"), summary.taskCount], [frontendText(locale, "HOME_PENDING_REVIEW"), summary.overdueTaskCount], [frontendText(locale, "HOME_PUBLISHED_KNOWLEDGE"), summary.recentKnowledge.length]].map(([label, value]) => <Card key={label as string}><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}</div><div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><Card><CardHeader><CardTitle>{frontendText(locale, "HOME_RECENT_TITLE")}</CardTitle></CardHeader><CardContent>{summary.recentKnowledge.length ? <div className="divide-y">{summary.recentKnowledge.map((item) => <a key={item.id} href={`/knowledge/${encodeURIComponent(item.id)}`} className="block py-3 first:pt-0 last:pb-0 hover:text-primary"><p className="font-medium">{item.title || frontendText(locale, "KNOWLEDGE_UNTITLED")}</p>{item.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>}</a>)}</div> : <p className="text-sm text-muted-foreground">{frontendText(locale, "HOME_RECENT_EMPTY")}</p>}</CardContent></Card><Card><CardHeader><CardTitle>{frontendText(locale, "HOME_QUICK_ACTIONS")}</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1"><a href="/knowledge" className="rounded-md border px-3 py-2 text-sm hover:bg-accent">{frontendText(locale, "HOME_OPEN_KNOWLEDGE")}</a><a href="/search" className="rounded-md border px-3 py-2 text-sm hover:bg-accent">{frontendText(locale, "HOME_OPEN_SEARCH")}</a><a href="/agent" className="rounded-md border px-3 py-2 text-sm hover:bg-accent">{frontendText(locale, "HOME_OPEN_AGENT")}</a></CardContent></Card></div></section>;
}
