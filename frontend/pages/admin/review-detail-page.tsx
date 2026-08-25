import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { ReviewDetailModel } from "../../components/review/review-detail-model";

export type ReviewDecision = "publish" | "request_changes" | "reject";
export type ReviewDetailState = { kind: "loading" } | { kind: "ready"; detail: ReviewDetailModel } | { kind: "error"; message: string };

export function ReviewDetailPage({ state, onDecision, locale }: { state: ReviewDetailState; onDecision?: (action: ReviewDecision, reason?: string) => void; locale?: LocaleRuntime }) {
  if (state.kind === "loading") return <div aria-busy="true" className="space-y-4"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>;
  if (state.kind === "error") return <Alert variant="destructive"><AlertDescription>{state.message}</AlertDescription></Alert>;
  const { detail } = state;
  return <section className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_REVIEW_DETAIL_LABEL")}</p><h1 className="mt-1 text-2xl font-semibold">{detail.title}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_SUBMITTER")}: {detail.submitter}</p></div><Badge variant="outline">{detail.status}</Badge></div><Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_CONTENT")}</CardTitle></CardHeader><CardContent><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm leading-7">{detail.content || frontendText(locale, "ADMIN_REVIEW_NO_CONTENT")}</pre></CardContent></Card>{detail.warnings.length ? <Alert><AlertDescription><strong>{frontendText(locale, "ADMIN_REVIEW_WARNINGS")}:</strong> {detail.warnings.join(" · ")}</AlertDescription></Alert> : null}<Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_DECISION")}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button onClick={() => onDecision?.("publish")}>{frontendText(locale, "ADMIN_REVIEW_PUBLISH")}</Button><Button variant="outline" onClick={() => onDecision?.("request_changes", "")}>{frontendText(locale, "ADMIN_REVIEW_REQUEST_CHANGES")}</Button><Button variant="destructive" onClick={() => onDecision?.("reject", "")}>{frontendText(locale, "ADMIN_REVIEW_REJECT")}</Button></CardContent></Card></section>;
}
