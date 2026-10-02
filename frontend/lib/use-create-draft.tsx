import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "../components/ui/confirm-action";
import { frontendText, type LocaleRuntime } from "./i18n";
import { registerWorkspaceLeaveGuard, WORKSPACE_LOCATION_CHANGE_EVENT } from "./workspace-location";
import type { WorkspaceLeaveDecision } from "./workspace-navigation-gate";

/** Owned by a member/target-keyed form. Unresolved intents are never discardable. */
export function useCreateDraft<T extends Record<string, string>>(initial: T, blank: T, blocked: () => boolean, locale: LocaleRuntime | undefined, editBlocked: () => boolean, beforeDiscard?: () => boolean) {
  const discard = useRef(beforeDiscard); discard.current = beforeDiscard;
  const [fields, setFields] = useState(initial);
  const current = useRef(initial);
  const baseline = useRef(blank);
  const isBlocked = useRef(blocked); isBlocked.current = blocked;
  const isEditBlocked = useRef(editBlocked); isEditBlocked.current = editBlocked;
  const [decision, setDecision] = useState<{ version: string; navigation: WorkspaceLeaveDecision } | null>(null);
  const decisionRef = useRef<typeof decision>(null);
  const alive = useRef(true);
  const applying = useRef<{ fields: T; version: string } | null>(null);
  const [applicationPending, setApplicationPending] = useState(false);
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
    if (!alive.current || isBlocked.current() || isEditBlocked.current() || decisionRef.current || applying.current) return;
    set(key, value);
  }
  useEffect(() => {
    alive.current = true;
    const owner = window;
    const unregister = registerWorkspaceLeaveGuard(() => {
      if (!alive.current) return { kind: "allow" };
      if (isBlocked.current()) return { kind: "block" };
      // Only this reserved application may carry its exact source draft through
      // navigation. Other owners still confirm/block; unload still warns.
      if (applying.current) return { kind: applying.current.version === version() ? "allow" : "block" };
      const beforeCommit = () => !discard.current || discard.current();
      if (!dirty()) return { kind: "allow", beforeCommit };
      const snapshot = version();
      return { kind: "confirm", version: snapshot, prompt(navigation) {
        const next = { version: snapshot, navigation }; decisionRef.current = next; setDecision(next);
      }, dismiss, beforeCommit };
    });
    // Approval alone cannot erase input: another guard or final admission may fail.
    const committed = () => { if (alive.current && !isBlocked.current()) reset(); };
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty() || isBlocked.current() || applying.current) { event.preventDefault(); event.returnValue = ""; }
    };
    owner.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, committed);
    owner.addEventListener("beforeunload", warn);
    return () => {
      alive.current = false; unregister(); decisionRef.current = null; applying.current = null;
      owner.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, committed);
      owner.removeEventListener("beforeunload", warn);
    };
  }, []);
  function applyNavigation(start: (onCommit: () => void, onSettled: () => void) => void) {
    if (!alive.current || isBlocked.current() || isEditBlocked.current() || decisionRef.current || applying.current) return;
    const application = { fields: { ...current.current }, version: version() };
    applying.current = application; setApplicationPending(true);
    const settle = () => {
      if (applying.current !== application) return;
      applying.current = null;
      if (alive.current) setApplicationPending(false);
    };
    try { start(() => {
      if (alive.current && applying.current === application) checkpoint(application.fields);
    }, settle); } catch (error) { settle(); throw error; }
  }
  const cancel = () => decisionRef.current?.navigation.cancel();
  const confirm = () => {
    if (!decision || decisionRef.current !== decision || !alive.current) return;
    if (isBlocked.current() || decision.version !== version()) { cancel(); return; }
    decision.navigation.accept();
  };
  return { fields, current, set, edit, reset, checkpoint, applyNavigation, applicationPending, confirming: decision !== null,
    isConfirming: () => decisionRef.current !== null || applying.current !== null,
    confirmation: <ConfirmAction open={decision !== null} title={frontendText(locale, "CREATE_DISCARD_TITLE")}
      description={frontendText(locale, "CREATE_DISCARD_IMPACT")}
      cancelLabel={frontendText(locale, "TASKS_KEEP_EDITING")} confirmLabel={frontendText(locale, "TASKS_DISCARD_CONFIRM")}
      onCancel={cancel} onConfirm={confirm} />,
  };
}
