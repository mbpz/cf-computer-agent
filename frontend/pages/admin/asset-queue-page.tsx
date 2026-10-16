import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { FilterSelect } from "../../components/ui/filter-select";
import { AppliedFilters } from "../../components/ui/applied-filters";
import { AssetPreviewPanel } from "../../components/assets/asset-preview-panel";
import { DataTable } from "../../components/data-table";
import { PageState } from "../../components/ui/page-state";
import type { AssetPreviewModel } from "../../components/assets/asset-preview-model";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminAssetsPage, AdminAssetStatus } from "../../lib/admin-assets-data";
import type { SupportedPageSize } from "../../lib/numbered-page";

export function AssetQueuePage({ onLoadRetry, data, loading = false, forbidden = false, error, localError, readRequired = false, pending = false, pendingIds = [], status = "", preview = null, previewLoading = false, previewError, retryError, onRetry, onPreview, onStatusChange, onPageChange, onPageSizeChange, onLoadMore, locale, recordBlocked = false, onDiscardRecord }: { onLoadRetry?: () => void; data?: AdminAssetsPage; loading?: boolean; forbidden?: boolean; error?: string; localError?: string; readRequired?: boolean; pending?: boolean; pendingIds?: readonly string[]; status?: "" | AdminAssetStatus; preview?: AssetPreviewModel | null; previewLoading?: boolean; previewError?: string; retryError?: string; onRetry?: (id: string) => void; onPreview?: (id: string) => void; onStatusChange?: (status: "" | AdminAssetStatus) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void; onLoadMore?: () => void; locale: LocaleRuntime; recordBlocked?: boolean; onDiscardRecord?: () => void }) {
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
  // The header and filter row are constant (research §4.3); loading and read failure
  // only replace the queue area below them.
  return <><section className="flex flex-col gap-5 lg:h-full lg:min-h-0" inert={valid} aria-hidden={valid || undefined}><PageHeader title={frontendText(locale, "ADMIN_ASSET_QUEUE_TITLE")} description={frontendText(locale, "ADMIN_ASSET_QUEUE_DESCRIPTION")}
      actions={<FilterSelect label="Status" ariaLabel="Asset status" value={status} disabled={pending} onChange={(value) => onStatusChange?.(value as "" | AdminAssetStatus)} options={[{ value: "", label: "All" }, { value: "queued", label: "queued" }, { value: "processing", label: "processing" }, { value: "succeeded", label: "succeeded" }, { value: "failed_retryable", label: "failed_retryable" }, { value: "failed_terminal", label: "failed_terminal" }]} />} /><AppliedFilters
      ariaLabel={frontendText(locale, "COMMON_APPLIED_FILTERS")}
      clearLabel={frontendText(locale, "COMMON_CLEAR_FILTERS")}
      filters={status ? [{ id: "status", label: `Status: ${status}`, onRemove: () => onStatusChange?.("") }] : []}
      onClear={() => onStatusChange?.("")}
    />
    {loading ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : error ? <PageState kind={forbidden ? "forbidden" : "error"} title={error} description={frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>
      : <>{recordBlocked && <div role="alert" data-asset-retry-record-blocked className="space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_ASSET_RETRY_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardRecord}>{frontendText(locale, "ADMIN_ASSET_RETRY_RECORD_DISCARD")}</Button></div>}{(previewError || retryError || localError) && <p role="alert" className="text-sm text-destructive">{previewError || retryError || localError}{(localError || retryError) && onLoadRetry && <Button type="button" variant="outline" disabled={pending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</p>}{readRequired && !localError && !retryError && <div role="status" className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ASSET_READ_REQUIRED")}<Button type="button" variant="outline" disabled={pending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}{data && <DataTable
    locale={locale}
    rows={data.items}
    rowId={(asset) => asset.id}
    ariaLabel={frontendText(locale, "ADMIN_ASSET_QUEUE_TITLE")}
    emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_ASSET_EMPTY")} description={frontendText(locale, "ADMIN_ASSET_QUEUE_DESCRIPTION")} />}
    loading={pending}
    pagination={data.pagination}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
    hasMore={!localError && data.pagination.page < data.pagination.totalPages}
    onLoadMore={onLoadMore}
    fill
    rowHeight={88}
    columns={[
      { key: "asset", header: frontendText(locale, "ADMIN_ASSET_COLUMN_ASSET"), cellClassName: "whitespace-normal", cell: (asset) => { const label = asset.name || frontendText(locale, "ADMIN_ASSET_UNNAMED"); return <div className="py-1"><p className="line-clamp-1 font-medium">{label}</p><div className="mt-2 flex flex-wrap gap-2">{(asset.warnings ?? []).map((warning) => <Badge key={warning} variant="warning">{warning}</Badge>)}</div></div>; } },
      { key: "status", header: frontendText(locale, "ADMIN_ASSET_COLUMN_STATUS"), width: "200px", cell: (asset) => <Badge variant={asset.status === "failed_retryable" ? "warning" : "outline"}>{asset.status || frontendText(locale, "ADMIN_ASSET_STATUS_UNAVAILABLE")}</Badge> },
      { key: "actions", header: frontendText(locale, "ADMIN_ASSET_COLUMN_ACTIONS"), width: "260px", cell: (asset) => { const label = asset.name || asset.id; return <div className="flex items-center gap-2"><Button aria-label={`${frontendText(locale, "ADMIN_ASSET_PREVIEW")} ${label}`} size="sm" variant="outline" disabled={pending || previewLoading} onClick={() => onPreview?.(asset.id)}>{previewLoading ? frontendText(locale, "ADMIN_ASSET_PREVIEW_LOADING") : frontendText(locale, "ADMIN_ASSET_PREVIEW")}</Button>{asset.status === "failed_retryable" && <Button aria-label={`${frontendText(locale, "ADMIN_ASSET_RETRY")} ${label}`} size="sm" disabled={!onRetry || pending || forbidden || pendingIds.includes(asset.id)} onClick={() => request(asset)}>{frontendText(locale, "ADMIN_ASSET_RETRY")}</Button>}</div>; } },
    ]}
  />}{preview && <AssetPreviewPanel locale={locale} preview={preview} />}</>}</section><ConfirmAction open={valid} title={frontendText(locale,"ADMIN_ASSET_CONFIRM_TITLE")}
    description={confirmation ? `${confirmation.asset.name || frontendText(locale,"ADMIN_ASSET_UNNAMED")} (${confirmation.asset.id}). ${frontendText(locale,"ADMIN_ASSET_RETRY_IMPACT")}` : ""}
    cancelLabel={frontendText(locale,"COMMON_CANCEL")} confirmLabel={frontendText(locale,"ADMIN_ASSET_CONFIRM_RETRY")}
    onCancel={cancel} onConfirm={confirm} /></>;
}
