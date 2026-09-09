import { Target, Plus, Archive, CheckCircle } from "@phosphor-icons/react";
import { useState } from "react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { Goal, GoalStatus } from "../lib/goals-data";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { PageState } from "../components/ui/page-state";

export type GoalsPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly Goal[]; nextCursor?: string };

export function GoalsPage({ locale, state, pending = false, actionError, onRetry, onCreate, onStatusChange, onProgressChange, onLoadMore }: {
  locale: LocaleRuntime; state: GoalsPageState; pending?: boolean; actionError?: string;
  onRetry?: () => void; onCreate?: (input: { title: string; description?: string | null }) => void;
  onStatusChange?: (goal: Goal, status: GoalStatus) => void; onProgressChange?: (goal: Goal, progress: number) => void; onLoadMore?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const submit = () => { if (!title.trim()) return; onCreate?.({ title: title.trim(), description: description.trim() || null }); setTitle(""); setDescription(""); };
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "GOALS_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "GOALS_RETRY")}</Button></PageState>;
  return <section className="space-y-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><Target size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "GOALS_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "GOALS_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "GOALS_PRIVATE_BADGE")}</Badge></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "GOALS_CREATE_TITLE")}</CardTitle></CardHeader><CardContent className="space-y-3"><Input aria-label={frontendText(locale, "GOALS_TITLE_FIELD")} value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={frontendText(locale, "GOALS_TITLE_PLACEHOLDER")} /><Textarea aria-label={frontendText(locale, "GOALS_DESCRIPTION_FIELD")} value={description} onChange={(event) => setDescription(event.currentTarget.value)} placeholder={frontendText(locale, "GOALS_DESCRIPTION_PLACEHOLDER")} rows={3} /><Button type="button" onClick={submit} disabled={pending || !title.trim()}>{frontendText(locale, "GOALS_CREATE")}</Button></CardContent></Card>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {state.items.length ? <div className="grid gap-3 lg:grid-cols-2">{state.items.map((goal) => <Card key={goal.id}><CardContent className="space-y-4 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-medium">{goal.title}</h2>{goal.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{goal.description}</p>}</div><Badge variant={goal.status === "completed" ? "success" : goal.status === "archived" ? "outline" : "secondary"}>{frontendText(locale, `GOALS_STATUS_${goal.status.toUpperCase()}`)}</Badge></div><div className="space-y-2"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{frontendText(locale, "GOALS_PROGRESS")}</span><span>{goal.progress}%</span></div><input aria-label={`${frontendText(locale, "GOALS_PROGRESS")} ${goal.title}`} type="range" min="0" max="100" step="1" value={goal.progress} disabled={pending || goal.status === "archived"} onChange={(event) => onProgressChange?.(goal, Number(event.currentTarget.value))} className="w-full accent-primary" /></div><div className="flex flex-wrap gap-2">{goal.status !== "completed" && goal.status !== "archived" && <Button type="button" size="sm" onClick={() => onStatusChange?.(goal, "completed")}><CheckCircle size={14} className="mr-1" />{frontendText(locale, "GOALS_COMPLETE")}</Button>}{goal.status !== "archived" && <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange?.(goal, "archived")}><Archive size={14} className="mr-1" />{frontendText(locale, "GOALS_ARCHIVE")}</Button>}{goal.status === "archived" && <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange?.(goal, "active")}>{frontendText(locale, "GOALS_RESTORE")}</Button>}</div></CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "GOALS_EMPTY")} />}
    {state.nextCursor && <div className="flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={pending}>{frontendText(locale, "GOALS_LOAD_MORE")}</Button></div>}
  </section>;
}
