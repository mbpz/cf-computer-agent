import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { OverflowActions, type OverflowActionItem } from "../../components/motion/overflow-actions";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { DataTable } from "../../components/data-table";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminDuplicateCandidate, DuplicateDecision } from "../../lib/admin-duplicates-data";
import type { AdminDuplicatePageResult } from "../../lib/admin-duplicates-data";
import type { SupportedPageSize } from "../../lib/numbered-page";
import { useCreateDraft } from "../../lib/use-create-draft";

interface DuplicateQueuePageProps {
  onLoadRetry?: () => void;
  state: { kind: "loading" } | { kind: "ready"; data: AdminDuplicatePageResult } | { kind: "error" | "forbidden"; message: string };
  locale: LocaleRuntime;
  pendingId?: string | null;
  pending?: boolean;
  lockedIds?: string[];
  readRequired?: boolean;
  localError?: string;
  decisionRecordBlocked?: boolean;
  onDiscardDecisionRecord?: () => void;
  onDecision?: (id: string, decision: DuplicateDecision) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: SupportedPageSize) => void;
  onLoadMore?: () => void;
}

export function DuplicateQueuePage({ onLoadRetry, state, locale, pendingId, pending, lockedIds, readRequired, localError, decisionRecordBlocked = false, onDiscardDecisionRecord, onDecision, onPageChange, onPageSizeChange, onLoadMore }: DuplicateQueuePageProps) {
  type Confirmation = { item: AdminDuplicateCandidate; decision: DuplicateDecision; data: AdminDuplicatePageResult };
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  useCreateDraft({}, {}, () => confirmationRef.current !== null, locale, () => false);
  const cancel = () => { confirmationRef.current = null; setConfirmation(null); };
  const valid = Boolean(confirmation && state.kind === "ready" && state.data === confirmation.data
    && !pending && !pendingId && !lockedIds?.includes(confirmation.item.submissionId)
    && confirmation.item.decision === "pending" && onDecision);
  useEffect(() => { if (confirmation && !valid) cancel(); }, [confirmation, valid]);
  useEffect(() => () => { confirmationRef.current = null; }, []);
  const request = (item: AdminDuplicateCandidate, decision: DuplicateDecision) => {
    if (confirmationRef.current || state.kind !== "ready" || pending || pendingId || lockedIds?.includes(item.submissionId)
      || item.decision !== "pending" || !onDecision) return;
    const next = { item, decision, data: state.data };
    confirmationRef.current = next; setConfirmation(next);
  };
  const confirm = () => {
    if (!valid || !confirmation || confirmationRef.current !== confirmation) return;
    // Consume before invoking the callback so same-batch double clicks cannot replay it.
    cancel(); onDecision?.(confirmation.item.submissionId, confirmation.decision);
  };
  const label = (decision: DuplicateDecision) => frontendText(locale, decision === "associate" ? "ADMIN_DUPLICATE_ASSOCIATE" : decision === "keep_separate" ? "ADMIN_DUPLICATE_KEEP_SEPARATE" : "ADMIN_DUPLICATE_REJECT");
  // The page shell is constant (research §4.3): the header renders for every state and
  // only the content slot switches between loading, failure and the candidate table.
  return <>
    <section className="flex flex-col gap-5 lg:h-full lg:min-h-0" inert={valid} aria-hidden={valid || undefined}>
      <PageHeader title={frontendText(locale, "ADMIN_DUPLICATE_TITLE")} description={frontendText(locale, "ADMIN_DUPLICATE_DESCRIPTION")} />
      {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
        : state.kind !== "ready" ? <PageState kind={state.kind} title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>
        : <>
      {decisionRecordBlocked && <div role="alert" data-duplicate-decision-record-blocked className="space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_DUPLICATE_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardDecisionRecord}>{frontendText(locale, "ADMIN_DUPLICATE_RECORD_DISCARD")}</Button></div>}
      {localError && <p role="alert" className="text-sm text-destructive">{localError}</p>}
      {readRequired && <p role="status" className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_DUPLICATE_READ_REQUIRED")}</p>}
      {(localError || readRequired) && onLoadRetry && <Button type="button" variant="outline" disabled={pending || Boolean(pendingId)} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}
      <DataTable
        locale={locale}
        rows={state.data.items}
        rowId={(item) => item.submissionId}
        ariaLabel={frontendText(locale, "ADMIN_DUPLICATE_TITLE")}
        emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_DUPLICATE_EMPTY")} description={frontendText(locale, "ADMIN_DUPLICATE_DESCRIPTION")} />}
        loading={pending}
        pagination={state.data.pagination}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        hasMore={!localError && state.data.pagination.page < state.data.pagination.totalPages}
        onLoadMore={onLoadMore}
        fill
        rowHeight={104}
        columns={[
          { key: "candidate", header: frontendText(locale, "ADMIN_DUPLICATE_COLUMN_CANDIDATE"), cellClassName: "whitespace-normal", cell: (item) => <div className="py-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="line-clamp-1 font-medium">{item.submissionTitle}</h2>
              <Badge variant="warning">{frontendText(locale, "ADMIN_DUPLICATE_PENDING")}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.submissionId}</p>
          </div> },
          { key: "canonical", header: frontendText(locale, "ADMIN_DUPLICATE_CANONICAL"), width: "40%", cellClassName: "whitespace-normal", cell: (item) => <div className="space-y-1 py-1">
            <p className="line-clamp-1 text-sm"><span className="font-medium">{frontendText(locale, "ADMIN_DUPLICATE_CANONICAL")}: </span>{item.canonicalTitle}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">{item.canonicalSubmissionId} · {item.canonicalSourceId} · {item.canonicalSourceVersionId}</p>
          </div> },
          { key: "decision", header: frontendText(locale, "ADMIN_DUPLICATE_COLUMN_ACTION"), width: "320px", cellClassName: "whitespace-normal", cell: (item) => {
            const itemPending = Boolean(!onDecision || pending || pendingId || lockedIds?.includes(item.submissionId) || item.decision !== "pending");
            const target = item.submissionTitle.trim() || item.submissionId;
            // Three decisions per row: one beUI rail (overflow-actions) with the
            // destructive rejection carrying its own tone. The `aria-label`s are
            // the ones the suites address the exact target by.
            const decisions: OverflowActionItem[] = [
              { id: "associate", label: label("associate"), ariaLabel: `${label("associate")} ${target}`, disabled: itemPending, onClick: () => request(item, "associate") },
              { id: "keep_separate", label: label("keep_separate"), ariaLabel: `${label("keep_separate")} ${target}`, disabled: itemPending, onClick: () => request(item, "keep_separate") },
              { id: "reject", label: label("reject"), ariaLabel: `${label("reject")} ${target}`, tone: "destructive", disabled: itemPending, onClick: () => request(item, "reject") },
            ];
            return <OverflowActions size="sm" primaryActions={decisions}
              openLabel={frontendText(locale, "COMMON_MORE_ACTIONS")} closeLabel={frontendText(locale, "COMMON_FEWER_ACTIONS")} />;
          } },
        ]}
      />
      </>}
    </section>
    <ConfirmAction open={valid} title={frontendText(locale, "ADMIN_DUPLICATE_CONFIRM_TITLE")}
      description={confirmation ? `${label(confirmation.decision)}: ${confirmation.item.submissionTitle} (${confirmation.item.submissionId}) → ${confirmation.item.canonicalTitle} (${confirmation.item.canonicalSubmissionId}; ${confirmation.item.canonicalSourceId}; ${confirmation.item.canonicalSourceVersionId}). ${frontendText(locale, "ADMIN_DUPLICATE_DECISION_IMPACT")}` : ""}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, "ADMIN_DUPLICATE_CONFIRM_ACTION")}
      destructive={confirmation?.decision === "reject"} onCancel={cancel} onConfirm={confirm} />
  </>;
}
