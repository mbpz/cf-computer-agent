import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, type Fetcher } from "./api";
import { validateSubmissionTarget, type SubmissionTarget } from "./submission-data";

export interface MemberSpace {
  id: string;
  slug: string;
  name: string;
  kind: "shared" | "legacy";
  status: "active" | "disabled";
  readOnly: boolean;
  position: number;
}

export interface MemberCollection {
  id: string;
  spaceId: string;
  parentId: string | null;
  name: string;
  status: "active" | "disabled";
}

/** A Space may receive a submission only when the repository insert guard accepts it. */
export function isSubmittableSpace(space: MemberSpace): boolean {
  return space.kind === "shared" && space.readOnly === false && space.status === "active";
}

type ReadOptions = { cursor?: string; requester?: Fetcher; signal?: AbortSignal };

export async function loadSubmissionSpaces(options: ReadOptions = {}): Promise<{ items: MemberSpace[]; nextCursor?: string }> {
  const { cursor, requester = fetch, signal } = options;
  return page(await apiFetch<unknown>(pageUrl("/api/spaces", cursor), { requester, signal }), normalizeSpace);
}

export async function loadSpaceCollections(spaceId: string, options: ReadOptions = {}): Promise<{ items: MemberCollection[]; nextCursor?: string }> {
  const { cursor, requester = fetch, signal } = options;
  return page(
    await apiFetch<unknown>(pageUrl(`/api/spaces/${encodeURIComponent(spaceId)}/collections`, cursor), { requester, signal }),
    (value) => normalizeCollection(value, spaceId),
  );
}

export interface SubmissionTargetsView {
  kind: "loading" | "error" | "ready";
  spaces: readonly MemberSpace[];
  hasMoreSpaces: boolean;
  spaceId: string | null;
  collections: { kind: "idle" | "loading" | "error" | "ready"; items: readonly MemberCollection[]; hasMore: boolean };
  collectionId: string | null;
  visibility: "shared" | "admin_only";
  target: SubmissionTarget | null;
  storedTargetMissing: boolean;
}

export interface SubmissionTargetsActions {
  retry(): void;
  loadMoreSpaces(): void;
  selectSpace(id: string): void;
  retryCollections(): void;
  loadMoreCollections(): void;
  selectCollection(id: string | null): void;
  selectVisibility(value: "shared" | "admin_only"): void;
}

/** The imperative surface behind {@link useSubmissionTargets}; owned here so the hook never re-derives it. */
export interface SubmissionTargetsController {
  start(): void;
  retry(): void;
  loadMoreSpaces(): void;
  selectSpace(id: string): void;
  retryCollections(): void;
  loadMoreCollections(): void;
  selectCollection(id: string | null): void;
  selectVisibility(value: "shared" | "admin_only"): void;
  dispose(): void;
}

/** The server page size the member endpoints accept; every page below is folded up to this bound. */
const pageLimit = 50;
const maxPagesPerLoad = 5;

interface CollectionsState {
  kind: "idle" | "loading" | "error" | "ready";
  items: MemberCollection[];
  nextCursor: string | undefined;
  hasMore: boolean;
}

interface InternalState {
  kind: "loading" | "error" | "ready";
  spaces: MemberSpace[];
  nextCursor: string | undefined;
  hasMoreSpaces: boolean;
  spaceId: string | null;
  collections: CollectionsState;
  collectionId: string | null;
  visibility: "shared" | "admin_only";
  storedTargetMissing: boolean;
}

export function useSubmissionTargets(options: { requester?: Fetcher; initial?: SubmissionTarget | null } = {}): {
  view: SubmissionTargetsView;
  actions: SubmissionTargetsActions;
} {
  const requester = options.requester ?? fetch;
  const initial = useRef<SubmissionTarget | null>(options.initial ?? null);
  const [view, setView] = useState<SubmissionTargetsView>(() => derive(emptyState()));
  const controller = useRef<SubmissionTargetsController | null>(null);

  useEffect(() => {
    const current = createController({ requester, initial: initial.current, onView: setView });
    controller.current = current;
    current.start();
    return () => {
      current.dispose();
      if (controller.current === current) controller.current = null;
    };
  }, [requester]);

  const actions = useMemo<SubmissionTargetsActions>(() => ({
    retry: () => controller.current?.retry(),
    loadMoreSpaces: () => controller.current?.loadMoreSpaces(),
    selectSpace: (id) => controller.current?.selectSpace(id),
    retryCollections: () => controller.current?.retryCollections(),
    loadMoreCollections: () => controller.current?.loadMoreCollections(),
    selectCollection: (id) => controller.current?.selectCollection(id),
    selectVisibility: (value) => controller.current?.selectVisibility(value),
  }), []);

  return { view, actions };
}

