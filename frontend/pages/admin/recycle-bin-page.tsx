import { Alert, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { DataTable } from "../../components/data-table";
import { HoldActionButton } from "../../components/motion/hold-action-button";
import { Input } from "../../components/ui/input";
import { PageHeader } from "../../components/ui/page-header";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { TrashedKnowledgeItem } from "../../lib/admin-knowledge-trash-data";

export type RecycleBinState =
  | { kind: "loading" }
  | { kind: "ready"; items: TrashedKnowledgeItem[]; nextCursor?: string }
  | { kind: "error"; message: string }
  | { kind: "forbidden"; message: string };

/**
 * The real, server-reported outcome of one recycle-bin write. The unknown member
 * is a lost response, not a failure: the recorded operation can be retried by its
 * own number, so it is the only one that offers a retry.
 */
export type TrashFeedback =
  | { kind: "restored"; knowledgeItemId: string; visibility: string }
  | { kind: "purged"; count: number }
  | { kind: "purge-nothing" }
  | { kind: "purge-refused" }
  | { kind: "write-refused" }
  | { kind: "conflict" }
  | { kind: "unknown" };

export interface RecycleBinPageProps {
  state: RecycleBinState;
  locale: LocaleRuntime;
  onRetry?: () => void;
  onLoadMore?: () => void;
  busyId?: string | null;
  busyAction?: "restore" | "purge" | null;
  pending?: boolean;
  /** Writes stay unavailable until an earlier operation with an unknown outcome is resolved. */
  locked?: boolean;
  feedback?: TrashFeedback;
  recordNotice?: string;
  recordBlocked?: boolean;
  onDiscardOperation?: () => void;
  onRetryOperation?: () => void;
  onRestore?: (knowledgeItemId: string) => void;
  onPurge?: (knowledgeItemId: string) => void;
  /** Opens the item's own administration page (the SPA route, not a new tab). */
  onOpenItem?: (knowledgeItemId: string) => void;
  purgeConfirm?: Record<string, string>;
  onPurgeConfirmChange?: (knowledgeItemId: string, value: string) => void;
}

const DAY_MS = 86_400_000;

function formatText(locale: LocaleRuntime, key: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), frontendText(locale, key));
}

function feedbackText(locale: LocaleRuntime, feedback: TrashFeedback): string {
  if (feedback.kind === "restored") return formatText(locale, "ADMIN_TRASH_RESTORED", { visibility: feedback.visibility });
  if (feedback.kind === "purged") return formatText(locale, "ADMIN_TRASH_PURGED", { count: String(feedback.count) });
  if (feedback.kind === "purge-nothing") return frontendText(locale, "ADMIN_TRASH_PURGE_NOTHING");
  if (feedback.kind === "purge-refused") return frontendText(locale, "ADMIN_TRASH_PURGE_REFUSED");
  if (feedback.kind === "write-refused") return frontendText(locale, "ADMIN_TRASH_WRITE_REFUSED");
  if (feedback.kind === "conflict") return frontendText(locale, "ADMIN_TRASH_OPERATION_CONFLICT");
  return frontendText(locale, "ADMIN_TRASH_OPERATION_UNKNOWN");
}

function feedbackVariant(feedback: TrashFeedback) {
  if (feedback.kind === "restored" || feedback.kind === "purged") return "success" as const;
  if (feedback.kind === "purge-nothing") return "info" as const;
  if (feedback.kind === "unknown") return "warning" as const;
  return "destructive" as const;
}

/**
 * The administrator recycle bin. It renders only what the server's page and the
 * server's retention facts state: no total is invented, a purge is reachable only
 * after the human types the item's own identifier, and a lost outcome offers a
 * retry of the same operation rather than a fresh request.
 */
