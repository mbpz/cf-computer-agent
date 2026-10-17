import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PageState } from "../ui/page-state";
import { Textarea } from "../ui/textarea";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import {
  correctReparseCandidate,
  loadReparseJob,
  loadSubmissionSourceVersion,
  promoteReparseJob,
  publishReparseJob,
  startSourceReparse,
  type ReparseJobView,
  type ReparsePromotion,
  type ReparsePublishResult,
  type SubmissionSourceVersion,
} from "../../lib/admin-reparse-data";
import { ReviewChunkPanel } from "./review-chunk-panel";

type Step = { readonly key: string; readonly detail: string; readonly failed: boolean };
type SourceState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; value: SubmissionSourceVersion } | { kind: "error"; message: string };

function messageOf(error: unknown, fallbackKey: string, locale?: LocaleRuntime): string {
  return error instanceof ApiRequestError ? `${error.code}: ${error.message}` : frontendText(locale, fallbackKey);
}

function statusTone(status: ReparseJobView["status"]): "outline" | "warning" | "success" | "destructive" {
  if (status === "indexed") return "success";
  if (status === "failed_terminal") return "destructive";
  return status === "failed_retryable" ? "warning" : "outline";
}

/**
 * The source-reparse lifecycle for one submission, as an administrator runs it:
 * read the source version, run one reparse job, correct its candidate, then
 * promote the candidate to a submission or publish it as a revision. Every
 * figure shown is the job's own status (`queued`/`processing`/`indexed`/
 * `failed_retryable`/`failed_terminal`) — the server reports no percentage, so
 * none is drawn.
 */
