import { useEffect, useMemo, useRef, useState } from "react";
import { createLocaleRuntime } from "../../lib/i18n";
import { landingText, type LandingCopyKey } from "./workbench-copy";
import {
  LANDING_MODEL_URL, LANDING_POSTER_DESKTOP_URL, LANDING_POSTER_MOBILE_URL,
  SCENE_BUDGET, type SceneSnapshot, type WorkbenchSceneHandle,
} from "./workbench-scene-config";
import { shouldAutoLoadScene } from "./workbench-scene-policy";

type SceneStatus = "poster" | "loading" | "ready" | "error" | "timeout" | "static";
type SceneView = { status: SceneStatus; message: LandingCopyKey; language: string };
type SceneController = { update(snapshot: SceneSnapshot): void; load(): void; useStatic(): void };
type Connection = EventTarget & { saveData?: boolean };
type Attempt = {
  abort: AbortController; host: HTMLDivElement;
  timer?: ReturnType<typeof setTimeout>; handle?: WorkbenchSceneHandle;
};

function failureMessage(error: unknown): LandingCopyKey {
  const message = error instanceof Error ? error.message : "";
  if (/webgl/i.test(message)) return "SCENE_UNAVAILABLE";
  if (message.startsWith("MODEL_MISSING_NODE_")) return "SCENE_MISSING_NODES";
  return "SCENE_ERROR";
}

