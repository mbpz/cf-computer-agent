import { useEffect, useRef, useState } from "react";
import { useCreateDraft } from "../../lib/use-create-draft";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { DataPagination } from "../../components/data-pagination";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { FrontendPageMetadata, SupportedPageSize } from "../../lib/numbered-page";

export function MembersPage({ onLoadRetry, members, pagination, status = "", pendingIds = [], loading = false, forbidden = false, readRequired = false, pending = false, error, pageError, actionError, onStatusFilterChange, onPageChange, onPageSizeChange, onStatusChange, locale }: { onLoadRetry?: () => void; members: readonly { id: string; email?: string; role?: string; status?: string }[]; pagination?: FrontendPageMetadata; status?: "" | "active" | "disabled"; pendingIds?: readonly string[]; loading?: boolean; forbidden?: boolean; readRequired?: boolean; pending?: boolean; error?: string; pageError?: string; actionError?: string; onStatusFilterChange?: (status: "" | "active" | "disabled") => void; onPageChange?: (page: number) => void; onPageSizeChange?: (size: SupportedPageSize) => void; onStatusChange?: (id: string, status: "active" | "disabled") => void; locale: LocaleRuntime }) {
  type Confirmation = {
    id: string; email?: string; previousStatus: string; nextStatus: "active" | "disabled";
    list: typeof members; filter: typeof status; page?: number; pageSize?: number;
  };
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  // The action confirmation must be explicitly resolved, never discarded by navigation.
  useCreateDraft({}, {}, () => confirmationRef.current !== null, locale, () => false);
  useEffect(() => () => { confirmationRef.current = null; }, []);
  const currentMember = confirmation && members.find((member) => member.id === confirmation.id);
  const validConfirmation = !!(confirmation && currentMember && confirmation.list === members
    && confirmation.filter === status && confirmation.page === pagination?.page && confirmation.pageSize === pagination?.pageSize
    && currentMember.email === confirmation.email && currentMember.role === "contributor" && currentMember.status === confirmation.previousStatus
    && !loading && !error && !forbidden && !pending && !pendingIds.includes(confirmation.id) && onStatusChange);
  const cancelConfirmation = () => { confirmationRef.current = null; setConfirmation(null); };
  useEffect(() => { if (confirmation && !validConfirmation) cancelConfirmation(); }, [confirmation, validConfirmation]);
  const requestConfirmation = (member: typeof members[number]) => {
    if (confirmationRef.current || loading || error || forbidden || pending || pendingIds.includes(member.id) || !onStatusChange
      || member.role !== "contributor" || (member.status !== "active" && member.status !== "disabled")) return;
    const next: Confirmation = { id: member.id, email: member.email, previousStatus: member.status,
      nextStatus: member.status === "active" ? "disabled" : "active", list: members, filter: status, page: pagination?.page, pageSize: pagination?.pageSize };
    confirmationRef.current = next; setConfirmation(next);
  };
  const confirmStatusChange = () => {
    if (!validConfirmation || !confirmation || confirmationRef.current !== confirmation) return;
    // Consume before invoking the write: same-batch double confirmation cannot replay it.
    cancelConfirmation(); onStatusChange?.(confirmation.id, confirmation.nextStatus);
  };
  if (loading) return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (error) return <PageState kind={forbidden ? "forbidden" : "error"} title={error} description={frontendText(locale, "COMMON_UNABLE_TO_LOAD")} >{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>;
  return <><section className="space-y-5" inert={validConfirmation} aria-hidden={validConfirmation || undefined}>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_MEMBERS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_MEMBERS_DESCRIPTION")}</p></div><label className="text-sm text-muted-foreground">Status <select aria-label="Member status" className="ml-2 h-9 rounded-md border bg-background px-2" disabled={pending} value={status} onChange={(event) => onStatusFilterChange?.(event.target.value as "" | "active" | "disabled")}><option value="">All</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label></div>
    {(actionError || pageError || readRequired) && <div role="alert" className="space-y-2 text-sm text-destructive">{(actionError || pageError) && <p>{actionError || pageError}</p>}{readRequired && <p>{frontendText(locale, "ADMIN_MEMBER_READ_REQUIRED")}</p>}{onLoadRetry && <Button type="button" variant="outline" disabled={pending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</div>}
    {members.length ? <div className="space-y-3">{members.map((member) => { const disabled = member.status === "disabled"; const itemPending = pending || pendingIds.includes(member.id); const mutable = member.role === "contributor" && (member.status === "active" || member.status === "disabled"); const actionLabel = disabled ? frontendText(locale, "ADMIN_ENABLE") : frontendText(locale, "ADMIN_DISABLE"); const target = member.email || member.id; return <Card key={member.id}><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{member.email || frontendText(locale, "ADMIN_EMAIL_UNAVAILABLE")}</p><p className="mt-1 text-xs text-muted-foreground">{member.role || frontendText(locale, "ADMIN_ROLE_UNAVAILABLE")}</p></div><div className="flex items-center gap-3"><Badge variant={disabled ? "destructive" : member.status === "active" ? "success" : "secondary"}>{disabled ? frontendText(locale, "ADMIN_DISABLED") : member.status === "active" ? frontendText(locale, "ADMIN_ACTIVE") : frontendText(locale, "ADMIN_MEMBER_STATUS_UNAVAILABLE")}</Badge>{mutable && <Button aria-label={`${actionLabel} ${target}`} size="sm" variant="outline" disabled={itemPending || forbidden || !onStatusChange} onClick={() => requestConfirmation(member)}>{actionLabel}</Button>}</div></CardContent></Card>; })}</div> : <PageState kind="empty" title={frontendText(locale, "ADMIN_MEMBERS_EMPTY")} description={frontendText(locale, "ADMIN_MEMBERS_DESCRIPTION")} />}
    {pagination && <DataPagination {...pagination} locale={locale} pending={pending} onPageChange={(page) => onPageChange?.(page)} onPageSizeChange={(size) => onPageSizeChange?.(size)} />}
  </section>
    <ConfirmAction open={validConfirmation}
      title={frontendText(locale, confirmation?.nextStatus === "disabled" ? "ADMIN_MEMBER_DISABLE_CONFIRM_TITLE" : "ADMIN_MEMBER_ENABLE_CONFIRM_TITLE")}
      description={`${confirmation?.email || confirmation?.id || ""} — ${frontendText(locale, confirmation?.nextStatus === "disabled" ? "ADMIN_MEMBER_DISABLE_IMPACT" : "ADMIN_MEMBER_ENABLE_IMPACT")}`}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")}
      confirmLabel={frontendText(locale, confirmation?.nextStatus === "disabled" ? "ADMIN_MEMBER_CONFIRM_DISABLE" : "ADMIN_MEMBER_CONFIRM_ENABLE")}
      destructive={confirmation?.nextStatus === "disabled"} onCancel={cancelConfirmation} onConfirm={confirmStatusChange} />
  </>;
}
