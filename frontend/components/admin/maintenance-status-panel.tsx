import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PageState } from "../ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import {
  loadMaintenanceCapacity,
  loadMaintenanceStatus,
  maintenanceControlDisabled,
  type MaintenanceCapacity,
  type MaintenanceSnapshot,
} from "../../lib/admin-maintenance-data";

type StatusState =
  | { kind: "loading" }
  | { kind: "ready"; status: MaintenanceSnapshot; capacity: MaintenanceCapacity | null; capacityError: string | null }
  | { kind: "disabled"; message: string }
  | { kind: "error"; message: string };

/**
 * Where the missing coordinator control token is provisioned. A missing secret is
 * a permanent configuration fact for this instance, so the not-configured state
 * points at the operations runbook instead of offering a retry that can only read
 * the same unconfigured instance again. Source of truth in the repository:
 * `docs/operations/evidence/2026-09-22-r14-production-activation-preflight.md`
 * ("生产激活顺序", step 2).
 */
const MAINTENANCE_ACTIVATION_RUNBOOK =
  "https://github.com/mbpz/cf-computer-agent/blob/HEAD/docs/operations/evidence/2026-09-22-r14-production-activation-preflight.md";

function messageOf(error: unknown, fallbackKey: string, locale?: LocaleRuntime): string {
  return error instanceof ApiRequestError ? error.message || error.code : frontendText(locale, fallbackKey);
}

/**
 * The instance's maintenance state, read-only.
 *
 * Draining is an operations action, not a daily administration screen: the
 * control endpoint needs the maintenance window issued by the runbook and a
 * coordinator control token, and this instance does not have that token
 * configured, so every control call answers `MAINTENANCE_CONTROL_UNAVAILABLE`.
 * A drain button here could therefore only fail, so the surface reports the
 * coordinator's own state — phase, epoch, window, registered active permits and
 * the record capacity it enforces — and names the two control endpoints for the
 * operator's runbook instead of inventing a control.
 *
 * When the status read answers `MAINTENANCE_CONTROL_UNAVAILABLE` the instance is
 * reporting a missing configuration, which no retry can change: that branch names
 * the missing coordinator control token and points at the activation runbook, and
 * only a genuinely transient read failure keeps the retry affordance.
 */
