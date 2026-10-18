import { useEffect, useRef, useState } from "react";
import { useCreateDraft } from "../../lib/use-create-draft";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { DataTable } from "../../components/data-table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { FilterSelect } from "../../components/ui/filter-select";
import { AppliedFilters } from "../../components/ui/applied-filters";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { FrontendPageMetadata, SupportedPageSize } from "../../lib/numbered-page";

export function MembersPage({
  onLoadRetry,
  members,
  pagination,
  status = "",
  pendingIds = [],
  loading = false,
  forbidden = false,
  readRequired = false,
  pending = false,
  error,
  pageError,
  actionError,
  statusRecordBlocked = false,
  onDiscardStatusRecord,
  onStatusFilterChange,
  onPageChange,
  onPageSizeChange,
  onLoadMore,
  onStatusChange,
  locale,
}: {
  onLoadRetry?: () => void;
  members: readonly { id: string; email?: string; role?: string; status?: string }[];
  pagination?: FrontendPageMetadata;
  status?: "" | "active" | "disabled";
  pendingIds?: readonly string[];
  loading?: boolean;
  forbidden?: boolean;
  readRequired?: boolean;
  pending?: boolean;
  error?: string;
  pageError?: string;
  actionError?: string;
  statusRecordBlocked?: boolean;
  onDiscardStatusRecord?: () => void;
  onStatusFilterChange?: (status: "" | "active" | "disabled") => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: SupportedPageSize) => void;
  onLoadMore?: () => void;
  onStatusChange?: (id: string, status: "active" | "disabled") => void;
  locale: LocaleRuntime;
}) {
  type StatusConfirmation = {
    kind: "status";
    id: string;
    email?: string;
    previousStatus: string;
    nextStatus: "active" | "disabled";
    list: typeof members;
    filter: typeof status;
    page?: number;
    pageSize?: number;
  };
  const [confirmation, setConfirmation] = useState<StatusConfirmation | null>(null);
  const confirmationRef = useRef<StatusConfirmation | null>(null);
  // The action confirmation must be explicitly resolved, never discarded by navigation.
  useCreateDraft({}, {}, () => confirmationRef.current !== null, locale, () => false);
  useEffect(() => () => { confirmationRef.current = null; }, []);

  const validConfirmation = (() => {
    if (!confirmation) return false;
    const member = members.find((item) => item.id === confirmation.id);
    return Boolean(member && confirmation.list === members
      && confirmation.filter === status && confirmation.page === pagination?.page && confirmation.pageSize === pagination?.pageSize
      && member.email === confirmation.email && member.role === "contributor" && member.status === confirmation.previousStatus
      && !loading && !error && !forbidden && !pending && !pendingIds.includes(confirmation.id) && onStatusChange);
  })();
  const cancelConfirmation = () => { confirmationRef.current = null; setConfirmation(null); };
  useEffect(() => { if (confirmation && !validConfirmation) cancelConfirmation(); }, [confirmation, validConfirmation]);
  const requestStatusConfirmation = (member: typeof members[number]) => {
    if (confirmationRef.current || loading || error || forbidden || pending || pendingIds.includes(member.id) || !onStatusChange
      || member.role !== "contributor" || (member.status !== "active" && member.status !== "disabled")) return;
    const next: StatusConfirmation = {
      kind: "status",
      id: member.id,
      email: member.email,
      previousStatus: member.status,
      nextStatus: member.status === "active" ? "disabled" : "active",
      list: members,
      filter: status,
      page: pagination?.page,
      pageSize: pagination?.pageSize,
    };
    confirmationRef.current = next;
    setConfirmation(next);
  };
  const confirmAction = () => {
    if (!validConfirmation || !confirmation || confirmationRef.current !== confirmation) return;
    const action = confirmation;
    // Consume before invoking the write: same-batch double confirmation cannot replay it.
    cancelConfirmation();
    onStatusChange?.(action.id, action.nextStatus);
  };
  const dialog = confirmation ? {
    title: frontendText(locale, confirmation.nextStatus === "disabled" ? "ADMIN_MEMBER_DISABLE_CONFIRM_TITLE" : "ADMIN_MEMBER_ENABLE_CONFIRM_TITLE"),
    description: `${confirmation.email || confirmation.id} — ${frontendText(locale, confirmation.nextStatus === "disabled" ? "ADMIN_MEMBER_DISABLE_IMPACT" : "ADMIN_MEMBER_ENABLE_IMPACT")}`,
    confirmLabel: frontendText(locale, confirmation.nextStatus === "disabled" ? "ADMIN_MEMBER_CONFIRM_DISABLE" : "ADMIN_MEMBER_CONFIRM_ENABLE"),
    destructive: confirmation.nextStatus === "disabled",
  } : null;

  // The page shell is constant: the header and status filter render for every
  // state; loading and read failure only replace the member table.
  return <><section className="flex flex-col gap-5 lg:h-full lg:min-h-0" inert={validConfirmation} aria-hidden={validConfirmation || undefined}>
    <PageHeader title={frontendText(locale, "ADMIN_MEMBERS_TITLE")} description={frontendText(locale, "ADMIN_MEMBERS_DESCRIPTION")}
      actions={<FilterSelect label="Status" ariaLabel="Member status" value={status} disabled={pending} onChange={(value) => onStatusFilterChange?.(value as "" | "active" | "disabled")} options={[{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "disabled", label: "Disabled" }]} />} />
    <AppliedFilters
      ariaLabel={frontendText(locale, "COMMON_APPLIED_FILTERS")}
      clearLabel={frontendText(locale, "COMMON_CLEAR_FILTERS")}
      filters={status ? [{ id: "status", label: `Status: ${status}`, onRemove: () => onStatusFilterChange?.("") }] : []}
      onClear={() => onStatusFilterChange?.("")}
    />
    {loading ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : error ? <PageState kind={forbidden ? "forbidden" : "error"} title={error} description={frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>
        : <>
          {statusRecordBlocked && <div role="alert" data-member-status-record-blocked className="space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_MEMBER_STATUS_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardStatusRecord}>{frontendText(locale, "ADMIN_MEMBER_STATUS_RECORD_DISCARD")}</Button></div>}
          {(actionError || pageError || readRequired) && <div role="alert" className="space-y-2 text-sm text-destructive">{(actionError || pageError) && <p>{actionError || pageError}</p>}{readRequired && <p>{frontendText(locale, "ADMIN_MEMBER_READ_REQUIRED")}</p>}{onLoadRetry && <Button type="button" variant="outline" disabled={pending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</div>}
          <DataTable
            locale={locale}
            rows={members}
            rowId={(member) => member.id}
            ariaLabel={frontendText(locale, "ADMIN_MEMBERS_TITLE")}
            loading={pending}
            pagination={pagination}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_MEMBERS_EMPTY")} description={frontendText(locale, "ADMIN_MEMBERS_DESCRIPTION")} />}
            hasMore={!!pagination && !pageError && pagination.page < pagination.totalPages}
            onLoadMore={onLoadMore}
            fill
            className="lg:min-h-0 lg:flex-1"
            rowHeight={64}
            columns={[
              { key: "email", header: frontendText(locale, "ADMIN_MEMBERS_COLUMN_EMAIL"), cellClassName: "whitespace-normal", cell: (member) => <p className="line-clamp-1 font-medium">{member.email || frontendText(locale, "ADMIN_EMAIL_UNAVAILABLE")}</p> },
              { key: "role", header: frontendText(locale, "ADMIN_MEMBERS_COLUMN_ROLE"), width: "160px", cell: (member) => <span className="text-sm text-muted-foreground">{member.role || frontendText(locale, "ADMIN_ROLE_UNAVAILABLE")}</span> },
              { key: "status", header: frontendText(locale, "ADMIN_MEMBERS_COLUMN_STATUS"), width: "160px", cell: (member) => { const disabled = member.status === "disabled"; return <Badge variant={disabled ? "destructive" : member.status === "active" ? "success" : "secondary"}>{disabled ? frontendText(locale, "ADMIN_DISABLED") : member.status === "active" ? frontendText(locale, "ADMIN_ACTIVE") : frontendText(locale, "ADMIN_MEMBER_STATUS_UNAVAILABLE")}</Badge>; } },
              { key: "actions", header: frontendText(locale, "ADMIN_MEMBERS_COLUMN_ACTIONS"), align: "right", width: "160px", cell: (member) => { const disabled = member.status === "disabled"; const itemPending = pending || pendingIds.includes(member.id); const mutable = member.role === "contributor" && (member.status === "active" || member.status === "disabled"); const actionLabel = disabled ? frontendText(locale, "ADMIN_ENABLE") : frontendText(locale, "ADMIN_DISABLE"); const target = member.email || member.id; return mutable ? <Button aria-label={`${actionLabel} ${target}`} size="sm" variant="outline" disabled={itemPending || forbidden || !onStatusChange} onClick={() => requestStatusConfirmation(member)}>{actionLabel}</Button> : null; } },
            ]}
          />
        </>}
  </section>
    <ConfirmAction open={validConfirmation}
      title={dialog?.title ?? ""}
      description={dialog?.description ?? ""}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")}
      confirmLabel={dialog?.confirmLabel ?? ""}
      destructive={dialog?.destructive ?? false} onCancel={cancelConfirmation} onConfirm={confirmAction} />
  </>;
}