export function RecycleBinPage({
  state, locale, onRetry, onLoadMore, busyId = null, busyAction = null, pending = false, locked = false, feedback,
  recordNotice, recordBlocked = false, onDiscardOperation, onRetryOperation,
  onRestore, onPurge, onOpenItem, purgeConfirm = {}, onPurgeConfirmChange,
}: RecycleBinPageProps) {
  const writesLocked = pending || locked;
  const now = Date.now();
  const retry = <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>;
  // The page shell is constant (research §4.3): the header stays mounted through
  // loading, failure, forbidden and ready states; only the content slot switches.
  return <section data-admin-recycle-bin className="space-y-5" aria-busy={state.kind === "loading" || undefined}>
    <PageHeader title={frontendText(locale, "ADMIN_TRASH_TITLE")} description={frontendText(locale, "ADMIN_TRASH_DESCRIPTION")} />
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind === "forbidden" ? <PageState kind="forbidden" title={state.message || frontendText(locale, "ADMIN_REVIEW_FORBIDDEN")} />
      : state.kind === "error" ? <PageState kind="error" title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{retry}</PageState>
      : <>
    <p className="text-sm text-muted-foreground" data-trash-scope>{frontendText(locale, "ADMIN_TRASH_SCOPE")}</p>
    {recordBlocked && <div role="alert" data-trash-record-blocked className="space-y-2 text-sm text-destructive">
      <p>{frontendText(locale, "ADMIN_TRASH_RECORD_BLOCKED")}</p>
      <Button type="button" variant="outline" size="sm" data-trash-discard-operation onClick={onDiscardOperation}>{frontendText(locale, "ADMIN_TRASH_DISCARD")}</Button>
    </div>}
    {recordNotice && <p role="alert" className="text-sm text-destructive">{recordNotice}</p>}
    <div role="status" aria-live="polite" data-trash-feedback className="space-y-2 text-sm">
      {feedback && <Alert variant={feedbackVariant(feedback)} role="status">
        <AlertTitle>{feedbackText(locale, feedback)}</AlertTitle>
        {feedback.kind === "unknown" && <Button type="button" variant="outline" size="sm" className="mt-3" data-trash-retry-operation onClick={onRetryOperation}>{frontendText(locale, "ADMIN_TRASH_RETRY")}</Button>}
        {/* Restoring is what makes an item administrative again, so the useful way
            into its page is offered from this success, not from a trashed row. */}
        {feedback.kind === "restored" && <a href={`/admin/knowledge/${encodeURIComponent(feedback.knowledgeItemId)}`} data-trash-open-restored={feedback.knowledgeItemId}
          aria-label={formatText(locale, "ADMIN_TRASH_OPEN_RESTORED", { id: feedback.knowledgeItemId })}
          onClick={(event) => {
            if (!onOpenItem || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onOpenItem(feedback.knowledgeItemId);
          }}
          className="mt-3 inline-block underline hover:text-foreground">{formatText(locale, "ADMIN_TRASH_OPEN_RESTORED", { id: feedback.knowledgeItemId })}</a>}
      </Alert>}
    </div>
    <DataTable
      locale={locale}
      rows={state.items}
      rowId={(item) => item.id}
      ariaLabel={frontendText(locale, "ADMIN_TRASH_TITLE")}
      loading={pending}
      emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_TRASH_EMPTY")} description={frontendText(locale, "ADMIN_TRASH_SCOPE")} />}
      columns={[
        { key: "item", header: frontendText(locale, "ADMIN_TRASH_COLUMN_ITEM"), cellClassName: "whitespace-normal", cell: (item) => <div className="py-1">
          <p className="font-medium">{item.title.trim() || frontendText(locale, "ADMIN_REVIEW_UNTITLED")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.id} · {item.spaceId}</p>
          {/* A real href so the item's administration page is reachable (and
              copyable) without JavaScript; the SPA intercepts a plain click. */}
          <a href={`/admin/knowledge/${encodeURIComponent(item.id)}`} data-trash-open-item={item.id}
            aria-label={`${frontendText(locale, "ADMIN_TRASH_OPEN_ITEM")}: ${item.title.trim() || item.id}`}
            title={frontendText(locale, "ADMIN_TRASH_OPEN_ITEM_HINT")}
            onClick={(event) => {
              if (!onOpenItem || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onOpenItem(item.id);
            }}
            className="mt-1 inline-block text-xs underline hover:text-foreground">{frontendText(locale, "ADMIN_TRASH_OPEN_ITEM")}</a>
        </div> },
        { key: "retention", header: frontendText(locale, "ADMIN_TRASH_COLUMN_RETENTION"), cellClassName: "whitespace-normal", cell: (item) => <div data-trash-retention={item.id} data-trash-purge-eligible-at={item.retention.purgeEligibleAt} className="space-y-1 text-xs text-muted-foreground">
          <p>{formatText(locale, "ADMIN_TRASH_RETENTION_TRASHED_AT", { trashedAt: item.retention.trashedAt })}</p>
          {item.retention.purgeable
            ? <p>{formatText(locale, "ADMIN_TRASH_RETENTION_ELIGIBLE", { deadline: item.retention.purgeEligibleAt })}</p>
            : <p>{formatText(locale, "ADMIN_TRASH_RETENTION_WAIT", { days: String(Math.max(0, Math.ceil((Date.parse(item.retention.purgeEligibleAt) - now) / DAY_MS))), deadline: item.retention.purgeEligibleAt })}</p>}
        </div> },
        { key: "actions", header: frontendText(locale, "ADMIN_TRASH_COLUMN_ACTIONS"), width: "360px", cellClassName: "whitespace-normal", cell: (item) => {
          const typed = purgeConfirm[item.id] ?? "";
          const mismatch = typed.length > 0 && typed !== item.id;
          const busy = pending && busyId === item.id;
          const restoring = busy && busyAction === "restore";
          const canPurge = item.retention.purgeable && typed === item.id && !writesLocked;
          const confirmLabel = formatText(locale, "ADMIN_TRASH_PURGE_CONFIRM_LABEL", { id: item.id });
          return <div className="space-y-2 py-1" data-trash-pending={busy ? busyAction ?? undefined : undefined}>
            <Button type="button" variant="outline" size="sm" data-trash-restore={item.id} disabled={writesLocked} onClick={() => onRestore?.(item.id)}>
              {restoring ? frontendText(locale, "ADMIN_TRASH_RESTORING") : frontendText(locale, "ADMIN_TRASH_RESTORE")}
            </Button>
            <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_TRASH_PURGE_IRREVERSIBLE")}</p>
            {item.retention.purgeable ? <>
              <label className="block text-xs" htmlFor={`trash-purge-${item.id}`}>{confirmLabel}</label>
              <Input id={`trash-purge-${item.id}`} data-trash-purge-confirm={item.id} aria-label={confirmLabel} value={typed} disabled={writesLocked}
                onChange={(event) => onPurgeConfirmChange?.(item.id, event.target.value)} />
              {mismatch && <p role="alert" className="text-xs text-destructive">{frontendText(locale, "ADMIN_TRASH_PURGE_CONFIRM_MISMATCH")}</p>}
              <HoldActionButton type="horizontal" data-trash-purge={item.id} disabled={!canPurge}
                onActivate={() => { if (canPurge) onPurge?.(item.id); }}
                fillClassName="bg-destructive/30" labelClassName="text-xs"
                className="[height:2.25rem] [min-width:0] rounded-lg px-3 [background-color:var(--destructive)] text-white">
                {frontendText(locale, "ADMIN_TRASH_PURGE")}
              </HoldActionButton>
            </> : <>
              <p data-trash-retention-blocked={item.id} className="text-xs text-destructive">{frontendText(locale, "ADMIN_TRASH_RETENTION_BLOCKED")}</p>
              <HoldActionButton type="horizontal" data-trash-purge={item.id} disabled
                fillClassName="bg-destructive/30" labelClassName="text-xs"
                className="[height:2.25rem] [min-width:0] rounded-lg px-3 [background-color:var(--destructive)] text-white">
                {frontendText(locale, "ADMIN_TRASH_PURGE")}
              </HoldActionButton>
            </>}
          </div>;
        } },
      ]}
    />
    {state.nextCursor && onLoadMore ? <div>
      <Button type="button" variant="outline" size="sm" data-trash-load-more disabled={writesLocked} onClick={onLoadMore}>{frontendText(locale, "ADMIN_LOAD_MORE")}</Button>
    </div> : null}
      </>}
  </section>;
}
