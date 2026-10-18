import { Button } from "../components/ui/button";
import { ListChecks, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { AnimatedNumber } from "../components/motion/animated-number";
import { Dock, DockItem } from "../components/motion/dock";
import { SharedLayoutBg } from "../components/motion/shared-layout-bg";
import { TiltCard } from "../components/motion/tilt-card";
import { Tooltip } from "../components/motion/tooltip";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { WorkbenchSummary } from "../lib/workbench-data";

export type WorkbenchHomeState =
  | { kind: "loading" }
  | {
      kind: "ready";
      summary: WorkbenchSummary;
      unavailable?: readonly ("tasks" | "knowledge" | "activity")[];
      /** Cursor for the next recent page; null means the server list ended. */
      recentCursor?: string | null;
      /** A later recent page is in flight. */
      recentPending?: boolean;
      /** A later recent page failed; the loaded rows stay and the control retries it. */
      recentMoreError?: boolean;
    }
  | { kind: "error"; message: string; retryable?: boolean };

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
  "task.status_changed": "WORKBENCH_ACTIVITY_TASK_STATUS_CHANGED",
  "task.progress_changed": "WORKBENCH_ACTIVITY_TASK_PROGRESS_CHANGED",
  "task.tags_replaced": "WORKBENCH_ACTIVITY_TASK_TAGS_REPLACED",
  "task.linked": "WORKBENCH_ACTIVITY_TASK_LINKED",
  "task.unlinked": "WORKBENCH_ACTIVITY_TASK_UNLINKED",
  "discussion.message_sent": "WORKBENCH_ACTIVITY_DISCUSSION_MESSAGE_SENT",
};

const QUICK_ACTION_ICONS: Record<string, ReactNode> = {
  "open-tasks": <ListChecks size={20} weight="duotone" />,
  "ask-ai": <Sparkle size={20} weight="duotone" />,
  "search-knowledge": <MagnifyingGlass size={20} weight="duotone" />,
};

function textWithCount(locale: LocaleRuntime | undefined, key: string, count: number): string {
  return frontendText(locale, key).replace("{count}", String(count));
}

function toDateLabel(value: string, locale: LocaleRuntime | undefined): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale?.locale ?? "en", { month: "short", day: "numeric" });
}

