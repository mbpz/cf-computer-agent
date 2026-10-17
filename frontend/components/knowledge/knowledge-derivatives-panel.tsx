import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleIndicator, CollapsibleTrigger } from "../motion/collapsible";
import { BouncyAccordion } from "../motion/bouncy-accordion";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import {
  EVIDENCE_INSUFFICIENT_MESSAGE_KEY,
  KNOWLEDGE_ARTIFACT_KINDS,
  artifactMessageKey,
  type DerivativeCitation,
  type DerivativeStatement,
  type KnowledgeArtifactKind,
  type KnowledgeDerivative,
} from "../../lib/knowledge-derivatives-data";
import type { DerivativeState, KnowledgeDerivativesController } from "../../lib/use-knowledge-derivatives";

const LABEL_KEYS: Record<KnowledgeArtifactKind, string> = {
  summary: "KNOWLEDGE_DERIVATIVE_SUMMARY",
  faq: "KNOWLEDGE_DERIVATIVE_FAQ",
  timeline: "KNOWLEDGE_DERIVATIVE_TIMELINE",
  brief: "KNOWLEDGE_DERIVATIVE_BRIEF",
  comparison: "KNOWLEDGE_DERIVATIVE_COMPARISON",
  mindmap: "KNOWLEDGE_DERIVATIVE_MINDMAP",
  report: "KNOWLEDGE_DERIVATIVE_REPORT",
  flashcards: "KNOWLEDGE_DERIVATIVE_FLASHCARDS",
  quiz: "KNOWLEDGE_DERIVATIVE_QUIZ",
};

export function derivativeLabel(kind: KnowledgeArtifactKind, locale?: LocaleRuntime): string {
  return frontendText(locale, LABEL_KEYS[kind]);
}

/**
 * Generation surface for the current revision.
 *
 * One page action stays primary: the article itself is never replaced, hidden,
 * or blocked while a generation runs — the panel reports which artifact is
 * running and renders only what the server returned. A result can be closed
 * without touching the article, and every failure (server code, quota
 * deferral, temporarily unavailable backend, or a client-side precondition) is
 * a distinct, textual state with its own recovery action.
 */
export function KnowledgeDerivativesPanel(props: {
  locale?: LocaleRuntime;
  knowledgeItemId: string;
  derivatives: KnowledgeDerivativesController;
  /** The selected run, when it is running: the only state the report surface accepts. */
  runningRunId: string | null;
  renderMarkdown: (markdown: string) => ReactNode;
}) {
  const { locale, knowledgeItemId, derivatives, runningRunId, renderMarkdown } = props;
  const activeKind = derivatives.activeKind;
  const activeState: DerivativeState = activeKind ? derivatives.stateFor(activeKind) : { kind: "idle" };
  return <Card data-reader-derivatives="true">
    <CardHeader>
      <CardTitle className="text-base">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_TITLE")}</CardTitle>
      <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_DESCRIPTION")}</p>
      <p className="text-xs text-muted-foreground" data-derivative-scope={derivatives.sourceCount}>
        {derivatives.canGenerate
          ? frontendText(locale, "KNOWLEDGE_DERIVATIVES_SOURCES").replace("{count}", String(derivatives.sourceCount))
          : frontendText(locale, "KNOWLEDGE_DERIVATIVES_NO_SOURCES")}
      </p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div role="group" aria-label={frontendText(locale, "KNOWLEDGE_DERIVATIVES_ACTIONS")} className="flex flex-wrap gap-2">
        {KNOWLEDGE_ARTIFACT_KINDS.map((kind) => {
          const state = derivatives.stateFor(kind);
          const generating = state.kind === "generating";
          return <Button
            key={kind}
            type="button"
            size="sm"
            data-derivative-action={kind}
            data-derivative-state={state.kind}
            aria-busy={generating}
            aria-pressed={activeKind === kind}
            variant={activeKind === kind ? "default" : "outline"}
            disabled={!derivatives.canGenerate}
            onClick={() => derivatives.generate(kind, kind === "report" ? runningRunId ?? undefined : undefined)}
          >{generating ? frontendText(locale, "KNOWLEDGE_DERIVATIVES_GENERATING") : derivativeLabel(kind, locale)}</Button>;
        })}
      </div>
      {/* The report is bound to a research run on the server: saying so here is
          cheaper than a request that can only be refused. */}
      {activeKind !== null && activeState.kind === "blocked" && <p className="text-sm text-muted-foreground" data-derivative-blocked={activeState.reason}>
        {activeState.reason === "missing-run"
          ? <>{frontendText(locale, "KNOWLEDGE_DERIVATIVES_NEEDS_RUN")}{" "}<a className="text-primary underline-offset-4 hover:underline" href="#reader-research-panel">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_OPEN_RESEARCH")}</a></>
          : frontendText(locale, "KNOWLEDGE_DERIVATIVES_NO_SOURCES")}
      </p>}
      {activeKind !== null && activeState.kind !== "idle" && activeState.kind !== "blocked"
        ? <DerivativeResult locale={locale} knowledgeItemId={knowledgeItemId} kind={activeKind} state={activeState} renderMarkdown={renderMarkdown} onGenerate={() => derivatives.generate(activeKind, activeKind === "report" ? runningRunId ?? undefined : undefined)} onClose={derivatives.dismiss} />
        : <p className="text-sm text-muted-foreground" data-derivative-idle>{frontendText(locale, "KNOWLEDGE_DERIVATIVES_IDLE")}</p>}
    </CardContent>
  </Card>;
}

