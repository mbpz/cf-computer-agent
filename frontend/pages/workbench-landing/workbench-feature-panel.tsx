import { ArrowLeft, ArrowRight, Check, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type Dispatch } from "react";
import { Button } from "../../components/motion/button/base";
import { Card } from "../../components/ui/card";
import { Sheet, SheetContent } from "../../components/ui/sheet";
import type { LocaleRuntime } from "../../lib/i18n";
import { landingText, type LandingCopyKey } from "./workbench-copy";
import { demoContent } from "./workbench-demo-data";
import type { DemoEvent, DemoState, FeatureId } from "./workbench-demo-state";

const featureCopy: Record<FeatureId, { title: LandingCopyKey; description: LandingCopyKey }> = {
  capture: { title: "CAPTURE_TITLE", description: "CAPTURE_DESCRIPTION" },
  library: { title: "LIBRARY_TITLE", description: "LIBRARY_DESCRIPTION" },
  answer: { title: "ANSWER_TITLE", description: "ANSWER_DESCRIPTION" },
  action: { title: "ACTION_TITLE", description: "ACTION_DESCRIPTION" },
  updates: { title: "UPDATES_TITLE", description: "UPDATES_DESCRIPTION" },
};

// The panel body owns the prose rhythm: the copy inside a feature is untagged
// data, so headings and paragraphs are styled from their parent, not per node.
const panelBody = "workbench-feature-panel-body [&_h2]:mt-0 [&_h2]:mb-4 [&_h3]:my-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-6 [&_p]:my-3 [&_button:not([data-demo-action=close])]:h-auto [&_button:not([data-demo-action=close])]:whitespace-normal [&_button:not([data-demo-action=close])]:text-pretty";
const mutedText = "text-[.9375rem] text-muted-foreground";
const demoBadge = "text-[.8125rem] font-[550] text-primary";
const panelContent = "mt-6";
const sampleCard = "my-4 p-[1.125rem] shadow-none";
// The citation rail keeps its accent border in the stylesheet: `globals.css`
// applies `* { border-color: var(--border) }` unlayered, which outranks every
// `border-*` utility, so only a plain rule (or `!`) can paint another colour.
const sourceArticle = "workbench-source text-[.9375rem] [overflow-wrap:anywhere] [&_mark]:bg-accent [&_mark]:text-accent-foreground [&_mark]:box-decoration-clone [&_mark]:[-webkit-box-decoration-break:clone]";

