import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AssetPreviewModel } from "./asset-preview-model";

export function AssetPreviewPanel({ preview, locale }: { preview: AssetPreviewModel | null; locale?: LocaleRuntime }) {
  if (!preview) return <Card><CardContent className="p-5 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ASSET_PREVIEW_EMPTY")}</CardContent></Card>;
  return <Card data-asset-preview={preview.assetId}><CardHeader><CardTitle>{frontendText(locale, "ADMIN_ASSET_PREVIEW_TITLE")}: {preview.originalName}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{frontendText(locale, "ADMIN_ASSET_PREVIEW_LINES")}: {preview.lineCount}</span><span>{frontendText(locale, "ADMIN_ASSET_PREVIEW_SCHEMA")}: {preview.parserSchemaVersion}</span></div>{preview.warnings.length ? <div><p className="mb-2 text-sm font-medium">{frontendText(locale, "ADMIN_ASSET_PREVIEW_WARNINGS")}</p><div className="flex flex-wrap gap-2">{preview.warnings.map((warning, index) => <Badge key={`${warning}-${index}`} variant="warning">{warning}</Badge>)}</div></div> : null}<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-xs leading-6">{preview.markdown || frontendText(locale, "ADMIN_ASSET_PREVIEW_EMPTY")}</pre></CardContent></Card>;
}
