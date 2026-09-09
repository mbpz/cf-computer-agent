import { CalendarBlank, Clock, Plus, X } from "@phosphor-icons/react";
import { useState } from "react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { CalendarEvent } from "../lib/calendar-data";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { PageState } from "../components/ui/page-state";

export type CalendarPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly CalendarEvent[]; nextCursor?: string };

export function CalendarPage({ locale, state, pending = false, actionError, onRetry, onCreate, onCancel, onLoadMore }: { locale: LocaleRuntime; state: CalendarPageState; pending?: boolean; actionError?: string; onRetry?: () => void; onCreate?: (input: { title: string; startsAt: string; endsAt: string }) => void; onCancel?: (event: CalendarEvent) => void; onLoadMore?: () => void }) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const submit = () => { if (!title.trim() || !startsAt || !endsAt) return; onCreate?.({ title: title.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }); setTitle(""); setStartsAt(""); setEndsAt(""); };
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "CALENDAR_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "CALENDAR_RETRY")}</Button></PageState>;
  return <section className="space-y-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><CalendarBlank size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "CALENDAR_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "CALENDAR_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "CALENDAR_PRIVATE_BADGE")}</Badge></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "CALENDAR_CREATE_TITLE")}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]"><Input aria-label={frontendText(locale, "CALENDAR_TITLE_FIELD")} value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={frontendText(locale, "CALENDAR_TITLE_PLACEHOLDER")} /><Input aria-label={frontendText(locale, "CALENDAR_START_FIELD")} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.currentTarget.value)} /><Input aria-label={frontendText(locale, "CALENDAR_END_FIELD")} type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.currentTarget.value)} /><Button type="button" onClick={submit} disabled={pending || !title.trim() || !startsAt || !endsAt}>{frontendText(locale, "CALENDAR_CREATE")}</Button></CardContent></Card>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {state.items.length ? <div className="space-y-3">{state.items.map((event) => <Card key={event.id}><CardContent className="flex items-start justify-between gap-4 p-4"><div className="min-w-0"><div className="flex items-center gap-2"><Clock size={16} className="text-muted-foreground" /><h2 className="truncate font-medium">{event.title}</h2><Badge variant="outline">{event.kind === "focus" ? frontendText(locale, "CALENDAR_FOCUS") : frontendText(locale, "CALENDAR_EVENT")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{formatRange(event, locale)}</p>{event.description && <p className="mt-2 text-sm">{event.description}</p>}</div>{event.status === "scheduled" && <Button type="button" variant="ghost" size="sm" onClick={() => onCancel?.(event)} disabled={pending} aria-label={frontendText(locale, "CALENDAR_CANCEL")}>{<X size={16} />}</Button>}</CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "CALENDAR_EMPTY")} />}
    {state.nextCursor && <div className="flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={pending}>{frontendText(locale, "CALENDAR_LOAD_MORE")}</Button></div>}
  </section>;
}

function formatRange(event: CalendarEvent, locale: LocaleRuntime): string {
  try { return `${new Intl.DateTimeFormat(locale.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.startsAt))} – ${new Intl.DateTimeFormat(locale.locale, { timeStyle: "short" }).format(new Date(event.endsAt))}`; } catch { return frontendText(locale, "CALENDAR_TIME_UNAVAILABLE"); }
}
