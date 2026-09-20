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
export const GRAPH_CANVAS_MEDIA_QUERY = "(max-width: 48rem)";
export const GRAPH_CANVAS_LAYOUT_TIMEOUT_MS = 1500;

export interface GraphCanvasLayoutOptions {
  name: GraphCanvasLayout;
  animate: false;
  fit: true;
  padding: number;
  [key: string]: string | number | boolean;
}

export interface GraphCanvasHandle {
  destroy: () => void;
}

export interface GraphCanvasProps {
  snapshot: GraphSnapshot;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearSelection?: () => void;
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

interface CytoscapeLayoutHandle {
  run: () => unknown;
  stop: () => unknown;
  on?: (event: string, handler: () => void) => unknown;
}

interface CytoscapeElement {
  group: "nodes" | "edges";
  data: Record<string, unknown>;
}

interface CytoscapeInstance {
  on: (event: string, handler: (event: CytoscapeEvent) => void) => void;
  off: (event: string, handler: (event: CytoscapeEvent) => void) => void;
  destroy: () => void;
  layout?: (options: GraphCanvasLayoutOptions) => CytoscapeLayoutHandle;
  resize?: () => void;
  getElementById?: (id: string) => { addClass?: (name: string) => void; removeClass?: (name: string) => void };
  elements?: () => { removeClass?: (name: string) => void };
}

type CytoscapeFactory = (options: {
  container: HTMLElement;
  elements: CytoscapeElement[];
  style: Array<{ selector: string; style: Record<string, string | number> }>;
}) => CytoscapeInstance;

const destroyedInstances = new WeakSet<object>();

export function normalizeGraphCanvasLayout(layout: string | undefined): GraphCanvasLayout {
  return isGraphCanvasLayout(layout) ? layout : "concentric";
}

export function graphCanvasLayoutOptions(layout: GraphCanvasLayout): GraphCanvasLayoutOptions {
  const base = { name: layout, animate: false as const, fit: true as const, padding: 24 };
  if (layout === "breadthfirst") return { ...base, directed: true, maximalAdjustments: 50, spacingFactor: 1.1 };
  if (layout === "concentric") return { ...base, minNodeSpacing: 24, equidistant: true, avoidOverlap: true };
  if (layout === "cose") return { ...base, numIter: 250, refresh: 25, randomize: false, initialTemp: 100, idealEdgeLength: 100 };
  return { ...base, rows: 4, cols: 4, avoidOverlap: true };
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

function stopLayout(layoutRef: { current: CytoscapeLayoutHandle | null }, timerRef: { current: ReturnType<typeof setTimeout> | null }): void {
  if (timerRef.current !== null) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  layoutRef.current?.stop();
  layoutRef.current = null;
}

function graphCanvasIsNarrow(): boolean {
  return typeof globalThis.matchMedia === "function" && globalThis.matchMedia(GRAPH_CANVAS_MEDIA_QUERY).matches;
}

function graphCanvasIsHidden(container: HTMLElement): boolean {
  if (typeof globalThis.getComputedStyle !== "function") return false;
  const style = globalThis.getComputedStyle(container);
  return style.display === "none" || style.visibility === "hidden";
}

function GraphCanvasView(
  { snapshot, selectedId, onSelect, onClearSelection, layout, fallbackLabel, loadCytoscape }: GraphCanvasProps,
  forwardedRef: ForwardedRef<GraphCanvasHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<CytoscapeInstance | null>(null);
  const tapHandlerRef = useRef<((event: CytoscapeEvent) => void) | null>(null);
  const layoutRef = useRef<CytoscapeLayoutHandle | null>(null);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const safeLayout = normalizeGraphCanvasLayout(layout);
  const elements = useMemo(() => graphSnapshotToCytoscapeElements(snapshot), [snapshot]);
  const nodeButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useImperativeHandle(forwardedRef, () => ({
    destroy() {
      stopLayout(layoutRef, layoutTimerRef);
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

    const canInitialize = () => Boolean(container) && snapshot.nodes.length > 0 && !graphCanvasIsNarrow() && !graphCanvasIsHidden(container!);
    const clearLayout = () => stopLayout(layoutRef, layoutTimerRef);
    const runLayout = (instance: CytoscapeInstance, layoutName: GraphCanvasLayout, allowFallback: boolean) => {
      clearLayout();
      const handle = instance.layout?.(graphCanvasLayoutOptions(layoutName));
      if (!handle) return;
      layoutRef.current = handle;
      const clearWhenStopped = () => {
        if (layoutRef.current === handle) {
          if (layoutTimerRef.current !== null) clearTimeout(layoutTimerRef.current);
          layoutTimerRef.current = null;
        }
      };
      handle.on?.("layoutstop", clearWhenStopped);
      if (allowFallback && layoutName === "cose") {
        layoutTimerRef.current = setTimeout(() => {
          if (!active || layoutRef.current !== handle) return;
          handle.stop();
          layoutRef.current = null;
          runLayout(instance, "grid", false);
        }, GRAPH_CANVAS_LAYOUT_TIMEOUT_MS);
      }
      handle.run();
    };
    const destroyLocal = () => {
      clearLayout();
      destroyInstance(localInstance, tapHandler);
      if (instanceRef.current === localInstance) instanceRef.current = null;
      if (tapHandlerRef.current === tapHandler) tapHandlerRef.current = null;
      localInstance = null;
      tapHandler = null;
    };
    const createInstance = async () => {
      if (!canInitialize() || localInstance) return;
      try {
        const module = await cytoscapeLoader();
        if (!active || !canInitialize() || !containerRef.current) return;
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
          style: [
            { selector: "node", style: { label: "data(label)", "background-color": "#2f6f8f", color: "#102a43", "font-size": 12, "text-wrap": "wrap", "text-max-width": 120 } },
            { selector: "node.is-selected", style: { "background-color": "#d97706", "border-width": 3, "border-color": "#92400e" } },
            { selector: "edge", style: { label: "data(label)", width: "data(weight)", "line-color": "#9fb3c8", "target-arrow-color": "#9fb3c8", "target-arrow-shape": "triangle", "curve-style": "bezier", "font-size": 9, color: "#486581" } },
          ],
        });
        instanceRef.current = localInstance;
        localInstance.on("tap", tapHandler);
        updateSelectedNode(localInstance, selectedId);
        runLayout(localInstance, safeLayout, true);
      } catch {
        // The semantic list remains available when Cytoscape cannot load.
      }
    };
    const handleVisibilityChange = () => {
      if (!active) return;
      if (!canInitialize()) {
        destroyLocal();
        return;
      }
      if (localInstance) {
        localInstance.resize?.();
        runLayout(localInstance, safeLayout, true);
      } else {
        void createInstance();
      }
    };

    if (container) {
      const media = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(GRAPH_CANVAS_MEDIA_QUERY) : null;
      media?.addEventListener?.("change", handleVisibilityChange);
      media?.addListener?.(handleVisibilityChange);
      const ResizeObserverCtor = typeof globalThis.ResizeObserver === "function" ? globalThis.ResizeObserver : null;
      const observer = ResizeObserverCtor ? new ResizeObserverCtor(() => handleVisibilityChange()) : null;
      observer?.observe(container);
      void createInstance();
      return () => {
        active = false;
        media?.removeEventListener?.("change", handleVisibilityChange);
        media?.removeListener?.(handleVisibilityChange);
        observer?.disconnect();
        destroyLocal();
      };
    }

    return () => {
      active = false;
      destroyLocal();
    };
  }, [cytoscapeLoader, elements, safeLayout, snapshot]);

  useEffect(() => {
    updateSelectedNode(instanceRef.current, selectedId);
  }, [selectedId]);

  return (
    <section data-graph-canvas className="graph-canvas" aria-label={fallbackLabel || undefined}>
      <div ref={containerRef} className="graph-canvas__viewport" aria-hidden="true" />
      <ul
        data-graph-fallback
        data-graph-node-list
        className="graph-canvas__fallback"
        aria-label={fallbackLabel || undefined}
        onKeyDown={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLButtonElement)) return;
          const index = snapshot.nodes.findIndex((node) => node.id === target.dataset.graphNodeId);
          if (index < 0) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClearSelection?.();
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            onSelect(snapshot.nodes[index]!.id);
            return;
          }
          const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
          if (!direction) return;
          event.preventDefault();
          const next = (index + direction + snapshot.nodes.length) % snapshot.nodes.length;
          const nextNode = snapshot.nodes[next];
          if (nextNode) nodeButtonRefs.current.get(nextNode.id)?.focus();
        }}
      >
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
                ref={(element) => {
                  if (element) nodeButtonRefs.current.set(node.id, element);
                  else nodeButtonRefs.current.delete(node.id);
                }}
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
