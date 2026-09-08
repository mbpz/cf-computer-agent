import { ArrowRight, Bell, Books, ChatCircleText, GithubLogo, SquaresFour, Tray } from "@phosphor-icons/react";
import { useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from "react";
import { Button } from "../../components/ui/button";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { readTheme, type ThemeMode } from "../../lib/theme";
import { landingText, type LandingCopyKey } from "./workbench-copy";
import { demoReducer, initialDemoState, type DemoStep, type FeatureId } from "./workbench-demo-state";
import { WorkbenchFeaturePanel } from "./workbench-feature-panel";
import { WorkbenchScene } from "./workbench-scene";
import "./workbench-landing.css";

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

export function PublicWorkbenchPage({ locale, githubEnabled = true }: { locale: LocaleRuntime; githubEnabled?: boolean }) {
  const language = useSyncExternalStore(locale.subscribe, () => locale.locale, () => locale.locale);
  const [state, dispatch] = useReducer(demoReducer, undefined, initialDemoState);
  const snapshot = useMemo(() => ({ feature: state.activeFeature, captured: state.captured,
    taskDone: state.taskDone, citationId: state.citationId, paused: state.paused, reduceMotion: false, dark: false }), [state]);
  const firstFeature = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let mode: ThemeMode = "system";
    try { mode = readTheme(window.localStorage); } catch { /* Storage may be blocked. */ }
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && Boolean(media?.matches)));
    apply();
    media?.addEventListener?.("change", apply);
    return () => media?.removeEventListener?.("change", apply);
  }, []);
  const text = (key: LandingCopyKey) => landingText(locale, key);
  const gated = (state.step === "capture" && !state.captured) || (state.step === "action" && !state.taskDone);
  const login = githubEnabled
    ? <a className="workbench-login" href="/auth/github"><GithubLogo size={18} weight="fill" aria-hidden="true" />{text("LOGIN")}</a>
    : <p className="workbench-muted workbench-login-unavailable">{frontendText(locale, "LOGIN_GITHUB_UNAVAILABLE")}</p>;

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
            <WorkbenchScene snapshot={snapshot} />
            <Button variant="ghost" size="sm" data-demo-action="pause" aria-pressed={state.paused}
              onClick={() => dispatch({ type: "pause", value: !state.paused })}>{text(state.paused ? "SCENE_RESUME" : "SCENE_PAUSE")}</Button>
            <figcaption className="workbench-demo-badge">{text("DEMO_BADGE")}</figcaption>
          </figure>
        </section>

        <section className="workbench-demo" aria-label={text("GUIDE_LABEL")} data-demo-step={state.step}>
          <div className="workbench-demo-intro">
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

        <section className="workbench-flow" aria-labelledby="workbench-flow-title">
          <h2 id="workbench-flow-title">{text("FLOW_TITLE")}</h2><p>{text("FLOW_DESCRIPTION")}</p>
        </section>
        <footer className="workbench-footer">
          <div><h2>{text("PRIVACY_TITLE")}</h2><p>{text("PRIVACY_DESCRIPTION")}</p><p className="workbench-muted">{text("DEMO_DESCRIPTION")}</p></div>
          <div><h2>{text("FOOTER_CTA")}</h2>{login}<p className="workbench-muted">{text("INVITE_ONLY")}</p></div>
        </footer>
      </div>
    </div>
    <WorkbenchFeaturePanel locale={locale} state={state} dispatch={dispatch} />
  </main>;
}