function DerivativeResult(props: {
  locale?: LocaleRuntime;
  knowledgeItemId: string;
  kind: KnowledgeArtifactKind;
  state: DerivativeState;
  renderMarkdown: (markdown: string) => ReactNode;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const { locale, knowledgeItemId, kind, state, renderMarkdown, onGenerate, onClose } = props;
  const label = derivativeLabel(kind, locale);
  const close = <Button type="button" size="sm" variant="ghost" data-derivative-close={kind} onClick={onClose}>{frontendText(locale, "KNOWLEDGE_DERIVATIVES_CLOSE")}</Button>;
  if (state.kind === "generating") {
    return <div className="rounded-md border p-4" data-derivative-panel={kind} data-derivative-status="generating">
      <p role="status" aria-live="polite" className="text-sm">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_RUNNING").replace("{artifact}", label)}</p>
      <div className="mt-2">{close}</div>
    </div>;
  }
  if (state.kind === "empty") {
    const insufficient = state.messageKey === EVIDENCE_INSUFFICIENT_MESSAGE_KEY;
    return <div className="rounded-md border p-4" data-derivative-panel={kind} data-derivative-status="empty">
      <p className="text-sm">{frontendText(locale, insufficient ? "KNOWLEDGE_DERIVATIVES_INSUFFICIENT" : "KNOWLEDGE_DERIVATIVES_EMPTY")}</p>
      {state.messageKey && <p className="mt-1 text-xs text-muted-foreground"><code data-derivative-message-key>{state.messageKey}</code></p>}
      <div className="mt-2 flex gap-2"><Button type="button" size="sm" variant="outline" data-derivative-retry={kind} onClick={onGenerate}>{frontendText(locale, "KNOWLEDGE_DERIVATIVES_RETRY").replace("{artifact}", label)}</Button>{close}</div>
    </div>;
  }
  if (state.kind === "failed" || state.kind === "unavailable") {
    const unavailable = state.kind === "unavailable";
    return <div className="rounded-md border p-4" data-derivative-panel={kind} data-derivative-status={unavailable ? `unavailable-${state.reason}` : "failed"} data-derivative-code={state.code}>
      <p role={unavailable ? "status" : "alert"} className={unavailable ? "text-sm" : "text-sm text-destructive"}>
        {unavailable
          ? frontendText(locale, state.reason === "quota" ? "KNOWLEDGE_DERIVATIVES_QUOTA" : "KNOWLEDGE_DERIVATIVES_DEGRADED")
          : frontendText(locale, "KNOWLEDGE_DERIVATIVES_FAILED").replace("{artifact}", label).replace("{code}", state.code)}
      </p>
      {state.message && <p className="mt-1 text-xs text-muted-foreground">{state.message}</p>}
      <div className="mt-2 flex gap-2"><Button type="button" size="sm" variant="outline" data-derivative-retry={kind} onClick={onGenerate}>{frontendText(locale, "KNOWLEDGE_DERIVATIVES_RETRY").replace("{artifact}", label)}</Button>{close}</div>
    </div>;
  }
  if (state.kind !== "ready") return null;
  const artifact = state.artifact;
  return <div className="rounded-md border p-4" data-derivative-panel={kind} data-derivative-status="ready" data-derivative-artifact={artifact.kind}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_READY")}</p>
      </div>
      {close}
    </div>
    {artifactMessageKey(artifact) && <p className="mt-2 text-xs text-muted-foreground"><code data-derivative-message-key>{artifactMessageKey(artifact)}</code></p>}
    <div className="mt-3 space-y-3">
      <ArtifactBody locale={locale} knowledgeItemId={knowledgeItemId} artifact={artifact} renderMarkdown={renderMarkdown} />
    </div>
  </div>;
}

function Citations(props: { locale?: LocaleRuntime; knowledgeItemId: string; citations: readonly DerivativeCitation[] }) {
  const { locale, knowledgeItemId, citations } = props;
  if (citations.length === 0) return null;
  return <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label={frontendText(locale, "KNOWLEDGE_DERIVATIVES_CITATIONS")} data-derivative-citations="true">
    {citations.map((citation) => <li key={citation.citationId}>
      <a
        className="text-primary underline-offset-4 hover:underline"
        href={`/knowledge/${encodeURIComponent(knowledgeItemId)}#${encodeURIComponent(citation.citationId)}`}
        data-derivative-citation={citation.citationId}
      >{citation.title.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}<span className="text-muted-foreground"> · {frontendText(locale, "KNOWLEDGE_READER_SOURCE_LINES")} {citation.startLine}–{citation.endLine}</span></a>
    </li>)}
  </ul>;
}

function Statements(props: { locale?: LocaleRuntime; knowledgeItemId: string; heading: string; statements: readonly DerivativeStatement[] }) {
  const { locale, knowledgeItemId, heading, statements } = props;
  if (statements.length === 0) return null;
  return <section>
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</h4>
    <ul className="mt-1 space-y-2">
      {statements.map((statement, index) => <li key={index} className="text-sm">
        <p className="whitespace-pre-wrap">{statement.text}</p>
        <Citations locale={locale} knowledgeItemId={knowledgeItemId} citations={statement.citations} />
      </li>)}
    </ul>
  </section>;
}

/** Every body of server prose goes through the reader's own safe markdown surface. */
function Prose(props: { renderMarkdown: (markdown: string) => ReactNode; text: string }) {
  return <div className="prose prose-slate max-w-none text-sm leading-7">{props.renderMarkdown(props.text)}</div>;
}

function ArtifactBody(props: {
  locale?: LocaleRuntime;
  knowledgeItemId: string;
  artifact: KnowledgeDerivative;
  renderMarkdown: (markdown: string) => ReactNode;
}) {
  const { locale, knowledgeItemId, artifact, renderMarkdown } = props;
  const citationsOf = (items: readonly DerivativeCitation[]) => <Citations locale={locale} knowledgeItemId={knowledgeItemId} citations={items} />;
  switch (artifact.kind) {
    case "summary":
      return <>
        <Prose renderMarkdown={renderMarkdown} text={artifact.summary} />
        {citationsOf(artifact.citations)}
      </>;
    case "faq":
      // beUI's `bouncy-accordion` (slug: bouncy-accordion) carries the FAQ
      // entries. `data-faq-item` moves to each row wrapper through the payload's
      // `attributes` slot, and the answer (gap copy or markdown prose plus
      // citations) is the row description. The previous `<dl>` term/definition
      // pairing is expressed by the trigger naming its content section via
      // `aria-labelledby`; the definition-list element itself is gone.
      return <BouncyAccordion
        className="space-y-3"
        items={artifact.items.map((item, index) => ({
          id: `faq-${index}`,
          title: item.question,
          attributes: { "data-faq-item": item.gap ? "gap" : "answered" },
          description: <>
            {item.answer === null || item.answer.trim().length === 0
              ? <p className="text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_FAQ_GAP")}</p>
              : <Prose renderMarkdown={renderMarkdown} text={item.answer} />}
            {citationsOf(item.citations)}
          </>,
        }))}
      />;
    case "timeline":
      return <>
        {artifact.sortStatus === "unsorted" && <p className="text-xs text-muted-foreground" data-derivative-unsorted="true">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_UNSORTED")}</p>}
        <ol className="space-y-3">
          {artifact.events.map((event, index) => <li key={index} className="border-l pl-3">
            <Collapsible defaultOpen>
              <CollapsibleTrigger>
                <span className="text-xs font-medium text-muted-foreground">{event.date ?? frontendText(locale, "KNOWLEDGE_DERIVATIVES_DATE_UNKNOWN")}</span>
                <span className="text-sm font-medium">{event.title}</span>
                <CollapsibleIndicator />
              </CollapsibleTrigger>
              <CollapsibleContent contentClassName="px-3 pb-2">
                <p className="text-sm whitespace-pre-wrap">{event.description}</p>
                {citationsOf(event.citations)}
              </CollapsibleContent>
            </Collapsible>
          </li>)}
        </ol>
      </>;
    case "brief":
      return <>
        {artifact.goal && <Statements locale={locale} knowledgeItemId={knowledgeItemId} heading={frontendText(locale, "KNOWLEDGE_DERIVATIVES_BRIEF_GOAL")} statements={[artifact.goal]} />}
        <Statements locale={locale} knowledgeItemId={knowledgeItemId} heading={frontendText(locale, "KNOWLEDGE_DERIVATIVES_BRIEF_KEY_POINTS")} statements={artifact.keyPoints} />
        <Statements locale={locale} knowledgeItemId={knowledgeItemId} heading={frontendText(locale, "KNOWLEDGE_DERIVATIVES_BRIEF_RISKS")} statements={artifact.risks} />
        <Statements locale={locale} knowledgeItemId={knowledgeItemId} heading={frontendText(locale, "KNOWLEDGE_DERIVATIVES_BRIEF_OPEN_QUESTIONS")} statements={artifact.openQuestions} />
      </>;
    case "comparison":
      return <>
        <table className="w-full text-sm">
          <thead><tr>
            <th scope="col" className="text-left text-xs uppercase tracking-wide text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_COMPARISON_TOPIC")}</th>
            <th scope="col" className="text-left text-xs uppercase tracking-wide text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_COMPARISON_CELLS")}</th>
          </tr></thead>
          <tbody>
            {artifact.rows.map((row) => <tr key={row.topic} className="border-t align-top">
              <th scope="row" className="py-2 pr-3 text-left font-medium">{row.topic}</th>
              <td className="py-2">
                {row.cells.map((cell) => <div key={cell.sourceId} className="mb-2">
                  <p className="whitespace-pre-wrap">{cell.text}</p>
                  <p className="text-xs text-muted-foreground">{cell.sourceId}</p>
                  {citationsOf(cell.citations)}
                </div>)}
              </td>
            </tr>)}
          </tbody>
        </table>
        <Statements locale={locale} knowledgeItemId={knowledgeItemId} heading={frontendText(locale, "KNOWLEDGE_DERIVATIVES_CONSENSUS")} statements={artifact.consensus} />
        <Statements locale={locale} knowledgeItemId={knowledgeItemId} heading={frontendText(locale, "KNOWLEDGE_DERIVATIVES_CONFLICTS")} statements={artifact.conflicts} />
      </>;
    case "mindmap":
      return <>
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_MINDMAP_NODES")}</h4>
          <ul className="mt-1 space-y-2">
            {artifact.nodes.map((node) => <li key={node.id} className="text-sm">
              <span className="font-medium">{node.label}</span>
              {citationsOf(node.citations)}
            </li>)}
          </ul>
        </section>
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_MINDMAP_EDGES")}</h4>
          <ul className="mt-1 space-y-2">
            {artifact.edges.map((edge, index) => {
              const from = artifact.nodes.find((node) => node.id === edge.from);
              const to = artifact.nodes.find((node) => node.id === edge.to);
              return <li key={index} className="text-sm">
                <span className="font-medium">{from?.label ?? edge.from} → {to?.label ?? edge.to}</span>
                <span className="text-muted-foreground"> · {edge.relation}</span>
                {citationsOf(edge.citations)}
              </li>;
            })}
          </ul>
        </section>
      </>;
    case "report":
      return <>
        <p className="text-xs text-muted-foreground" data-derivative-report={artifact.reportId ?? "unsaved"}>
          {artifact.version === undefined ? null : `${frontendText(locale, "KNOWLEDGE_DERIVATIVES_REPORT_VERSION").replace("{version}", String(artifact.version))} · `}
          {frontendText(locale, "KNOWLEDGE_DERIVATIVES_REPORT_RUN").replace("{runId}", artifact.researchRunId)}
        </p>
        <h4 className="text-base font-semibold">{artifact.title.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}</h4>
        {artifact.sections.map((section, index) => <section key={index}>
          <h5 className="text-sm font-semibold">{section.heading}</h5>
          <Prose renderMarkdown={renderMarkdown} text={section.body} />
          {citationsOf(section.citations)}
        </section>)}
        <Citations locale={locale} knowledgeItemId={knowledgeItemId} citations={artifact.sourceSnapshots} />
      </>;
    case "flashcards":
      return <ul className="space-y-3">
        {artifact.cards.map((card, index) => <li key={index} className="rounded-md border p-3">
          <p className="text-sm font-medium">{card.question}</p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{card.answer}</p>
          {citationsOf(card.citations)}
        </li>)}
      </ul>;
    case "quiz":
      return <ol className="space-y-4">
        {artifact.questions.map((question) => <li key={question.id} data-quiz-question={question.id}>
          <p className="text-sm font-medium">{question.prompt}</p>
          <ol className="mt-1 space-y-1 text-sm">
            {question.options.map((option, index) => <li key={index} data-quiz-option={question.answerIndex === index ? "answer" : "distractor"} className={question.answerIndex === index ? "font-medium" : undefined}>
              {option}
              {question.answerIndex === index && <span className="ml-2 text-xs">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_QUIZ_ANSWER")}</span>}
            </li>)}
          </ol>
          {question.answerIndex === null
            ? <p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_DERIVATIVES_QUIZ_SKIP")}</p>
            : question.explanation.trim().length > 0 ? <Prose renderMarkdown={renderMarkdown} text={question.explanation} /> : null}
          {citationsOf(question.explanationCitations)}
        </li>)}
      </ol>;
  }
}
