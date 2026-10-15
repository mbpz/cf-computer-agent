import { TimelineItemEditor } from "../components/timeline-item-editor";
import { DataTable } from "../components/data-table";
import type { FrontendPageMetadata, SupportedPageSize } from "../lib/numbered-page";
import { ArrowLeft, CalendarDots, CheckCircle, ClipboardText, Gavel, MapPin, UsersThree } from "@phosphor-icons/react";
import { TimelineCreateForm, type TimelineCreateCallbacks } from "../components/timeline-create-form";
import type { LocaleRuntime } from "../lib/i18n";
import { frontendText } from "../lib/i18n";
import type { Project, ProjectTimelineItem, ProjectTimelineStatus, TimelineEditContent } from "../lib/projects-data";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { PageState } from "../components/ui/page-state";

export type ProjectTimelinePageState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; project: Project; items: readonly ProjectTimelineItem[]; nextCursor?: string; pagination?: FrontendPageMetadata };

const kindIcons = { meeting: UsersThree, decision: Gavel, action_item: ClipboardText, milestone: MapPin } as const;

export function ProjectTimelinePage({ locale, state, pending = false, actionError, onRetry, onEdit, onStatusChange, onLoadMore, onPageChange, onPageSizeChange, onBack, createLocked = false, ...createCallbacks }: TimelineCreateCallbacks & {
  locale: LocaleRuntime; state: ProjectTimelinePageState; pending?: boolean; actionError?: string; createLocked?: boolean;
  onRetry?: () => void;
  onEdit?: (item: ProjectTimelineItem, content: TimelineEditContent) => Promise<boolean>;
  onStatusChange?: (item: ProjectTimelineItem, status: ProjectTimelineStatus) => void; onLoadMore?: () => void; onBack?: () => void;
  onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void;
}) {
  const controlsBlocked = pending || createLocked;
  const changePage = (page: number) => { if (controlsBlocked) return; onPageChange?.(page); };
  const changePageSize = (pageSize: SupportedPageSize) => { if (controlsBlocked) return; onPageSizeChange?.(pageSize); };
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "PROJECT_TIMELINE_LOADING")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "PROJECT_TIMELINE_RETRY")}</Button></PageState>;
  return <section className="flex flex-col space-y-5 lg:h-full lg:min-h-0">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16} className="mr-1" />{frontendText(locale, "PROJECT_TIMELINE_BACK")}</Button><div className="mt-2 flex items-center gap-2"><CalendarDots size={22} weight="duotone" className="text-primary" /><h1 className="text-2xl font-semibold">{state.project.title}</h1></div><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "PROJECT_TIMELINE_DESCRIPTION")}</p></div><Badge variant="outline">{frontendText(locale, "PROJECT_TIMELINE_PRIVATE_BADGE")}</Badge></div>
    <TimelineCreateForm locale={locale} pending={pending} {...createCallbacks} />
    {actionError && <div role="alert" className="text-sm text-destructive">{actionError}</div>}
    <DataTable
      locale={locale}
      rows={state.items}
      rowId={(item) => item.id}
      ariaLabel={frontendText(locale, "PROJECTS_TIMELINE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "PROJECT_TIMELINE_EMPTY")} />}
      loading={pending || createLocked}
      pagination={state.pagination}
      onPageChange={changePage}
      onPageSizeChange={changePageSize}
      fill
      className="lg:min-h-0 lg:flex-1"
      hasMore={Boolean(state.pagination && state.pagination.page < state.pagination.totalPages)}
      onLoadMore={onLoadMore}
      rowHeight={132}
      columns={[
        { key: "item", header: frontendText(locale, "PROJECT_TIMELINE_COLUMN_ITEM"), cellClassName: "whitespace-normal", cell: (item) => { const Icon = kindIcons[item.kind]; return <div className="flex gap-3 py-1"><Icon size={22} weight="duotone" className="mt-0.5 shrink-0 text-primary" /><div className="min-w-0 flex-1 space-y-2"><h2 className="line-clamp-1 font-medium">{item.title}</h2><p className="line-clamp-1 text-xs text-muted-foreground">{frontendText(locale, `PROJECT_TIMELINE_KIND_${item.kind.toUpperCase()}`)}{item.startsAt ? ` · ${new Date(item.startsAt).toLocaleString()}` : ""}{item.dueAt ? ` · ${frontendText(locale, "PROJECT_TIMELINE_DUE_SHORT")} ${new Date(item.dueAt).toLocaleString()}` : ""}</p>{item.body && <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p>}</div></div>; } },
        { key: "status", header: frontendText(locale, "PROJECT_TIMELINE_COLUMN_STATUS"), width: "160px", cell: (item) => <Badge variant={item.status === "done" ? "success" : item.status === "archived" ? "outline" : "secondary"}>{frontendText(locale, `PROJECT_TIMELINE_STATUS_${item.status.toUpperCase()}`)}</Badge> },
        { key: "actions", header: frontendText(locale, "PROJECT_TIMELINE_COLUMN_ACTIONS"), width: "280px", cellClassName: "whitespace-normal", cell: (item) => <div className="space-y-2 py-1"><div className="flex flex-wrap gap-2">{item.status === "open" && <Button type="button" size="sm" disabled={pending || createLocked} onClick={() => onStatusChange?.(item, "done")}><CheckCircle size={14} className="mr-1" />{frontendText(locale, "PROJECT_TIMELINE_MARK_DONE")}</Button>}{item.status !== "archived" && <Button type="button" size="sm" variant="outline" disabled={pending || createLocked} onClick={() => onStatusChange?.(item, "archived")}>{frontendText(locale, "PROJECT_TIMELINE_ARCHIVE")}</Button>}{item.status === "archived" && <Button type="button" size="sm" variant="outline" disabled={pending || createLocked} onClick={() => onStatusChange?.(item, "open")}>{frontendText(locale, "PROJECT_TIMELINE_REOPEN")}</Button>}</div>{onEdit && <TimelineItemEditor locale={locale} item={item} pending={pending || createLocked} onSave={onEdit} />}</div> },
      ]}
    />
  </section>;
}
