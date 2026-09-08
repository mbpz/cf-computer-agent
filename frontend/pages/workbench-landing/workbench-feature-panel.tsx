import { ArrowLeft, ArrowRight, Check, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type Dispatch } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { useFocusScope } from "../../components/ui/focus-scope";
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

export function WorkbenchFeaturePanel({ locale, state, dispatch }: {
  locale: LocaleRuntime; state: DemoState; dispatch: Dispatch<DemoEvent>;
}) {
  useSyncExternalStore(locale.subscribe, () => locale.locale, () => locale.locale);
  const text = (key: LandingCopyKey) => landingText(locale, key);
  const content = demoContent(locale.locale);
  const active = state.activeFeature !== null;
  const close = useCallback(() => dispatch({ type: "close" }), [dispatch]);
  const focusRef = useFocusScope(active, close);
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
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [active]);

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

  return <div className="workbench-landing-overlay" data-landing-overlay onClick={event => {
    if (event.target === event.currentTarget) close();
  }}>
    <div ref={focusRef} className="workbench-feature-panel" role="dialog" aria-modal="true"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}>
      <header className="workbench-panel-header">
        <p className="workbench-demo-badge">{text("DEMO_BADGE")}</p>
        <Button variant="ghost" size="icon" data-demo-action="close" aria-label={text("CLOSE_PANEL")} onClick={close}>
          <X size={20} aria-hidden="true" />
        </Button>
      </header>
      {showingCitation && source && citation ? <>
        <Button variant="ghost" className="workbench-back" data-demo-action="citation-back" onClick={() => dispatch({ type: "citation-back" })}>
          <ArrowLeft size={16} aria-hidden="true" />{text("BACK_TO_ANSWER")}
        </Button>
        <h2 id={`${id}-title`} ref={citationHeading} data-citation-heading tabIndex={-1}>{source.title}</h2>
        <p id={`${id}-description`} className="workbench-muted">{text("PARAGRAPH_LABEL")}: {citation.paragraphId}</p>
        <article className="workbench-source" data-source-id={source.id}>
          {source.paragraphs.map(paragraph => <p key={paragraph.id} data-paragraph-id={paragraph.id}
            data-cited={paragraph.id === citation.paragraphId || undefined}>
            {paragraph.id === citation.paragraphId ? <mark>{paragraph.text}</mark> : paragraph.text}
          </p>)}
        </article>
      </> : <>
        <h2 id={`${id}-title`}>{text(labels.title)}</h2>
        <p id={`${id}-description`} className="workbench-muted">{text(labels.description)}</p>

        {feature === "capture" && <div className="workbench-panel-content">
          <Card className="workbench-sample-card">
            <h3>{content.sources[0].title}</h3>
            <p>{content.sources[0].paragraphs[0].text}</p>
            <Button data-demo-action="capture" disabled={state.captured} onClick={() => dispatch({ type: "capture" })}>
              {state.captured && <Check size={18} aria-hidden="true" />}{text(state.captured ? "CAPTURE_DONE" : "CAPTURE_SELECT")}
            </Button>
          </Card>
          <p role="status" className="workbench-muted">{text(state.captured ? "CAPTURE_DONE" : "CAPTURE_PENDING")}</p>
        </div>}

        {feature === "library" && <div className="workbench-panel-content">
          <p>{text("LIBRARY_SUMMARY")}</p>
          <p className="workbench-muted">{text("LIBRARY_REVIEW")}</p>
          {content.sources.map(item => <Card key={item.id} className="workbench-sample-card">
            <p className="workbench-muted">{text("LIBRARY_PUBLISHED")}</p><h3>{item.title}</h3>
            <Button variant="outline" data-demo-action="open-source" data-source-id={item.id}
              aria-expanded={sourceOpen === item.id} aria-controls={`${id}-${item.id}`}
              onClick={() => setSourceOpen(sourceOpen === item.id ? null : item.id)}>{text("OPEN_SOURCE")}</Button>
            {sourceOpen === item.id && <article id={`${id}-${item.id}`} className="workbench-source" data-source-id={item.id}>
              {item.paragraphs.map(paragraph => <p key={paragraph.id} data-paragraph-id={paragraph.id}>{paragraph.text}</p>)}
            </article>}
          </Card>)}
        </div>}

        {feature === "answer" && <div className="workbench-panel-content">
          <Card className="workbench-sample-card">
            <p className="workbench-muted">{text("QUESTION_LABEL")}</p><h3>{content.question}</h3>
            <Button variant="outline" data-demo-action="show-answer" aria-expanded={answerVisible}
              aria-controls={`${id}-answer`} onClick={() => setAnswerVisible(true)}>{text("ANSWER_SHOW")}</Button>
          </Card>
          {answerVisible && <div id={`${id}-answer`}>
            <h3>{text("ANSWER_LABEL")}</h3><p>{content.answer}</p>
            <h3>{text("CITATIONS_LABEL")}</h3><p className="workbench-muted">{text("ANSWER_CITATION_HINT")}</p>
            <div className="workbench-citations">{content.citations.map(item => <Button key={item.id} variant="outline"
              data-citation-id={item.id} onClick={() => dispatch({ type: "citation", id: item.id })}>
              {text("SOURCE_LABEL")}: {content.sources.find(document => document.id === item.sourceId)?.title}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>)}</div>
          </div>}
        </div>}

        {feature === "action" && <div className="workbench-panel-content">
          <Card className="workbench-sample-card" data-task-done={state.taskDone}>
            <p className="workbench-muted">{text("TASK_LABEL")}</p><h3>{content.taskTitle}</h3>
            <p role="status" className="workbench-task-status">{text(state.taskDone ? "ACTION_DONE" : "ACTION_TODO")}</p>
            <Button data-demo-action="complete-task" disabled={state.taskDone} onClick={() => dispatch({ type: "complete-task" })}>
              <Check size={18} aria-hidden="true" />{text("ACTION_COMPLETE")}
            </Button>
          </Card>
        </div>}

        {feature === "updates" && <div className="workbench-panel-content">
          <h3>{text("UPDATES_NOTIFICATION")}</h3><p>{content.notification}</p>
          <h3>{text("UPDATES_DISCUSSION")}</h3><p>{content.discussion}</p>
        </div>}

        {state.step === feature && <footer className="workbench-panel-footer">
          {gated && <p id={`${id}-gate`} className="workbench-muted">{text(gateText)}</p>}
          <Button data-demo-action="next" disabled={gated} aria-describedby={gated ? `${id}-gate` : undefined}
            onClick={() => dispatch({ type: "next" })}>{text("NEXT")}<ArrowRight size={18} aria-hidden="true" /></Button>
        </footer>}
      </>}
    </div>
  </div>;
}
