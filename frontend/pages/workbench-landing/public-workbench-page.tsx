import { ArrowRight, Bell, Books, ChatCircleText, SquaresFour, Tray } from "@phosphor-icons/react";
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { Button, ButtonLink } from "../../components/motion/button/base";
import { ScrollReveal } from "../../components/motion/scroll-reveal";
import { syncDocumentLanguage, type LocaleRuntime } from "../../lib/i18n";
import { readTheme, type ThemeMode } from "../../lib/theme";
import { landingText, type LandingCopyKey } from "./workbench-copy";
import { demoReducer, initialDemoState, type DemoEvent, type DemoState, type DemoStep, type FeatureId } from "./workbench-demo-state";
import { WorkbenchFeaturePanel } from "./workbench-feature-panel";
import { WorkbenchScene, type SceneStatus } from "./workbench-scene";
import { SCENE_TOUR_INTERVAL_MS, SCENE_VIEWS, type SceneViewId } from "./workbench-scene-config";
import "./workbench-landing.css";

const viewLabels: Record<SceneViewId, LandingCopyKey> = {
  front: "SCENE_VIEW_FRONT", left: "SCENE_VIEW_LEFT", right: "SCENE_VIEW_RIGHT", high: "SCENE_VIEW_HIGH", low: "SCENE_VIEW_LOW",
};

const features = [
  { id: "capture", label: "STEP_CAPTURE", icon: Tray },
  { id: "library", label: "STEP_LIBRARY", icon: Books },
  { id: "answer", label: "STEP_ANSWER", icon: ChatCircleText },
  { id: "action", label: "STEP_ACTION", icon: SquaresFour },
  { id: "updates", label: "UPDATES_TITLE", icon: Bell },
] as const satisfies readonly { id: FeatureId; label: LandingCopyKey; icon: typeof Tray }[];
const steps: readonly DemoStep[] = ["overview", "capture", "library", "answer", "action", "complete"];
const stepLabels: Record<DemoStep, LandingCopyKey> = {
  overview: "STEP_OVERVIEW", capture: "STEP_CAPTURE", library: "STEP_LIBRARY", answer: "STEP_ANSWER", action: "STEP_ACTION", complete: "STEP_COMPLETE",
};

function landingReducer(previous: { demo: DemoState; cycleId: number }, event: DemoEvent) {
  return {
    demo: demoReducer(previous.demo, event),
    cycleId: previous.cycleId + Number(event.type === "start" || event.type === "replay"),
  };
}

