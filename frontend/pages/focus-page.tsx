import { Pause, Play, Stop, Timer } from "@phosphor-icons/react";
import { useState } from "react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { FocusSession } from "../lib/focus-data";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { PageState } from "../components/ui/page-state";

export type FocusPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; session: FocusSession | null };

export function FocusPage({ locale, state, pending = false, actionError, onRetry, onStart, onTransition }: { locale: LocaleRuntime; state: FocusPageState; pending?: boolean; actionError?: string; onRetry?: () => void; onStart?: (input: { taskId: string; title: string; durationMinutes: number }) => void; onTransition?: (action: "pause" | "resume" | "complete" | "abandon") => void }) {
  const [taskId, setTaskId] = useState("");
  const [title, setTitle] = useState("");
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "FOCUS_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "FOCUS_RETRY")}</Button></PageState>;
  const session = state.session;
  return <section className="space-y-5"><div className="flex items-center gap-2"><Timer size={22} weight="duotone" className="text-primary" /><div><h1 className="text-2xl font-semibold">{frontendText(locale, "FOCUS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "FOCUS_DESCRIPTION")}</p></div></div>{session ? <Card><CardHeader><CardTitle>{frontendText(locale, "FOCUS_CURRENT")}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm">{frontendText(locale, "FOCUS_TASK")}：{session.taskId}</p><p className="text-sm text-muted-foreground">{frontendText(locale, `FOCUS_STATUS_${session.status.toUpperCase()}`)}</p><div className="flex flex-wrap gap-2">{session.status === "active" && <Button onClick={() => onTransition?.("pause")} disabled={pending}><Pause size={16} />{frontendText(locale, "FOCUS_PAUSE")}</Button>}{session.status === "paused" && <Button onClick={() => onTransition?.("resume")} disabled={pending}><Play size={16} />{frontendText(locale, "FOCUS_RESUME")}</Button>}{(session.status === "active" || session.status === "paused") && <><Button variant="secondary" onClick={() => onTransition?.("complete")} disabled={pending}>{frontendText(locale, "FOCUS_COMPLETE")}</Button><Button variant="outline" onClick={() => onTransition?.("abandon")} disabled={pending}><Stop size={16} />{frontendText(locale, "FOCUS_ABANDON")}</Button></>}</div></CardContent></Card> : <Card><CardHeader><CardTitle>{frontendText(locale, "FOCUS_START")}</CardTitle></CardHeader><CardContent className="space-y-3"><Input aria-label={frontendText(locale, "FOCUS_TASK_ID")} value={taskId} onChange={(event) => setTaskId(event.currentTarget.value)} placeholder={frontendText(locale, "FOCUS_TASK_ID_PLACEHOLDER")} /><Input aria-label={frontendText(locale, "FOCUS_TITLE_FIELD")} value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={frontendText(locale, "FOCUS_TITLE_PLACEHOLDER")} /><Button onClick={() => { if (taskId.trim()) onStart?.({ taskId: taskId.trim(), title: title.trim() || frontendText(locale, "FOCUS_DEFAULT_TITLE"), durationMinutes: 25 }); }} disabled={pending || !taskId.trim()}><Play size={16} />{frontendText(locale, "FOCUS_START_ACTION")}</Button></CardContent></Card>}{actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}</section>;
}
