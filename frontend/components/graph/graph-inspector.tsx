import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { GraphNode } from "../../lib/graph-data";
import { buildGraphInspectorModel, isGraphInspectorValueAvailable } from "../../lib/graph-inspector";

export interface GraphInspectorProps {
  locale: LocaleRuntime;
  node: GraphNode | null | undefined;
  onClose?: () => void;
}

export function GraphInspector({ locale, node, onClose }: GraphInspectorProps) {
  const model = buildGraphInspectorModel(node);
  const copy = inspectorCopy(locale);

  if (!model) {
    return (
      <aside data-graph-inspector-empty className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" aria-label={copy.title}>
        <p className="font-medium text-foreground">{copy.title}</p>
        <p className="mt-2">{copy.empty}</p>
      </aside>
    );
  }

  return (
    <aside data-graph-inspector className="min-w-0" aria-label={copy.title}>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{model.label}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{copy.kind}: {model.kind}</p>
          </div>
          {onClose && <Button type="button" size="sm" variant="ghost" aria-label={copy.close} onClick={onClose}>{copy.close}</Button>}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid gap-3">
            <InspectorField label={copy.status} value={model.status} locale={locale} />
            <InspectorField label={copy.identifier} value={model.id} locale={locale} />
            <div>
              <dt className="text-xs text-muted-foreground">{copy.link}</dt>
              <dd className="mt-1 break-all">
                {isGraphInspectorValueAvailable(model.href)
                  ? <a className="text-primary underline-offset-4 hover:underline" href={model.href}>{model.href}</a>
                  : <span>{frontendText(locale, model.href)}</span>}
              </dd>
            </div>
          </dl>
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.metadata}</h4>
            {model.metadata.length ? (
              <dl className="mt-2 grid gap-2">
                {model.metadata.map((field) => (
                  <InspectorField key={`${field.key}:${field.value}`} label={field.key} value={field.value} locale={locale} />
                ))}
              </dl>
            ) : <p className="mt-2 text-muted-foreground">{copy.metadataEmpty}</p>}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function InspectorField({ label, value, locale }: { label: string; value: string; locale: LocaleRuntime }) {
  const display = value === "COMMON_VALUE_UNAVAILABLE" ? frontendText(locale, value) : value;
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{display}</dd></div>;
}

function inspectorCopy(locale: LocaleRuntime) {
  return {
    title: frontendText(locale, "GRAPH_INSPECTOR_TITLE"),
    empty: frontendText(locale, "GRAPH_INSPECTOR_EMPTY"),
    kind: frontendText(locale, "GRAPH_INSPECTOR_KIND"),
    status: frontendText(locale, "GRAPH_INSPECTOR_STATUS"),
    identifier: frontendText(locale, "GRAPH_INSPECTOR_IDENTIFIER"),
    link: frontendText(locale, "GRAPH_INSPECTOR_LINK"),
    metadata: frontendText(locale, "GRAPH_INSPECTOR_METADATA"),
    metadataEmpty: frontendText(locale, "GRAPH_INSPECTOR_METADATA_EMPTY"),
    close: frontendText(locale, "GRAPH_INSPECTOR_CLOSE"),
  };
}