// Snapshot remains the only business-state input; the page owns pause and feature controls.
export function WorkbenchScene({ snapshot }: { snapshot: SceneSnapshot }) {
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneController | null>(null);
  const [view, setView] = useState<SceneView>({ status: "poster", message: "SCENE_IDLE", language: "en" });
  const locale = useMemo(() => createLocaleRuntime({ navigatorLanguage: view.language }), [view.language]);
  const text = (key: LandingCopyKey) => landingText(locale, key);

  useEffect(() => {
    const element = root.current!;
    const canvasHost = host.current!;
    let alive = true;
    let currentSnapshot = snapshot;
    let onScreen = false;
    let documentVisible = document.visibilityState !== "hidden";
    let dark = currentSnapshot.dark || document.documentElement.classList.contains("dark");
    let explicitStatic = false;
    let attempted = false;
    let manualRequest = false;
    let active: Attempt | undefined;
    let status: SceneStatus = "poster";
    let message: LandingCopyKey = "SCENE_IDLE";
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const effectiveSnapshot = (): SceneSnapshot => ({
      ...currentSnapshot, dark, reduceMotion: currentSnapshot.reduceMotion || Boolean(media?.matches),
    });
    const visible = () => onScreen && documentVisible;
    const automatic = () => shouldAutoLoadScene({
      reduceMotion: effectiveSnapshot().reduceMotion,
      saveData: Boolean(connection?.saveData), staticMode: explicitStatic,
    });
    const publish = () => {
      if (!alive) return;
      const language = element.closest("[lang]")?.getAttribute("lang") || document.documentElement.lang || "en";
      const next = { status, message: status === "ready" && currentSnapshot.paused ? "SCENE_PAUSED" as const : message, language };
      setView(previous => previous.status === next.status && previous.message === next.message && previous.language === next.language ? previous : next);
    };
    const dispose = (handle: WorkbenchSceneHandle) => {
      // Cleanup must still finish if a renderer fails during its own disposal.
      try { handle.dispose(); } catch { /* detached host remains the DOM boundary */ }
    };
    const cancel = () => {
      const attempt = active;
      active = undefined;
      if (!attempt) return;
      clearTimeout(attempt.timer);
      // A late, even non-cooperative runtime can only append into this detached host.
      attempt.host.remove();
      attempt.abort.abort();
      if (attempt.handle) dispose(attempt.handle);
    };
    const isCurrent = (attempt: Attempt) => alive && active === attempt && !attempt.abort.signal.aborted;
    const fail = (attempt: Attempt, key: LandingCopyKey, timedOut = false) => {
      if (!isCurrent(attempt)) return;
      cancel();
      status = timedOut ? "timeout" : "error";
      message = key;
      publish();
    };
    const forward = (attempt: Attempt) => {
      if (!attempt.handle || !isCurrent(attempt)) return;
      try {
        attempt.handle.update(effectiveSnapshot());
        if (isCurrent(attempt)) attempt.handle.setVisible(visible());
      } catch (error) { fail(attempt, failureMessage(error)); }
    };
    const start = () => {
      attempted = true;
      manualRequest = false;
      const deadline = performance.now() + SCENE_BUDGET.loadTimeoutMs;
      const attempt: Attempt = { abort: new AbortController(), host: document.createElement("div") };
      const expire = () => {
        if (performance.now() < deadline) return false;
        fail(attempt, "SCENE_TIMEOUT", true);
        return true;
      };
      attempt.host.className = "workbench-scene-attempt";
      Object.assign(attempt.host.style, { width: "100%", height: "100%" });
      canvasHost.append(attempt.host);
      active = attempt;
      status = "loading"; message = "SCENE_LOADING"; publish();
      // One total deadline, including the module download; never reset for GLB loading.
      attempt.timer = setTimeout(() => fail(attempt, "SCENE_TIMEOUT", true), SCENE_BUDGET.loadTimeoutMs);
      void (async () => {
        try {
          const runtime = await import("./workbench-scene-runtime");
          if (!isCurrent(attempt) || expire()) return;
          const handle = await runtime.createWorkbenchScene({
            host: attempt.host, modelUrl: LANDING_MODEL_URL, signal: attempt.abort.signal,
            onFailure: reason => fail(attempt, reason === "context-lost" ? "SCENE_CONTEXT_LOST" : "SCENE_ERROR"),
          });
          if (!isCurrent(attempt)) { dispose(handle); return; }
          attempt.handle = handle;
          if (expire()) return;
          forward(attempt);
          if (!isCurrent(attempt) || expire()) return;
          clearTimeout(attempt.timer);
          status = "ready"; message = "SCENE_READY"; publish();
        } catch (error) { if (!expire()) fail(attempt, failureMessage(error)); }
      })();
    };
    const reconcile = () => {
      if (!alive) return;
      if (active) forward(active);
      if (!active && status !== "error" && status !== "timeout" && status !== "ready") {
        status = automatic() ? "poster" : "static";
        message = explicitStatic ? "SCENE_STATIC"
          : effectiveSnapshot().reduceMotion ? "SCENE_REDUCED_MOTION"
            : connection?.saveData ? "SCENE_SAVE_DATA" : "SCENE_IDLE";
      }
      if (!active && visible() && (manualRequest || (!attempted && automatic()))) start();
      publish();
    };
    const instance: SceneController = {
      update(next) {
        if (next.dark !== currentSnapshot.dark) dark = next.dark;
        currentSnapshot = next;
        reconcile();
      },
      load() {
        if (!alive || active || manualRequest) return;
        manualRequest = true; explicitStatic = false;
        reconcile();
      },
      useStatic() {
        if (!alive) return;
        cancel(); attempted = true; manualRequest = false; explicitStatic = true;
        status = "static"; message = "SCENE_STATIC"; publish();
      },
    };
    controller.current = instance;
    const onVisibility = () => { documentVisible = document.visibilityState !== "hidden"; reconcile(); };
    const onPreference = () => reconcile();
    document.addEventListener("visibilitychange", onVisibility);
    if (media?.addEventListener) media.addEventListener("change", onPreference);
    else media?.addListener?.(onPreference);
    connection?.addEventListener?.("change", onPreference);

    let intersection: IntersectionObserver | undefined;
    const measure = () => {
      if (!alive) return;
      const rect = element.getBoundingClientRect();
      onScreen = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        && rect.top < window.innerHeight && rect.left < window.innerWidth;
      reconcile();
    };
    if (typeof IntersectionObserver !== "undefined") {
      intersection = new IntersectionObserver(entries => {
        if (!alive) return;
        for (const entry of entries) onScreen = entry.isIntersecting && entry.intersectionRatio > 0;
        reconcile();
      // Positive threshold also reports entry after zero-area edge contact.
      }, { threshold: 0.01 });
      intersection.observe(element);
    } else {
      window.addEventListener("resize", measure, { passive: true });
      window.addEventListener("scroll", measure, { passive: true, capture: true });
      measure();
    }
    // Observe only language ancestors and the root theme, never renderer DOM mutations.
    const attributes = new MutationObserver(records => {
      if (!alive) return;
      if (records.some(record => record.target === document.documentElement && record.attributeName === "class")) {
        dark = document.documentElement.classList.contains("dark");
      }
      reconcile();
    });
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      attributes.observe(ancestor, { attributes: true, attributeFilter: ancestor === document.documentElement ? ["lang", "class"] : ["lang"] });
    }
    reconcile();
    return () => {
      alive = false;
      if (controller.current === instance) controller.current = null;
      cancel(); intersection?.disconnect(); attributes.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (media?.removeEventListener) media.removeEventListener("change", onPreference);
      else media?.removeListener?.(onPreference);
      connection?.removeEventListener?.("change", onPreference);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // The controller has mount lifetime; snapshot updates use the separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { controller.current?.update(snapshot); }, [snapshot]);

  const failed = view.status === "error" || view.status === "timeout";
  return (
    <div ref={root} className="workbench-scene" data-scene-status={view.status} aria-label={text("SCENE_LABEL")}>
      <div className="workbench-scene-visual" style={{ position: "relative", width: "100%", minWidth: 0 }}>
        <picture className="workbench-scene-poster">
          <source media="(max-width: 767px)" srcSet={LANDING_POSTER_MOBILE_URL} width={900} height={1100} />
          <img src={LANDING_POSTER_DESKTOP_URL} alt={text("SCENE_POSTER_ALT")} width={1600} height={1000}
            style={{ display: "block", width: "100%", height: "auto" }} />
        </picture>
        <div ref={host} className="workbench-scene-host" data-scene-host aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
      </div>
      <p className="workbench-scene-status" role="status" aria-live="polite" aria-atomic="true">{text(view.message)}</p>
      <div className="workbench-scene-controls">
        {view.status !== "loading" && view.status !== "ready" && (
          <button type="button" className="workbench-scene-button" data-scene-action={failed ? "retry" : "load"}
            onClick={() => controller.current?.load()}>{text(failed ? "SCENE_RETRY" : "SCENE_LOAD")}</button>
        )}
        {view.status !== "static" && (
          <button type="button" className="workbench-scene-button" data-scene-action="static"
            onClick={() => controller.current?.useStatic()}>{text("SCENE_STATIC_MODE")}</button>
        )}
      </div>
    </div>
  );
}
