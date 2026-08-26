import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { ReviewDetailModel } from "../../components/review/review-detail-model";
import type { ReactNode } from "react";

export type ReviewDecision = "publish" | "request_changes" | "reject";
export type ReviewDetailState = { kind: "loading" } | { kind: "ready"; detail: ReviewDetailModel } | { kind: "error"; message: string };
export type ReviewDecisionState = { kind: "idle" } | { kind: "pending"; action: ReviewDecision } | { kind: "success"; action: ReviewDecision } | { kind: "error"; action: ReviewDecision; message: string };

export function ReviewDetailPage({ state, onDecision, decisionState = { kind: "idle" }, locale, comments }: { state: ReviewDetailState; onDecision?: (action: ReviewDecision, reason?: string) => void; decisionState?: ReviewDecisionState; locale?: LocaleRuntime; comments?: ReactNode }) {
  if (state.kind === "loading") return <div aria-busy="true" className="space-y-4"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>;
  if (state.kind === "error") return <Alert variant="destructive"><AlertDescription>{state.message}</AlertDescription></Alert>;
  const { detail } = state;
  const busy = decisionState.kind === "pending";
  const terminal = detail.status !== "review_pending";
  return <section className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_REVIEW_DETAIL_LABEL")}</p><h1 className="mt-1 text-2xl font-semibold">{detail.title}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_SUBMITTER")}: {detail.submitter}</p></div><Badge variant="outline">{detail.status}</Badge></div><Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_CONTENT")}</CardTitle></CardHeader><CardContent><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm leading-7">{detail.content || frontendText(locale, "ADMIN_REVIEW_NO_CONTENT")}</pre></CardContent></Card>{detail.warnings.length ? <Alert><AlertDescription><strong>{frontendText(locale, "ADMIN_REVIEW_WARNINGS")}:</strong> {detail.warnings.join(" · ")}</AlertDescription></Alert> : null}{comments}{decisionState.kind === "success" && <Alert><AlertDescription>{frontendText(locale, "ADMIN_REVIEW_ACTION_SUCCESS")}</AlertDescription></Alert>}{decisionState.kind === "error" && <Alert variant="destructive"><AlertDescription>{decisionState.message}</AlertDescription></Alert>}<Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_DECISION")}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button disabled={busy || terminal} aria-busy={busy && decisionState.kind === "pending" && decisionState.action === "publish"} onClick={() => onDecision?.("publish")}>{busy && decisionState.kind === "pending" && decisionState.action === "publish" ? frontendText(locale, "ADMIN_REVIEW_ACTION_PENDING") : frontendText(locale, "ADMIN_REVIEW_PUBLISH")}</Button><Button disabled={busy || terminal} variant="outline" aria-busy={busy && decisionState.kind === "pending" && decisionState.action === "request_changes"} onClick={() => onDecision?.("request_changes", "")}>{busy && decisionState.kind === "pending" && decisionState.action === "request_changes" ? frontendText(locale, "ADMIN_REVIEW_ACTION_PENDING") : frontendText(locale, "ADMIN_REVIEW_REQUEST_CHANGES")}</Button><Button disabled={busy || terminal} variant="destructive" aria-busy={busy && decisionState.kind === "pending" && decisionState.action === "reject"} onClick={() => onDecision?.("reject", "")}>{busy && decisionState.kind === "pending" && decisionState.action === "reject" ? frontendText(locale, "ADMIN_REVIEW_ACTION_PENDING") : frontendText(locale, "ADMIN_REVIEW_REJECT")}</Button></CardContent></Card></section>;
}
