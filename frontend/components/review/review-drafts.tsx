import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCreateDraft } from "../../lib/use-create-draft";
import type { LocaleRuntime } from "../../lib/i18n";
import type { ReviewNoteInput } from "./review-detail-data";

export type ReviewNoteAction = "reject" | "request_changes";
type Entry = ReviewNoteInput & { action: ReviewNoteAction };
export const initialReviewNote = (action: ReviewNoteAction): ReviewNoteInput => ({ reasonCode: action === "reject" ? "not_relevant" : "needs_revision", note: "" });

type ReviewDrafts = {
  get: (id: string) => Entry | undefined;
  set: (id: string, entry: Entry) => void;
  clear: (id: string) => void;
  isConfirming: () => boolean;
  confirming: boolean;
  preserveUnsent: boolean;
  revision: string;
};
const Context = createContext<ReviewDrafts | null>(null);
export const useReviewDrafts = () => useContext(Context);

/** Route/session-owned memory only. Removed or denied rows cannot erase a note.
 * No private note content is rendered by this owner; its dialog is generic.
 */
export function ReviewDraftProvider({ children, locale, preserveUnsent = false }: {
  children: ReactNode; locale?: LocaleRuntime; preserveUnsent?: boolean;
}) {
  const draft = useCreateDraft({ notes: "{}" }, { notes: "{}" }, () => false, locale, () => false);
  // Stable methods read synchronous refs, including same-event edits and leave.
  // The current serialized value below only notifies consumers to re-render.
  const api = useMemo(() => {
    const records = (): Record<string, Entry> => JSON.parse(draft.current.current.notes);
    return {
      get(id: string) { const values = records(); return Object.hasOwn(values, id) ? values[id] : undefined; },
      set(id: string, entry: Entry) {
        const values = records();
        if (entry.note === "" && entry.reasonCode === initialReviewNote(entry.action).reasonCode) delete values[id];
        else Object.defineProperty(values, id, { value: { ...entry }, enumerable: true, configurable: true, writable: true });
        draft.edit("notes", JSON.stringify(values));
      },
      clear(id: string) {
        const values = records();
        if (!Object.hasOwn(values, id)) return;
        delete values[id]; draft.set("notes", JSON.stringify(values));
      },
      isConfirming: draft.isConfirming,
    };
  }, []);
  return <Context.Provider value={{ ...api, revision: draft.fields.notes, confirming: draft.confirming, preserveUnsent }}>
    {children}{draft.confirmation}
  </Context.Provider>;
}
