import { DataPagination } from "../../components/data-pagination";
import { Card, CardContent } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { Skeleton } from "../../components/ui/skeleton";
import type { AdminAuditPage } from "../../lib/admin-audit-data";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { SupportedPageSize } from "../../lib/numbered-page";

const actions = ["member.login", "member.identity_linked", "member.status_updated", "role.updated", "role.created", "role.deleted", "role.member_assigned", "role.member_unassigned", "menu.updated", "space.created", "space.updated", "collection.created", "collection.updated", "submission.created", "submission.draft_saved", "submission.rejected", "submission.duplicate_decided", "submission.revision_requested", "review.metadata_changed", "review.visibility_expanded", "submission.resubmitted", "knowledge.published", "knowledge.downloaded", "knowledge.rolled_back", "knowledge.trashed", "knowledge.restored", "knowledge.purged", "agent.tool_called", "task.created", "task.updated", "task.status_changed", "task.progress_changed", "task.tags_replaced", "task.deleted", "task.linked", "task.unlinked"] as const;

export function AuditPage({ state, action = "", pending = false, localError, onActionChange, onPageChange, onPageSizeChange, locale }: { state: { kind: "loading" } | { kind: "ready"; page: AdminAuditPage } | { kind: "error"; message: string }; action?: string; pending?: boolean; localError?: string; onActionChange?: (action: string) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (size: SupportedPageSize) => void; locale: LocaleRuntime }) {
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-24" /></div>;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "ADMIN_AUDIT_UNAVAILABLE")} />;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_AUDIT_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_AUDIT_DESCRIPTION")}</p></div><label className="text-sm text-muted-foreground">Action <select aria-label="Audit action" className="ml-2 h-9 rounded-md border bg-background px-2" disabled={pending} value={action} onChange={(event) => onActionChange?.(event.target.value)}><option value="">All</option>{actions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {localError && <p role="alert" className="text-sm text-destructive">{localError}</p>}
    {state.page.items.length ? <div className="space-y-3">{state.page.items.map((event) => <Card key={event.id}><CardContent className="grid gap-1 p-4 text-sm md:grid-cols-[1fr_1fr_auto]"><span className="font-medium">{event.action || frontendText(locale, "ADMIN_AUDIT_ACTION_UNAVAILABLE")}</span><span className="text-muted-foreground">{event.actor || frontendText(locale, "ADMIN_AUDIT_ACTOR_UNAVAILABLE")}</span><time className="text-muted-foreground">{event.createdAt || frontendText(locale, "ADMIN_AUDIT_DATE_UNAVAILABLE")}</time></CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "ADMIN_AUDIT_EMPTY")} description={frontendText(locale, "ADMIN_AUDIT_DESCRIPTION")} />}
    <DataPagination {...state.page.pagination} locale={locale} pending={pending} onPageChange={(page) => onPageChange?.(page)} onPageSizeChange={(size) => onPageSizeChange?.(size)} />
  </section>;
}
