import { Button } from "../../components/ui/button";
import { DataTable } from "../../components/data-table";
import { PageState } from "../../components/ui/page-state";
import { Skeleton } from "../../components/ui/skeleton";
import type { AdminAuditEvent, AdminAuditPage } from "../../lib/admin-audit-data";
import type { SupportedPageSize } from "../../lib/numbered-page";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

const actions = ["member.login", "member.identity_linked", "member.status_updated", "role.updated", "role.created", "role.deleted", "role.member_assigned", "role.member_unassigned", "menu.updated", "space.created", "space.updated", "collection.created", "collection.updated", "submission.created", "submission.draft_saved", "submission.rejected", "submission.duplicate_decided", "submission.revision_requested", "review.metadata_changed", "review.visibility_expanded", "submission.resubmitted", "knowledge.published", "knowledge.downloaded", "knowledge.rolled_back", "knowledge.trashed", "knowledge.restored", "knowledge.purged", "agent.tool_called", "task.created", "task.updated", "task.status_changed", "task.progress_changed", "task.tags_replaced", "task.deleted", "task.linked", "task.unlinked", "discussion.message_sent"] as const;

export function AuditPage({ state, action = "", pending = false, localError, onRetry, onActionChange, onPageChange, onPageSizeChange, onLoadMore, locale }: { state: { kind: "loading" } | { kind: "ready"; page: AdminAuditPage } | { kind: "error"; message: string }; action?: string; pending?: boolean; localError?: string; onRetry?: () => void; onActionChange?: (action: string) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void; onLoadMore?: () => void; locale: LocaleRuntime }) {
  const retry = onRetry && <Button type="button" variant="outline" size="sm" className="mt-3" disabled={pending} onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>;
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-24" /></div>;
  if (state.kind === "error") return <div aria-busy={pending}><PageState kind="error" title={state.message || frontendText(locale, "ADMIN_AUDIT_UNAVAILABLE")}>{retry}</PageState></div>;
  return <section className="flex flex-col gap-5 lg:h-full lg:min-h-0" aria-busy={pending}>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_AUDIT_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_AUDIT_DESCRIPTION")}</p></div><label className="text-sm text-muted-foreground">Action <select aria-label="Audit action" className="ml-2 h-9 rounded-md border bg-background px-2" disabled={pending} value={action} onChange={(event) => onActionChange?.(event.target.value)}><option value="">All</option>{actions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {localError && <PageState kind="error" title={localError}>{retry}</PageState>}
    <DataTable
      locale={locale}
      rows={state.page.items}
      rowId={(event: AdminAuditEvent) => event.id}
      ariaLabel={frontendText(locale, "ADMIN_AUDIT_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_AUDIT_EMPTY")} description={frontendText(locale, "ADMIN_AUDIT_DESCRIPTION")} />}
      loading={pending}
      pagination={state.page.pagination}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      hasMore={!localError && state.page.pagination.page < state.page.pagination.totalPages}
      onLoadMore={onLoadMore}
      fill
      rowHeight={56}
      columns={[
        { key: "action", header: frontendText(locale, "ADMIN_AUDIT_COLUMN_ACTION"), cellClassName: "whitespace-normal", cell: (event) => <span className="line-clamp-1 font-medium">{event.action || frontendText(locale, "ADMIN_AUDIT_ACTION_UNAVAILABLE")}</span> },
        { key: "actor", header: frontendText(locale, "ADMIN_AUDIT_COLUMN_ACTOR"), width: "240px", cellClassName: "whitespace-normal", cell: (event) => <span className="line-clamp-1 text-muted-foreground">{event.actor || frontendText(locale, "ADMIN_AUDIT_ACTOR_UNAVAILABLE")}</span> },
        { key: "createdAt", header: frontendText(locale, "ADMIN_AUDIT_COLUMN_TIME"), width: "220px", cellClassName: "whitespace-normal", cell: (event) => <time className="line-clamp-1 text-muted-foreground">{event.createdAt || frontendText(locale, "ADMIN_AUDIT_DATE_UNAVAILABLE")}</time> },
      ]}
    />
  </section>;
}
