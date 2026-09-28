import type { TodayTarget } from "../components/today-target-detail";
import { writeCalendarSearch } from "../lib/calendar-query";
import { writeWorkspaceHistory } from "../lib/workspace-location";
import { CheckCircle, Clock, Target, Tray } from "@phosphor-icons/react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { TodaySnapshot } from "../lib/today-data";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { Button } from "../components/ui/button";

export type TodayPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; snapshot: TodaySnapshot };

export function TodayPage({ locale, state, onRetry, onOpen }: { locale: LocaleRuntime; state: TodayPageState; onRetry?: () => void; onOpen?: (target: TodayTarget) => void }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "TODAY_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "TODAY_RETRY")}</Button></PageState>;
  const { snapshot } = state;
  const from = `${snapshot.date}T00:00:00.000Z`;
  const validDate = /^\d{4}-\d{2}-\d{2}$/u.test(snapshot.date) && Number.isFinite(Date.parse(from)) && new Date(from).toISOString() === from;
  const calendarHref = validDate ? `/calendar${writeCalendarSearch("", {page: 1, pageSize: 20, from, to: new Date(Date.parse(from) + 86400000).toISOString()})}` : null;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "TODAY_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "TODAY_DESCRIPTION")} · {snapshot.date} UTC</p></div><div className="grid gap-3 md:grid-cols-4"><Metric icon={<CheckCircle size={18} />} label={frontendText(locale, "TODAY_TASKS")} value={snapshot.taskSummary.todo + snapshot.taskSummary.doing + snapshot.taskSummary.blocked} /><Metric icon={<Clock size={18} />} label={frontendText(locale, "TODAY_CALENDAR")} value={snapshot.calendar.length} /><Metric icon={<Tray size={18} />} label={frontendText(locale, "TODAY_INBOX")} value={snapshot.inbox.length} /><Metric icon={<Target size={18} />} label={frontendText(locale, "TODAY_PROJECTS")} value={snapshot.projects.length} /></div><p className="text-sm text-muted-foreground">{frontendText(locale, "TODAY_BOUNDED_HINT")}</p><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>{frontendText(locale, "TODAY_TASK_LIST")}</CardTitle><TodayLink kind="tasks" href="/tasks?due=today&page=1&pageSize=20">{frontendText(locale, "TODAY_TASKS_ALL")}</TodayLink></CardHeader><CardContent>{snapshot.tasks.items.length ? <ul className="space-y-2">{snapshot.tasks.items.slice(0, 10).map((task) => <li key={task.id} className="rounded-md border p-3 text-sm"><Button variant="ghost" className="h-auto whitespace-normal text-left justify-start w-full" data-today-target="task" onClick={() => onOpen?.({kind: "task", id: task.id})}>{task.title}</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">{frontendText(locale, "TODAY_TASK_EMPTY")}</p>}</CardContent></Card><Card><CardHeader><CardTitle>{frontendText(locale, "TODAY_CALENDAR_LIST")}</CardTitle>{calendarHref && <TodayLink kind="calendar" href={calendarHref}>{frontendText(locale, "TODAY_CALENDAR_ALL")}</TodayLink>}</CardHeader><CardContent>{snapshot.calendar.length ? <ul className="space-y-2">{snapshot.calendar.slice(0, 10).map((event) => <li key={event.id} className="rounded-md border p-3 text-sm"><Button variant="ghost" className="h-auto whitespace-normal text-left justify-start w-full" data-today-target="calendar" onClick={() => onOpen?.({kind: "calendar", id: event.id})}>{event.title}</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">{frontendText(locale, "TODAY_CALENDAR_EMPTY")}</p>}</CardContent></Card></div></section>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <Card><CardContent className="flex items-center gap-3 p-4"><span className="text-primary">{icon}</span><div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>; }

function TodayLink({kind, href, children}: {kind: string; href: string; children: React.ReactNode}) {
  return <a className="text-sm underline underline-offset-4" data-today-all={kind} href={href} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault(); writeWorkspaceHistory("push", href);
  }}>{children}</a>;
}
