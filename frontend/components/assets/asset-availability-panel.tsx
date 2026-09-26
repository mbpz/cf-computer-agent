import { useCallback, useEffect, useRef, useState } from "react";
import type { AssetAvailability } from "../../../shared/asset-availability";
import { loadAssetAvailability } from "../../lib/asset-availability";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { AssetDropzone } from "./asset-dropzone";

type State = { kind: "loading" | "error" } | { kind: "ready"; value: AssetAvailability };

export function AssetAvailabilityPanel({ locale }: { locale?: LocaleRuntime }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const active = useRef<AbortController | null>(null);
  const read = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setState({ kind: "loading" });
    try {
      const value = await loadAssetAvailability({ signal: controller.signal });
      if (!controller.signal.aborted) setState({ kind: "ready", value });
    } catch {
      if (!controller.signal.aborted) setState({ kind: "error" });
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, []);
  useEffect(() => {
    void read();
    return () => { active.current?.abort(); active.current = null; };
  }, [read]);
  const message = frontendText(locale, state.kind === "loading" ? "SUBMIT_ASSET_LOADING"
    : state.kind === "error" ? "SUBMIT_ASSET_READ_FAILED"
    : state.value.storageEnabled ? "SUBMIT_ASSET_NOT_CONNECTED" : "SUBMIT_ASSET_NOT_CONFIGURED");
  return <div data-asset-availability={state.kind} aria-busy={state.kind === "loading"}>
    {/* A configured binding alone must never enable an unwired upload control. */}
    <AssetDropzone locale={locale} disabledMessage={message} />
    {state.kind === "ready" && <p className="mt-2 text-xs text-muted-foreground">{frontendText(locale, "SUBMIT_ASSET_MAX_BYTES")}: {state.value.maxBytes}</p>}
    {state.kind === "error" && <div role="alert" className="mt-2"><button type="button" data-asset-availability-retry className="rounded-md border px-3 py-2 text-sm" onClick={() => { void read(); }}>{frontendText(locale, "SUBMIT_ASSET_RETRY_READ")}</button></div>}
  </div>;
}
