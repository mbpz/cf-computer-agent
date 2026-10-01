import { useEffect, useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { InboxItem, InboxStatus } from "../lib/inbox-data";
import type { FrontendPageMetadata } from "../lib/numbered-page";
import { ConfirmAction } from "./ui/confirm-action";

type Operation = "status" | "task";
export function useInboxActionConfirmation({ locale, items, pagination, memberId, filter, blocked, onStatusChange, onPromoteTask }: {
  locale: LocaleRuntime; items?: readonly InboxItem[]; pagination?: FrontendPageMetadata; memberId?: string; filter?: InboxStatus;
  blocked: boolean; onStatusChange?: (item: InboxItem) => void; onPromoteTask?: (item: InboxItem) => void;
}) {
  type Decision = { row: InboxItem; operation: Operation; items: readonly InboxItem[]; page?: number; size?: number; memberId?: string; filter?: InboxStatus };
  const [decision, setDecision] = useState<Decision | null>(null);
  const decisionRef = useRef<Decision | null>(null);
  const valid = !!decision && !blocked && decision.items === items && !!items?.includes(decision.row)
    && decision.page === pagination?.page && decision.size === pagination?.pageSize && decision.memberId === memberId && decision.filter === filter
    && !!(decision.operation === "status" ? onStatusChange : onPromoteTask);
  const cancel = () => { decisionRef.current = null; setDecision(null); };
  useEffect(() => { if (decision && !valid) cancel(); }, [decision, valid]);
  useEffect(() => () => { decisionRef.current = null; }, []);
  const request = (row: InboxItem, operation: Operation) => {
    if (blocked || decisionRef.current || row.status === "promoted" || !items?.includes(row) || !(operation === "status" ? onStatusChange : onPromoteTask)) return;
    const next = { row, operation, items, page: pagination?.page, size: pagination?.pageSize, memberId, filter };
    decisionRef.current = next; setDecision(next);
  };
  const confirm = () => {
    if (!valid || !decision || decisionRef.current !== decision) return;
    // Consume before entering the route's original CAS / durable recovery protocol.
    cancel(); (decision.operation === "status" ? onStatusChange : onPromoteTask)?.(decision.row);
  };
  const action = decision?.operation === "task" ? "PROMOTE_TASK" : decision?.row.status === "archived" ? "RESTORE" : "ARCHIVE";
  const targetStatus = action === "PROMOTE_TASK" ? "PROMOTED" : action === "RESTORE" ? "INBOX" : "ARCHIVED";
  const content = decision?.row.content.trim() ?? "";
  const excerpt = content.length > 160 ? `${content.slice(0, 160)}…` : content;
  const target = decision ? excerpt ? `${excerpt} (${decision.row.id})` : decision.row.id : "";
  const transition = decision ? `${frontendText(locale, `INBOX_STATUS_${decision.row.status.toUpperCase()}`)} → ${frontendText(locale, `INBOX_STATUS_${targetStatus}`)}` : "";
  return {
    open: valid, request, isOpen: () => decisionRef.current !== null,
    dialog: <ConfirmAction open={valid} title={frontendText(locale, "INBOX_ACTION_CONFIRM_TITLE")}
      description={`${target}. ${transition}. ${frontendText(locale, `INBOX_${action}_IMPACT`)}`}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, `INBOX_${action}`)} onCancel={cancel} onConfirm={confirm} />,
  };
}
