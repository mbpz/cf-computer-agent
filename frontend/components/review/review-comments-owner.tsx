import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import type { LocaleRuntime } from "../../lib/i18n";
import { useCreateDraft } from "../../lib/use-create-draft";
import { createReviewComment, loadReviewComments, type ReviewCommentItem } from "./review-comments-data";

type ReadState = "loading" | "ready" | "error";
type WriteState = "idle" | "saving" | "rejected" | "unknown";
type Owner = {
  comments: ReviewCommentItem[]; body: string; readState: ReadState; writeState: WriteState;
  locked: boolean; hasDraft: boolean; unresolved: boolean;
  edit: (body: string) => void; save: () => Promise<void>; reload: () => Promise<void>;
  attach: () => () => void;
};
const Context = createContext<Owner | null>(null);
export const useReviewCommentsOwner = () => useContext(Context);

/** One target/session owns the draft and POST, not its permission-gated editor.
 * Memory only. A list GET cannot settle an unknown non-idempotent comment POST.
 */
export function ReviewCommentsProvider({ submissionId, requester = fetch, locale, children }: {
  submissionId: string; requester?: Fetcher; locale?: LocaleRuntime; children: ReactNode;
}) {
  const [comments, setComments] = useState<ReviewCommentItem[]>([]);
  const [readState, setReadState] = useState<ReadState>("loading");
  const [writeState, setWriteState] = useState<WriteState>("idle");
  const request = useRef(requester); request.current = requester;
  const lifetime = useRef<object | null>(null);
  const view = useRef<object | null>(null);
  const reading = useRef<object | null>(null);
  const authorized = useRef(false);
  const operation = useRef<object | null>(null);
  const sending = useRef(false);
  const draft = useCreateDraft({ body: "" }, { body: "" }, () => operation.current !== null, locale,
    () => !authorized.current || view.current === null);
  useLayoutEffect(() => {
    lifetime.current = {};
    return () => { lifetime.current = null; reading.current = null; view.current = null; authorized.current = false; };
  }, []);

  // Stable methods reference synchronous state; render timing cannot admit a
  // second POST or edit after navigation confirmation has reserved the draft.
  const actions = useMemo(() => {
    const reload = async () => {
      if (!lifetime.current || !view.current || reading.current || sending.current || draft.isConfirming()) return;
      const token = {}; const owner = lifetime.current; const editor = view.current;
      reading.current = token; authorized.current = false; setReadState("loading"); setComments([]);
      const current = () => lifetime.current === owner && view.current === editor && reading.current === token;
      try {
        const rows = await loadReviewComments(submissionId, request.current);
        if (!current()) return;
        setComments(rows); authorized.current = true; setReadState("ready");
      } catch {
        if (current()) setReadState("error");
      } finally { if (reading.current === token) reading.current = null; }
    };
    return {
      reload,
      attach() {
        const editor = {}; view.current = editor;
        void reload();
        return () => {
          if (view.current !== editor) return;
          view.current = null; reading.current = null; authorized.current = false;
          setComments([]); setReadState("loading");
        };
      },
      edit(body: string) { draft.edit("body", body); },
      async save() {
        if (!lifetime.current || !view.current || !authorized.current || operation.current || draft.isConfirming()) return;
        const body = draft.current.current.body;
        if (!body.trim()) return;
        const token = {}; const owner = lifetime.current;
        operation.current = token; sending.current = true; reading.current = null; setWriteState("saving");
        const current = () => lifetime.current === owner && operation.current === token;
        try {
          const comment = await createReviewComment(submissionId, body, request.current);
          if (!current()) return;
          operation.current = null; draft.set("body", ""); setWriteState("idle");
          if (view.current && authorized.current) setComments(rows => [...rows.filter(row => row.id !== comment.id), comment]);
        } catch (error) {
          if (!current()) return;
          // These exact service errors precede repository.create. A generic
          // 4xx, transport failure, 5xx, or malformed receipt proves no outcome.
          const rejected = error instanceof ApiRequestError &&
            ((error.status === 400 && error.code === "REVIEW_COMMENT_INVALID") ||
             (error.status === 404 && error.code === "REVIEW_COMMENT_NOT_FOUND"));
          if (rejected) operation.current = null;
          setWriteState(rejected ? "rejected" : "unknown");
          if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) {
            authorized.current = false; setComments([]); setReadState("error");
          }
        } finally {
          if (lifetime.current === owner) {
            sending.current = false;
            // An editor reattached during the POST could not start its read.
            if (view.current && !authorized.current) void reload();
          }
        }
      },
    };
  }, []);
  return <Context.Provider value={{ ...actions, comments, body: draft.fields.body, readState, writeState,
    locked: Boolean(operation.current) || !authorized.current || draft.confirming,
    hasDraft: draft.fields.body !== "", unresolved: operation.current !== null }}>
    {children}{draft.confirmation}
  </Context.Provider>;
}
