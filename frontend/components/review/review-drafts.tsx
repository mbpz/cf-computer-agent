import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useCreateDraft } from "../../lib/use-create-draft";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { discardBlockedReviewNoteDraft, loadReviewNoteDraft, persistReviewNoteDraft } from "../../lib/review-note-draft";
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

/** Unsent notes stay with this owner. A signed-in member's note is also kept in this tab across refresh.
 * Removed or denied rows cannot erase a note. This owner does not render the note; its dialog is generic.
 */
export function ReviewDraftProvider({ children, locale, preserveUnsent = false, memberId }: {
  children: ReactNode; locale?: LocaleRuntime; preserveUnsent?: boolean; memberId?: string;
}) {
  const [stored] = useState(() => memberId ? loadReviewNoteDraft(memberId) : { kind: "empty" as const });
  const [recordBlocked, setRecordBlocked] = useState(stored.kind === "blocked");
  const [recordNotice, setRecordNotice] = useState<string>();
  const draft = useCreateDraft({ notes: stored.kind === "ready" ? stored.notes : "{}" }, { notes: "{}" }, () => false, locale, () => false);
  useEffect(() => {
    if (!memberId || recordBlocked) return;
    const saved = persistReviewNoteDraft(memberId, draft.fields.notes);
    setRecordNotice(saved ? undefined : frontendText(locale, "REVIEW_NOTE_DRAFT_NOT_RECORDED"));
  }, [draft.fields.notes, locale, memberId, recordBlocked]);
  const discardRecord = () => {
    if (!memberId || !discardBlockedReviewNoteDraft(memberId)) return;
    setRecordBlocked(false);
  };
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
    {recordBlocked ? <div data-review-note-draft-blocked role="alert">
      <p>{frontendText(locale, "REVIEW_NOTE_DRAFT_RECORD_BLOCKED")}</p>
      <button type="button" onClick={discardRecord}>{frontendText(locale, "REVIEW_NOTE_DRAFT_RECORD_DISCARD")}</button>
    </div> : null}
    {recordNotice ? <p role="alert">{recordNotice}</p> : null}
    {children}{draft.confirmation}
  </Context.Provider>;
}
