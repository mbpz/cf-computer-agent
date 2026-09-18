import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ForwardedRef,
} from "react";
import type { GraphSnapshot } from "../../lib/graph-data";
import "./graph-canvas.css";

export const GRAPH_CANVAS_LAYOUTS = ["breadthfirst", "concentric", "cose", "grid"] as const;
export type GraphCanvasLayout = (typeof GRAPH_CANVAS_LAYOUTS)[number];

export interface GraphCanvasHandle {
  destroy: () => void;
}

export interface GraphCanvasProps {
  snapshot: GraphSnapshot;
  selectedId: string | null;
  onSelect: (id: string) => void;
  layout?: string;
  fallbackLabel?: string;
  loadCytoscape?: () => Promise<unknown>;
}

interface CytoscapeTarget {
  id?: () => string;
  isNode?: () => boolean;
}

interface CytoscapeEvent {
  target?: CytoscapeTarget;
}

interface CytoscapeElement {
  group: "nodes" | "edges";
  data: Record<string, unknown>;
}

interface CytoscapeInstance {
  on: (event: string, handler: (event: CytoscapeEvent) => void) => void;
  off: (event: string, handler: (event: CytoscapeEvent) => void) => void;
  destroy: () => void;
  getElementById?: (id: string) => { addClass?: (name: string) => void; removeClass?: (name: string) => void };
  elements?: () => { removeClass?: (name: string) => void };
}

type CytoscapeFactory = (options: {
  container: HTMLElement;
  elements: CytoscapeElement[];
  layout: { name: GraphCanvasLayout };
  style: Array<{ selector: string; style: Record<string, string | number> }>;
}) => CytoscapeInstance;

const destroyedInstances = new WeakSet<object>();

export function normalizeGraphCanvasLayout(layout: string | undefined): GraphCanvasLayout {
  return isGraphCanvasLayout(layout) ? layout : "concentric";
}

export function graphSnapshotToCytoscapeElements(snapshot: GraphSnapshot): CytoscapeElement[] {
  const nodes = snapshot.nodes.map((node) => ({
    group: "nodes" as const,
    data: {
      id: node.id,
      label: safeLabel(node.label, node.id),
      kind: node.kind,
      status: node.status ?? null,
      href: node.href ?? null,
      metadata: node.metadata ?? {},
    },
  }));
  const edges = snapshot.edges.map((edge) => ({
    group: "edges" as const,
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      label: safeLabel(edge.label, edge.kind),
      weight: Number.isFinite(edge.weight) ? edge.weight : 0,
      citationIds: [...(edge.citationIds ?? [])],
    },
  }));
  return [...nodes, ...edges];
}

function isGraphCanvasLayout(value: string | undefined): value is GraphCanvasLayout {
  return typeof value === "string" && (GRAPH_CANVAS_LAYOUTS as readonly string[]).includes(value);
}

function destroyInstance(instance: CytoscapeInstance | null, tapHandler: ((event: CytoscapeEvent) => void) | null): void {
  if (!instance) return;
  if (destroyedInstances.has(instance)) return;
  if (tapHandler) instance.off("tap", tapHandler);
  instance.destroy();
  destroyedInstances.add(instance);
}

function safeLabel(value: string, fallback: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function updateSelectedNode(instance: CytoscapeInstance | null, selectedId: string | null): void {
  if (!instance) return;
  instance.elements?.()?.removeClass?.("is-selected");
  if (selectedId) instance.getElementById?.(selectedId)?.addClass?.("is-selected");
}

function GraphCanvasView(
  { snapshot, selectedId, onSelect, layout, fallbackLabel, loadCytoscape }: GraphCanvasProps,
  forwardedRef: ForwardedRef<GraphCanvasHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<CytoscapeInstance | null>(null);
  const tapHandlerRef = useRef<((event: CytoscapeEvent) => void) | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const safeLayout = normalizeGraphCanvasLayout(layout);
  const elements = useMemo(() => graphSnapshotToCytoscapeElements(snapshot), [snapshot]);

  useImperativeHandle(forwardedRef, () => ({
    destroy() {
      destroyInstance(instanceRef.current, tapHandlerRef.current);
      instanceRef.current = null;
      tapHandlerRef.current = null;
    },
  }), []);

  const cytoscapeLoader = useMemo(() => loadCytoscape ?? (() => import("cytoscape")), [loadCytoscape]);

  useEffect(() => {
    const container = containerRef.current;
    let active = true;
    let tapHandler: ((event: CytoscapeEvent) => void) | null = null;
    let localInstance: CytoscapeInstance | null = null;

    if (container && snapshot.nodes.length > 0) {
      void cytoscapeLoader().then((module) => {
        if (!active || !containerRef.current) return;
        const cytoscape = (module.default ?? module) as unknown as CytoscapeFactory;
        tapHandler = (event) => {
          const target = event.target;
          if (target?.isNode && !target.isNode()) return;
          const id = target?.id?.();
          if (id) onSelectRef.current(id);
        };
        tapHandlerRef.current = tapHandler;
        localInstance = cytoscape({
          container,
          elements,
          layout: { name: safeLayout },
          style: [
            { selector: "node", style: { label: "data(label)", "background-color": "#2f6f8f", color: "#102a43", "font-size": 12, "text-wrap": "wrap", "text-max-width": 120 } },
            { selector: "node.is-selected", style: { "background-color": "#d97706", "border-width": 3, "border-color": "#92400e" } },
            { selector: "edge", style: { label: "data(label)", width: "data(weight)", "line-color": "#9fb3c8", "target-arrow-color": "#9fb3c8", "target-arrow-shape": "triangle", "curve-style": "bezier", "font-size": 9, color: "#486581" } },
          ],
        });
        instanceRef.current = localInstance;
        localInstance.on("tap", tapHandler);
      }).catch(() => {
        // The semantic list remains available when Cytoscape cannot load.
      });
    }

    return () => {
      active = false;
      destroyInstance(localInstance, tapHandler);
      if (tapHandlerRef.current === tapHandler) tapHandlerRef.current = null;
      if (instanceRef.current === localInstance) instanceRef.current = null;
    };
  }, [cytoscapeLoader, elements, safeLayout, snapshot]);

  useEffect(() => {
    updateSelectedNode(instanceRef.current, selectedId);
  }, [selectedId]);

  return (
    <section data-graph-canvas className="graph-canvas" aria-label={fallbackLabel || undefined}>
      <div ref={containerRef} className="graph-canvas__viewport" aria-hidden="true" />
      <ul data-graph-fallback className="graph-canvas__fallback">
        {snapshot.nodes.map((node) => {
          const label = safeLabel(node.label, node.id);
          const isSelected = selectedId === node.id;
          return (
            <li key={node.id}>
              <button
                type="button"
                data-graph-node-id={node.id}
                data-graph-node-kind={node.kind}
                aria-pressed={isSelected}
                className="graph-canvas__node"
                onClick={() => onSelect(node.id)}
              >
                <span>{label}</span>
                {typeof node.status === "string" && node.status.trim() && <span className="graph-canvas__status">{node.status}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(GraphCanvasView);
GraphCanvas.displayName = "GraphCanvas";