export function HomePage({ state, locale, onRetry, onLoadMoreRecent }: { state: HomeState; locale?: LocaleRuntime; onRetry?: () => void; onLoadMoreRecent?: () => void }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{state.retryable !== false && <Button type="button" variant="outline" className="mt-3" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>;

  if (!("summary" in state)) return <LegacyHomePage locale={locale} state={state} />;
  const summary = state.summary;

  const unavailable = new Set(state.unavailable);
  const failed = <div role="status"><p>{frontendText(locale, "COMMON_UNABLE_TO_LOAD")}</p><Button type="button" variant="outline" className="mt-3" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></div>;

  return (
    <section className="space-y-6" aria-labelledby="workbench-title">
      {/* One capture action per page: the card below owns `/submit`, so the
          header carries the title and description only. */}
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">{frontendText(locale, "APP_BRAND_EYEBROW")}</p>
        <h1 id="workbench-title" className="mt-2 text-3xl font-semibold tracking-tight">{frontendText(locale, "WORKBENCH_TITLE")}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{frontendText(locale, "WORKBENCH_DESCRIPTION")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <TiltCard className="h-full">
        <Card className="h-full overflow-hidden border-primary/25">
          <CardHeader>
            <CardTitle>{frontendText(locale, "WORKBENCH_CAPTURE_TITLE")}</CardTitle>
            <p className="text-sm text-muted-foreground">{frontendText(locale, "WORKBENCH_CAPTURE_DESCRIPTION")}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a href="/submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">{frontendText(locale, "WORKBENCH_QUICK_SUBMIT")}</a>
            <a href="/agent" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">{frontendText(locale, "WORKBENCH_QUICK_AI")}</a>
          </CardContent>
        </Card>
        </TiltCard>

        <Card data-home-section="tasks">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{frontendText(locale, "WORKBENCH_TASKS_TITLE")}</CardTitle>
              {!unavailable.has("tasks") && <p className="mt-1 text-sm text-muted-foreground">{textWithCount(locale, "WORKBENCH_TASKS_COUNT", summary.taskCount)}</p>}
            </div>
            <a href="/tasks" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "WORKBENCH_OPEN_TASKS")}</a>
          </CardHeader>
          <CardContent>
            {unavailable.has("tasks") ? failed : <><p className="text-4xl font-semibold"><AnimatedNumber value={summary.taskCount} startOnView={false} /></p>
            <p className="mt-1 text-sm text-muted-foreground">{textWithCount(locale, "WORKBENCH_OVERDUE", summary.overdueTaskCount)}</p></>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card data-home-section="knowledge">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <CardTitle>{frontendText(locale, "WORKBENCH_KNOWLEDGE_TITLE")}</CardTitle>
            <a href="/knowledge" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "HOME_OPEN_KNOWLEDGE")}</a>
          </CardHeader>
          <CardContent>
            {unavailable.has("knowledge") ? failed : (
              <>
                {summary.recentKnowledge.length ? (
                  <SharedLayoutBg as="ul" className="divide-y" inset={10}>
                    {summary.recentKnowledge.map((item) => (
                      <li key={item.id}>
                        <a href={`/knowledge/${encodeURIComponent(item.id)}`} className="block px-2 py-3 first:pt-0 last:pb-0 hover:text-primary">
                          <p className="font-medium">{item.title || frontendText(locale, "KNOWLEDGE_UNTITLED")}</p>
                          {item.summary && <p className="mt-1 text-xs text-muted-foreground">{toDateLabel(item.summary, locale)}</p>}
                        </a>
                      </li>
                    ))}
                  </SharedLayoutBg>
                ) : <p className="text-sm text-muted-foreground">{frontendText(locale, "HOME_RECENT_EMPTY")}</p>}
                {state.recentMoreError ? (
                  <div role="alert" data-home-more-error="knowledge" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-destructive">
                    <span>{frontendText(locale, "COMMON_UNABLE_TO_LOAD")}</span>
                    {onLoadMoreRecent && <Button type="button" variant="outline" size="sm" onClick={onLoadMoreRecent}>{frontendText(locale, "COMMON_RETRY")}</Button>}
                  </div>
                ) : state.recentCursor && onLoadMoreRecent ? (
                  <Button type="button" variant="outline" className="mt-3" data-home-more="knowledge" disabled={state.recentPending} onClick={onLoadMoreRecent}>
                    {frontendText(locale, "KNOWLEDGE_LOAD_MORE")}
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card data-home-section="activity">
          <CardHeader><CardTitle>{frontendText(locale, "WORKBENCH_ACTIVITY_TITLE")}</CardTitle></CardHeader>
          <CardContent>
            {unavailable.has("activity") ? failed : summary.recentActivity.length ? (
              <SharedLayoutBg as="ul" className="space-y-1" inset={10}>
                {summary.recentActivity.map((item) => {
                  const label = frontendText(locale, ACTIVITY_LABEL_KEYS[item.label] ?? "WORKBENCH_ACTIVITY_UNKNOWN");
                  const content = <div className="px-2 py-2"><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{toDateLabel(item.createdAt, locale)}</p></div>;
                  return <li key={item.id}>{item.href ? <a href={item.href} className="block hover:text-primary">{content}</a> : content}</li>;
                })}
              </SharedLayoutBg>
            ) : <p className="text-sm text-muted-foreground">{frontendText(locale, "WORKBENCH_ACTIVITY_EMPTY")}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{frontendText(locale, "WORKBENCH_QUICK_ACTIONS")}</CardTitle></CardHeader>
        <CardContent>
          <Dock size={44} className="max-w-full">
            {summary.quickActions.map((action) => {
              const label = frontendText(locale, action.labelKey);
              return <DockItem key={action.id}>
                <Tooltip content={label}>
                  <a href={action.href} aria-label={label} className="grid size-full place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {QUICK_ACTION_ICONS[action.id] ?? <ListChecks size={20} weight="duotone" />}
                  </a>
                </Tooltip>
              </DockItem>;
            })}
          </Dock>
        </CardContent>
      </Card>
    </section>
  );
}

function LegacyHomePage({ locale, state }: { locale?: LocaleRuntime; state: LegacyHomeState }) {
  const recent = state.recent ?? [];
  const metrics: ReadonlyArray<readonly [string, number]> = [
    [frontendText(locale, "HOME_TOTAL_SUBMISSIONS"), state.total],
    [frontendText(locale, "HOME_PENDING_REVIEW"), state.pending],
    [frontendText(locale, "HOME_PUBLISHED_KNOWLEDGE"), state.published],
  ];
  return <section className="space-y-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">{frontendText(locale, "APP_BRAND_EYEBROW")}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{frontendText(locale, "HOME_TITLE")}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{frontendText(locale, "HOME_DESCRIPTION")}</p></div><a href="/submit" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">{frontendText(locale, "HOME_QUICK_SUBMIT")}</a></div><div className="grid gap-4 md:grid-cols-3">{metrics.map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}</div><div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><Card><CardHeader><CardTitle>{frontendText(locale, "HOME_RECENT_TITLE")}</CardTitle></CardHeader><CardContent>{recent.length ? <div className="divide-y">{recent.map((item) => <a key={item.id} href={`/knowledge/${encodeURIComponent(item.id)}`} className="block py-3 first:pt-0 last:pb-0 hover:text-primary"><p className="font-medium">{item.title || frontendText(locale, "KNOWLEDGE_UNTITLED")}</p>{item.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>}</a>)}</div> : <p className="text-sm text-muted-foreground">{frontendText(locale, "HOME_RECENT_EMPTY")}</p>}</CardContent></Card><Card><CardHeader><CardTitle>{frontendText(locale, "HOME_QUICK_ACTIONS")}</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1"><a href="/knowledge" className="rounded-md border px-3 py-2 text-sm hover:bg-accent">{frontendText(locale, "HOME_OPEN_KNOWLEDGE")}</a><a href="/search" className="rounded-md border px-3 py-2 text-sm hover:bg-accent">{frontendText(locale, "HOME_OPEN_SEARCH")}</a><a href="/agent" className="rounded-md border px-3 py-2 text-sm hover:bg-accent">{frontendText(locale, "HOME_OPEN_AGENT")}</a></CardContent></Card></div></section>;
}
