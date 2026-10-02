import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import type { LocaleRuntime } from "../../lib/i18n";
import { useCreateDraft } from "../../lib/use-create-draft";
import { writeReviewCommentOperation, readReviewCommentOperation, loadReviewComments, type ReviewCommentItem } from "./review-comments-data";

type ReadState = "loading" | "ready" | "error";
type WriteState = "idle" | "saving" | "rejected" | "unknown";
type Owner = {
  comments: ReviewCommentItem[]; body: string; readState: ReadState; writeState: WriteState;
  locked: boolean; hasDraft: boolean; unresolved: boolean;
  edit: (body: string) => void; save: () => Promise<void>; reload: () => Promise<void>; retry: () => Promise<void>;
  attach: () => () => void;
};
const Context = createContext<Owner | null>(null);
export const useReviewCommentsOwner = () => useContext(Context);

/** One target/session owns the draft and operation, not its permission-gated editor.
 * Memory only. Only an exact operation receipt can settle an unknown write.
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
  const operation = useRef<{ id: string; body: string } | null>(null);
  const sending = useRef(false);
  const draft = useCreateDraft({ body: "" }, { body: "" }, () => operation.current !== null, locale,
    () => !authorized.current || view.current === null);
  useLayoutEffect(() => {
    lifetime.current = {};
    return () => { lifetime.current = null; reading.current = null; view.current = null; authorized.current = false; };
  }, []);

  // Synchronous refs own admission; render timing cannot admit a second write.
  const actions = useMemo(() => {
    const settle = (comment: ReviewCommentItem) => {
      operation.current = null; draft.set("body", ""); setWriteState("idle");
      if (view.current && authorized.current) setComments(rows => [...rows.filter(row => row.id !== comment.id), comment]);
    };
    const reload = async () => {
      if (!lifetime.current || !view.current || reading.current || sending.current || draft.isConfirming()) return;
      const token = {}; const owner = lifetime.current; const editor = view.current; const pending = operation.current;
      reading.current = token; authorized.current = false; setReadState("loading"); setComments([]);
      const current = () => lifetime.current === owner && view.current === editor && reading.current === token;
      try {
        const rows = await loadReviewComments(submissionId, request.current);
        if (!current()) return;
        // Absence is not proof of failure: an earlier PUT can still be in flight.
        const receipt = pending ? await readReviewCommentOperation(submissionId, pending.id, pending.body, request.current) : null;
        if (!current()) return;
        setComments(rows); authorized.current = true; setReadState("ready");
        if (receipt && operation.current === pending) settle(receipt);
      } catch {
        if (current()) { authorized.current = false; setComments([]); setReadState("error"); }
      } finally { if (reading.current === token) reading.current = null; }
    };
    const submit = async (retry: boolean) => {
      if (!lifetime.current || !view.current || !authorized.current || sending.current || reading.current || draft.isConfirming()) return;
      if (retry ? !operation.current : operation.current) return;
      const body = retry ? operation.current!.body : draft.current.current.body.trim();
      if (!body) return;
      const token = retry ? operation.current! : { id: crypto.randomUUID(), body };
      const owner = lifetime.current;
      operation.current = token; sending.current = true; setWriteState("saving");
      const current = () => lifetime.current === owner && operation.current === token;
      try {
        const comment = await writeReviewCommentOperation(submissionId, token.id, token.body, request.current);
        if (current()) settle(comment);
      } catch (error) {
        if (!current()) return;
        // A rejection of a retry says nothing about the original PUT. Never
        // discard its key or frozen body, even for a pre-write validation error.
        const rejected = !retry && error instanceof ApiRequestError &&
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
          if (view.current && !authorized.current) void reload();
        }
      }
    };
    return {
      reload, save: () => submit(false), retry: () => submit(true),
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
    };
  }, []);
  return <Context.Provider value={{ ...actions, comments, body: draft.fields.body, readState, writeState,
    locked: Boolean(operation.current) || !authorized.current || draft.confirming,
    hasDraft: draft.fields.body !== "", unresolved: operation.current !== null }}>
    {children}{draft.confirmation}
  </Context.Provider>;
}