export function WorkbenchFeaturePanel({ locale, state, dispatch }: {
  locale: LocaleRuntime; state: DemoState; dispatch: Dispatch<DemoEvent>;
}) {
  useSyncExternalStore(locale.subscribe, () => locale.locale, () => locale.locale);
  const text = (key: LandingCopyKey) => landingText(locale, key);
  const content = demoContent(locale.locale);
  const active = state.activeFeature !== null;
  const close = useCallback(() => dispatch({ type: "close" }), [dispatch]);
  // The sheet adapter arms the focus scope (initial focus, Tab trap, restore)
  // on its own wrapper; this ref only anchors the manual recovery and the
  // citation trigger lookup.
  const focusRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const citationHeading = useRef<HTMLHeadingElement>(null);
  const previousCitation = useRef<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState<string | null>(null);
  const [answerVisible, setAnswerVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    const landing = focusRef.current?.closest("[data-workbench-landing]");
    const feature = state.activeFeature;
    return () => {
      // The shared scope restores surviving triggers first. Page Next/Replay
      // unmount on opening; recover only if dismissal otherwise strands focus.
      if (focusRef.current || !landing?.isConnected || document.activeElement !== document.body) return;
      const target = landing.querySelector<HTMLButtonElement>(`button[data-feature="${feature}"]:not([disabled])`)
        ?? landing.querySelector<HTMLButtonElement>('button[data-demo-action="start"]:not([disabled])');
      target?.focus();
    };
  }, [active, state.activeFeature, focusRef]);

  useEffect(() => {
    setSourceOpen(null);
    setAnswerVisible(false);
  }, [state.activeFeature]);

  useEffect(() => {
    if (state.citationId) {
      previousCitation.current = state.citationId;
      citationHeading.current?.focus();
    } else if (previousCitation.current) {
      const citationId = previousCitation.current;
      previousCitation.current = null;
      // Compare IDs as data, rather than interpolating them into a CSS selector.
      const trigger = Array.from(focusRef.current?.querySelectorAll<HTMLButtonElement>("button[data-citation-id]") ?? [])
        .find(button => button.dataset.citationId === citationId);
      trigger?.focus();
    }
  }, [state.citationId, focusRef]);

  if (!state.activeFeature) return null;
  const feature = state.activeFeature;
  const labels = featureCopy[feature];
  const citation = content.citations.find(item => item.id === state.citationId);
  const source = citation && content.sources.find(item => item.id === citation.sourceId);
  const showingCitation = Boolean(citation && source);
  const gated = (state.step === "capture" && !state.captured) || (state.step === "action" && !state.taskDone);
  const gateText = state.step === "capture" ? "CAPTURE_GATE" : "ACTION_GATE";

  return <Sheet open={active} onOpenChange={open => { if (!open) close(); }}>
    <SheetContent side="right" ariaLabel={text("GUIDE_LABEL")} className="workbench-feature-panel"
      backdropClassName="workbench-landing-overlay">
    <div ref={focusRef} className={panelBody} tabIndex={-1}
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <header className="mb-6 flex items-start justify-between gap-4 [&>p]:mt-2 [&>button]:shrink-0">
        <p className={demoBadge}>{text("DEMO_BADGE")}</p>
        <Button variant="ghost" size="icon" data-demo-action="close" aria-label={text("CLOSE_PANEL")} onClick={close}>
          <X size={20} aria-hidden="true" />
        </Button>
      </header>
      {showingCitation && source && citation ? <>
        <Button variant="ghost" className="mb-4 px-0" data-demo-action="citation-back" onClick={() => dispatch({ type: "citation-back" })}>
          <ArrowLeft size={16} aria-hidden="true" />{text("BACK_TO_ANSWER")}
        </Button>
        <h2 id={`${id}-title`} ref={citationHeading} data-citation-heading tabIndex={-1}>{source.title}</h2>
        <p id={`${id}-description`} className={mutedText}>{text("PARAGRAPH_LABEL")}: {citation.paragraphId}</p>
        <article className={sourceArticle} data-source-id={source.id}>
          {source.paragraphs.map(paragraph => <p key={paragraph.id} data-paragraph-id={paragraph.id}
            data-cited={paragraph.id === citation.paragraphId || undefined}>
            {paragraph.id === citation.paragraphId ? <mark>{paragraph.text}</mark> : paragraph.text}
          </p>)}
        </article>
      </> : <>
        <h2 id={`${id}-title`}>{text(labels.title)}</h2>
        <p id={`${id}-description`} className={mutedText}>{text(labels.description)}</p>

        {feature === "capture" && <div className={panelContent}>
          <Card className={sampleCard}>
            <h3>{content.sources[0].title}</h3>
            <p>{content.sources[0].paragraphs[0].text}</p>
            <Button data-demo-action="capture" disabled={state.captured} onClick={() => dispatch({ type: "capture" })}>
              {state.captured && <Check size={18} aria-hidden="true" />}{text(state.captured ? "CAPTURE_DONE" : "CAPTURE_SELECT")}
            </Button>
          </Card>
          <p role="status" className={mutedText}>{text(state.captured ? "CAPTURE_DONE" : "CAPTURE_PENDING")}</p>
        </div>}

        {feature === "library" && <div className={panelContent}>
          <p>{text("LIBRARY_SUMMARY")}</p>
          <p className={mutedText}>{text("LIBRARY_REVIEW")}</p>
          {content.sources.map(item => <Card key={item.id} className={sampleCard}>
            <p className={mutedText}>{text("LIBRARY_PUBLISHED")}</p><h3>{item.title}</h3>
            <Button variant="outline" data-demo-action="open-source" data-source-id={item.id}
              aria-expanded={sourceOpen === item.id} aria-controls={`${id}-${item.id}`}
              onClick={() => setSourceOpen(sourceOpen === item.id ? null : item.id)}>{text("OPEN_SOURCE")}</Button>
            {sourceOpen === item.id && <article id={`${id}-${item.id}`} className={sourceArticle} data-source-id={item.id}>
              {item.paragraphs.map(paragraph => <p key={paragraph.id} data-paragraph-id={paragraph.id}>{paragraph.text}</p>)}
            </article>}
          </Card>)}
        </div>}

        {feature === "answer" && <div className={panelContent}>
          <Card className={sampleCard}>
            <p className={mutedText}>{text("QUESTION_LABEL")}</p><h3>{content.question}</h3>
            <Button variant="outline" data-demo-action="show-answer" aria-expanded={answerVisible}
              aria-controls={`${id}-answer`} onClick={() => setAnswerVisible(true)}>{text("ANSWER_SHOW")}</Button>
          </Card>
          {answerVisible && <div id={`${id}-answer`}>
            <h3>{text("ANSWER_LABEL")}</h3><p>{content.answer}</p>
            <h3>{text("CITATIONS_LABEL")}</h3><p className={mutedText}>{text("ANSWER_CITATION_HINT")}</p>
            <div className="grid gap-2.5 [&_button]:justify-between [&_button]:text-left">{content.citations.map(item => <Button key={item.id} variant="outline"
              data-citation-id={item.id} onClick={() => dispatch({ type: "citation", id: item.id })}>
              {text("SOURCE_LABEL")}: {content.sources.find(document => document.id === item.sourceId)?.title}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>)}</div>
          </div>}
        </div>}

        {feature === "action" && <div className={panelContent}>
          <Card className={sampleCard} data-task-done={state.taskDone}>
            <p className={mutedText}>{text("TASK_LABEL")}</p><h3>{content.taskTitle}</h3>
            <p role="status" className="font-semibold text-primary">{text(state.taskDone ? "ACTION_DONE" : "ACTION_TODO")}</p>
            <Button data-demo-action="complete-task" disabled={state.taskDone} onClick={() => dispatch({ type: "complete-task" })}>
              <Check size={18} aria-hidden="true" />{text("ACTION_COMPLETE")}
            </Button>
          </Card>
        </div>}

        {feature === "updates" && <div className={panelContent}>
          <h3>{text("UPDATES_NOTIFICATION")}</h3><p>{content.notification}</p>
          <h3>{text("UPDATES_DISCUSSION")}</h3><p>{content.discussion}</p>
        </div>}

        {state.step === feature && <footer className="mt-6 border-t border-border pt-4">
          {gated && <p id={`${id}-gate`} className={mutedText}>{text(gateText)}</p>}
          <Button data-demo-action="next" disabled={gated} aria-describedby={gated ? `${id}-gate` : undefined}
            onClick={() => dispatch({ type: "next" })}>{text("NEXT")}<ArrowRight size={18} aria-hidden="true" /></Button>
        </footer>}
      </>}
    </div>
    </SheetContent>
  </Sheet>;
}
