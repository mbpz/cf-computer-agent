import { ArrowRight, Bell, Books, ChatCircleText, SquaresFour, Tray } from "@phosphor-icons/react";
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Button, ButtonLink } from "../../components/motion/button/base";
import { ScrollReveal } from "../../components/motion/scroll-reveal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "../../components/motion/tabs";
import { syncDocumentLanguage, type LocaleRuntime } from "../../lib/i18n";
import { readTheme, type ThemeMode } from "../../lib/theme";
import { landingText, type LandingCopyKey } from "./workbench-copy";
import { demoReducer, initialDemoState, type DemoEvent, type DemoState, type DemoStep, type FeatureId } from "./workbench-demo-state";
import { WorkbenchFeaturePanel } from "./workbench-feature-panel";
import { WorkbenchScene, type SceneStatus } from "./workbench-scene";
import { SCENE_TOUR_INTERVAL_MS, SCENE_VIEWS, type SceneViewId } from "./workbench-scene-config";
import "./workbench-landing.css";

// Layout and type are Tailwind utilities; the only stylesheet left on this page
// carries the palette the contrast gate reads, the shell scroll locks and the
// scene/media rules whose selectors cannot be written as utilities.
const pageGutter = "mx-auto w-[min(100%_-_4rem,86rem)] max-md:w-[calc(100%_-_2rem)]";
const pageHeading = "font-[family-name:var(--landing-display)] text-[clamp(1.4rem,2vw,1.9rem)] font-semibold leading-[1.3] tracking-[-.025em] text-balance";
const mutedText = "text-[.9375rem] text-muted-foreground";
const demoBadge = "text-[.8125rem] font-[550] text-primary";

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

  return <main data-public-workbench-page data-workbench-landing className="workbench-landing min-h-dvh bg-background text-foreground" lang={language}>
    <div inert={state.activeFeature !== null}>
      {/* No border utilities here: `globals.css` sets `* { border-color: var(--border) }`
          outside every cascade layer, so a `border-transparent` would paint the shell's
          border instead of nothing. The bar is separated by its blur and 88% background. */}
      <header className={`sticky top-0 z-30 flex min-h-20 items-center justify-between gap-6 bg-background/88 backdrop-blur-[22px] backdrop-saturate-[180%] max-md:items-start max-md:gap-3 max-md:py-4 ${pageGutter}`}>
        <a className="font-[family-name:var(--landing-display)] text-[1.05rem] font-[650] tracking-[-.035em] whitespace-nowrap max-md:pt-[.4rem]" href="/">{text("BRAND")}</a>
        <div className="flex flex-wrap items-center gap-3 max-md:justify-end max-md:gap-2.5">
          <Select value={language} onValueChange={value => locale.setLocale(value)}>
            <SelectTrigger className="workbench-locale max-w-full min-h-11 bg-background px-[.6rem] py-[.4rem] text-[.8125rem] transition-colors duration-[120ms] ease-[var(--ease-out)] motion-reduce:transition-none">
              <span className="sr-only">{text("SWITCH_LANGUAGE")}</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="zh-CN">简体中文</SelectItem>
            </SelectContent>
          </Select>
          {login}
        </div>
      </header>

      <div className={pageGutter}>
        <section className="grid grid-cols-[minmax(0,.9fr)_minmax(0,1.25fr)] items-center gap-[clamp(1rem,3vw,3rem)] pt-[var(--landing-space-hero)] pb-8 max-md:grid-cols-1 max-md:gap-3 max-md:pt-6" aria-labelledby="workbench-hero-title">
          <div className="pt-4 pb-8 max-md:pb-0">
            <h1 id="workbench-hero-title" className="m-0 max-w-[12ch] font-[family-name:var(--landing-display)] text-[clamp(2.3rem,3.65vw,3.65rem)] font-semibold leading-[1.13] tracking-[-.052em] text-balance max-md:max-w-[16ch] max-md:text-[clamp(2.1rem,7.5vw,3rem)] [&:lang(zh-CN)]:max-w-[10em] [&:lang(zh-CN)]:leading-[1.27] [&:lang(zh-CN)]:tracking-[-.045em]">{text("HERO_TITLE")}</h1>
            <p className="mt-6 mb-7 max-w-[34ch] text-[1.0625rem] text-muted-foreground max-md:my-5 max-md:max-w-[40ch]">{text("HERO_DESCRIPTION")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" data-demo-action="start" onClick={() => dispatch({ type: "start" })}>
                {text("START")}<ArrowRight size={18} aria-hidden="true" />
              </Button>
              <Button variant="ghost" data-demo-action="explore" onClick={() => firstFeature.current?.focus()}>{text("EXPLORE")}</Button>
            </div>
          </div>
          <figure className="workbench-studio m-0 min-w-0 max-md:mt-3">
            <WorkbenchScene snapshot={snapshot} onStatus={setSceneStatus} />
            {sceneLive && <div className="workbench-scene-controls">
              <Button variant="ghost" size="sm" data-demo-action="pause" aria-pressed={state.paused}
                onClick={() => dispatch({ type: "pause", value: !state.paused })}>{text(state.paused ? "SCENE_RESUME" : "SCENE_PAUSE")}</Button>
              <div className="workbench-views" role="group" aria-label={text("SCENE_VIEWS_LABEL")} data-scene-tour={state.paused ? "paused" : "running"}>
                <Tabs value={view} onValueChange={next => setView(next as SceneViewId)} variant="pill">
                  <TabsList>
                    {SCENE_VIEWS.map(entry => <TabsTrigger key={entry.id} value={entry.id}>{text(viewLabels[entry.id])}</TabsTrigger>)}
                  </TabsList>
                </Tabs>
              </div>
            </div>}
          </figure>
        </section>

        <ScrollReveal amount={0.15}>
          <section className="border-t border-border pt-6 pb-[var(--landing-space-section)]" aria-label={text("GUIDE_LABEL")} data-demo-step={state.step}>
            <div className="mb-5 flex flex-wrap justify-between gap-x-8 gap-y-2 [&>p]:m-0">
              <p className={demoBadge}>{text("DEMO_BADGE")}</p>
              <p className={mutedText}>{text("DEMO_DESCRIPTION")}</p>
              <p className={mutedText}>{text("INVITE_ONLY")}</p>
            </div>
            <div className="flex flex-wrap gap-2.5 max-md:grid max-md:grid-cols-2" role="group" aria-label={text("HOTSPOTS_LABEL")}>
              {features.map(({ id, label, icon: Icon }, index) => <Button key={id} ref={index === 0 ? firstFeature : undefined}
                className="flex-1 basis-auto max-md:flex-none max-md:h-auto max-md:justify-start max-md:whitespace-normal max-md:px-3 max-md:text-left max-md:last:col-span-2"
                variant="outline" data-feature={id} aria-haspopup="dialog" aria-expanded={state.activeFeature === id}
                onClick={() => dispatch({ type: "open", feature: id })}>
                <Icon size={20} aria-hidden="true" className="shrink-0 text-primary" /><span>{text(label)}</span>
              </Button>)}
            </div>
            <ol className="m-0 flex list-none flex-wrap gap-x-6 gap-y-3 p-0 pt-6 text-[.8125rem] text-muted-foreground max-md:gap-x-4 [&_[aria-current=step]]:font-[650] [&_[aria-current=step]]:text-primary [&_[aria-current=step]]:underline [&_[aria-current=step]]:underline-offset-[.4em]" aria-label={text("GUIDE_LABEL")}>
              {steps.map(step => <li key={step} aria-current={state.step === step ? "step" : undefined}>{text(stepLabels[step])}</li>)}
            </ol>
            <div className="my-5 max-w-[65ch] text-[.9375rem]" aria-live="polite">
              {state.step === "overview" ? <p>{text("GUIDE_HINT")}</p>
                : state.step === "complete" ? <><h2 className={pageHeading}>{text("COMPLETE_TITLE")}</h2><p>{text("COMPLETE_DESCRIPTION")}</p></>
                : state.step === "capture" ? <p>{text(state.captured ? "CAPTURE_DONE" : "CAPTURE_GATE")}</p>
                : state.step === "action" ? <p>{text(state.taskDone ? "ACTION_DONE" : "ACTION_GATE")}</p>
                : <p>{text(stepLabels[state.step])}</p>}
            </div>
            {!state.activeFeature && state.step !== "overview" && <div className="flex flex-wrap items-center gap-3">
              {state.step !== "complete" && <Button data-demo-action="next" disabled={gated}
                onClick={() => dispatch({ type: "next" })}>{text("NEXT")}<ArrowRight size={18} aria-hidden="true" /></Button>}
              <Button variant="outline" data-demo-action="replay" onClick={() => dispatch({ type: "replay" })}>{text("REPLAY")}</Button>
            </div>}
          </section>
        </ScrollReveal>

        <ScrollReveal>
          <section className="border-t border-border py-[var(--landing-space-section)] [&>p]:mt-4 [&>p]:max-w-[62ch] [&>p]:text-muted-foreground" aria-labelledby="workbench-flow-title">
            <h2 id="workbench-flow-title" className={pageHeading}>{text("FLOW_TITLE")}</h2><p>{text("FLOW_DESCRIPTION")}</p>
          </section>
        </ScrollReveal>
        <ScrollReveal delay={0.08}>
          <footer className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-12 border-t border-border py-[var(--landing-space-section)] max-md:grid-cols-1 max-md:gap-6 [&_h2]:mb-4 [&_h2]:text-[1.125rem] [&_p]:my-4 [&_p]:max-w-[58ch] [&_p]:text-[.9375rem]">
            <div><h2 className={pageHeading}>{text("PRIVACY_TITLE")}</h2><p>{text("PRIVACY_DESCRIPTION")}</p><p className={mutedText}>{text("DEMO_DESCRIPTION")}</p></div>
            <div><h2 className={pageHeading}>{text("FOOTER_CTA")}</h2>{login}<p className={mutedText}>{text("INVITE_ONLY")}</p></div>
          </footer>
        </ScrollReveal>
      </div>
    </div>
    <WorkbenchFeaturePanel locale={locale} state={state} dispatch={dispatch} />
  </main>;
}