function emptyState(): InternalState {
  return {
    kind: "loading",
    spaces: [],
    nextCursor: undefined,
    hasMoreSpaces: false,
    spaceId: null,
    collections: { kind: "idle", items: [], nextCursor: undefined, hasMore: false },
    collectionId: null,
    visibility: "shared",
    storedTargetMissing: false,
  };
}

/** The loaded pages are the only source of options; nothing is synthesized here. */
function derive(state: InternalState): SubmissionTargetsView {
  const space = state.spaces.find((candidate) => candidate.id === state.spaceId);
  const selected = space && isSubmittableSpace(space) ? space : null;
  const collectionId = state.collectionId !== null && state.collections.kind === "ready"
    && state.collections.items.some((collection) => collection.id === state.collectionId && collection.status === "active")
    ? state.collectionId
    : null;
  let target: SubmissionTarget | null = null;
  if (selected) {
    try {
      target = validateSubmissionTarget({ requestedSpaceId: selected.id, requestedCollectionId: collectionId, requestedVisibility: state.visibility });
    } catch {
      target = null;
    }
  }
  return {
    kind: state.kind,
    spaces: state.kind === "ready" ? state.spaces : [],
    hasMoreSpaces: state.kind === "ready" && state.hasMoreSpaces,
    spaceId: selected ? selected.id : null,
    collections: { kind: state.collections.kind, items: state.collections.items, hasMore: state.collections.hasMore },
    collectionId,
    visibility: state.visibility,
    target,
    storedTargetMissing: state.kind === "ready" && state.storedTargetMissing,
  };
}

function createController({ requester, initial, onView }: { requester: Fetcher; initial: SubmissionTarget | null; onView: (view: SubmissionTargetsView) => void }): SubmissionTargetsController {
  let disposed = false;
  let spaceGeneration = 0;
  let collectionGeneration = 0;
  let initialized = false;
  const inflight = new Set<AbortController>();
  let state = emptyState();

  const track = () => { const controller = new AbortController(); inflight.add(controller); return controller; };
  const emit = () => { if (!disposed) onView(derive(state)); };

  /** Runs once per successful space read: the stored target wins only when its Space is loaded and submittable. */
  function applyInitial() {
    const stored = initial;
    if (stored) {
      const found = state.spaces.find((space) => space.id === stored.requestedSpaceId);
      if (found && isSubmittableSpace(found)) {
        state.spaceId = found.id;
        state.collectionId = stored.requestedCollectionId;
        state.visibility = stored.requestedVisibility === "admin_only" ? "admin_only" : "shared";
        state.storedTargetMissing = false;
        return;
      }
      state.storedTargetMissing = true;
      state.visibility = "shared";
      state.spaceId = state.spaces.find(isSubmittableSpace)?.id ?? null;
      return;
    }
    state.storedTargetMissing = false;
    state.visibility = "shared";
    state.spaceId = state.spaces.find(isSubmittableSpace)?.id ?? null;
  }

  async function loadSpaces() {
    const generation = ++spaceGeneration;
    collectionGeneration += 1;
    const controller = track();
    state = emptyState();
    emit();
    try {
      const items: MemberSpace[] = [];
      let cursor: string | undefined;
      let next: string | undefined;
      for (let index = 0; index < maxPagesPerLoad; index += 1) {
        const result = await loadSubmissionSpaces({ cursor, requester, signal: controller.signal });
        if (disposed || generation !== spaceGeneration) return;
        items.push(...result.items);
        next = result.nextCursor;
        if (!next) break;
        cursor = next;
      }
      state.kind = "ready";
      state.spaces = items;
      state.nextCursor = next;
      state.hasMoreSpaces = next !== undefined;
      if (!initialized) { initialized = true; applyInitial(); }
      emit();
      if (state.spaceId) await loadCollections(state.spaceId, "reset", generation);
    } catch {
      if (disposed || generation !== spaceGeneration) return;
      state = emptyState();
      state.kind = "error";
      emit();
    } finally {
      inflight.delete(controller);
    }
  }

  async function loadCollections(spaceId: string, mode: "reset" | "more", spaceRun: number) {
    const generation = ++collectionGeneration;
    const controller = track();
    const startCursor = mode === "reset" ? undefined : state.collections.nextCursor;
    if (mode === "reset") {
      state.collections = { kind: "loading", items: [], nextCursor: undefined, hasMore: false };
      emit();
    }
    try {
      const items = mode === "more" ? [...state.collections.items] : [];
      let cursor = startCursor;
      let next: string | undefined;
      const pages = mode === "reset" ? maxPagesPerLoad : 1;
      for (let index = 0; index < pages; index += 1) {
        const result = await loadSpaceCollections(spaceId, { cursor, requester, signal: controller.signal });
        if (disposed || generation !== collectionGeneration || spaceRun !== spaceGeneration || state.spaceId !== spaceId) return;
        items.push(...result.items);
        next = result.nextCursor;
        if (!next) break;
        cursor = next;
      }
      state.collections = { kind: "ready", items, nextCursor: next, hasMore: next !== undefined };
      emit();
    } catch {
      if (disposed || generation !== collectionGeneration || spaceRun !== spaceGeneration || state.spaceId !== spaceId) return;
      state.collections = { kind: "error", items: [], nextCursor: undefined, hasMore: false };
      emit();
    } finally {
      inflight.delete(controller);
    }
  }

  function start() { void loadSpaces(); }

  function retry() { initialized = false; void loadSpaces(); }

  async function loadMoreSpaces() {
    if (state.kind !== "ready" || !state.hasMoreSpaces || state.nextCursor === undefined) return;
    const generation = spaceGeneration;
    const controller = track();
    try {
      const result = await loadSubmissionSpaces({ cursor: state.nextCursor, requester, signal: controller.signal });
      if (disposed || generation !== spaceGeneration) return;
      state.spaces = [...state.spaces, ...result.items];
      state.nextCursor = result.nextCursor;
      state.hasMoreSpaces = result.nextCursor !== undefined;
      emit();
    } catch {
      // The loaded options stay authoritative; a failed page adds nothing.
    } finally {
      inflight.delete(controller);
    }
  }

  function selectSpace(id: string) {
    const space = state.spaces.find((candidate) => candidate.id === id);
    if (!space || !isSubmittableSpace(space) || id === state.spaceId) return;
    state.spaceId = id;
    state.collectionId = null;
    state.collections = { kind: "loading", items: [], nextCursor: undefined, hasMore: false };
    emit();
    void loadCollections(id, "reset", spaceGeneration);
  }

  function retryCollections() {
    if (!state.spaceId) return;
    void loadCollections(state.spaceId, "reset", spaceGeneration);
  }

  function loadMoreCollections() {
    if (!state.spaceId || state.collections.kind !== "ready" || !state.collections.hasMore || state.collections.nextCursor === undefined) return;
    void loadCollections(state.spaceId, "more", spaceGeneration);
  }

  function selectCollection(id: string | null) { state.collectionId = id; emit(); }

  function selectVisibility(value: "shared" | "admin_only") { state.visibility = value; emit(); }

  function dispose() {
    disposed = true;
    for (const controller of inflight) controller.abort();
    inflight.clear();
  }

  return { start, retry, loadMoreSpaces, selectSpace, retryCollections, loadMoreCollections, selectCollection, selectVisibility, dispose };
}

