import { useEffect, useId, useRef, useState } from "react";
import { useCreateDraft } from "../../lib/use-create-draft";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { DataTable } from "../../components/data-table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { FilterSelect } from "../../components/ui/filter-select";
import { AppliedFilters } from "../../components/ui/applied-filters";
import { Card, CardContent } from "../../components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/motion/input";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminMemberInvitation, AdminMemberInvitationStatus } from "../../lib/admin-member-invitations-data";
import type { FrontendPageMetadata, SupportedPageSize } from "../../lib/numbered-page";

const invitationStatusKeys: Record<AdminMemberInvitationStatus, string> = {
  pending: "ADMIN_INVITATION_STATUS_PENDING",
  redeemed: "ADMIN_INVITATION_STATUS_REDEEMED",
  revoked: "ADMIN_INVITATION_STATUS_REVOKED",
};

function withPlaceholder(text: string, placeholder: string, value: string): string {
  return text.replace(`{${placeholder}}`, value);
}

export function MembersPage({ onLoadRetry, members, pagination, status = "", pendingIds = [], loading = false, forbidden = false, readRequired = false, pending = false, error, pageError, actionError, statusRecordBlocked = false, onDiscardStatusRecord, onStatusFilterChange, onPageChange, onPageSizeChange, onLoadMore, onStatusChange, invitations = [], invitationsPending = false, invitationWritePending = false, invitationError, invitationsError, issuedInvitation, onIssueInvitation, onRevokeInvitation, onLoadInvitationsRetry, locale }: { onLoadRetry?: () => void; members: readonly { id: string; email?: string; role?: string; status?: string }[]; pagination?: FrontendPageMetadata; status?: "" | "active" | "disabled"; pendingIds?: readonly string[]; loading?: boolean; forbidden?: boolean; readRequired?: boolean; pending?: boolean; error?: string; pageError?: string; actionError?: string; statusRecordBlocked?: boolean; onDiscardStatusRecord?: () => void; onStatusFilterChange?: (status: "" | "active" | "disabled") => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void; onLoadMore?: () => void; onStatusChange?: (id: string, status: "active" | "disabled") => void; invitations?: readonly AdminMemberInvitation[]; invitationsPending?: boolean; invitationWritePending?: boolean; invitationError?: string; invitationsError?: string; issuedInvitation?: { email: string; code: string; expiresAt: string } | null; onIssueInvitation?: (email: string) => void; onRevokeInvitation?: (id: string) => void; onLoadInvitationsRetry?: () => void; locale: LocaleRuntime }) {
  type StatusConfirmation = {
    kind: "status"; id: string; email?: string; previousStatus: string; nextStatus: "active" | "disabled";
    list: typeof members; filter: typeof status; page?: number; pageSize?: number;
  };
  type InviteConfirmation = { kind: "invite"; email: string };
  type RevokeConfirmation = { kind: "revoke"; id: string; email: string };
  type Confirmation = StatusConfirmation | InviteConfirmation | RevokeConfirmation;
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addTitleId = useId();
  const addDescriptionId = useId();
  // The action confirmation must be explicitly resolved, never discarded by navigation.
  useCreateDraft({}, {}, () => confirmationRef.current !== null, locale, () => false);
  useEffect(() => () => { confirmationRef.current = null; }, []);
  useEffect(() => {
    setCopied(false); setCopyFailed(false);
    // A freshly issued code clears the input only when it matches what was typed
    // and dismisses the add dialog: the one-time code now lives in the list view.
    if (issuedInvitation) {
      setEmail((current) => current.trim() === issuedInvitation.email ? "" : current);
      setAddOpen(false);
    }
  }, [issuedInvitation]);
  const validConfirmation = (() => {
    if (!confirmation) return false;
    if (confirmation.kind === "invite") return !!(onIssueInvitation && !invitationWritePending && !pending && !loading && !error && !forbidden && confirmation.email.length > 0);
    if (confirmation.kind === "revoke") {
      const invitation = invitations.find((item) => item.id === confirmation.id);
      return !!(invitation && invitation.status === "pending" && invitation.email === confirmation.email && onRevokeInvitation && !invitationWritePending && !pending && !loading && !error && !forbidden);
    }
    const member = members.find((item) => item.id === confirmation.id);
    return !!(member && confirmation.list === members
      && confirmation.filter === status && confirmation.page === pagination?.page && confirmation.pageSize === pagination?.pageSize
      && member.email === confirmation.email && member.role === "contributor" && member.status === confirmation.previousStatus
      && !loading && !error && !forbidden && !pending && !pendingIds.includes(confirmation.id) && onStatusChange);
  })();
  const cancelConfirmation = () => { confirmationRef.current = null; setConfirmation(null); };
  useEffect(() => { if (confirmation && !validConfirmation) cancelConfirmation(); }, [confirmation, validConfirmation]);
  const requestStatusConfirmation = (member: typeof members[number]) => {
    if (confirmationRef.current || loading || error || forbidden || pending || pendingIds.includes(member.id) || !onStatusChange
      || member.role !== "contributor" || (member.status !== "active" && member.status !== "disabled")) return;
    const next: StatusConfirmation = { kind: "status", id: member.id, email: member.email, previousStatus: member.status,
      nextStatus: member.status === "active" ? "disabled" : "active", list: members, filter: status, page: pagination?.page, pageSize: pagination?.pageSize };
    confirmationRef.current = next; setConfirmation(next);
  };
  const requestInviteConfirmation = () => {
    const target = email.trim();
    if (confirmationRef.current || !target || invitationWritePending || pending || loading || error || forbidden || !onIssueInvitation) return;
    const next: InviteConfirmation = { kind: "invite", email: target };
    confirmationRef.current = next; setConfirmation(next);
  };
  const requestRevokeConfirmation = (invitation: AdminMemberInvitation) => {
    if (confirmationRef.current || invitation.status !== "pending" || invitationWritePending || pending || loading || error || forbidden || !onRevokeInvitation) return;
    const next: RevokeConfirmation = { kind: "revoke", id: invitation.id, email: invitation.email };
    confirmationRef.current = next; setConfirmation(next);
  };
  const confirmAction = () => {
    if (!validConfirmation || !confirmation || confirmationRef.current !== confirmation) return;
    const action = confirmation;
    // Consume before invoking the write: same-batch double confirmation cannot replay it.
    cancelConfirmation();
    if (action.kind === "status") onStatusChange?.(action.id, action.nextStatus);
    else if (action.kind === "invite") onIssueInvitation?.(action.email);
    else onRevokeInvitation?.(action.id);
  };
  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setCopyFailed(false); }
    catch { setCopied(false); setCopyFailed(true); }
  };
  const dialog = (() => {
    if (!confirmation) return null;
    if (confirmation.kind === "invite") return {
      title: frontendText(locale, "ADMIN_INVITATION_GENERATE_CONFIRM_TITLE"),
      description: withPlaceholder(frontendText(locale, "ADMIN_INVITATION_GENERATE_CONFIRM_DESCRIPTION"), "email", confirmation.email),
      confirmLabel: frontendText(locale, "ADMIN_INVITATION_CONFIRM_GENERATE"), destructive: false,
    };
    if (confirmation.kind === "revoke") return {
      title: frontendText(locale, "ADMIN_INVITATION_REVOKE_CONFIRM_TITLE"),
      description: withPlaceholder(frontendText(locale, "ADMIN_INVITATION_REVOKE_CONFIRM_DESCRIPTION"), "email", confirmation.email),
      confirmLabel: frontendText(locale, "ADMIN_INVITATION_CONFIRM_REVOKE"), destructive: true,
    };
    return {
      title: frontendText(locale, confirmation.nextStatus === "disabled" ? "ADMIN_MEMBER_DISABLE_CONFIRM_TITLE" : "ADMIN_MEMBER_ENABLE_CONFIRM_TITLE"),
      description: `${confirmation.email || confirmation.id} — ${frontendText(locale, confirmation.nextStatus === "disabled" ? "ADMIN_MEMBER_DISABLE_IMPACT" : "ADMIN_MEMBER_ENABLE_IMPACT")}`,
      confirmLabel: frontendText(locale, confirmation.nextStatus === "disabled" ? "ADMIN_MEMBER_CONFIRM_DISABLE" : "ADMIN_MEMBER_CONFIRM_ENABLE"), destructive: confirmation.nextStatus === "disabled",
    };
  })();
  // The page shell is constant (research §4.3): the header and the shared status filter
  // render for every state; loading and read failure only replace the member table.
  return <><section className="flex flex-col gap-5 lg:h-full lg:min-h-0" inert={validConfirmation || addOpen} aria-hidden={validConfirmation || addOpen || undefined}>
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
    <section data-admin-invitations aria-busy={(invitationWritePending || invitationsPending) || undefined} className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{frontendText(locale, "ADMIN_INVITATION_SECTION_TITLE")}</h2><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_INVITATION_SECTION_DESCRIPTION")}</p></div><Button type="button" data-member-add-open aria-haspopup="dialog" aria-expanded={addOpen} disabled={pending || invitationWritePending || forbidden || !onIssueInvitation} onClick={() => setAddOpen(true)}>{frontendText(locale, "ADMIN_INVITATION_ADD")}</Button></div>
      {invitationError && <p role="alert" className="text-sm text-destructive">{invitationError}</p>}
      {issuedInvitation && <Card data-invitation-code className="border-primary/40"><CardContent className="space-y-2 p-4">
        <p className="text-sm font-medium">{withPlaceholder(frontendText(locale, "ADMIN_INVITATION_CODE_TITLE"), "email", issuedInvitation.email)}</p>
        <div className="flex flex-wrap items-center gap-3"><code className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">{issuedInvitation.code}</code><Button type="button" size="sm" variant="outline" onClick={() => void copyCode(issuedInvitation.code)}>{frontendText(locale, copied ? "ADMIN_INVITATION_CODE_COPIED" : "ADMIN_INVITATION_CODE_COPY")}</Button></div>
        {copyFailed && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "ADMIN_INVITATION_CODE_COPY_FAILED")}</p>}
        <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_INVITATION_CODE_ONCE_NOTE")}</p>
        <p className="text-xs text-muted-foreground">{withPlaceholder(frontendText(locale, "ADMIN_INVITATION_CODE_EXPIRES"), "expiresAt", issuedInvitation.expiresAt)}</p>
      </CardContent></Card>}
      {invitationsError
        ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{invitationsError}</p>{onLoadInvitationsRetry && <Button type="button" variant="outline" disabled={invitationWritePending} onClick={onLoadInvitationsRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</div>
        : <div className="space-y-2"><h3 className="text-sm font-medium">{frontendText(locale, "ADMIN_INVITATION_LIST_TITLE")}</h3>
          {invitations.length ? invitations.map((invitation) => <Card key={invitation.id}><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{invitation.email}</p><p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, invitationStatusKeys[invitation.status])} · {withPlaceholder(frontendText(locale, "ADMIN_INVITATION_CODE_EXPIRES"), "expiresAt", invitation.expiresAt)}</p></div>{invitation.status === "pending" && <Button size="sm" variant="outline" disabled={invitationWritePending || pending || forbidden || !onRevokeInvitation} onClick={() => requestRevokeConfirmation(invitation)}>{frontendText(locale, "ADMIN_INVITATION_REVOKE")}</Button>}</CardContent></Card>)
            : <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_INVITATION_LIST_EMPTY")}</p>}
        </div>}
    </section>
      </>}
  </section>
    <Dialog open={addOpen} onOpenChange={(next) => { if (!next) setAddOpen(false); }}>
      <DialogContent role="dialog" data-member-add-dialog aria-labelledby={addTitleId} aria-describedby={addDescriptionId} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
        <DialogTitle id={addTitleId}>{frontendText(locale, "ADMIN_INVITATION_SECTION_TITLE")}</DialogTitle>
        <p id={addDescriptionId} className="mt-2 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_INVITATION_SECTION_DESCRIPTION")}</p>
        <div className="mt-4">
          <Input id="invitation-email" type="email" autoComplete="off" label={frontendText(locale, "ADMIN_INVITATION_EMAIL_LABEL")} value={email} disabled={pending || invitationWritePending || forbidden || !onIssueInvitation} placeholder={frontendText(locale, "ADMIN_INVITATION_EMAIL_PLACEHOLDER")} onChange={(value) => setEmail(value)} />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" data-member-add-cancel variant="outline" onClick={() => setAddOpen(false)}>{frontendText(locale, "COMMON_CANCEL")}</Button>
          <Button type="button" disabled={!email.trim() || pending || invitationWritePending || forbidden || !onIssueInvitation} onClick={requestInviteConfirmation}>{frontendText(locale, "ADMIN_INVITATION_GENERATE")}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmAction open={validConfirmation}
      title={dialog?.title ?? ""}
      description={dialog?.description ?? ""}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")}
      confirmLabel={dialog?.confirmLabel ?? ""}
      destructive={dialog?.destructive ?? false} onCancel={cancelConfirmation} onConfirm={confirmAction} />
  </>;
}
