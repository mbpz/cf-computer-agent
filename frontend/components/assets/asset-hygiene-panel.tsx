import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PageState } from "../ui/page-state";
import { FilterSelect } from "../ui/filter-select";
import { TypedConfirmAction } from "../ui/typed-confirm-action";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import {
  ADMIN_ORPHAN_DEFAULT_LIMIT,
  ADMIN_ORPHAN_MAX_LIMIT,
  loadAdminAssetCapacity,
  loadAdminOrphans,
  reclaimAdminOrphans,
  reclaimableBytes,
  type AdminAssetCapacity,
  type AdminOrphanPage,
  type AdminOrphanPrefix,
} from "../../lib/admin-asset-hygiene-data";
import {
  clearAdminOperation,
  discardBlockedAdminOperation,
  loadAdminOperation,
  newAdminOperationId,
  saveAdminOperation,
  type StoredAdminOperation,
} from "../../lib/admin-operation-intent";

type CapacityState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; value: AdminAssetCapacity } | { kind: "error"; message: string };
type ScanState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; page: AdminOrphanPage } | { kind: "error"; message: string };

function bytesLabel(value: number): string {
  const mib = value / (1024 * 1024);
  return `${mib.toFixed(mib < 10 ? 2 : 1)} MiB`;
}

function messageOf(error: unknown, fallbackKey: string, locale?: LocaleRuntime): string {
  return error instanceof ApiRequestError ? error.message || error.code : frontendText(locale, fallbackKey);
}

/** An answer that never arrived, or a server fault, leaves the outcome unknown. */
function unknownOutcome(error: unknown): boolean {
  return error instanceof ApiRequestError ? error.retryable && error.status >= 500 : true;
}

/**
 * Storage hygiene for the admin asset queue: the capacity and thresholds the
 * server reports, an orphan scan with the server's own paging, and a reclamation
 * that states what will be deleted and how many objects before it runs, then
 * reports each object's outcome. The reclamation carries one operation number,
 * so an unknown outcome is retried as the same operation — which the server
 * answers from its receipt — instead of deleting a second time.
 */
