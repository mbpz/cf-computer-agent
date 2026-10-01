import { useEffect, useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { FrontendPageMetadata } from "../lib/numbered-page";
import { ConfirmAction } from "./ui/confirm-action";

type StatusAction = "completed" | "archived" | "active";
type PlanningRow = { id: string; title: string; status: string; updatedAt: string };

/** A decision belongs to the displayed list, member, page and row version, not just an ID. */
export function usePlanningStatusConfirmation<T extends PlanningRow>({ kind, locale, items, pagination, memberId, blocked, onStatusChange }: {
  kind: "GOALS" | "PROJECTS"; locale: LocaleRuntime; items?: readonly T[]; pagination?: FrontendPageMetadata;
  memberId?: string; blocked: boolean; onStatusChange?: (item: T, status: StatusAction) => void;
}) {
  type Decision = { row: T; status: StatusAction; items: readonly T[]; page?: number; pageSize?: number; memberId?: string };
  const [decision, setDecision] = useState<Decision | null>(null);
  const decisionRef = useRef<Decision | null>(null);
  const unavailable = blocked || !items || !onStatusChange;
  const valid = !!decision && !unavailable && decision.items === items && items.includes(decision.row)
    && decision.page === pagination?.page && decision.pageSize === pagination?.pageSize && decision.memberId === memberId;
  const cancel = () => { decisionRef.current = null; setDecision(null); };
  useEffect(() => { if (decision && !valid) cancel(); }, [decision, valid]);
  useEffect(() => () => { decisionRef.current = null; }, []);
  const request = (row: T, status: StatusAction) => {
    if (unavailable || decisionRef.current || !items.includes(row)) return;
    if (status === "active" ? row.status !== "archived" : row.status === "archived" || row.status === status) return;
    const next = { row, status, items, page: pagination?.page, pageSize: pagination?.pageSize, memberId };
    decisionRef.current = next; setDecision(next);
  };
  const confirm = () => {
    if (!valid || !decision || decisionRef.current !== decision) return;
    // Consume before calling the route. Keep its original row/CAS version and recovery protocol.
    cancel(); onStatusChange?.(decision.row, decision.status);
  };
  const action = decision?.status === "completed" ? "COMPLETE" : decision?.status === "archived" ? "ARCHIVE" : "RESTORE";
  const target = decision ? decision.row.title.trim() ? `${decision.row.title} (${decision.row.id})` : decision.row.id : "";
  const transition = decision ? `${frontendText(locale, `${kind}_STATUS_${decision.row.status.toUpperCase()}`)} → ${frontendText(locale, `${kind}_STATUS_${decision.status.toUpperCase()}`)}` : "";
  return {
    open: valid, unavailable, request, isOpen: () => decisionRef.current !== null,
    dialog: <ConfirmAction open={valid} title={frontendText(locale, `${kind}_STATUS_CONFIRM_TITLE`)}
      description={`${target}. ${transition}. ${frontendText(locale, `PLANNING_STATUS_${action}_IMPACT`)}`}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, `${kind}_${action}`)} onCancel={cancel} onConfirm={confirm} />,
  };
}
