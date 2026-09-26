import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import type { SubmissionDraft } from "../components/submissions/submission-form-model";
import { AssetAvailabilityPanel } from "../components/assets/asset-availability-panel";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { SimilarSubmissionCandidate } from "../lib/submission-data";

type SubmissionState = { kind: "idle" | "pending" } | { kind: "validation" | "error"; message: string } | { kind: "success"; message: string; similarCandidates?: readonly SimilarSubmissionCandidate[] };
type Recovery = { title?: string; storageUnavailable: boolean; invalid: boolean; onRetry: () => void };

export function SubmitPage({ draft, state, locale, onSubmit, onDraftChange, recovery }: {
  draft: SubmissionDraft; state: SubmissionState; locale?: LocaleRuntime;
  onSubmit?: (draft: SubmissionDraft) => void; onDraftChange?: (draft: SubmissionDraft) => void; recovery?: Recovery;
}) {
  const pending = state.kind === "pending";
  const unresolved = recovery?.title !== undefined;
  const similarCandidates = state.kind === "success" ? state.similarCandidates ?? [] : [];
  return <section className="mx-auto max-w-3xl space-y-6">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "SUBMIT_TITLE")}</h1><p id="submission-description" className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "SUBMIT_DESCRIPTION")}</p></div>
    {(state.kind === "validation" || state.kind === "error") && <PageState kind="error" title={state.message} />}
    {state.kind === "success" && <PageState kind="empty" title={state.message} />}
    {recovery?.storageUnavailable && <Alert data-submission-storage-warning><AlertDescription>{frontendText(locale, "SUBMIT_STORAGE_WARNING")}</AlertDescription></Alert>}
    {recovery?.invalid && <Alert><AlertDescription><p>{frontendText(locale, "SUBMIT_INTENT_INVALID")}</p><a className="underline" href="/my-submissions">{frontendText(locale, "SUBMIT_CHECK_SUBMISSIONS")}</a></AlertDescription></Alert>}
    {unresolved && !recovery?.invalid && <Card aria-live="polite"><CardHeader><CardTitle>{frontendText(locale, "SUBMIT_RECOVERY_TITLE")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="break-words text-sm font-medium">{recovery?.title}</p>
      <p className="text-sm text-muted-foreground">{frontendText(locale, "SUBMIT_RECOVERY_DESCRIPTION")}</p>
      <div className="flex flex-wrap items-center gap-3"><Button type="button" data-submission-retry disabled={pending} onClick={recovery?.onRetry}>{frontendText(locale, pending ? "SUBMIT_BUTTON_PENDING" : "SUBMIT_RETRY")}</Button><a className="text-sm underline" href="/my-submissions">{frontendText(locale, "SUBMIT_CHECK_SUBMISSIONS")}</a></div>
    </CardContent></Card>}
    {similarCandidates.length > 0 && <Alert><AlertDescription><p className="font-medium">{frontendText(locale, "SUBMIT_SIMILAR_NOTICE")}</p><ul className="mt-2 list-disc pl-5">{similarCandidates.map((candidate) => <li key={candidate.sourceVersionId}>{candidate.title}</li>)}</ul></AlertDescription></Alert>}
    <form aria-describedby="submission-description" aria-busy={pending ? "true" : undefined} onSubmit={(event) => { event.preventDefault(); if (!pending && !recovery?.invalid) onSubmit?.(draft); }}>
      <Card><CardHeader><CardTitle>{frontendText(locale, "SUBMIT_NEW")}</CardTitle></CardHeader><CardContent className="space-y-5">
        <div><Label htmlFor="submission-title">{frontendText(locale, "SUBMIT_TITLE_LABEL")}</Label><Input id="submission-title" value={draft.title} onChange={(event) => onDraftChange?.({ ...draft, title: event.currentTarget.value })} /></div>
        <div><Label htmlFor="submission-mode">{frontendText(locale, "SUBMIT_MODE_LABEL")}</Label><select id="submission-mode" value={draft.mode} onChange={(event) => onDraftChange?.({ ...draft, mode: event.currentTarget.value as SubmissionDraft["mode"] })} className="mt-2 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm">
          <option value="text">{frontendText(locale, "SUBMIT_CONTENT_LABEL")}</option><option value="markdown">{frontendText(locale, "SUBMIT_MARKDOWN_LABEL")}</option><option value="code">{frontendText(locale, "SUBMIT_CODE_LABEL")}</option>
        </select></div>
        <div><Label htmlFor="submission-content">{frontendText(locale, draft.mode === "code" ? "SUBMIT_CODE_LABEL" : draft.mode === "markdown" ? "SUBMIT_MARKDOWN_LABEL" : "SUBMIT_CONTENT_LABEL")}</Label><Textarea id="submission-content" value={draft.content} onChange={(event) => onDraftChange?.({ ...draft, content: event.currentTarget.value })} className="min-h-64 font-mono" /></div>
        <AssetAvailabilityPanel locale={locale} />
        <Button type="submit" disabled={pending || unresolved || recovery?.invalid}>{frontendText(locale, pending ? "SUBMIT_BUTTON_PENDING" : "SUBMIT_BUTTON")}</Button>
      </CardContent></Card>
    </form>
  </section>;
}
