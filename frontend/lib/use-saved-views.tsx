import { useEffect, useRef, useState } from "react";
import { ApiRequestError, type Fetcher } from "./api";
import { createSavedView, deleteSavedView, loadSavedViews, findSavedView, savedViewIsAbsent, type SavedViewFilters, type SavedViewItem } from "./saved-views-data";
import { frontendText, type LocaleRuntime } from "./i18n";
import { ConfirmAction } from "../components/ui/confirm-action";
import { useCreateDraft } from "./use-create-draft";

type Intent = { kind: "create"; name: string; filters: Partial<SavedViewFilters> } | { kind: "delete"; view: SavedViewItem };

/** One member-keyed owner. A transport error is not evidence that a write failed. */
export function useSavedViews(locale: LocaleRuntime, filters: () => Partial<SavedViewFilters>, actionBlocked: () => boolean = () => false) {
  const [items, setItems] = useState<SavedViewItem[]>([]);
  const [phase, setPhase] = useState<"idle" | "pending" | "unknown">("idle");
  const phaseRef = useRef(phase);
  const transition = (next: typeof phase) => { phaseRef.current = next; setPhase(next); };
  const [error, setError] = useState<string>();
  const intent = useRef<Intent | null>(null);
  const [deletion, setDeletion] = useState<{ view: SavedViewItem } | null>(null);
  const deleteRef = useRef<{ view: SavedViewItem } | null>(null);
  const itemsRef = useRef(items); itemsRef.current = items;
  const owner = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const draft = useCreateDraft({ name: "" }, { name: "" }, () => intent.current !== null || deleteRef.current !== null, locale, actionBlocked);
  useEffect(() => {
    const controller = new AbortController(); owner.current = controller;
    const revision = generation.current;
    void loadSavedViews(requester(controller)).then(views => {
      if (owner.current === controller && generation.current === revision) setItems(views);
    }).catch(() => {
      if (owner.current === controller && generation.current === revision) setError(frontendText(locale, "SEARCH_SAVED_VIEW_ERROR"));
    });
    return () => { controller.abort(); owner.current = null; intent.current = null; deleteRef.current = null; };
  }, []);
  async function save() {
    const controller = owner.current;
    if (!controller || intent.current || deleteRef.current || draft.isConfirming() || actionBlocked()) return;
    const name = draft.current.current.name.trim(); if (!name) return;
    const operation: Intent = { kind: "create", name, filters: filters() };
    await run(operation, controller);
  }
  function requestDelete(id: string) {
    if (!owner.current || intent.current || deleteRef.current || draft.isConfirming() || actionBlocked()) return;
    const view = itemsRef.current.find(item => item.id === id); if (!view) return;
    const decision = { view }; deleteRef.current = decision; setDeletion(decision);
  }
  function cancelDelete() { if (!owner.current || deleteRef.current !== deletion) return; deleteRef.current = null; setDeletion(null); }
  function confirmDelete() {
    const controller = owner.current;
    if (!controller || !deletion || deleteRef.current !== deletion || intent.current || draft.isConfirming() || actionBlocked()) return;
    if (!itemsRef.current.some(item => item === deletion.view)) { cancelDelete(); return; }
    const operation: Intent = { kind: "delete", view: deletion.view };
    cancelDelete(); void run(operation, controller);
  }
  async function run(operation: Intent, controller: AbortController) {
    intent.current = operation; generation.current++; transition("pending"); setError(undefined);
    try {
      const result = operation.kind === "create"
        ? await createSavedView(operation.name, operation.filters, requester(controller))
        : await deleteSavedView(operation.view.id, requester(controller));
      if (owner.current !== controller || intent.current !== operation) return;
      accept(operation, result);
    } catch (error) {
      if (owner.current !== controller || intent.current !== operation) return;
      if (error instanceof ApiRequestError && ((error.status === 400 && error.code === "SAVED_VIEW_INVALID") || (error.status === 409 && error.code === "SAVED_VIEW_NAME_CONFLICT"))) {
        intent.current = null; transition("idle"); setError(frontendText(locale, "SEARCH_SAVED_VIEW_ERROR"));
      } else { transition("unknown"); setError(frontendText(locale, "SEARCH_SAVED_VIEW_UNKNOWN")); }
    }
  }
  function accept(operation: Intent, result: SavedViewItem | void) {
      if (operation.kind === "create" && result) {
        setItems(views => [result, ...views.filter(view => view.id !== result.id)]);
        draft.set("name", ""); draft.checkpoint({ name: "" });
      } else if (operation.kind === "delete") setItems(views => views.filter(view => view.id !== operation.view.id));
      intent.current = null; transition("idle");
    setError(undefined);
  }
  async function check() {
    const controller = owner.current; const operation = intent.current;
    if (!controller || !operation || phaseRef.current !== "unknown") return;
    transition("pending");
    try {
      const result = operation.kind === "create"
        ? await findSavedView(operation.name, operation.filters, requester(controller))
        : await savedViewIsAbsent(operation.view.id, requester(controller));
      if (owner.current !== controller || intent.current !== operation) return;
      if (result) { accept(operation, typeof result === "boolean" ? undefined : result); return; }
    } catch { /* Keep the original intent: neither a failed read nor absence proves failure. */ }
    if (owner.current === controller && intent.current === operation) {
      transition("unknown"); setError(frontendText(locale, "SEARCH_SAVED_VIEW_UNKNOWN"));
    }
  }
  function mayApply(view: SavedViewItem) {
    return !!owner.current && !intent.current && !deleteRef.current && !draft.isConfirming() && !actionBlocked() && itemsRef.current.includes(view);
  }
  return { isBlocking: () => intent.current !== null || deleteRef.current !== null, mayApply, items, phase, error, draft, save, check, requestDelete, locked: phase !== "idle" || deletion !== null || draft.confirming,
    confirmation: <>{draft.confirmation}<ConfirmAction open={deletion !== null}
      title={frontendText(locale, "SEARCH_DELETE_VIEW")} description={`${deletion?.view.name ?? ""} — ${frontendText(locale, "SEARCH_DELETE_VIEW_IMPACT")}`}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, "SEARCH_DELETE_VIEW")} destructive
      onCancel={cancelDelete} onConfirm={confirmDelete} /></>,
  };
}
function requester(owner: AbortController): Fetcher {
  return (input, init) => fetch(input, { ...init, signal: owner.signal });
}
