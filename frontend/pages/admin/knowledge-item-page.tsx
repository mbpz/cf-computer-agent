import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SharedLayoutBg } from "../../components/motion/shared-layout-bg";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminKnowledgeItem, KnowledgeRevisionSummary } from "../../lib/admin-knowledge-item-data";

export type KnowledgeItemPageState =
  | { kind: "loading" }
  | { kind: "ready"; item: AdminKnowledgeItem }
  | { kind: "error" | "forbidden" | "not-found"; message: string };

/** The write the page is waiting on; one at a time. */
export type KnowledgeItemPendingAction = "trash" | "rollback" | null;

export type KnowledgeItemFeedback =
  | { kind: "idle" }
  | { kind: "trashed" }
  | { kind: "rolled-back"; revisionId: string; previousRevisionId: string }
  | { kind: "refused"; message: string }
  | { kind: "unknown"; message: string }
  | { kind: "conflict"; message: string };

export function KnowledgeItemPage({ state, locale, onRetry, canReview, pendingAction = null, feedback = { kind: "idle" }, onTrash, onRetryOperation, onResolveOperation, onDiscardOperation, recordBlocked = false, trashed = false, revisions = [], confirmTarget = null, onSelectRollback, onConfirmRollback, onCancelRollback, resolutionMissed = false, hasMoreRevisions = false, historyPending = false, onLoadMoreRevisions }: {
  state: KnowledgeItemPageState; locale?: LocaleRuntime; onRetry?: () => void; canReview: boolean;
  pendingAction?: KnowledgeItemPendingAction; feedback?: KnowledgeItemFeedback;
  onTrash?: () => void;
  onRetryOperation?: () => void; onResolveOperation?: () => void; onDiscardOperation?: () => void;
  recordBlocked?: boolean; trashed?: boolean;
  revisions?: readonly KnowledgeRevisionSummary[]; confirmTarget?: string | null;
  onSelectRollback?: (revisionId: string) => void; onConfirmRollback?: () => void; onCancelRollback?: () => void;
  resolutionMissed?: boolean;
  hasMoreRevisions?: boolean; historyPending?: boolean; onLoadMoreRevisions?: () => void;
}) {
  const pending = pendingAction !== null;
  const item = state.kind === "ready" ? state.item : null;
  const previousRevisionId = item ? item.currentRevision.previousRevisionId : null;
  // A trashed item is handled from the recycle bin, so it offers no write at all;
  // a pending write only locks the affordances until its outcome is known.
  const canWrite = canReview && !trashed;
  const retry = <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>;
  const phase = pendingAction === "trash"
    ? frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TRASH")
    : frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_ROLLBACK").replace("{revisionId}", confirmTarget ?? previousRevisionId ?? "");
  // The page shell is constant: the titled header renders for every state and only
  // the content slot switches between loading, failure and the item.
  return <section className="flex flex-col gap-5" data-admin-knowledge-item aria-busy={state.kind === "loading" || pending || undefined}>
    <PageHeader title={frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TITLE")} description={frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_DESCRIPTION")} />
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind !== "ready" ? <PageState
        kind={state.kind === "not-found" ? "error" : state.kind}
        title={state.message || (state.kind === "not-found" ? frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_NOT_FOUND") : frontendText(locale, "COMMON_UNABLE_TO_LOAD"))}>
        {state.kind === "error" ? retry : null}
      </PageState>
      : <ItemBody item={state.item} locale={locale} canWrite={canWrite} locked={pending}
        previousRevisionId={previousRevisionId} trashed={trashed} onTrash={onTrash}
        revisions={revisions} confirmTarget={confirmTarget}
        hasMoreRevisions={hasMoreRevisions} historyPending={historyPending} onLoadMoreRevisions={onLoadMoreRevisions}
        onSelectRollback={onSelectRollback} onConfirmRollback={onConfirmRollback} onCancelRollback={onCancelRollback} />}
    {recordBlocked && <div role="alert" data-knowledge-record-blocked className="space-y-2 text-sm text-destructive">
      <p>{frontendText(locale, "ADMIN_TRASH_RECORD_BLOCKED")}</p>
      <Button type="button" variant="outline" data-knowledge-discard-operation onClick={onDiscardOperation}>{frontendText(locale, "ADMIN_TRASH_DISCARD")}</Button>
    </div>}
    <div role="status" aria-live="polite" data-knowledge-feedback={feedback.kind} className="space-y-2 text-sm">
      {feedback.kind === "rolled-back" && <p>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_ROLLED_BACK").replace("{id}", feedback.revisionId).replace("{previousRevisionId}", feedback.previousRevisionId)}</p>}
      {feedback.kind === "trashed" && <p>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TRASHED")}</p>}
      {feedback.kind === "refused" && <p role="alert" className="text-destructive">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_WRITE_REFUSED")}{feedback.message ? ` (${feedback.message})` : ""}</p>}
      {feedback.kind === "unknown" && <>
        <p className="text-destructive">{frontendText(locale, "ADMIN_TRASH_OPERATION_UNKNOWN")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" data-knowledge-resolve-operation disabled={pending} onClick={onResolveOperation}>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_RESOLVE")}</Button>
          <Button type="button" variant="outline" data-knowledge-retry-operation disabled={pending} onClick={onRetryOperation}>{frontendText(locale, "ADMIN_TRASH_RETRY")}</Button>
        </div>
        {resolutionMissed && <p data-knowledge-resolution-missed className="text-muted-foreground">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_NOT_RECORDED")}</p>}
      </>}
      {feedback.kind === "conflict" && <>
        <p className="text-destructive">{frontendText(locale, "ADMIN_TRASH_OPERATION_CONFLICT")}</p>
        <Button type="button" variant="outline" data-knowledge-discard-operation disabled={pending} onClick={onDiscardOperation}>{frontendText(locale, "ADMIN_TRASH_DISCARD")}</Button>
      </>}
    </div>
    {pending && <div data-knowledge-pending className="space-y-2">
      <PageState kind="loading" title={`${phase}…`} />
      <p className="text-sm text-muted-foreground">{phase}…</p>
    </div>}
  </section>;
}

function ItemBody({ item, locale, canWrite, locked, previousRevisionId, trashed, onTrash, revisions, confirmTarget, hasMoreRevisions, historyPending, onLoadMoreRevisions, onSelectRollback, onConfirmRollback, onCancelRollback }: {
  item: AdminKnowledgeItem; locale?: LocaleRuntime; canWrite: boolean; locked: boolean;
  previousRevisionId: string | null; trashed: boolean; onTrash?: () => void;
  revisions: readonly KnowledgeRevisionSummary[]; confirmTarget: string | null;
  hasMoreRevisions: boolean; historyPending: boolean; onLoadMoreRevisions?: () => void;
  onSelectRollback?: (revisionId: string) => void; onConfirmRollback?: () => void; onCancelRollback?: () => void;
}) {
  const revision = item.currentRevision;
  const rollbackEffect = frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_ROLLBACK_EFFECT")
    .replace("{toRevisionId}", confirmTarget ?? "").replace("{fromRevisionId}", revision.id);
  return <>
    <Card data-knowledge-identity>
      <CardHeader><CardTitle>{item.title}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p data-knowledge-item-id className="font-mono text-xs text-muted-foreground">{item.id}</p>
        <p data-knowledge-item-space className="font-mono text-xs text-muted-foreground">{item.spaceId}</p>
        <p className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" data-knowledge-visibility>{item.visibility}</Badge>
          <span data-knowledge-item-status>{trashed ? "trashed" : "active"}</span>
        </p>
        <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_SCOPE")}</p>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="space-y-4 pt-6 text-sm">
        <div data-knowledge-current-revision className="space-y-1">
          <p className="font-medium">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_CURRENT")}</p>
          <p className="font-mono text-xs">{revision.id}</p>
          <p className="text-xs text-muted-foreground" data-knowledge-current-published-at>{revision.publishedAt}</p>
        </div>
        <div data-knowledge-previous-revision className="space-y-2">
          <p className="font-medium">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_PREVIOUS")}</p>
          {previousRevisionId === null
            ? <p className="text-muted-foreground">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_NO_PREVIOUS")}</p>
            : <p className="font-mono text-xs">{previousRevisionId}</p>}
        </div>
        <div data-knowledge-revision-history className="space-y-2">
          <p className="font-medium">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_HISTORY")}</p>
          <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_HISTORY_HINT")}</p>
          {revisions.length === 0
            ? <p className="text-muted-foreground">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_HISTORY_EMPTY")}</p>
            : <SharedLayoutBg as="ul" className="space-y-2" inset={8}>
              {revisions.map((entry) => <li key={entry.id} data-knowledge-history-row={entry.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{entry.id}</span>
                  <span className="text-xs text-muted-foreground">{entry.publishedAt}</span>
                  {entry.isCurrent
                    ? <Badge variant="outline">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_HISTORY_CURRENT")}</Badge>
                    : canWrite && <Button type="button" variant="outline" size="sm" disabled={locked}
                      data-knowledge-rollback-target={entry.id}
                      aria-label={frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_ROLLBACK").replace("{revisionId}", entry.id)}
                      onClick={() => onSelectRollback?.(entry.id)}>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_SELECT")}</Button>}
                </div>
              </li>)}
            </SharedLayoutBg>}
          {hasMoreRevisions && <Button type="button" variant="outline" size="sm" data-knowledge-history-more
            disabled={locked || historyPending} onClick={onLoadMoreRevisions}>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_HISTORY_MORE")}</Button>}
        </div>
        {confirmTarget !== null && canWrite && <div data-knowledge-rollback-confirm className="space-y-2 rounded-md border p-3">
          <p className="font-medium">{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_CONFIRM_TITLE").replace("{revisionId}", confirmTarget)}</p>
          <p className="text-sm text-muted-foreground" data-knowledge-rollback-effect>{rollbackEffect}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" data-knowledge-confirm-rollback disabled={locked} onClick={onConfirmRollback}>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_CONFIRM")}</Button>
            <Button type="button" variant="outline" data-knowledge-cancel-rollback disabled={locked} onClick={onCancelRollback}>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_CANCEL")}</Button>
          </div>
        </div>}
        {canWrite && <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="destructive" data-knowledge-trash disabled={locked} aria-label={frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TRASH")} onClick={onTrash}>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TRASH")}</Button>
          <p className="text-sm text-muted-foreground" data-knowledge-trash-effect>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TRASH_EFFECT")}</p>
        </div>}
      </CardContent>
    </Card>
  </>;
}
