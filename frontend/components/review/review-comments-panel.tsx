import { useEffect } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { Fetcher } from "../../lib/api";
import { ReviewCommentsProvider, useReviewCommentsOwner } from "./review-comments-owner";

type Props = { submissionId: string; locale?: LocaleRuntime; requester?: Fetcher };
export function ReviewCommentsPanel(props: Props) {
  const owner = useReviewCommentsOwner();
  return owner ? <ReviewCommentsEditor {...props} /> : <ReviewCommentsProvider key={props.submissionId} {...props}><ReviewCommentsEditor {...props} /></ReviewCommentsProvider>;
}
function ReviewCommentsEditor({ locale, requester }: Props) {
  const owner = useReviewCommentsOwner()!;
  useEffect(() => owner.attach(), [owner.attach, requester]);
  const { comments, body, readState, writeState, locked } = owner;
  return <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_COMMENTS")}</CardTitle></CardHeader><CardContent className="space-y-4">
    <div aria-live="polite" className="space-y-3">
      {readState === "loading" ? <p className="text-sm text-muted-foreground">{frontendText(locale, "APP_LOADING_TITLE")}</p> : readState === "ready" && (comments.length === 0 ? <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_COMMENT_EMPTY")}</p> : comments.map(comment => <div key={comment.id} className="rounded-md border p-3"><div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{comment.authorRole === "admin" ? frontendText(locale, "ADMIN_REVIEW_COMMENT_AUTHOR_ADMIN") : frontendText(locale, "ADMIN_REVIEW_COMMENT_AUTHOR_OWNER")}</span><time dateTime={comment.createdAt}>{comment.createdAt}</time></div><p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p></div>))}
    </div>
    {readState === "ready" && <>
      <Textarea aria-label={frontendText(locale, "ADMIN_REVIEW_COMMENT_PLACEHOLDER")} value={body} disabled={locked} onChange={event => owner.edit(event.currentTarget.value)} placeholder={frontendText(locale, "ADMIN_REVIEW_COMMENT_PLACEHOLDER")} maxLength={4000} />
      <Button size="sm" disabled={locked || !body.trim()} onClick={() => { void owner.save(); }}>{writeState === "saving" ? frontendText(locale, "ADMIN_REVIEW_ACTION_PENDING") : frontendText(locale, "ADMIN_REVIEW_COMMENT_ADD")}</Button>
    </>}
    {(readState === "error" || writeState === "rejected") && <p role="status" className="text-sm text-destructive">{frontendText(locale, "ADMIN_REVIEW_COMMENT_ERROR")}</p>}
    {writeState === "unknown" && <Alert><AlertDescription>{frontendText(locale, "ADMIN_REVIEW_COMMENT_UNKNOWN")}</AlertDescription></Alert>}
    {writeState === "unknown" && readState === "ready" && <Button variant="outline" onClick={() => { void owner.retry(); }}>{frontendText(locale, "ADMIN_REVIEW_COMMENT_RETRY")}</Button>}
    {(readState === "error" || writeState === "unknown") && <Button variant="outline" disabled={writeState === "saving" || readState === "loading"} onClick={() => { void owner.reload(); }}>{frontendText(locale, "ADMIN_REVIEW_RELOAD")}</Button>}
  </CardContent></Card>;
}
