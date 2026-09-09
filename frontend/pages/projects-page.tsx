import { FolderSimple, Plus, Archive, CheckCircle } from "@phosphor-icons/react";
import { useState } from "react";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { Project, ProjectStatus, ProjectSummary } from "../lib/projects-data";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { PageState } from "../components/ui/page-state";

export type ProjectsPageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: readonly Project[]; summaries: Readonly<Record<string, ProjectSummary>>; nextCursor?: string };

const emptySummary: ProjectSummary = { goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] };

export function ProjectsPage({ locale, state, pending = false, actionError, onRetry, onCreate, onStatusChange, onLoadMore }: {
  locale: LocaleRuntime; state: ProjectsPageState; pending?: boolean; actionError?: string;
  onRetry?: () => void; onCreate?: (input: { title: string; description?: string | null }) => void;
  onStatusChange?: (project: Project, status: ProjectStatus) => void; onLoadMore?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const submit = () => { if (!title.trim()) return; onCreate?.({ title: title.trim(), description: description.trim() || null }); setTitle(""); setDescription(""); };
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "PROJECTS_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "PROJECTS_RETRY")}</Button></PageState>;
  return <section className="space-y-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><FolderSimple size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{frontendText(locale, "PROJECTS_TITLE")}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "PROJECTS_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "PROJECTS_PRIVATE_BADGE")}</Badge></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "PROJECTS_CREATE_TITLE")}</CardTitle></CardHeader><CardContent className="space-y-3"><Input aria-label={frontendText(locale, "PROJECTS_TITLE_FIELD")} value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={frontendText(locale, "PROJECTS_TITLE_PLACEHOLDER")} /><Textarea aria-label={frontendText(locale, "PROJECTS_DESCRIPTION_FIELD")} value={description} onChange={(event) => setDescription(event.currentTarget.value)} placeholder={frontendText(locale, "PROJECTS_DESCRIPTION_PLACEHOLDER")} rows={3} /><Button type="button" onClick={submit} disabled={pending || !title.trim()}>{frontendText(locale, "PROJECTS_CREATE")}</Button></CardContent></Card>
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {state.items.length ? <div className="grid gap-3 lg:grid-cols-2">{state.items.map((project) => { const summary = state.summaries[project.id] ?? emptySummary; return <Card key={project.id}><CardContent className="space-y-4 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-medium">{project.title}</h2>{project.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{project.description}</p>}</div><Badge variant={project.status === "completed" ? "success" : project.status === "archived" ? "outline" : "secondary"}>{frontendText(locale, `PROJECTS_STATUS_${project.status.toUpperCase()}`)}</Badge></div><div className="space-y-2"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{frontendText(locale, "PROJECTS_PROGRESS")}</span><span>{project.progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${project.progress}%` }} /></div></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-md bg-muted/60 p-2"><div className="font-semibold">{summary.goalCount}</div><div className="text-muted-foreground">{frontendText(locale, "PROJECTS_GOALS")}</div></div><div className="rounded-md bg-muted/60 p-2"><div className="font-semibold">{summary.taskCount}</div><div className="text-muted-foreground">{frontendText(locale, "PROJECTS_TASKS")}</div></div><div className="rounded-md bg-muted/60 p-2"><div className="font-semibold">{summary.completedTaskCount}/{summary.taskCount}</div><div className="text-muted-foreground">{frontendText(locale, "PROJECTS_DONE")}</div></div></div>{summary.goals.length > 0 && <p className="text-xs text-muted-foreground">{frontendText(locale, "PROJECTS_LINKED_GOAL")}: {summary.goals.map((goal) => goal.title).join(" · ")}</p>}<div className="flex flex-wrap gap-2">{project.status !== "completed" && project.status !== "archived" && <Button type="button" size="sm" onClick={() => onStatusChange?.(project, "completed")}><CheckCircle size={14} className="mr-1" />{frontendText(locale, "PROJECTS_COMPLETE")}</Button>}{project.status !== "archived" && <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange?.(project, "archived")}><Archive size={14} className="mr-1" />{frontendText(locale, "PROJECTS_ARCHIVE")}</Button>}{project.status === "archived" && <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange?.(project, "active")}>{frontendText(locale, "PROJECTS_RESTORE")}</Button>}</div></CardContent></Card>; })}</div> : <PageState kind="empty" title={frontendText(locale, "PROJECTS_EMPTY")} />}
    {state.nextCursor && <div className="flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={pending}>{frontendText(locale, "PROJECTS_LOAD_MORE")}</Button></div>}
  </section>;
}
