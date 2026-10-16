import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminKnowledgeItem } from "../../lib/admin-knowledge-item-data";

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

export function KnowledgeItemPage({ state, locale, onRetry, canReview, pendingAction = null, feedback = { kind: "idle" }, onTrash, onRollback, onRetryOperation, onDiscardOperation, recordBlocked = false, trashed = false }: {
  state: KnowledgeItemPageState; locale?: LocaleRuntime; onRetry?: () => void; canReview: boolean;
  pendingAction?: KnowledgeItemPendingAction; feedback?: KnowledgeItemFeedback;
  onTrash?: () => void; onRollback?: (revisionId: string) => void;
  onRetryOperation?: () => void; onDiscardOperation?: () => void;
  recordBlocked?: boolean; trashed?: boolean;
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
    : frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_ROLLBACK").replace("{revisionId}", previousRevisionId ?? "");
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
        previousRevisionId={previousRevisionId} trashed={trashed} onTrash={onTrash} onRollback={onRollback} />}
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
        <Button type="button" variant="outline" data-knowledge-retry-operation disabled={pending} onClick={onRetryOperation}>{frontendText(locale, "ADMIN_TRASH_RETRY")}</Button>
      </>}
      {feedback.kind === "conflict" && <>
        <p className="text-destructive">{frontendText(locale, "ADMIN_TRASH_OPERATION_CONFLICT")}</p>
        <Button type="button" variant="outline" data-knowledge-discard-operation disabled={pending} onClick={onDiscardOperation}>{frontendText(locale, "ADMIN_TRASH_DISCARD")}</Button>
      </>}
    </div>
    {pending && <p role="status" data-knowledge-pending className="text-sm text-muted-foreground">{phase}…</p>}
  </section>;
}

function ItemBody({ item, locale, canWrite, locked, previousRevisionId, trashed, onTrash, onRollback }: {
  item: AdminKnowledgeItem; locale?: LocaleRuntime; canWrite: boolean; locked: boolean;
  previousRevisionId: string | null; trashed: boolean; onTrash?: () => void; onRollback?: (revisionId: string) => void;
}) {
  const revision = item.currentRevision;
  const rollbackLabel = frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_ROLLBACK").replace("{revisionId}", previousRevisionId ?? "");
  const rollbackEffect = frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_ROLLBACK_EFFECT")
    .replace("{toRevisionId}", previousRevisionId ?? "").replace("{fromRevisionId}", revision.id);
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
            : <>
              <p className="font-mono text-xs">{previousRevisionId}</p>
              {canWrite && <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" data-knowledge-rollback disabled={locked} aria-label={rollbackLabel} onClick={() => onRollback?.(previousRevisionId)}>{rollbackLabel}</Button>
                <p className="text-sm text-muted-foreground" data-knowledge-rollback-effect>{rollbackEffect}</p>
              </div>}
            </>}
        </div>
        {canWrite && <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="destructive" data-knowledge-trash disabled={locked} aria-label={frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TRASH")} onClick={onTrash}>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TRASH")}</Button>
          <p className="text-sm text-muted-foreground" data-knowledge-trash-effect>{frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TRASH_EFFECT")}</p>
        </div>}
      </CardContent>
    </Card>
  </>;
}
