import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "../components/ui/confirm-action";
import { frontendText, type LocaleRuntime } from "./i18n";
import { registerWorkspaceLeaveGuard, WORKSPACE_LOCATION_CHANGE_EVENT } from "./workspace-location";
import type { WorkspaceLeaveDecision } from "./workspace-navigation-gate";

/** Owned by a member/target-keyed form. Unresolved intents are never discardable. */
export function useCreateDraft<T extends Record<string, string>>(initial: T, blank: T, blocked: () => boolean, locale: LocaleRuntime, editBlocked: () => boolean) {
  const [fields, setFields] = useState(initial);
  const current = useRef(initial);
  const baseline = useRef(blank);
  const isBlocked = useRef(blocked); isBlocked.current = blocked;
  const isEditBlocked = useRef(editBlocked); isEditBlocked.current = editBlocked;
  const [decision, setDecision] = useState<{ version: string; navigation: WorkspaceLeaveDecision } | null>(null);
  const decisionRef = useRef<typeof decision>(null);
  const alive = useRef(true);
  const version = () => JSON.stringify(current.current);
  const dirty = () => version() !== JSON.stringify(baseline.current);
  const dismiss = () => { decisionRef.current = null; setDecision(null); };
  // Internal recovery/reset setters intentionally work while the form is locked.
  function set<K extends keyof T>(key: K, value: T[K]) {
    current.current = { ...current.current, [key]: value }; setFields(current.current);
  }
  // Accepted submissions may stay visible; do not erase a newer local draft.
  function checkpoint(accepted: T) { baseline.current = { ...accepted }; }
  function reset() { current.current = { ...baseline.current }; setFields(current.current); }
  function edit<K extends keyof T>(key: K, value: T[K]) {
    if (!alive.current || isBlocked.current() || isEditBlocked.current() || decisionRef.current) return;
    set(key, value);
  }
  useEffect(() => {
    alive.current = true;
    const owner = window;
    const unregister = registerWorkspaceLeaveGuard(() => {
      if (!alive.current) return { kind: "allow" };
      if (isBlocked.current()) return { kind: "block" };
      if (!dirty()) return { kind: "allow" };
      const snapshot = version();
      return { kind: "confirm", version: snapshot, prompt(navigation) {
        const next = { version: snapshot, navigation }; decisionRef.current = next; setDecision(next);
      }, dismiss };
    });
    // Approval alone cannot erase input: another guard or final admission may fail.
    const committed = () => { if (alive.current && !isBlocked.current()) reset(); };
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty() || isBlocked.current()) { event.preventDefault(); event.returnValue = ""; }
    };
    owner.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, committed);
    owner.addEventListener("beforeunload", warn);
    return () => {
      alive.current = false; unregister(); decisionRef.current = null;
      owner.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, committed);
      owner.removeEventListener("beforeunload", warn);
    };
  }, []);
  const cancel = () => decisionRef.current?.navigation.cancel();
  const confirm = () => {
    if (!decision || decisionRef.current !== decision || !alive.current) return;
    if (isBlocked.current() || decision.version !== version()) { cancel(); return; }
    decision.navigation.accept();
  };
  return { fields, current, set, edit, reset, checkpoint, confirming: decision !== null,
    isConfirming: () => decisionRef.current !== null,
    confirmation: <ConfirmAction open={decision !== null} title={frontendText(locale, "CREATE_DISCARD_TITLE")}
      description={frontendText(locale, "CREATE_DISCARD_IMPACT")}
      cancelLabel={frontendText(locale, "TASKS_KEEP_EDITING")} confirmLabel={frontendText(locale, "TASKS_DISCARD_CONFIRM")}
      onCancel={cancel} onConfirm={confirm} />,
  };
}
