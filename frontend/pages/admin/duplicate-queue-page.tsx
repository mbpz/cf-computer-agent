import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminDuplicateCandidate, DuplicateDecision } from "../../lib/admin-duplicates-data";
import type { AdminDuplicatePageResult } from "../../lib/admin-duplicates-data";
import { useCreateDraft } from "../../lib/use-create-draft";
import { DataPagination } from "../../components/data-pagination";
import type { SupportedPageSize } from "../../lib/numbered-page";

interface DuplicateQueuePageProps {
  onLoadRetry?: () => void;
  state: { kind: "loading" } | { kind: "ready"; data: AdminDuplicatePageResult } | { kind: "error" | "forbidden"; message: string };
  locale: LocaleRuntime;
  pendingId?: string | null;
  pending?: boolean;
  lockedIds?: string[];
  readRequired?: boolean;
  localError?: string;
  onDecision?: (id: string, decision: DuplicateDecision) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: SupportedPageSize) => void;
}

export function DuplicateQueuePage({ onLoadRetry, state, locale, pendingId, pending, lockedIds, readRequired, localError, onDecision, onPageChange, onPageSizeChange }: DuplicateQueuePageProps) {
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
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind !== "ready") return <PageState kind={state.kind} title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")} >{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>;
  return <>
    <section className="space-y-5" inert={valid} aria-hidden={valid || undefined}>
      <div>
        <h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_DUPLICATE_TITLE")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_DUPLICATE_DESCRIPTION")}</p>
      </div>
      {localError && <p role="alert" className="text-sm text-destructive">{localError}</p>}
      {readRequired && <p role="status" className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_DUPLICATE_READ_REQUIRED")}</p>}
      {(localError || readRequired) && onLoadRetry && <Button type="button" variant="outline" disabled={pending || Boolean(pendingId)} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}
      {state.data.items.length ? state.data.items.map((item: AdminDuplicateCandidate) => {
        const itemPending = Boolean(!onDecision || pending || pendingId || lockedIds?.includes(item.submissionId) || item.decision !== "pending");
        const target = item.submissionTitle.trim() || item.submissionId;
        return <Card key={item.submissionId}>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-medium">{item.submissionTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_DUPLICATE_CANONICAL")}: {item.canonicalTitle}</p>
              </div>
              <Badge variant="warning">{frontendText(locale, "ADMIN_DUPLICATE_PENDING")}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button aria-label={`${label("associate")} ${target}`} size="sm" disabled={itemPending} onClick={() => request(item, "associate")}>{label("associate")}</Button>
              <Button aria-label={`${label("keep_separate")} ${target}`} size="sm" variant="outline" disabled={itemPending} onClick={() => request(item, "keep_separate")}>{label("keep_separate")}</Button>
              <Button aria-label={`${label("reject")} ${target}`} size="sm" variant="destructive" disabled={itemPending} onClick={() => request(item, "reject")}>{label("reject")}</Button>
            </div>
          </CardContent>
        </Card>;
      }) : <PageState kind="empty" title={frontendText(locale, "ADMIN_DUPLICATE_EMPTY")} description={frontendText(locale, "ADMIN_DUPLICATE_DESCRIPTION")} />}
      <DataPagination {...state.data.pagination} locale={locale} pending={pending} onPageChange={(page) => onPageChange?.(page)} onPageSizeChange={(size) => onPageSizeChange?.(size)} />
    </section>
    <ConfirmAction open={valid} title={frontendText(locale, "ADMIN_DUPLICATE_CONFIRM_TITLE")}
      description={confirmation ? `${label(confirmation.decision)}: ${confirmation.item.submissionTitle} (${confirmation.item.submissionId}) → ${confirmation.item.canonicalTitle} (${confirmation.item.canonicalSubmissionId}; ${confirmation.item.canonicalSourceId}; ${confirmation.item.canonicalSourceVersionId}). ${frontendText(locale, "ADMIN_DUPLICATE_DECISION_IMPACT")}` : ""}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, "ADMIN_DUPLICATE_CONFIRM_ACTION")}
      destructive={confirmation?.decision === "reject"} onCancel={cancel} onConfirm={confirm} />
  </>;
}
