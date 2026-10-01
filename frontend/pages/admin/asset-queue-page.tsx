import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { AssetPreviewPanel } from "../../components/assets/asset-preview-panel";
import { PageState } from "../../components/ui/page-state";
import type { AssetPreviewModel } from "../../components/assets/asset-preview-model";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { DataPagination } from "../../components/data-pagination";
import type { AdminAssetsPage, AdminAssetStatus } from "../../lib/admin-assets-data";
import type { SupportedPageSize } from "../../lib/numbered-page";

export function AssetQueuePage({ onLoadRetry, data, loading = false, forbidden = false, error, localError, readRequired = false, pending = false, pendingIds = [], status = "", preview = null, previewLoading = false, previewError, retryError, onRetry, onPreview, onStatusChange, onPageChange, onPageSizeChange, locale }: { onLoadRetry?: () => void; data?: AdminAssetsPage; loading?: boolean; forbidden?: boolean; error?: string; localError?: string; readRequired?: boolean; pending?: boolean; pendingIds?: readonly string[]; status?: "" | AdminAssetStatus; preview?: AssetPreviewModel | null; previewLoading?: boolean; previewError?: string; retryError?: string; onRetry?: (id: string) => void; onPreview?: (id: string) => void; onStatusChange?: (status: "" | AdminAssetStatus) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (size: SupportedPageSize) => void; locale: LocaleRuntime }) {
  type Confirmation = { asset: AdminAssetsPage["items"][number]; data: AdminAssetsPage; status: typeof status };
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const cancel = () => { confirmationRef.current = null; setConfirmation(null); };
  const valid = Boolean(confirmation && confirmation.data === data && confirmation.status === status
    && !loading && !forbidden && !error && !pending && !pendingIds.includes(confirmation.asset.id)
    && confirmation.asset.status === "failed_retryable" && onRetry);
  useEffect(() => { if (confirmation && !valid) cancel(); }, [confirmation, valid]);
  useEffect(() => () => { confirmationRef.current = null; }, []);
  const request = (asset: AdminAssetsPage["items"][number]) => {
    if (confirmationRef.current || !data || loading || forbidden || error || pending || pendingIds.includes(asset.id)
      || asset.status !== "failed_retryable" || !onRetry) return;
    const next = {asset, data, status}; confirmationRef.current = next; setConfirmation(next);
  };
  const confirm = () => {
    if (!valid || !confirmation || confirmationRef.current !== confirmation) return;
    cancel(); onRetry?.(confirmation.asset.id);
  };
  if (loading) return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (error) return <PageState kind={forbidden ? "forbidden" : "error"} title={error} description={frontendText(locale, "COMMON_UNABLE_TO_LOAD")} >{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>;
  const assets = data?.items ?? [];
  return <><section className="space-y-5" inert={valid} aria-hidden={valid || undefined}><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_ASSET_QUEUE_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ASSET_QUEUE_DESCRIPTION")}</p></div><label className="text-sm text-muted-foreground">Status <select aria-label="Asset status" className="ml-2 h-9 rounded-md border bg-background px-2" disabled={pending} value={status} onChange={(event) => onStatusChange?.(event.target.value as "" | AdminAssetStatus)}><option value="">All</option><option value="queued">queued</option><option value="processing">processing</option><option value="succeeded">succeeded</option><option value="failed_retryable">failed_retryable</option><option value="failed_terminal">failed_terminal</option></select></label></div>{(previewError || retryError || localError) && <p role="alert" className="text-sm text-destructive">{previewError || retryError || localError}{(localError || retryError) && onLoadRetry && <Button type="button" variant="outline" disabled={pending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</p>}{readRequired && !localError && !retryError && <div role="status" className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ASSET_READ_REQUIRED")}<Button type="button" variant="outline" disabled={pending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}{assets.length ? assets.map((asset) => { const label = asset.name || asset.id; return <Card key={asset.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><div><h2 className="font-medium">{asset.name || frontendText(locale, "ADMIN_ASSET_UNNAMED")}</h2><div className="mt-2 flex flex-wrap gap-2">{(asset.warnings ?? []).map((warning) => <Badge key={warning} variant="warning">{warning}</Badge>)}</div></div><div className="flex items-center gap-2"><Badge variant={asset.status === "failed_retryable" ? "warning" : "outline"}>{asset.status || frontendText(locale, "ADMIN_ASSET_STATUS_UNAVAILABLE")}</Badge><Button aria-label={`${frontendText(locale, "ADMIN_ASSET_PREVIEW")} ${label}`} size="sm" variant="outline" disabled={pending || previewLoading} onClick={() => onPreview?.(asset.id)}>{previewLoading ? frontendText(locale, "ADMIN_ASSET_PREVIEW_LOADING") : frontendText(locale, "ADMIN_ASSET_PREVIEW")}</Button>{asset.status === "failed_retryable" && <Button aria-label={`${frontendText(locale, "ADMIN_ASSET_RETRY")} ${label}`} size="sm" disabled={!onRetry || pending || forbidden || pendingIds.includes(asset.id)} onClick={() => request(asset)}>{frontendText(locale, "ADMIN_ASSET_RETRY")}</Button>}</div></CardContent></Card>; }) : <PageState kind="empty" title={frontendText(locale, "ADMIN_ASSET_EMPTY")} description={frontendText(locale, "ADMIN_ASSET_QUEUE_DESCRIPTION")} />}{data && <DataPagination {...data.pagination} locale={locale} pending={pending} onPageChange={(page) => onPageChange?.(page)} onPageSizeChange={(size) => onPageSizeChange?.(size)} />}{preview && <AssetPreviewPanel locale={locale} preview={preview} />}</section><ConfirmAction open={valid} title={frontendText(locale,"ADMIN_ASSET_CONFIRM_TITLE")}
    description={confirmation ? `${confirmation.asset.name || frontendText(locale,"ADMIN_ASSET_UNNAMED")} (${confirmation.asset.id}). ${frontendText(locale,"ADMIN_ASSET_RETRY_IMPACT")}` : ""}
    cancelLabel={frontendText(locale,"COMMON_CANCEL")} confirmLabel={frontendText(locale,"ADMIN_ASSET_CONFIRM_RETRY")}
    onCancel={cancel} onConfirm={confirm} /></>;
}
