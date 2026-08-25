import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import type { SubmissionDraft } from "../components/submissions/submission-form-model";

export function SubmitPage({ draft, state }: { draft: SubmissionDraft; state: { kind: "idle" } | { kind: "pending" } | { kind: "validation"; message: string } | { kind: "error"; message: string } }) {
  return <section className="mx-auto max-w-3xl space-y-6"><div><h1 className="text-2xl font-semibold">Submit knowledge</h1><p className="mt-1 text-sm text-muted-foreground">Add a bounded, reviewable knowledge entry.</p></div>{(state.kind === "validation" || state.kind === "error") && <Alert variant="destructive"><AlertDescription>{state.message}</AlertDescription></Alert>}<Card><CardHeader><CardTitle>New submission</CardTitle></CardHeader><CardContent className="space-y-5"><div><Label htmlFor="submission-title">Title</Label><Input id="submission-title" value={draft.title} readOnly /></div><div><Label htmlFor="submission-content">{draft.mode === "code" ? "Code" : draft.mode === "markdown" ? "Markdown" : "Content"}</Label><Textarea id="submission-content" value={draft.content} readOnly className="min-h-64 font-mono" /></div><Button disabled={state.kind === "pending"}>{state.kind === "pending" ? "Submitting…" : "Submit knowledge"}</Button></CardContent></Card></section>;
}
