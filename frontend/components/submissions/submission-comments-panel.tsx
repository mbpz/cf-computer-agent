import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PageState } from "../ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { MemberSubmissionComment } from "../../lib/submission-comments-data";

export type SubmissionCommentsState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; comments: readonly MemberSubmissionComment[] };

/**
 * The member's own read-only view of the thread on a submission. It shows who
 * spoke (the submitter or an administrator) because that is all the member
 * projection carries, and it never duplicates the reviewer surface: no
 * decision, no reviewer identity, no comment editing.
 */
export function SubmissionCommentsPanel({ locale, state, onRetry }: {
  locale?: LocaleRuntime;
  state: SubmissionCommentsState;
  onRetry?: () => void;
}) {
  return <Card data-submission-comments={state.kind} aria-busy={state.kind === "loading" ? "true" : undefined}>
    <CardHeader><CardTitle>{frontendText(locale, "SUBMISSION_COMMENTS_TITLE")}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {state.kind === "loading" && <PageState kind="loading" title={frontendText(locale, "SUBMISSION_COMMENTS_LOADING")} />}
      {state.kind === "error" && <PageState kind="error" title={frontendText(locale, "SUBMISSION_COMMENTS_ERROR")}>
        {onRetry && <Button type="button" variant="outline" size="sm" data-submission-comments-retry onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}
      </PageState>}
      {state.kind === "ready" && (state.comments.length === 0
        ? <PageState kind="empty" title={frontendText(locale, "SUBMISSION_COMMENTS_EMPTY")} />
        : <ul className="space-y-3" aria-label={frontendText(locale, "SUBMISSION_COMMENTS_TITLE")}>
          {state.comments.map((comment) => <li key={comment.id} data-submission-comment={comment.authorRole} className="rounded-md border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              {frontendText(locale, comment.authorRole === "owner" ? "SUBMISSION_COMMENTS_FROM_YOU" : "SUBMISSION_COMMENTS_FROM_REVIEWER")}
              <span className="ml-2 font-normal">{comment.createdAt}</span>
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
          </li>)}
        </ul>)}
      <p className="text-xs text-muted-foreground">{frontendText(locale, "SUBMISSION_COMMENTS_READ_ONLY")}</p>
    </CardContent>
  </Card>;
}