function pageUrl(path: string, cursor?: string) {
  const params = new URLSearchParams({ limit: String(pageLimit) });
  if (cursor) params.set("cursor", cursor);
  return `${path}?${params}`;
}

function invalid(): never { throw new Error("SPACE_RESPONSE_INVALID"); }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function normalizeSpace(value: unknown): MemberSpace {
  const source = record(value);
  if (!text(source.id, 200) || !text(source.name, 120) || !text(source.slug, 80)
    || !["shared", "legacy"].includes(String(source.kind))
    || !["active", "disabled"].includes(String(source.status))
    || typeof source.readOnly !== "boolean"
    || !Number.isSafeInteger(source.position) || Number(source.position) < 0 || Number(source.position) > 1_000_000) invalid();
  return {
    id: source.id as string,
    slug: source.slug as string,
    name: source.name as string,
    kind: source.kind as MemberSpace["kind"],
    status: source.status as MemberSpace["status"],
    readOnly: source.readOnly as boolean,
    position: source.position as number,
  };
}

function normalizeCollection(value: unknown, spaceId: string): MemberCollection {
  const source = record(value);
  if (!text(source.id, 200) || source.spaceId !== spaceId
    || (source.parentId !== null && !text(source.parentId, 200))
    || !text(source.name, 120)
    || !["active", "disabled"].includes(String(source.status))) invalid();
  return {
    id: source.id as string,
    spaceId,
    parentId: source.parentId as string | null,
    name: source.name as string,
    status: source.status as MemberCollection["status"],
  };
}

function page<T extends { id: string }>(value: unknown, normalize: (value: unknown) => T): { items: T[]; nextCursor?: string } {
  const source = record(value);
  if (!Array.isArray(source.items) || source.items.length > pageLimit || (source.nextCursor !== undefined && !text(source.nextCursor, 4096))) invalid();
  const items = (source.items as unknown[]).map(normalize);
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid();
  return { items, nextCursor: source.nextCursor as string | undefined };
}
