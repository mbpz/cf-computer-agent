import { useState, useSyncExternalStore } from "react";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { readWorkspaceHistoryFault, retryWorkspaceHistory, subscribeWorkspaceHistoryFault } from "../lib/workspace-location";
import { Button } from "./ui/button";

/** A failed traversal must not silently leave the address and retained draft apart. */
export function HistoryNavigationNotice({ locale }: { locale: Pick<LocaleRuntime, "t"> }) {
  const fault = useSyncExternalStore(subscribeWorkspaceHistoryFault, readWorkspaceHistoryFault, () => null);
  const [retrying, setRetrying] = useState(false);
  if (!fault) return null;
  return <section role="alert" className="mb-4 rounded-lg border border-destructive p-4">
    <p>{frontendText(locale, "HISTORY_UNVERIFIED")}</p>
    <Button disabled={retrying} onClick={async () => {
      setRetrying(true);
      try { await retryWorkspaceHistory(); } finally { setRetrying(false); }
    }}>{frontendText(locale, "HISTORY_RETRY")}</Button>
  </section>;
}
