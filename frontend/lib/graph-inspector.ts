import type { GraphNode } from "./graph-data";

/** Translation key consumed by the inspector when an optional graph value is absent. */
export const COMMON_VALUE_UNAVAILABLE = "COMMON_VALUE_UNAVAILABLE" as const;

export interface GraphInspectorMetadataField {
  key: string;
  value: string;
}

export interface GraphInspectorModel {
  id: string;
  kind: string;
  label: string;
  status: string;
  href: string;
  metadata: GraphInspectorMetadataField[];
}

/**
 * Convert the public graph node contract into display-safe values.
 *
 * Graph metadata is intentionally treated as untrusted display data. The model
 * never leaks nullish values to React text nodes, so the inspector cannot render
 * the literal strings "undefined" or "null" when a projection is incomplete.
 */
export function buildGraphInspectorModel(node: GraphNode | null | undefined): GraphInspectorModel | null {
  if (!node) return null;

  const metadata = Object.entries(node.metadata ?? {})
    .map(([key, value]) => ({ key: displayValue(key), value: displayValue(value) }))
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    id: displayValue(node.id),
    kind: displayValue(node.kind),
    label: displayValue(node.label),
    status: displayValue(node.status),
    href: displayValue(node.href),
    metadata,
  };
}

export function isGraphInspectorValueAvailable(value: string): boolean {
  return value !== COMMON_VALUE_UNAVAILABLE;
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value.trim() || COMMON_VALUE_UNAVAILABLE;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return COMMON_VALUE_UNAVAILABLE;
}
