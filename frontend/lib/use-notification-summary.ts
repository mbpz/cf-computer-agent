import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "./api";
import { loadNotificationSummary } from "./notifications-data";
import { subscribeNotificationSummary } from "./notification-summary-events";

type SummaryState = { kind: "loading" | "error" | "forbidden" } | { kind: "ready"; unread: number };
export function useNotificationSummary(scope: string, pathname: string, enabled: boolean) {
  const key = JSON.stringify([scope, pathname, enabled]);
  const [snapshot, setSnapshot] = useState<{ key: string; state: SummaryState }>();
  const retryRef = useRef<(() => void) | null>(null);
  const deniedScope = useRef<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let current: AbortController | null = null;
    const publish = (state: SummaryState) => setSnapshot({ key, state });
    if (deniedScope.current !== scope) deniedScope.current = null;
    if (!enabled || deniedScope.current === scope) {
      publish({ kind: "forbidden" });
      return;
    }
    const refresh = (invalidate = false) => {
      if (disposed || deniedScope.current === scope || (current && !invalidate)) return;
      current?.abort();
      const controller = new AbortController(); current = controller;
      publish({ kind: "loading" });
      void loadNotificationSummary(fetch, controller.signal).then(summary => {
        if (disposed || current !== controller) return;
        publish({ kind: "ready", unread: summary.unread });
      }).catch((error: unknown) => {
        if (disposed || current !== controller) return;
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          deniedScope.current = scope; publish({ kind: "forbidden" });
        } else publish({ kind: "error" });
      }).finally(() => { if (current === controller) current = null; });
    };
    const focus = () => refresh();
    const visibility = () => { if (document.visibilityState === "visible") refresh(); };
    retryRef.current = focus;
    const unsubscribe = subscribeNotificationSummary(() => refresh(true));
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    refresh();
    return () => {
      disposed = true; current?.abort(); current = null; retryRef.current = null;
      unsubscribe(); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility);
    };
  }, [key, scope, enabled]);
  // Suppress another member/route snapshot during render, before effect cleanup.
  const state: SummaryState = !enabled || deniedScope.current === scope ? { kind: "forbidden" }
    : snapshot?.key === key ? snapshot.state : { kind: "loading" };
  return { state, retry: () => retryRef.current?.() };
}
