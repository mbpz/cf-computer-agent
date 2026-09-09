import { ArrowLeft, CalendarDots, CheckCircle, ClipboardText, Gavel, MapPin, Plus, UsersThree } from "@phosphor-icons/react";
import { useState } from "react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { Project, ProjectTimelineItem, ProjectTimelineKind, ProjectTimelineStatus } from "../lib/projects-data";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { PageState } from "../components/ui/page-state";

export type ProjectTimelinePageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; project: Project; items: readonly ProjectTimelineItem[]; nextCursor?: string };

const kindIcons = { meeting: UsersThree, decision: Gavel, action_item: ClipboardText, milestone: MapPin } as const;

export function ProjectTimelinePage({ locale, state, pending = false, actionError, onRetry, onCreate, onStatusChange, onLoadMore, onBack }: {
  locale: LocaleRuntime; state: ProjectTimelinePageState; pending?: boolean; actionError?: string;
  onRetry?: () => void; onCreate?: (input: { kind: ProjectTimelineKind; title: string; body?: string; startsAt?: string | null; dueAt?: string | null }) => void;
  onStatusChange?: (item: ProjectTimelineItem, status: ProjectTimelineStatus) => void; onLoadMore?: () => void; onBack?: () => void;
}) {
  const [kind, setKind] = useState<ProjectTimelineKind>("meeting");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const submit = () => { if (!title.trim()) return; onCreate?.({ kind, title: title.trim(), body: body.trim(), startsAt: startsAt ? new Date(startsAt).toISOString() : null, dueAt: dueAt ? new Date(dueAt).toISOString() : null }); setTitle(""); setBody(""); setStartsAt(""); setDueAt(""); };
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "PROJECT_TIMELINE_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "PROJECT_TIMELINE_RETRY")}</Button></PageState>;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16} className="mr-1" />{frontendText(locale, "PROJECT_TIMELINE_BACK")}</Button><div className="mt-2 flex items-center gap-2"><CalendarDots size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{state.project.title}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "PROJECT_TIMELINE_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "PROJECT_TIMELINE_PRIVATE_BADGE")}</Badge></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "PROJECT_TIMELINE_CREATE_TITLE")}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_KIND")}</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={kind} onChange={(event) => setKind(event.currentTarget.value as ProjectTimelineKind)}><option value="meeting">{frontendText(locale, "PROJECT_TIMELINE_KIND_MEETING")}</option><option value="decision">{frontendText(locale, "PROJECT_TIMELINE_KIND_DECISION")}</option><option value="action_item">{frontendText(locale, "PROJECT_TIMELINE_KIND_ACTION")}</option><option value="milestone">{frontendText(locale, "PROJECT_TIMELINE_KIND_MILESTONE")}</option></select></label><Input aria-label={frontendText(locale, "PROJECT_TIMELINE_TITLE_FIELD")} value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={frontendText(locale, "PROJECT_TIMELINE_TITLE_PLACEHOLDER")} /><Textarea className="md:col-span-2" aria-label={frontendText(locale, "PROJECT_TIMELINE_BODY_FIELD")} value={body} onChange={(event) => setBody(event.currentTarget.value)} placeholder={frontendText(locale, "PROJECT_TIMELINE_BODY_PLACEHOLDER")} rows={3} /><label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_STARTS_AT")}</span><Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.currentTarget.value)} /></label><label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_DUE_AT")}</span><Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.currentTarget.value)} /></label><div className="md:col-span-2"><Button type="button" onClick={submit} disabled={pending || !title.trim()}>{frontendText(locale, "PROJECT_TIMELINE_CREATE")}</Button></div></CardContent></Card>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {state.items.length ? <div className="space-y-3">{state.items.map((item) => { const Icon = kindIcons[item.kind]; return <Card key={item.id}><CardContent className="flex gap-3 p-4"><Icon size={22} weight="duotone" className="mt-0.5 shrink-0 text-primary" /><div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-medium">{item.title}</h2><p className="text-xs text-muted-foreground">{frontendText(locale, `PROJECT_TIMELINE_KIND_${item.kind.toUpperCase()}`)}{item.startsAt ? ` · ${new Date(item.startsAt).toLocaleString()}` : ""}{item.dueAt ? ` · ${frontendText(locale, "PROJECT_TIMELINE_DUE_SHORT")} ${new Date(item.dueAt).toLocaleString()}` : ""}</p></div><Badge variant={item.status === "done" ? "success" : item.status === "archived" ? "outline" : "secondary"}>{frontendText(locale, `PROJECT_TIMELINE_STATUS_${item.status.toUpperCase()}`)}</Badge></div>{item.body && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p>}<div className="flex flex-wrap gap-2">{item.status === "open" && <Button type="button" size="sm" onClick={() => onStatusChange?.(item, "done")}><CheckCircle size={14} className="mr-1" />{frontendText(locale, "PROJECT_TIMELINE_MARK_DONE")}</Button>}{item.status !== "archived" && <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange?.(item, "archived")}>{frontendText(locale, "PROJECT_TIMELINE_ARCHIVE")}</Button>}{item.status === "archived" && <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange?.(item, "open")}>{frontendText(locale, "PROJECT_TIMELINE_REOPEN")}</Button>}</div></div></CardContent></Card>; })}</div> : <PageState kind="empty" title={frontendText(locale, "PROJECT_TIMELINE_EMPTY")} />}
    {state.nextCursor && <div className="flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={pending}>{frontendText(locale, "PROJECT_TIMELINE_LOAD_MORE")}</Button></div>}
  </section>;
}
