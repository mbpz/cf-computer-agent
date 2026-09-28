import { writeWorkspaceHistory } from "../lib/workspace-location";
import { ArrowsClockwise, CheckCircle, Warning, Timer } from "@phosphor-icons/react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { WorkbenchReviewSnapshot } from "../lib/workbench-review-data";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";

export type ReviewTarget = {kind: "task" | "inbox" | "project"; id: string};
export type WorkbenchReviewPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; snapshot: WorkbenchReviewSnapshot };
export function WorkbenchReviewPage({ locale, period, state, onPeriodChange, onRetry, onOpen }: { locale: LocaleRuntime; period: "daily" | "weekly"; state: WorkbenchReviewPageState; onPeriodChange?: (period: "daily" | "weekly") => void; onRetry?: () => void; onOpen?: (target: ReviewTarget) => void }) {
  const s = state.kind === "ready" ? state.snapshot : null;
  return <section className="space-y-5" aria-busy={state.kind === "loading"}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{frontendText(locale, "REVIEW_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "REVIEW_DESCRIPTION")}{s ? ` · ${s.periodKey}` : ""}</p></div>
      <div className="flex flex-wrap gap-2">
        {s && <Button variant="outline" onClick={onRetry}>{frontendText(locale, "REVIEW_REFRESH")}</Button>}
        <Button aria-pressed={period === "daily"} variant={period === "daily" ? "default" : "outline"} onClick={() => onPeriodChange?.("daily")}>{frontendText(locale, "REVIEW_DAILY")}</Button>
        <Button aria-pressed={period === "weekly"} variant={period === "weekly" ? "default" : "outline"} onClick={() => onPeriodChange?.("weekly")}>{frontendText(locale, "REVIEW_WEEKLY")}</Button>
      </div>
    </div>
    {state.kind === "loading" && <PageState kind="loading" title={frontendText(locale, "REVIEW_LOADING")} />}
    {state.kind === "error" && <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "REVIEW_RETRY")}</Button></PageState>}
    {s && <>
      <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={<CheckCircle size={18} />} label={frontendText(locale, "REVIEW_COMPLETED")} value={s.taskSummary.done} />
        <Metric icon={<Warning size={18} />} label={frontendText(locale, "REVIEW_OVERDUE")} value={s.taskSummary.overdue} />
        <Metric icon={<ArrowsClockwise size={18} />} label={frontendText(locale, "REVIEW_BLOCKED")} value={s.taskSummary.blocked} />
        <Metric icon={<Timer size={18} />} label={frontendText(locale, "REVIEW_FOCUS_TIME")} value={Math.round(s.focusElapsedMs / 60000)} />
      </div>
      <p className="text-sm text-muted-foreground">{frontendText(locale, "REVIEW_BOUNDED_HINT")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard locale={locale} kind="completed" title={frontendText(locale, "REVIEW_COMPLETED_LIST")} items={s.completed.map(item => ({kind: "task", id: item.id, title: item.title}))} href="/tasks?status=done&page=1&pageSize=20" empty={frontendText(locale, "REVIEW_EMPTY_COMPLETED")} onOpen={onOpen} />
        <ListCard locale={locale} kind="overdue" title={frontendText(locale, "REVIEW_OVERDUE")} items={s.overdue.map(item => ({kind: "task", id: item.id, title: item.title}))} href="/tasks?due=overdue&page=1&pageSize=20" empty={frontendText(locale, "REVIEW_EMPTY_NEXT")} onOpen={onOpen} />
        <ListCard locale={locale} kind="blocked" title={frontendText(locale, "REVIEW_BLOCKED")} items={s.blocked.map(item => ({kind: "task", id: item.id, title: item.title}))} href="/tasks?status=blocked&page=1&pageSize=20" empty={frontendText(locale, "REVIEW_EMPTY_NEXT")} onOpen={onOpen} />
        <ListCard locale={locale} kind="inbox" title={frontendText(locale, "TODAY_INBOX")} items={s.inbox.map(item => ({kind: "inbox", id: item.id, title: item.content}))} href="/inbox?status=inbox&page=1&pageSize=20" empty={frontendText(locale, "REVIEW_EMPTY_NEXT")} onOpen={onOpen} />
        <ListCard locale={locale} kind="projects" title={frontendText(locale, "TODAY_PROJECTS")} items={s.projects.map(item => ({kind: "project", id: item.id, title: item.title}))} href="/projects?status=active&page=1&pageSize=20" empty={frontendText(locale, "REVIEW_EMPTY_NEXT")} onOpen={onOpen} />
      </div>
    </>}
  </section>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <Card><CardContent className="flex items-center gap-3 p-4"><span className="text-primary">{icon}</span><div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>; }
function ListCard({locale, kind, title, items, href, empty, onOpen}: {locale: LocaleRuntime; kind: string; title: string; items: (ReviewTarget & {title: string})[]; href: string; empty: string; onOpen?: (target: ReviewTarget) => void}) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><a className="text-sm underline underline-offset-4" data-review-all={kind} href={href} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault(); writeWorkspaceHistory("push", href);
  }}>{frontendText(locale, "REVIEW_VIEW_ALL")}</a></CardHeader><CardContent>{items.length ? <ul className="space-y-2">{items.slice(0,10).map(item => <li key={`${item.kind}:${item.id}`} className="rounded-md border p-3 text-sm"><Button variant="ghost" className="h-auto whitespace-normal text-left justify-start w-full" data-review-target={item.kind} onClick={() => onOpen?.({kind:item.kind,id:item.id})}>{item.title}</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}