export function MaintenanceStatusPanel({ locale, requester = fetch }: { locale?: LocaleRuntime; requester?: Fetcher }) {
  const [state, setState] = useState<StatusState>({ kind: "loading" });
  const request = useRef<AbortController | null>(null);

  const read = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ kind: "loading" });
    loadMaintenanceStatus(requester, controller.signal)
      .then(async (status) => {
        if (controller.signal.aborted) return;
        try {
          const capacity = await loadMaintenanceCapacity(requester, controller.signal);
          if (!controller.signal.aborted) setState({ kind: "ready", status, capacity, capacityError: null });
        } catch (error) {
          if (controller.signal.aborted) return;
          setState({ kind: "ready", status, capacity: null, capacityError: messageOf(error, "ADMIN_MAINTENANCE_CAPACITY_UNAVAILABLE", locale) });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState(maintenanceControlDisabled(error)
          ? { kind: "disabled", message: frontendText(locale, "ADMIN_MAINTENANCE_DISABLED") }
          : { kind: "error", message: messageOf(error, "ADMIN_MAINTENANCE_UNAVAILABLE", locale) });
      });
  }, [locale, requester]);

  useEffect(() => {
    read();
    return () => request.current?.abort();
  }, [read]);

  return <Card data-maintenance-status={state.kind}>
    <CardHeader><CardTitle>{frontendText(locale, "ADMIN_MAINTENANCE_TITLE")}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_MAINTENANCE_DESCRIPTION")}</p>
      {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
        : state.kind !== "ready" ? <div role="alert" data-maintenance-control="unavailable" className="space-y-2 text-sm">
          <p className={state.kind === "error" ? "text-destructive" : "text-muted-foreground"}>{state.message}</p>
          {state.kind === "disabled"
            ? <>
              <p data-maintenance-not-configured className="text-muted-foreground">{frontendText(locale, "ADMIN_MAINTENANCE_DISABLED_RUNBOOK")}</p>
              <a data-maintenance-runbook className="font-medium text-primary underline-offset-4 hover:underline" href={MAINTENANCE_ACTIVATION_RUNBOOK} target="_blank" rel="noreferrer noopener">{frontendText(locale, "ADMIN_MAINTENANCE_RUNBOOK_LINK")}</a>
            </>
            : <Button type="button" variant="outline" onClick={read}>{frontendText(locale, "COMMON_RETRY")}</Button>}
        </div>
        : <>
          {state.status.phase === "DRAINING" && <div role="alert" data-maintenance-drain="in-flight" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
            <p className="font-semibold text-destructive">{frontendText(locale, "ADMIN_MAINTENANCE_IN_FLIGHT")}</p>
            <p>{frontendText(locale, "ADMIN_MAINTENANCE_IN_FLIGHT_DETAIL").split("{active}").join(String(state.status.active)).split("{window}").join(state.status.window ?? "")}</p>
          </div>}
          {state.status.phase === "DRAINED" && <div role="alert" data-maintenance-drain="drained" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
            <p className="font-semibold text-destructive">{frontendText(locale, "ADMIN_MAINTENANCE_DRAINED")}</p>
            <p>{frontendText(locale, "ADMIN_MAINTENANCE_DRAINED_DETAIL")}</p>
          </div>}
          {state.status.phase === "OPEN" && <p data-maintenance-drain="open" className="text-sm">{frontendText(locale, "ADMIN_MAINTENANCE_OPEN")}</p>}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_PHASE")}</dt>
              <dd data-maintenance-phase={state.status.phase}><Badge variant={state.status.phase === "OPEN" ? "outline" : "warning"}>{state.status.phase}</Badge></dd></div>
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_EPOCH")}</dt>
              <dd data-maintenance-epoch={state.status.epoch}>{state.status.epoch}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_WINDOW")}</dt>
              <dd data-maintenance-window={state.status.window ?? "none"}>{state.status.window ?? frontendText(locale, "ADMIN_MAINTENANCE_NO_WINDOW")}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_ACTIVE")}</dt>
              <dd data-maintenance-active={state.status.active}>{state.status.active}</dd></div>
          </dl>
          {state.capacity === null ? <p role="alert" className="text-sm text-destructive" data-maintenance-capacity="unavailable">{state.capacityError}</p> : <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_RECORDS")}</dt>
              <dd data-maintenance-records={state.capacity.records}>{state.capacity.records}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_TOMBSTONES")}</dt>
              <dd data-maintenance-tombstones={state.capacity.tombstones}>{state.capacity.tombstones}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_CAPACITY_LIMIT")}</dt>
              <dd data-maintenance-capacity-limit={state.capacity.capacityLimit}>{state.capacity.capacityLimit}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_CAPACITY_REMAINING")}</dt>
              <dd data-maintenance-capacity-remaining={state.capacity.capacityRemaining}>{state.capacity.capacityRemaining}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_ALERT")}</dt>
              <dd data-maintenance-alert={state.capacity.alert}><Badge variant={state.capacity.alert === "NONE" ? "outline" : "warning"}>{state.capacity.alert}</Badge></dd></div>
            <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_MAINTENANCE_REQUIRES_REVIEW")}</dt>
              <dd data-maintenance-requires-review={state.capacity.requiresManualReview ? "yes" : "no"}>
                {frontendText(locale, state.capacity.requiresManualReview ? "ADMIN_MAINTENANCE_REVIEW_YES" : "ADMIN_MAINTENANCE_REVIEW_NO")}
              </dd></div>
          </dl>}
          <p data-maintenance-read-only className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_MAINTENANCE_READ_ONLY")}</p>
        </>}
    </CardContent>
  </Card>;
}