export function AssetHygienePanel({ locale, memberId, requester = fetch }: { locale?: LocaleRuntime; memberId?: string; requester?: Fetcher }) {
  const [capacity, setCapacity] = useState<CapacityState>({ kind: "idle" });
  const [prefix, setPrefix] = useState<AdminOrphanPrefix>("staging");
  const [limit, setLimit] = useState(ADMIN_ORPHAN_DEFAULT_LIMIT);
  const [scan, setScan] = useState<ScanState>({ kind: "idle" });
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ deleted: readonly string[]; skipped: readonly string[] } | null>(null);
  const [notice, setNotice] = useState<string>();
  const [record, setRecord] = useState<StoredAdminOperation>(() => memberId ? loadAdminOperation(memberId) : { kind: "empty" });
  const capacityRequest = useRef<AbortController | null>(null);
  const scanRequest = useRef<AbortController | null>(null);

  const readCapacity = useCallback(() => {
    capacityRequest.current?.abort();
    const controller = new AbortController();
    capacityRequest.current = controller;
    setCapacity({ kind: "loading" });
    loadAdminAssetCapacity(requester, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setCapacity({ kind: "ready", value }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCapacity({ kind: "error", message: messageOf(error, "ADMIN_ASSET_CAPACITY_UNAVAILABLE", locale) });
      });
  }, [locale, requester]);

  const scanOrphans = useCallback(() => {
    scanRequest.current?.abort();
    const controller = new AbortController();
    scanRequest.current = controller;
    setScan({ kind: "loading" });
    loadAdminOrphans({ prefix, limit, requester, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        // A key that is no longer on screen is no longer selected: the impact the
        // operator confirms is always what the listing in front of them reported.
        setSelected((current) => current.filter((key) => page.items.some((item) => item.key === key)));
        setScan({ kind: "ready", page });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setScan({ kind: "error", message: messageOf(error, "ADMIN_ASSET_ORPHAN_UNAVAILABLE", locale) });
      });
  }, [limit, locale, prefix, requester]);

  // Nothing is read on mount: the capacity report and the orphan scan both run
  // only when the operator asks for them, so this card never adds traffic to a
  // plain visit to the asset queue.
  useEffect(() => () => {
    capacityRequest.current?.abort();
    scanRequest.current?.abort();
  }, []);

  const items = scan.kind === "ready" ? scan.page.items : [];
  const selectedBytes = useMemo(() => reclaimableBytes(items, selected), [items, selected]);
  const storedReclaim = record.kind === "ready" && record.intent.op === "reclaim" ? record.intent : null;
  const blocked = record.kind === "blocked";

  const send = useCallback(async (operationId: string, keys: readonly string[]) => {
    setPending(true);
    setNotice(undefined);
    try {
      const outcome = await reclaimAdminOrphans({ operationId, keys, confirmCount: keys.length, requester });
      setResult(outcome);
      setSelected([]);
      setPending(false);
      if (memberId) {
        clearAdminOperation(memberId, operationId);
        setRecord(loadAdminOperation(memberId));
      }
      // The reclamation changed what the store holds, so both reports are re-read.
      readCapacity();
      scanOrphans();
    } catch (error) {
      setPending(false);
      if (memberId) setRecord(loadAdminOperation(memberId));
      // An unknown outcome keeps the recorded operation: retrying it replays the
      // server's receipt instead of asking for a second deletion.
      setNotice(unknownOutcome(error)
        ? frontendText(locale, "ADMIN_ASSET_ORPHAN_UNKNOWN")
        : messageOf(error, "ADMIN_ASSET_ORPHAN_RECLAIM_FAILED", locale));
    }
  }, [locale, memberId, readCapacity, requester, scanOrphans]);

  const confirmReclaim = () => {
    const keys = [...selected];
    setConfirming(false);
    if (!memberId || keys.length === 0) return;
    const intent = saveAdminOperation(memberId, { op: "reclaim", operationId: newAdminOperationId(), keys });
    if (!intent || intent.op !== "reclaim") {
      setNotice(frontendText(locale, "ADMIN_ASSET_ORPHAN_RECORD_BLOCKED"));
      setRecord(loadAdminOperation(memberId));
      return;
    }
    setRecord({ kind: "ready", intent });
    void send(intent.operationId, intent.keys);
  };

  const toggle = (key: string) => {
    setSelected((current) => current.includes(key)
      ? current.filter((entry) => entry !== key)
      : current.length >= ADMIN_ORPHAN_MAX_LIMIT ? current : [...current, key]);
  };

  return <Card data-asset-hygiene={capacity.kind}>
    <CardHeader><CardTitle>{frontendText(locale, "ADMIN_ASSET_HYGIENE_TITLE")}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ASSET_HYGIENE_DESCRIPTION")}</p>
      {capacity.kind === "idle" ? <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ASSET_CAPACITY_NOT_READ")}</p>
        <Button type="button" variant="outline" data-asset-capacity-read onClick={readCapacity}>{frontendText(locale, "ADMIN_ASSET_CAPACITY_READ")}</Button>
      </div>
        : capacity.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
        : capacity.kind === "error" ? <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{capacity.message}</p>
          <Button type="button" variant="outline" onClick={readCapacity}>{frontendText(locale, "COMMON_RETRY")}</Button>
        </div>
        : <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_ASSET_CAPACITY_USED")}</dt>
            <dd data-asset-capacity-used={capacity.value.usedBytes ?? "unavailable"}>
              {capacity.value.storageEnabled && capacity.value.usedBytes !== null
                ? bytesLabel(capacity.value.usedBytes)
                : frontendText(locale, "ADMIN_ASSET_CAPACITY_UNAVAILABLE")}
            </dd></div>
          <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_ASSET_CAPACITY_MAX")}</dt>
            <dd data-asset-capacity-max={capacity.value.maxBytes}>{bytesLabel(capacity.value.maxBytes)}</dd></div>
          <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_ASSET_CAPACITY_THRESHOLD")}</dt>
            <dd data-asset-capacity-threshold={capacity.value.warningThresholdBytes}>{bytesLabel(capacity.value.warningThresholdBytes)}</dd></div>
          <div className="flex items-center justify-between gap-2"><dt>{frontendText(locale, "ADMIN_ASSET_CAPACITY_WARNING")}</dt>
            <dd data-asset-capacity-warning={capacity.value.warning ? "over" : "under"}>
              <Badge variant={capacity.value.warning ? "warning" : "outline"}>
                {frontendText(locale, capacity.value.warning ? "ADMIN_ASSET_CAPACITY_WARNING_OVER" : "ADMIN_ASSET_CAPACITY_WARNING_UNDER")}
              </Badge>
            </dd></div>
        </dl>}

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect label={frontendText(locale, "ADMIN_ASSET_ORPHAN_PREFIX")} ariaLabel={frontendText(locale, "ADMIN_ASSET_ORPHAN_PREFIX")}
          value={prefix} disabled={pending || scan.kind === "loading"}
          onChange={(value) => { setPrefix(value === "parsed" ? "parsed" : "staging"); setSelected([]); }}
          options={[{ value: "staging", label: "staging/" }, { value: "parsed", label: "parsed/" }]} />
        <FilterSelect label={frontendText(locale, "ADMIN_ASSET_ORPHAN_LIMIT")} ariaLabel={frontendText(locale, "ADMIN_ASSET_ORPHAN_LIMIT")}
          value={String(limit)} disabled={pending || scan.kind === "loading"}
          onChange={(value) => { setLimit(Number(value) === ADMIN_ORPHAN_MAX_LIMIT ? ADMIN_ORPHAN_MAX_LIMIT : ADMIN_ORPHAN_DEFAULT_LIMIT); setSelected([]); }}
          options={[{ value: String(ADMIN_ORPHAN_DEFAULT_LIMIT), label: String(ADMIN_ORPHAN_DEFAULT_LIMIT) }, { value: String(ADMIN_ORPHAN_MAX_LIMIT), label: String(ADMIN_ORPHAN_MAX_LIMIT) }]} />
        <Button type="button" variant="outline" data-orphan-scan disabled={pending || scan.kind === "loading"} onClick={scanOrphans}>
          {frontendText(locale, scan.kind === "loading" ? "ADMIN_ASSET_ORPHAN_SCANNING" : "ADMIN_ASSET_ORPHAN_SCAN")}
        </Button>
      </div>

      {scan.kind === "idle" ? <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ASSET_ORPHAN_NOT_SCANNED")}</p>
        : scan.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
        : scan.kind === "error" ? <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{scan.message}</p>
          <Button type="button" variant="outline" onClick={scanOrphans}>{frontendText(locale, "COMMON_RETRY")}</Button>
        </div>
        : <>
          <p className="text-sm text-muted-foreground" data-orphan-summary={`${scan.page.scanned}:${scan.page.items.length}`}>
            {frontendText(locale, "ADMIN_ASSET_ORPHAN_SCANNED")}: {scan.page.scanned} · {frontendText(locale, "ADMIN_ASSET_ORPHAN_FOUND")}: {scan.page.items.length}
            {scan.page.truncated ? ` · ${frontendText(locale, "ADMIN_ASSET_ORPHAN_TRUNCATED")}` : ""}
          </p>
          {scan.page.items.length === 0 ? <PageState kind="empty" title={frontendText(locale, "ADMIN_ASSET_ORPHAN_EMPTY")} /> : <ul className="divide-y rounded-md border">
            {scan.page.items.map((item) => <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-orphan-row={item.key}>
              <label className="flex min-w-0 items-center gap-2">
                <input type="checkbox" checked={selected.includes(item.key)} disabled={pending}
                  aria-label={`${frontendText(locale, "ADMIN_ASSET_ORPHAN_SELECT")} ${item.key}`}
                  onChange={() => toggle(item.key)} />
                <span className="truncate">{item.key}</span>
              </label>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span data-orphan-size={item.size}>{bytesLabel(item.size)}</span>
                <span>{item.uploadedAt}</span>
              </span>
            </li>)}
          </ul>}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm" data-orphan-selected-count={selected.length} data-orphan-selected-bytes={selectedBytes}>
              {frontendText(locale, "ADMIN_ASSET_ORPHAN_SELECTED")}: {selected.length} · {bytesLabel(selectedBytes)}
            </p>
            <Button type="button" variant="destructive" data-orphan-reclaim
              disabled={pending || selected.length === 0 || !memberId}
              onClick={() => setConfirming(true)}>
              {frontendText(locale, "ADMIN_ASSET_ORPHAN_RECLAIM")}
            </Button>
          </div>
        </>}

      {storedReclaim && <Alert data-orphan-recovery><AlertDescription className="space-y-2">
        <span>{frontendText(locale, "ADMIN_ASSET_ORPHAN_PENDING")} <code>{storedReclaim.operationId}</code> · {storedReclaim.keys.length}</span>
        <span className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" data-orphan-retry-same disabled={pending} onClick={() => void send(storedReclaim.operationId, storedReclaim.keys)}>
            {frontendText(locale, "ADMIN_ASSET_ORPHAN_RETRY_SAME")}
          </Button>
        </span>
      </AlertDescription></Alert>}

      {blocked && <div role="alert" data-orphan-record-blocked className="space-y-2 text-sm text-destructive">
        <p>{frontendText(locale, "ADMIN_ASSET_ORPHAN_RECORD_BLOCKED")}</p>
        {memberId && <Button type="button" variant="outline" onClick={() => { discardBlockedAdminOperation(memberId); setRecord(loadAdminOperation(memberId)); }}>
          {frontendText(locale, "ADMIN_ASSET_ORPHAN_RECORD_DISCARD")}
        </Button>}
      </div>}
      {notice && <p role="alert" className="text-sm text-destructive">{notice}</p>}

      {result && <div data-orphan-results={`${result.deleted.length}:${result.skipped.length}`} className="space-y-2 text-sm">
        <p className="font-medium">{frontendText(locale, "ADMIN_ASSET_ORPHAN_RESULT_TITLE")}</p>
        <p data-orphan-deleted={result.deleted.length}>{frontendText(locale, "ADMIN_ASSET_ORPHAN_DELETED")}: {result.deleted.length}</p>
        <p data-orphan-skipped={result.skipped.length}>{frontendText(locale, "ADMIN_ASSET_ORPHAN_SKIPPED")}: {result.skipped.length}</p>
        {result.skipped.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{result.skipped.map((key) => <li key={key}>{key}</li>)}</ul>}
      </div>}
    </CardContent>
    <TypedConfirmAction open={confirming} destructive pending={pending}
      title={frontendText(locale, "ADMIN_ASSET_ORPHAN_CONFIRM_TITLE")}
      description={frontendText(locale, "ADMIN_ASSET_ORPHAN_CONFIRM_BODY")
        .split("{count}").join(String(selected.length))
        .split("{bytes}").join(bytesLabel(selectedBytes))
        .split("{prefix}").join(`${prefix}/`)}
      inputLabel={frontendText(locale, "ADMIN_ASSET_ORPHAN_CONFIRM_INPUT")}
      expectLabel={frontendText(locale, "ADMIN_ASSET_ORPHAN_CONFIRM_EXPECT").split("{count}").join(String(selected.length))}
      expectValue={String(selected.length)}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, "ADMIN_ASSET_ORPHAN_RECLAIM")}
      onCancel={() => setConfirming(false)} onConfirm={confirmReclaim} />
  </Card>;
}