export function ReviewSourcePanel({ submissionId, sourceVersion, locale, requester = fetch }: {
  submissionId: string;
  /**
   * The source version the review surface already loaded. When the parent passes
   * it, this panel never reads the submission again; when it is absent the panel
   * reads it once, and only after the administrator opens the section.
   */
  sourceVersion?: SubmissionSourceVersion;
  locale?: LocaleRuntime; requester?: Fetcher;
}) {
  const [source, setSource] = useState<SourceState>({ kind: "idle" });
  const [job, setJob] = useState<ReparseJobView | null>(null);
  const [steps, setSteps] = useState<readonly Step[]>([]);
  const [candidateDraft, setCandidateDraft] = useState("");
  const [promotion, setPromotion] = useState<ReparsePromotion | null>(null);
  const [published, setPublished] = useState<ReparsePublishResult | null>(null);
  const [pending, setPending] = useState<"reparse" | "candidate" | "promote" | "publish" | null>(null);
  const [notice, setNotice] = useState<string>();
  const read = useRef<AbortController | null>(null);
  // One publish has one operation number; an unknown outcome retries that number
  // so the server replays the recorded revision instead of publishing again.
  const publishOperation = useRef<{ readonly operationId: string } | null>(null);

  // Nothing is read on mount: the review surface has already read this submission,
  // and a second read of the same URL would be a duplicate. The source version is
  // either handed down or read once, explicitly, when the section is opened.
  const open = useCallback(() => {
    if (sourceVersion) {
      setSource({ kind: "ready", value: sourceVersion });
      return;
    }
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setSource({ kind: "loading" });
    loadSubmissionSourceVersion(submissionId, requester, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setSource({ kind: "ready", value }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSource({ kind: "error", message: messageOf(error, "ADMIN_REPARSE_SOURCE_UNAVAILABLE", locale) });
      });
  }, [locale, requester, sourceVersion, submissionId]);
  useEffect(() => () => read.current?.abort(), []);

  const note = useCallback((key: string, detail: string, failed = false) => {
    setSteps((current) => [...current, { key, detail, failed }]);
  }, []);

  const runReparse = useCallback(async (sourceVersionId: string) => {
    setPending("reparse");
    setNotice(undefined);
    try {
      const started = await startSourceReparse(sourceVersionId, requester);
      setJob(started);
      setCandidateDraft(started.candidate?.content ?? "");
      note("ADMIN_REPARSE_STEP_JOB", started.id, started.status.startsWith("failed"));
      setPending(null);
    } catch (error) {
      setPending(null);
      setNotice(messageOf(error, "ADMIN_REPARSE_FAILED", locale));
    }
  }, [locale, note, requester]);

  const saveCandidate = useCallback(async () => {
    if (!job || candidateDraft.length === 0) return;
    setPending("candidate");
    setNotice(undefined);
    try {
      const updated = await correctReparseCandidate(job.id, candidateDraft, requester);
      setJob(updated);
      setCandidateDraft(updated.candidate?.content ?? candidateDraft);
      note("ADMIN_REPARSE_STEP_CANDIDATE", updated.candidate?.contentSha256 ?? "");
      setPending(null);
    } catch (error) {
      setPending(null);
      setNotice(messageOf(error, "ADMIN_REPARSE_CANDIDATE_FAILED", locale));
    }
  }, [candidateDraft, job, locale, note, requester]);

  const promote = useCallback(async () => {
    if (!job) return;
    setPending("promote");
    setNotice(undefined);
    try {
      const result = await promoteReparseJob(job.id, requester);
      setPromotion(result);
      note("ADMIN_REPARSE_STEP_PROMOTION", result.submissionId);
      setPending(null);
    } catch (error) {
      setPending(null);
      setNotice(messageOf(error, "ADMIN_REPARSE_PROMOTE_FAILED", locale));
    }
  }, [job, locale, note, requester]);

  const publish = useCallback(async () => {
    if (!job) return;
    const operation = publishOperation.current ?? { operationId: crypto.randomUUID() };
    publishOperation.current = operation;
    setPending("publish");
    setNotice(undefined);
    try {
      const result = await publishReparseJob({ jobId: job.id, operationId: operation.operationId, requester });
      setPublished(result);
      note("ADMIN_REPARSE_STEP_PUBLISH", `${result.revisionId} · ${result.searchStatus ?? ""}`.trim());
      setPending(null);
      const refreshed = await loadReparseJob(job.id, requester).catch(() => null);
      if (refreshed) setJob(refreshed);
    } catch (error) {
      setPending(null);
      setNotice(error instanceof ApiRequestError && error.retryable
        ? frontendText(locale, "ADMIN_REPARSE_PUBLISH_UNKNOWN")
        : messageOf(error, "ADMIN_REPARSE_PUBLISH_FAILED", locale));
      if (error instanceof ApiRequestError && !error.retryable) publishOperation.current = null;
    }
  }, [job, locale, note, requester]);

  return <Card data-review-source={source.kind}>
    <CardHeader><CardTitle>{frontendText(locale, "ADMIN_REPARSE_TITLE")}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REPARSE_DESCRIPTION")}</p>
      {source.kind === "idle" ? <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REPARSE_IDLE")}</p>
        <Button type="button" variant="outline" data-review-source-open onClick={open}>
          {frontendText(locale, "ADMIN_REPARSE_OPEN")}
        </Button>
      </div>
        : source.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
        : source.kind === "error" ? <div className="space-y-2">
          <Alert variant="destructive"><AlertDescription>{source.message}</AlertDescription></Alert>
          <Button type="button" variant="outline" data-review-source-open onClick={open}>{frontendText(locale, "COMMON_RETRY")}</Button>
        </div>
        : <>
          <p className="text-sm">{frontendText(locale, "ADMIN_REPARSE_SOURCE_VERSION")}: <code data-review-source-version={source.value.sourceVersionId}>{source.value.sourceVersionId}</code></p>
          <Button type="button" variant="outline" data-review-reparse disabled={pending !== null}
            onClick={() => void runReparse(source.value.sourceVersionId)}>
            {frontendText(locale, pending === "reparse" ? "ADMIN_REPARSE_RUNNING" : "ADMIN_REPARSE_RUN")}
          </Button>

          {job && <div data-review-reparse-job={job.id} className="space-y-3 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusTone(job.status)} data-review-reparse-status={job.status}>{job.status}</Badge>
              <span>{frontendText(locale, "ADMIN_REPARSE_ATTEMPTS")}: <span data-review-reparse-attempts={job.attempts}>{job.attempts}</span></span>
              <span>{frontendText(locale, "ADMIN_REPARSE_LAST_ERROR")}: <span data-review-reparse-error={job.lastErrorCode ?? "none"}>{job.lastErrorCode ?? frontendText(locale, "ADMIN_REPARSE_NO_ERROR")}</span></span>
            </div>
            {job.candidate && <div className="space-y-1">
              <p>{frontendText(locale, "ADMIN_REPARSE_CANDIDATE")}: {frontendText(locale, "ADMIN_REPARSE_CANDIDATE_LINES")} <span data-review-reparse-lines={job.candidate.lineCount}>{job.candidate.lineCount}</span></p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-6">{job.candidate.content}</pre>
            </div>}
            <label className="block" htmlFor="reparse-candidate">{frontendText(locale, "ADMIN_REPARSE_CANDIDATE_EDIT")}</label>
            <Textarea id="reparse-candidate" data-review-reparse-candidate rows={8} value={candidateDraft}
              disabled={pending !== null || job.status !== "indexed"}
              onChange={(event) => setCandidateDraft(event.target.value)}
              className="font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" data-review-reparse-save-candidate
                disabled={pending !== null || job.status !== "indexed" || candidateDraft.length === 0}
                onClick={() => void saveCandidate()}>
                {frontendText(locale, "ADMIN_REPARSE_SAVE_CANDIDATE")}
              </Button>
              <Button type="button" variant="outline" data-review-reparse-run-again
                disabled={pending !== null || job.status === "indexed"}
                onClick={() => { publishOperation.current = null; void runReparse(job.baseSourceVersionId); }}>
                {frontendText(locale, "ADMIN_REPARSE_RUN_AGAIN")}
              </Button>
              <Button type="button" variant="outline" data-review-reparse-promote
                disabled={pending !== null || job.status !== "indexed"}
                onClick={() => void promote()}>
                {frontendText(locale, "ADMIN_REPARSE_PROMOTE")}
              </Button>
              <Button type="button" data-review-reparse-publish
                disabled={pending !== null || job.status !== "indexed" || promotion === null}
                onClick={() => void publish()}>
                {frontendText(locale, "ADMIN_REPARSE_PUBLISH")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_REPARSE_STEP_NOTES")}</p>
            {promotion && <p data-review-reparse-promotion={promotion.submissionId}>
              {frontendText(locale, "ADMIN_REPARSE_PROMOTION")}: {promotion.submissionId}
            </p>}
            {published && <p data-review-reparse-published={published.revisionId} className="space-x-2">
              {frontendText(locale, "ADMIN_REPARSE_PUBLISHED")}: {published.revisionId}
              <span data-review-reparse-search-status={published.searchStatus ?? "unavailable"}>
                {frontendText(locale, "ADMIN_REPARSE_SEARCH_STATUS")}: {published.searchStatus ?? frontendText(locale, "ADMIN_ASSET_STATUS_UNAVAILABLE")}
              </span>
            </p>}
          </div>}

          {steps.length > 0 && <ol data-review-reparse-steps={steps.length} className="list-decimal space-y-1 pl-5 text-sm">
            {steps.map((step, index) => <li key={`${step.key}-${index}`} data-review-reparse-step={step.key}
              className={step.failed ? "text-destructive" : undefined}>
              {frontendText(locale, step.key)}{step.detail ? `: ${step.detail}` : ""}
            </li>)}
          </ol>}
          {notice && <p role="alert" className="text-sm text-destructive">{notice}</p>}
          {published && <ReviewChunkPanel knowledgeItemId={published.knowledgeItemId} revisionId={published.revisionId} locale={locale} requester={requester} />}
        </>}
    </CardContent>
  </Card>;
}
