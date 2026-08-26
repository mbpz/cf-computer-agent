import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { Fetcher } from "../../lib/api";
import { createReviewComment, loadReviewComments, type ReviewCommentItem } from "./review-comments-data";

export function ReviewCommentsPanel({ submissionId, locale, requester = fetch }: { submissionId: string; locale?: LocaleRuntime; requester?: Fetcher }) {
  const [comments, setComments] = useState<ReviewCommentItem[]>([]);
  const [body, setBody] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  useEffect(() => {
    let active = true;
    setState("loading");
    loadReviewComments(submissionId, requester).then((items) => { if (active) { setComments(items); setState("ready"); } }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [submissionId, requester]);
  const save = async () => {
    if (!body.trim() || state === "saving") return;
    setState("saving");
    try {
      const comment = await createReviewComment(submissionId, body, requester);
      setComments((current) => [...current, comment]);
      setBody("");
      setState("ready");
    } catch {
      setState("error");
    }
  };
  return <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_COMMENTS")}</CardTitle></CardHeader><CardContent className="space-y-4"><div aria-live="polite" className="space-y-3">{state === "loading" ? <p className="text-sm text-muted-foreground">{frontendText(locale, "APP_LOADING_TITLE")}</p> : comments.length === 0 ? <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_COMMENT_EMPTY")}</p> : comments.map((comment) => <div key={comment.id} className="rounded-md border p-3"><div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{comment.authorRole === "admin" ? frontendText(locale, "ADMIN_REVIEW_COMMENT_AUTHOR_ADMIN") : frontendText(locale, "ADMIN_REVIEW_COMMENT_AUTHOR_OWNER")}</span><time dateTime={comment.createdAt}>{comment.createdAt}</time></div><p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p></div>)}</div><Textarea aria-label={frontendText(locale, "ADMIN_REVIEW_COMMENT_PLACEHOLDER")} value={body} onChange={(event) => setBody(event.currentTarget.value)} placeholder={frontendText(locale, "ADMIN_REVIEW_COMMENT_PLACEHOLDER")} maxLength={16000} /><div className="flex items-center justify-between gap-3"><span role="status" className="text-sm text-destructive">{state === "error" ? frontendText(locale, "ADMIN_REVIEW_COMMENT_ERROR") : ""}</span><Button size="sm" disabled={state === "saving" || !body.trim()} onClick={() => { void save(); }}>{state === "saving" ? frontendText(locale, "ADMIN_REVIEW_ACTION_PENDING") : frontendText(locale, "ADMIN_REVIEW_COMMENT_ADD")}</Button></div></CardContent></Card>;
}
