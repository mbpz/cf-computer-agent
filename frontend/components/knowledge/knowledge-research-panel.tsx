import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import type { ResearchDraftTarget, ResearchRunView } from "../../lib/knowledge-derivatives-data";
import type { ItemResearchRunsController, ResearchActionName } from "../../lib/use-knowledge-derivatives";

const STATUS_KEYS: Record<ResearchRunView["status"], string> = {
  draft: "RESEARCH_STATUS_DRAFT",
  running: "RESEARCH_STATUS_RUNNING",
  paused: "RESEARCH_STATUS_PAUSED",
  completed: "RESEARCH_STATUS_COMPLETED",
  cancelled: "RESEARCH_STATUS_CANCELLED",
};

const SUBQUESTION_STATUS_KEYS: Record<"pending" | "completed" | "blocked", string> = {
  pending: "KNOWLEDGE_RESEARCH_SUBQUESTION_PENDING",
  completed: "KNOWLEDGE_RESEARCH_SUBQUESTION_COMPLETED",
  blocked: "KNOWLEDGE_RESEARCH_SUBQUESTION_BLOCKED",
};

const ACTION_KEYS: Record<ResearchActionName, string> = {
  start: "KNOWLEDGE_RESEARCH_ACTION_START",
  approve: "KNOWLEDGE_RESEARCH_ACTION_APPROVE",
  pause: "KNOWLEDGE_RESEARCH_ACTION_PAUSE",
  cancel: "KNOWLEDGE_RESEARCH_ACTION_CANCEL",
  query: "KNOWLEDGE_RESEARCH_ACTION_QUERY",
};

export interface DraftableReport { runId: string; reportId: string; title: string }

/**
 * Research-run lifecycle for one knowledge item.
 *
 * The list is workspace-wide and bounded on the server, so the panel says how
 * many runs it could see instead of implying it saw all of them. The draft step
 * is the only derivative write without an idempotency key: it is journalled
 * before it is sent, and an unconfirmed outcome is offered back as the same
 * request plus an explicit discard, never replayed on its own.
 */