export function PublicWorkbenchPage({ locale }: { locale: LocaleRuntime }) {
  const language = useSyncExternalStore(locale.subscribe, () => locale.locale, () => locale.locale);
  const [{ demo: state, cycleId }, dispatch] = useReducer(landingReducer, undefined, () => ({ demo: initialDemoState(), cycleId: 0 }));
  // The tour is presentation state: it orbits the camera so the whole animation is
  // visible from several angles, and it follows the same pause as the animation.
  const [view, setView] = useState<SceneViewId>(SCENE_VIEWS[0].id);
  // The tour and the pause control only act on a scene that exists: while the model is
  // still loading, failed or replaced by the static preview there is nothing to orbit.
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>("poster");
  const sceneLive = sceneStatus === "ready";
  const snapshot = useMemo(() => ({ feature: state.activeFeature, captured: state.captured,
    taskDone: state.taskDone, citationId: state.citationId, paused: state.paused, reduceMotion: false, dark: false, cycleId, view }), [state, cycleId, view]);
  const firstFeature = useRef<HTMLButtonElement>(null);
  useEffect(() => { setView(SCENE_VIEWS[0].id); }, [cycleId]);
  useEffect(() => {
    if (state.paused || !sceneLive) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      setView(current => SCENE_VIEWS[(SCENE_VIEWS.findIndex(entry => entry.id === current) + 1) % SCENE_VIEWS.length].id);
    }, SCENE_TOUR_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [state.paused, sceneLive]);
  useEffect(() => {
    let mode: ThemeMode = "system";
    try { mode = readTheme(window.localStorage); } catch { /* Storage may be blocked. */ }
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && Boolean(media?.matches)));
    apply();
    media?.addEventListener?.("change", apply);
    return () => media?.removeEventListener?.("change", apply);
  }, []);
  useEffect(() => syncDocumentLanguage(locale, document), [locale]);
  const text = (key: LandingCopyKey) => landingText(locale, key);
  const gated = (state.step === "capture" && !state.captured) || (state.step === "action" && !state.taskDone);
  // The landing always routes to the sign-in page, which offers both the email + one-time-code
  // path and GitHub, and itself reports when GitHub is not configured.
  const login = <ButtonLink variant="secondary" size="md" href="/login">{text("LOGIN")}</ButtonLink>;

  return <main data-public-workbench-page data-workbench-landing className="workbench-landing" lang={language}>
    <div inert={state.activeFeature !== null}>
      <header className="workbench-header workbench-container">
        <a className="workbench-brand" href="/">{text("BRAND")}</a>
        <div className="workbench-header-actions">
          <select className="workbench-locale" aria-label={text("SWITCH_LANGUAGE")} value={language}
            onChange={event => locale.setLocale(event.target.value)}>
            <option value="en">English</option><option value="zh-CN">简体中文</option>
          </select>
          {login}
        </div>
      </header>

      <div className="workbench-container">
        <section className="workbench-hero" aria-labelledby="workbench-hero-title">
          <div className="workbench-hero-copy">
            <h1 id="workbench-hero-title">{text("HERO_TITLE")}</h1>
            <p>{text("HERO_DESCRIPTION")}</p>
            <div className="workbench-hero-actions">
              <Button size="lg" data-demo-action="start" onClick={() => dispatch({ type: "start" })}>
                {text("START")}<ArrowRight size={18} aria-hidden="true" />
              </Button>
              <Button variant="ghost" data-demo-action="explore" onClick={() => firstFeature.current?.focus()}>{text("EXPLORE")}</Button>
            </div>
          </div>
          <figure className="workbench-studio">
            <WorkbenchScene snapshot={snapshot} onStatus={setSceneStatus} />
            {sceneLive && <div className="workbench-scene-controls">
              <Button variant="ghost" size="sm" data-demo-action="pause" aria-pressed={state.paused}
                onClick={() => dispatch({ type: "pause", value: !state.paused })}>{text(state.paused ? "SCENE_RESUME" : "SCENE_PAUSE")}</Button>
              <div className="workbench-views" role="group" aria-label={text("SCENE_VIEWS_LABEL")} data-scene-tour={state.paused ? "paused" : "running"}>
                {SCENE_VIEWS.map((entry) => <button key={entry.id} type="button" className="workbench-view" data-scene-view-button={entry.id}
                  aria-pressed={view === entry.id} onClick={() => setView(entry.id)}>
                  {view === entry.id && <motion.span layoutId="workbench-view-active" className="workbench-view-pill" aria-hidden="true" />}
                  <span className="workbench-view-label">{text(viewLabels[entry.id])}</span>
                </button>)}
              </div>
            </div>}
          </figure>
        </section>

        <ScrollReveal amount={0.15}>
          <section className="workbench-demo" aria-label={text("GUIDE_LABEL")} data-demo-step={state.step}>
            <div className="workbench-demo-intro">
              <p className="workbench-demo-badge">{text("DEMO_BADGE")}</p>
              <p className="workbench-muted">{text("DEMO_DESCRIPTION")}</p>
              <p className="workbench-muted">{text("INVITE_ONLY")}</p>
            </div>
            <div className="workbench-features" role="group" aria-label={text("HOTSPOTS_LABEL")}>
              {features.map(({ id, label, icon: Icon }, index) => <Button key={id} ref={index === 0 ? firstFeature : undefined}
                variant="outline" data-feature={id} aria-haspopup="dialog" aria-expanded={state.activeFeature === id}
                onClick={() => dispatch({ type: "open", feature: id })}>
                <Icon size={20} aria-hidden="true" /><span>{text(label)}</span>
              </Button>)}
            </div>
            <ol className="workbench-progress" aria-label={text("GUIDE_LABEL")}>
              {steps.map(step => <li key={step} aria-current={state.step === step ? "step" : undefined}>{text(stepLabels[step])}</li>)}
            </ol>
            <div className="workbench-guide-status" aria-live="polite">
              {state.step === "overview" ? <p>{text("GUIDE_HINT")}</p>
                : state.step === "complete" ? <><h2>{text("COMPLETE_TITLE")}</h2><p>{text("COMPLETE_DESCRIPTION")}</p></>
                : state.step === "capture" ? <p>{text(state.captured ? "CAPTURE_DONE" : "CAPTURE_GATE")}</p>
                : state.step === "action" ? <p>{text(state.taskDone ? "ACTION_DONE" : "ACTION_GATE")}</p>
                : <p>{text(stepLabels[state.step])}</p>}
            </div>
            {!state.activeFeature && state.step !== "overview" && <div className="workbench-guide-controls">
              {state.step !== "complete" && <Button data-demo-action="next" disabled={gated}
                onClick={() => dispatch({ type: "next" })}>{text("NEXT")}<ArrowRight size={18} aria-hidden="true" /></Button>}
              <Button variant="outline" data-demo-action="replay" onClick={() => dispatch({ type: "replay" })}>{text("REPLAY")}</Button>
            </div>}
          </section>
        </ScrollReveal>

        <ScrollReveal>
          <section className="workbench-flow" aria-labelledby="workbench-flow-title">
            <h2 id="workbench-flow-title">{text("FLOW_TITLE")}</h2><p>{text("FLOW_DESCRIPTION")}</p>
          </section>
        </ScrollReveal>
        <ScrollReveal delay={0.08}>
          <footer className="workbench-footer">
            <div><h2>{text("PRIVACY_TITLE")}</h2><p>{text("PRIVACY_DESCRIPTION")}</p><p className="workbench-muted">{text("DEMO_DESCRIPTION")}</p></div>
            <div><h2>{text("FOOTER_CTA")}</h2>{login}<p className="workbench-muted">{text("INVITE_ONLY")}</p></div>
          </footer>
        </ScrollReveal>
      </div>
    </div>
    <WorkbenchFeaturePanel locale={locale} state={state} dispatch={dispatch} />
  </main>;
}
