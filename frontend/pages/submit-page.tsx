import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import type { SubmissionDraft } from "../components/submissions/submission-form-model";
import { AssetDropzone } from "../components/assets/asset-dropzone";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export function SubmitPage({ draft, state, locale, onSubmit }: { draft: SubmissionDraft; state: { kind: "idle" } | { kind: "pending" } | { kind: "validation"; message: string } | { kind: "error"; message: string }; locale?: LocaleRuntime; onSubmit?: () => void }) {
  return <section className="mx-auto max-w-3xl space-y-6"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "SUBMIT_TITLE")}</h1><p id="submission-description" className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "SUBMIT_DESCRIPTION")}</p></div>{(state.kind === "validation" || state.kind === "error") && <PageState kind="error" title={state.message} /> }<form aria-describedby="submission-description" aria-busy={state.kind === "pending" ? "true" : undefined} onSubmit={(event) => { event.preventDefault(); if (state.kind !== "pending") onSubmit?.(); }}><Card><CardHeader><CardTitle>{frontendText(locale, "SUBMIT_NEW")}</CardTitle></CardHeader><CardContent className="space-y-5"><div><Label htmlFor="submission-title">{frontendText(locale, "SUBMIT_TITLE_LABEL")}</Label><Input id="submission-title" value={draft.title} readOnly /></div><div><Label htmlFor="submission-content">{draft.mode === "code" ? frontendText(locale, "SUBMIT_CODE_LABEL") : draft.mode === "markdown" ? frontendText(locale, "SUBMIT_MARKDOWN_LABEL") : frontendText(locale, "SUBMIT_CONTENT_LABEL")}</Label><Textarea id="submission-content" value={draft.content} readOnly className="min-h-64 font-mono" /></div><AssetDropzone locale={locale} /><Button type="submit" disabled={state.kind === "pending"}>{state.kind === "pending" ? frontendText(locale, "SUBMIT_BUTTON_PENDING") : frontendText(locale, "SUBMIT_BUTTON")}</Button></CardContent></Card></form></section>;
}