export function KnowledgeResearchRunPanel(props: {
  locale?: LocaleRuntime;
  knowledgeItemId: string;
  research: ItemResearchRunsController;
  canCreateSubmission: boolean;
  /** The stored report this run produced, when the reader has generated one. */
  report: DraftableReport | null;
  draftTarget: ResearchDraftTarget;
}) {
  const { locale, knowledgeItemId, research, canCreateSubmission, report, draftTarget } = props;
  const [goal, setGoal] = useState("");
  const [completion, setCompletion] = useState("");
  const [steps, setSteps] = useState("");
  const [subquestions, setSubquestions] = useState("");
  const [startError, setStartError] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [queryRationale, setQueryRationale] = useState("");
  const [querySubquestionId, setQuerySubquestionId] = useState("");
  const [queryError, setQueryError] = useState(false);
  const list = research.list;
  const runs = list.kind === "ready" ? list.runs : [];
  const selected = runs.find((run) => run.id === research.selectedRunId) ?? null;
  const selectedReport = selected && report && report.runId === selected.id ? report : null;
  const querySubquestion = selected?.subquestions.find((item) => item.id === querySubquestionId) ?? selected?.subquestions[0];

  const submitStart = () => {
    const plan = {
      goal,
      completion: completion.split("\n").map((line) => line.trim()).filter((line) => line.length > 0),
      steps: steps.split("\n").map((line) => line.trim()).filter((line) => line.length > 0),
      subquestions: subquestions.split("\n").map((line) => line.trim()).filter((line) => line.length > 0),
    };
    if (!plan.goal.trim() || plan.completion.length === 0 || plan.steps.length === 0 || plan.subquestions.length === 0) {
      setStartError(true);
      return;
    }
    setStartError(false);
    research.start(plan);
  };
  const submitQuery = () => {
    if (!selected || !querySubquestion || !queryText.trim() || !queryRationale.trim()) {
      setQueryError(true);
      return;
    }
    setQueryError(false);
    research.appendQuery(selected.id, { subquestionId: querySubquestion.id, query: queryText, rationale: queryRationale });
  };

  return <Card data-reader-research="true" id="reader-research-panel">
    <CardHeader>
      <CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_RESEARCH_PANEL_TITLE")}</CardTitle>
      <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RESEARCH_PANEL_DESCRIPTION")}</p>
    </CardHeader>
    <CardContent className="space-y-4">
      {list.kind === "idle" && <div className="space-y-2">
        <p className="text-sm text-muted-foreground" data-research-unloaded="true">{frontendText(locale, "KNOWLEDGE_RESEARCH_UNLOADED")}</p>
        <Button type="button" size="sm" variant="outline" data-research-load="true" onClick={research.load}>{frontendText(locale, "KNOWLEDGE_RESEARCH_LOAD")}</Button>
      </div>}
      {list.kind === "loading" && <p role="status" className="text-sm text-muted-foreground" data-research-loading="true">{frontendText(locale, "KNOWLEDGE_RESEARCH_LOADING")}</p>}
      {(list.kind === "failed" || list.kind === "degraded") && <div data-research-unread={list.kind} className="space-y-2">
        <p role={list.kind === "degraded" ? "status" : "alert"} className={list.kind === "degraded" ? "text-sm" : "text-sm text-destructive"}>
          {frontendText(locale, list.kind === "degraded" ? "KNOWLEDGE_RESEARCH_DEGRADED" : "KNOWLEDGE_RESEARCH_UNREAD")} <code data-research-code={list.code}>{list.code}</code>
        </p>
        {list.message && <p className="text-xs text-muted-foreground">{list.message}</p>}
        <Button type="button" size="sm" variant="outline" data-research-retry="true" onClick={research.load}>{frontendText(locale, "KNOWLEDGE_RESEARCH_RETRY")}</Button>
      </div>}
      {list.kind === "ready" && <>
        {list.bounded && <p className="text-xs text-muted-foreground" data-research-bounded="true">{frontendText(locale, "KNOWLEDGE_RESEARCH_LIST_NOTE")}</p>}
        {runs.length === 0
          ? <p className="text-sm text-muted-foreground" data-research-empty="true">{frontendText(locale, "KNOWLEDGE_RESEARCH_EMPTY")}</p>
          : <ul className="space-y-2">{runs.map((run) => {
            const isSelected = run.id === research.selectedRunId;
            const pending = research.action?.runId === run.id;
            return <li key={run.id} data-research-run={run.id} data-research-status={run.status} className={isSelected ? "rounded-md border p-3 ring-1 ring-primary" : "rounded-md border p-3"}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{run.goal}</p>
                  <p className="text-xs text-muted-foreground">
                    {frontendText(locale, STATUS_KEYS[run.status])} · {run.quotaState === "deferred_quota"
                      ? frontendText(locale, "KNOWLEDGE_RESEARCH_QUOTA_DEFERRED").replace("{until}", run.quotaDeferredUntil ?? frontendText(locale, "COMMON_VALUE_UNAVAILABLE"))
                      : frontendText(locale, "KNOWLEDGE_RESEARCH_QUOTA_AVAILABLE")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RESEARCH_PROGRESS")} {run.subquestions.filter((item) => item.status === "completed").length}/{run.subquestions.length}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant={isSelected ? "default" : "outline"} aria-pressed={isSelected} data-research-select={run.id} onClick={() => research.selectRun(isSelected ? null : run.id)}>{frontendText(locale, "KNOWLEDGE_RESEARCH_SELECT")}</Button>
                  {(run.status === "draft" || run.status === "paused") && <Button type="button" size="sm" variant="outline" disabled={pending} data-research-approve={run.id} onClick={() => research.transition(run.id, "approve")}>{frontendText(locale, "KNOWLEDGE_RESEARCH_APPROVE")}</Button>}
                  {(run.status === "draft" || run.status === "running") && <Button type="button" size="sm" variant="outline" disabled={pending} data-research-pause={run.id} onClick={() => research.transition(run.id, "pause")}>{frontendText(locale, "KNOWLEDGE_RESEARCH_PAUSE")}</Button>}
                  {(run.status === "draft" || run.status === "running" || run.status === "paused") && <Button type="button" size="sm" variant="outline" disabled={pending} data-research-cancel={run.id} onClick={() => research.transition(run.id, "cancel")}>{frontendText(locale, "KNOWLEDGE_RESEARCH_CANCEL")}</Button>}
                </div>
              </div>
            </li>;
          })}</ul>}
        {research.action && <p role="status" className="text-sm text-muted-foreground" data-research-action={research.action.name}>
          {frontendText(locale, "KNOWLEDGE_RESEARCH_ACTION_RUNNING").replace("{action}", frontendText(locale, ACTION_KEYS[research.action.name]))}
        </p>}
        {research.actionError && <p role="alert" className="text-sm text-destructive" data-research-action-error={research.actionError.code}>
          {frontendText(locale, "KNOWLEDGE_RESEARCH_ACTION_FAILED").replace("{code}", research.actionError.code)}
          {research.actionError.message && <span className="block text-xs text-muted-foreground">{research.actionError.message}</span>}
        </p>}
        <ResearchDraftStatus locale={locale} research={research} />
        {selected && <section className="space-y-3 rounded-md border p-3" data-research-selected={selected.id}>
          <h3 className="text-sm font-semibold">{frontendText(locale, "KNOWLEDGE_RESEARCH_SELECTED")}</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">{selected.subquestions.map((item) => <li key={item.id} data-research-subquestion={item.status}>{item.question} · {frontendText(locale, SUBQUESTION_STATUS_KEYS[item.status])}</li>)}</ul>
          {research.queriesFor(selected.id).length > 0 && <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RESEARCH_QUERY_RECORDED")}</h4>
            <ul className="mt-1 space-y-1 text-xs" data-research-queries={selected.id}>{research.queriesFor(selected.id).map((query) => <li key={query.id} data-research-query={query.id}><span className="font-medium">{query.query}</span> — {query.rationale}</li>)}</ul>
          </div>}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{frontendText(locale, "KNOWLEDGE_RESEARCH_QUERY_TITLE")}</h4>
            <label className="block text-xs font-medium" htmlFor="research-query-subquestion">{frontendText(locale, "KNOWLEDGE_RESEARCH_QUERY_SUBQUESTION")}</label>
            <Select
              value={querySubquestion?.id ?? ""}
              onValueChange={(value) => setQuerySubquestionId(value)}
            >
              <SelectTrigger id="research-query-subquestion" data-research-query-subquestion="true"><SelectValue placeholder={selected.subquestions[0]?.question} /></SelectTrigger>
              <SelectContent>{selected.subquestions.map((item) => <SelectItem key={item.id} value={item.id}>{item.question}</SelectItem>)}</SelectContent>
            </Select>
            <label className="block text-xs font-medium" htmlFor="research-query-text">{frontendText(locale, "KNOWLEDGE_RESEARCH_QUERY_TEXT")}</label>
            <Input id="research-query-text" data-research-query-text="true" classNames={{ field: "h-9 rounded-md" }} value={queryText} onChange={setQueryText} />
            <label className="block text-xs font-medium" htmlFor="research-query-rationale">{frontendText(locale, "KNOWLEDGE_RESEARCH_QUERY_RATIONALE")}</label>
            <Input id="research-query-rationale" data-research-query-rationale="true" classNames={{ field: "h-9 rounded-md" }} value={queryRationale} onChange={setQueryRationale} />
            {queryError && <p role="alert" className="text-xs text-destructive" data-research-query-error="true">{frontendText(locale, "KNOWLEDGE_RESEARCH_QUERY_INVALID")}</p>}
            <Button type="button" size="sm" variant="outline" data-research-query-submit="true" disabled={research.action?.name === "query"} onClick={submitQuery}>{frontendText(locale, "KNOWLEDGE_RESEARCH_QUERY_SUBMIT")}</Button>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_ACTION")}</h4>
            <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_TARGET").replace("{space}", draftTarget.requestedSpaceId).replace("{visibility}", draftTarget.requestedVisibility)}</p>
            {!canCreateSubmission && <p className="text-xs text-muted-foreground" data-research-draft-blocked="capability">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_CAPABILITY")}</p>}
            {canCreateSubmission && !selectedReport && <p className="text-xs text-muted-foreground" data-research-draft-blocked="report">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_NEEDS_REPORT")}</p>}
            {canCreateSubmission && selectedReport && <Button
              type="button"
              size="sm"
              variant="outline"
              data-research-draft={selected.id}
              disabled={research.draft.kind === "pending"}
              onClick={() => research.createDraft(selected.id, { reportId: selectedReport.reportId, title: selectedReport.title }, draftTarget)}
            >{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_ACTION")}</Button>}
          </div>
        </section>}
      </>}
      <section className="space-y-2 rounded-md border p-3" data-research-start="true">
        <h3 className="text-sm font-semibold">{frontendText(locale, "KNOWLEDGE_RESEARCH_START_TITLE")}</h3>
        <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RESEARCH_START_SCOPE")}</p>
        <label className="block text-xs font-medium" htmlFor="research-goal">{frontendText(locale, "KNOWLEDGE_RESEARCH_START_GOAL")}</label>
        <Input id="research-goal" data-research-goal="true" classNames={{ field: "h-9 rounded-md" }} value={goal} onChange={setGoal} />
        <label className="block text-xs font-medium" htmlFor="research-completion">{frontendText(locale, "KNOWLEDGE_RESEARCH_START_COMPLETION")}</label>
        <Textarea id="research-completion" data-research-completion="true" value={completion} onChange={(event) => setCompletion(event.target.value)} />
        <label className="block text-xs font-medium" htmlFor="research-steps">{frontendText(locale, "KNOWLEDGE_RESEARCH_START_STEPS")}</label>
        <Textarea id="research-steps" data-research-steps="true" value={steps} onChange={(event) => setSteps(event.target.value)} />
        <label className="block text-xs font-medium" htmlFor="research-subquestions">{frontendText(locale, "KNOWLEDGE_RESEARCH_START_SUBQUESTIONS")}</label>
        <Textarea id="research-subquestions" data-research-subquestions="true" value={subquestions} onChange={(event) => setSubquestions(event.target.value)} />
        {startError && <p role="alert" className="text-xs text-destructive" data-research-start-error="true">{frontendText(locale, "KNOWLEDGE_RESEARCH_START_INVALID")}</p>}
        <Button type="button" size="sm" data-research-start-submit="true" disabled={research.action?.name === "start"} onClick={submitStart}>{frontendText(locale, "KNOWLEDGE_RESEARCH_START_SUBMIT")}</Button>
      </section>
      {/* The item is named so the panel never looks like a workspace-wide start. */}
      <p className="text-xs text-muted-foreground" data-research-item={knowledgeItemId}>{frontendText(locale, "KNOWLEDGE_RESEARCH_ITEM")} {knowledgeItemId}</p>
    </CardContent>
  </Card>;
}

function ResearchDraftStatus(props: { locale?: LocaleRuntime; research: ItemResearchRunsController }) {
  const { locale, research } = props;
  const draft = research.draft;
  if (draft.kind === "idle") return null;
  if (draft.kind === "pending") return <p role="status" className="text-sm text-muted-foreground" data-research-draft-status="pending">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_PENDING")}</p>;
  if (draft.kind === "blocked") return <p role="alert" className="text-sm text-destructive" data-research-draft-status="blocked">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_CAPABILITY")}</p>;
  if (draft.kind === "storage-blocked") return <div className="space-y-2" data-research-draft-status="storage-blocked" data-research-draft-code={draft.code}>
    <p role="alert" className="text-sm text-destructive">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_STORAGE")} <code>{draft.code}</code></p>
    <Button type="button" size="sm" variant="outline" data-research-draft-discard="true" onClick={research.discardDraft}>{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_DISCARD")}</Button>
  </div>;
  if (draft.kind === "ready") return <div className="space-y-2" data-research-draft-status="ready" data-research-draft-id={draft.receipt.id}>
    <p className="text-sm">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_READY").replace("{title}", draft.receipt.title)}</p>
    {draft.composer === "loaded"
      ? <a className="text-sm text-primary underline-offset-4 hover:underline" data-research-draft-open="true" href="/submit">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_READY_OPEN")}</a>
      : <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive" data-research-draft-composer-blocked={draft.composer.blocked}>
          {frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_COMPOSER_BLOCKED").replace("{id}", draft.receipt.id).replace("{code}", draft.composer.blocked)}
        </p>
        <Button type="button" size="sm" variant="outline" data-research-draft-composer-retry="true" onClick={research.retryComposerHandOff}>{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_COMPOSER_RETRY")}</Button>
      </div>}
  </div>;
  const unconfirmed = draft.kind === "unconfirmed";
  return <div className="space-y-2" data-research-draft-status={unconfirmed ? "unconfirmed" : "failed"} data-research-draft-report={draft.reportId}>
    <p role={unconfirmed ? "status" : "alert"} className={unconfirmed ? "text-sm" : "text-sm text-destructive"}>
      {unconfirmed
        ? frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_UNCONFIRMED")
        : frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_FAILED").replace("{code}", draft.failure.code)}
    </p>
    {!unconfirmed && draft.failure.message && <p className="text-xs text-muted-foreground">{draft.failure.message}</p>}
    {unconfirmed && <p className="text-xs text-muted-foreground" data-research-draft-warning="true">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_UNCONFIRMED_WARNING")}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" data-research-draft-retry="true" onClick={research.retryDraft}>{frontendText(locale, unconfirmed ? "KNOWLEDGE_RESEARCH_DRAFT_UNCONFIRMED_RETRY" : "KNOWLEDGE_RESEARCH_DRAFT_RETRY")}</Button>
      <Button type="button" size="sm" variant="ghost" data-research-draft-discard="true" onClick={research.discardDraft}>{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_DISCARD")}</Button>
    </div>
    <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_DISCARD_IMPACT")}</p>
  </div>;
}
