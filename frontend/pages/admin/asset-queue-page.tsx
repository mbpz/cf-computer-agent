import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { AssetPreviewPanel } from "../../components/assets/asset-preview-panel";
import { PageState } from "../../components/ui/page-state";
import type { AssetPreviewModel } from "../../components/assets/asset-preview-model";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export function AssetQueuePage({ assets, preview = null, onRetry, onPreview, locale }: { assets: readonly { id: string; name?: string; status?: string; warnings?: readonly string[] }[]; preview?: AssetPreviewModel | null; onRetry?: (id: string) => void; onPreview?: (id: string) => void; locale?: LocaleRuntime }) {
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_ASSET_QUEUE_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ASSET_QUEUE_DESCRIPTION")}</p></div>{assets.length ? assets.map((asset) => <Card key={asset.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><div><h2 className="font-medium">{asset.name || frontendText(locale, "ADMIN_ASSET_UNNAMED")}</h2><div className="mt-2 flex flex-wrap gap-2">{(asset.warnings ?? []).map((warning) => <Badge key={warning} variant="warning">{warning}</Badge>)}</div></div><div className="flex items-center gap-2"><Badge variant={asset.status === "failed_retryable" ? "warning" : "outline"}>{asset.status || frontendText(locale, "ADMIN_ASSET_STATUS_UNAVAILABLE")}</Badge><Button size="sm" variant="outline" onClick={() => onPreview?.(asset.id)}>{frontendText(locale, "ADMIN_ASSET_PREVIEW")}</Button>{asset.status === "failed_retryable" && <Button size="sm" onClick={() => onRetry?.(asset.id)}>{frontendText(locale, "ADMIN_ASSET_RETRY")}</Button>}</div></CardContent></Card>) : <PageState kind="empty" title={frontendText(locale, "ADMIN_ASSET_EMPTY")} description={frontendText(locale, "ADMIN_ASSET_QUEUE_DESCRIPTION")} />}{preview && <AssetPreviewPanel locale={locale} preview={preview} />}</section>;
}
