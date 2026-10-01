import { useEffect, useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { CalendarEvent } from "../lib/calendar-data";
import type { CalendarRange } from "../lib/calendar-query";
import type { FrontendPageMetadata } from "../lib/numbered-page";
import { ConfirmAction } from "./ui/confirm-action";

export function useCalendarCancelConfirmation({ locale, items, pagination, memberId, range, blocked, onCancel }: {
  locale: LocaleRuntime; items?: readonly CalendarEvent[]; pagination?: FrontendPageMetadata; memberId?: string;
  range?: CalendarRange; blocked: boolean; onCancel?: (event: CalendarEvent) => void;
}) {
  type Decision = { row: CalendarEvent; items: readonly CalendarEvent[]; page?: number; size?: number; memberId?: string; from?: string; to?: string };
  const [decision, setDecision] = useState<Decision | null>(null);
  const decisionRef = useRef<Decision | null>(null);
  const valid = !!decision && !blocked && !!onCancel && decision.items === items && !!items?.includes(decision.row)
    && decision.row.status === "scheduled" && decision.page === pagination?.page && decision.size === pagination?.pageSize
    && decision.memberId === memberId && decision.from === range?.from && decision.to === range?.to;
  const dismiss = () => { decisionRef.current = null; setDecision(null); };
  useEffect(() => { if (decision && !valid) dismiss(); }, [decision, valid]);
  useEffect(() => () => { decisionRef.current = null; }, []);
  const request = (row: CalendarEvent) => {
    if (blocked || !onCancel || decisionRef.current || row.status !== "scheduled" || !items?.includes(row)) return;
    const next = { row, items, page: pagination?.page, size: pagination?.pageSize, memberId, from: range?.from, to: range?.to };
    decisionRef.current = next; setDecision(next);
  };
  const confirm = () => {
    if (!valid || !decision || decisionRef.current !== decision) return;
    // Consume once before entering the existing versioned cancellation / recovery protocol.
    dismiss(); onCancel?.(decision.row);
  };
  const title = decision?.row.title.trim();
  const target = decision ? title ? `${title} (${decision.row.id})` : decision.row.id : "";
  return {
    open: valid, request, isOpen: () => decisionRef.current !== null,
    dialog: <ConfirmAction open={valid} title={frontendText(locale, "CALENDAR_CANCEL_HINT")}
      description={`${target}. ${decision ? formatCalendarRange(decision.row, locale) : ""}. ${frontendText(locale, "CALENDAR_CANCEL_IMPACT")}`}
      cancelLabel={frontendText(locale, "CALENDAR_CANCEL_KEEP")} confirmLabel={frontendText(locale, "CALENDAR_CANCEL_CONFIRM")}
      onCancel={dismiss} onConfirm={confirm} />,
  };
}

export function formatCalendarRange(event: CalendarEvent, locale: LocaleRuntime): string {
  try { return `${new Intl.DateTimeFormat(locale.locale, { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.startsAt))} – ${new Intl.DateTimeFormat(locale.locale, { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.endsAt))} (${event.timezone})`; } catch { return frontendText(locale, "CALENDAR_TIME_UNAVAILABLE"); }
}
