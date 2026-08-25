import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { AssetPreviewPanel } from "../../components/assets/asset-preview-panel";
import type { AssetPreviewModel } from "../../components/assets/asset-preview-model";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export function AssetQueuePage({ assets, preview = null, onRetry, onPreview, locale }: { assets: readonly { id: string; name?: string; status?: string; warnings?: readonly string[] }[]; preview?: AssetPreviewModel | null; onRetry?: (id: string) => void; onPreview?: (id: string) => void; locale?: LocaleRuntime }) {
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">Asset queue</h1><p className="mt-1 text-sm text-muted-foreground">Inspect parser status, warnings, and previews.</p></div>{assets.length ? assets.map((asset) => <Card key={asset.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><div><h2 className="font-medium">{asset.name || "Unnamed asset"}</h2><div className="mt-2 flex flex-wrap gap-2">{(asset.warnings ?? []).map((warning) => <Badge key={warning} variant="warning">{warning}</Badge>)}</div></div><div className="flex items-center gap-2"><Badge variant={asset.status === "failed_retryable" ? "warning" : "outline"}>{asset.status || "Status unavailable"}</Badge><Button size="sm" variant="outline" onClick={() => onPreview?.(asset.id)}>Preview</Button>{asset.status === "failed_retryable" && <Button size="sm" onClick={() => onRetry?.(asset.id)}>Retry</Button>}</div></CardContent></Card>) : <p className="text-sm text-muted-foreground">No assets in queue.</p>}{preview && <AssetPreviewPanel locale={locale} preview={preview} />}</section>;
}
