import { useEffect, useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { FocusSession } from "../lib/focus-data";
import { ConfirmAction } from "./ui/confirm-action";

type TerminalAction = "complete" | "abandon";
type Transition = TerminalAction | "pause" | "resume";
export function useFocusActionConfirmation({ locale, session, memberId, selectionVersion, blocked, onTransition }: {
  locale: LocaleRuntime; session?: FocusSession | null; memberId?: string; selectionVersion: number;
  blocked: boolean; onTransition?: (action: Transition) => void;
}) {
  type Decision = { session: FocusSession; action: TerminalAction; memberId?: string; selectionVersion: number };
  const [decision, setDecision] = useState<Decision | null>(null);
  const decisionRef = useRef<Decision | null>(null);
  const valid = !!decision && !blocked && !!onTransition && decision.session === session
    && (session.status === "active" || session.status === "paused")
    && decision.memberId === memberId && decision.selectionVersion === selectionVersion;
  const dismiss = () => { decisionRef.current = null; setDecision(null); };
  useEffect(() => { if (decision && !valid) dismiss(); }, [decision, valid]);
  useEffect(() => () => { decisionRef.current = null; }, []);
  const request = (action: TerminalAction) => {
    if (blocked || !onTransition || decisionRef.current || !session || (session.status !== "active" && session.status !== "paused")) return;
    const next = { session, action, memberId, selectionVersion };
    decisionRef.current = next; setDecision(next);
  };
  const confirm = () => {
    if (!valid || !decision || decisionRef.current !== decision) return;
    // Session identity remains current; consume before the route saves its versioned intent.
    dismiss(); onTransition?.(decision.action);
  };
  const target = decision?.session;
  const title = target?.startTitle?.trim();
  const identity = target ? title ? `${title} (${target.id})` : target.id : "";
  const status = target ? `${frontendText(locale, `FOCUS_STATUS_${target.status.toUpperCase()}`)} → ${frontendText(locale, decision?.action === "complete" ? "FOCUS_STATUS_COMPLETED" : "FOCUS_STATUS_ABANDONED")}` : "";
  const calendar = target?.calendarEventId
    ? `${frontendText(locale, decision?.action === "complete" ? "FOCUS_COMPLETE_CALENDAR_IMPACT" : "FOCUS_ABANDON_CALENDAR_IMPACT")} (${target.calendarEventId})`
    : frontendText(locale, "FOCUS_NO_CALENDAR_IMPACT");
  return {
    open: valid, request, isOpen: () => decisionRef.current !== null,
    dialog: <ConfirmAction open={valid} title={frontendText(locale, "FOCUS_FINISH_CONFIRM_TITLE")}
      description={`${identity}. ${frontendText(locale, "FOCUS_TASK_ID")}: ${target?.taskId ?? ""}. ${status}. ${frontendText(locale, "FOCUS_FINISH_IMPACT")} ${calendar}`}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, decision?.action === "complete" ? "FOCUS_COMPLETE" : "FOCUS_ABANDON")}
      onCancel={dismiss} onConfirm={confirm} />,
  };
}
