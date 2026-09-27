import { DataPagination } from "../components/data-pagination";
import type { FrontendPageMetadata, SupportedPageSize } from "../lib/numbered-page";
import { ArrowLeft, CalendarDots, CheckCircle, ClipboardText, Gavel, MapPin, UsersThree } from "@phosphor-icons/react";
import { TimelineCreateForm, type TimelineCreateCallbacks } from "../components/timeline-create-form";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { Project, ProjectTimelineItem, ProjectTimelineStatus } from "../lib/projects-data";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";

export type ProjectTimelinePageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; project: Project; items: readonly ProjectTimelineItem[]; nextCursor?: string; pagination?: FrontendPageMetadata };

const kindIcons = { meeting: UsersThree, decision: Gavel, action_item: ClipboardText, milestone: MapPin } as const;

export function ProjectTimelinePage({ locale, state, pending = false, actionError, onRetry, onStatusChange, onLoadMore, onPageChange, onPageSizeChange, onBack, createLocked = false, ...createCallbacks }: TimelineCreateCallbacks & {
  locale: LocaleRuntime; state: ProjectTimelinePageState; pending?: boolean; actionError?: string; createLocked?: boolean;
  onRetry?: () => void;
  onPageChange?: (page: number) => void; onPageSizeChange?: (size: SupportedPageSize) => void;
  onStatusChange?: (item: ProjectTimelineItem, status: ProjectTimelineStatus) => void; onLoadMore?: () => void; onBack?: () => void;
}) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "PROJECT_TIMELINE_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "PROJECT_TIMELINE_RETRY")}</Button></PageState>;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16} className="mr-1" />{frontendText(locale, "PROJECT_TIMELINE_BACK")}</Button><div className="mt-2 flex items-center gap-2"><CalendarDots size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{state.project.title}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "PROJECT_TIMELINE_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "PROJECT_TIMELINE_PRIVATE_BADGE")}</Badge></div>
    <TimelineCreateForm locale={locale} pending={pending} {...createCallbacks} />
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    {state.items.length ? <div className="space-y-3">{state.items.map((item) => { const Icon = kindIcons[item.kind]; return <Card key={item.id}><CardContent className="flex gap-3 p-4"><Icon size={22} weight="duotone" className="mt-0.5 shrink-0 text-primary" /><div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-medium">{item.title}</h2><p className="text-xs text-muted-foreground">{frontendText(locale, `PROJECT_TIMELINE_KIND_${item.kind.toUpperCase()}`)}{item.startsAt ? ` · ${new Date(item.startsAt).toLocaleString()}` : ""}{item.dueAt ? ` · ${frontendText(locale, "PROJECT_TIMELINE_DUE_SHORT")} ${new Date(item.dueAt).toLocaleString()}` : ""}</p></div><Badge variant={item.status === "done" ? "success" : item.status === "archived" ? "outline" : "secondary"}>{frontendText(locale, `PROJECT_TIMELINE_STATUS_${item.status.toUpperCase()}`)}</Badge></div>{item.body && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p>}<div className="flex flex-wrap gap-2">{item.status === "open" && <Button type="button" size="sm" disabled={pending || createLocked} onClick={() => onStatusChange?.(item, "done")}><CheckCircle size={14} className="mr-1" />{frontendText(locale, "PROJECT_TIMELINE_MARK_DONE")}</Button>}{item.status !== "archived" && <Button type="button" size="sm" variant="outline" disabled={pending || createLocked} onClick={() => onStatusChange?.(item, "archived")}>{frontendText(locale, "PROJECT_TIMELINE_ARCHIVE")}</Button>}{item.status === "archived" && <Button type="button" size="sm" variant="outline" disabled={pending || createLocked} onClick={() => onStatusChange?.(item, "open")}>{frontendText(locale, "PROJECT_TIMELINE_REOPEN")}</Button>}</div></div></CardContent></Card>; })}</div> : <PageState kind="empty" title={frontendText(locale, "PROJECT_TIMELINE_EMPTY")} />}
    {state.pagination && <DataPagination {...state.pagination} maxPage={Math.ceil(10_000 / state.pagination.pageSize)} locale={locale} pending={pending || createLocked} onPageChange={page => onPageChange?.(page)} onPageSizeChange={size => onPageSizeChange?.(size)} />}
    {!state.pagination && state.nextCursor && <div className="flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={pending || createLocked}>{frontendText(locale, "PROJECT_TIMELINE_LOAD_MORE")}</Button></div>}
  </section>;
}
