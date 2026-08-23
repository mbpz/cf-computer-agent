import { translateEnglish } from "./i18n.js";

let translate = translateEnglish;

export function configureWorkspaceI18n(nextTranslate) {
  translate = typeof nextTranslate === "function" ? nextTranslate : translateEnglish;
}

function t(key, values) { return translate(key, values); }

const assetFailureMessageKeys = Object.freeze({
  ASSET_CONTENT_INVALID: "ERROR_ASSET_CONTENT_INVALID",
  ASSET_PARSER_UNSUPPORTED: "ERROR_ASSET_PARSER_UNSUPPORTED",
  SOURCE_EMPTY: "ERROR_ASSET_CONTENT_EMPTY",
  SOURCE_TOO_LARGE: "ERROR_ASSET_CONTENT_TOO_LARGE",
  ASSET_ORIGINAL_MISSING: "ERROR_ASSET_ORIGINAL_MISSING",
  ASSET_AI_PARSE_FAILED: "ERROR_ASSET_AI_PARSE_FAILED",
  ASSET_PARSE_RETRYABLE: "SUBMIT_ASSET_RETRYABLE",
});

export function createRouteGuard() {
  let generation = 0;
  return Object.freeze({
    begin() { generation += 1; return generation; },
    capture(pathname) { return Object.freeze({ generation, pathname }); },
    owner(routeGeneration, pathname) { return Object.freeze({ generation: routeGeneration, pathname }); },
    isCurrent(value) { return value === generation; },
    owns(owner, pathname) { return owner.generation === generation && owner.pathname === pathname; },
  });
}

export function createOperationGuard() {
  let generation = 0;
  return Object.freeze({
    begin() { generation += 1; return generation; },
    isCurrent(value) { return value === generation; },
  });
}

export function createLocaleRefreshController(initialLocale, callbacks) {
  let locale = safeString(initialLocale);
  return Object.freeze({
    apply(nextLocale) {
      const candidate = safeString(nextLocale);
      if (!candidate || candidate === locale) return false;
      locale = candidate;
      callbacks.applyLocale(candidate);
      callbacks.refreshTranslations();
      return true;
    },
  });
}

export function createReplaceableOwner(owns) {
  let generation = 0;
  return Object.freeze({
    claim() {
      generation += 1;
      const claimedGeneration = generation;
      return () => claimedGeneration === generation && owns();
    },
  });
}

export async function runLatestOperation(guard, operation, onSuccess, onError, owns = () => true) {
  if (!owns()) return;
  const generation = guard.begin();
  try {
    const value = await operation();
    if (guard.isCurrent(generation) && owns()) onSuccess(value);
  } catch (error) {
    if (guard.isCurrent(generation) && owns()) onError(error);
  }
}

export function createOwnedActionController(owns, action) {
  let invalidated = false;
  let handled = false;
  return Object.freeze({
    run() {
      if (invalidated || handled || !owns()) return false;
      handled = true;
      action();
      return true;
    },
    invalidate() { invalidated = true; },
    canReturnFocus() { return !invalidated && owns(); },
  });
}

export function createLogoutController(request, callbacks) {
  const guard = createOperationGuard();
  let active;
  return Object.freeze({
    run() {
      if (active) return active;
      const generation = guard.begin();
      callbacks.onPendingChange(true);
      active = postLogout(request).then(
        () => {
          if (!guard.isCurrent(generation)) return;
          active = undefined;
          callbacks.onPendingChange(false);
          callbacks.onSuccess();
        },
        (error) => {
          if (!guard.isCurrent(generation)) return;
          active = undefined;
          callbacks.onPendingChange(false);
          callbacks.onError(error);
        },
      );
      return active;
    },
    invalidate() {
      guard.begin();
      active = undefined;
      callbacks.onPendingChange(false);
    },
  });
}

export function drawerState(open) {
  return Object.freeze({
    open,
    ariaExpanded: String(open),
    ariaHidden: String(!open),
    inert: !open,
    label: t(open ? "SHELL_CLOSE_NAVIGATION" : "SHELL_OPEN_NAVIGATION"),
  });
}

export function drawerStateForViewport(mobile, open) {
  return mobile ? drawerState(open) : Object.freeze({
    open: false,
    ariaExpanded: "false",
    ariaHidden: "false",
    inert: false,
    label: t("SHELL_OPEN_NAVIGATION"),
  });
}

export function anonymousShellState() {
  return Object.freeze({
    statusMessage: "",
    drawer: drawerState(false),
  });
}

export function shellControlsModel() {
  return Object.freeze({ placement: "topbar-right", mobile: "topbar-right" });
}

/** Keep account chrome deterministic when a session is partial or anonymous. */
export function accountPresentationModel(session) {
  const email = safeString(session?.member?.email).trim();
  const localPart = email.split("@", 1)[0] || "";
  const initials = localPart
    .split(/[._-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
  return Object.freeze({
    visible: Boolean(email),
    email,
    initials,
    role: safeString(session?.member?.role).trim(),
  });
}

export function shellPresentationModel() {
  return Object.freeze({
    theme: "ink-garden",
    density: "comfortable",
    navigation: "grouped",
    context: "secondary",
  });
}

/**
 * Stable UI contract for the Cloudflare-inspired workbench layer.
 * Keeping this model separate from page rendering makes the visual system
 * testable without coupling tests to browser layout measurements.
 */
export function designSystemModel() {
  return Object.freeze({
    name: "cloudflare-workbench",
    density: "comfortable",
    breakpoints: Object.freeze({ tablet: 960, mobile: 760 }),
    primitives: Object.freeze([
      "shell",
      "topbar",
      "navigation",
      "page-header",
      "content",
      "context-rail",
      "state",
    ]),
    reducedMotion: true,
  });
}

export function dashboardMetricsModel(items) {
  const records = safeArray(items).filter((item) => item && typeof item === "object");
  return Object.freeze({
    total: records.length,
    pending: records.filter((item) => item.status === "review_pending").length,
    published: records.filter((item) => item.status === "published").length,
    needsRevision: records.filter((item) => item.status === "revision_requested").length,
  });
}

export function contentLayoutModel(contextVisible) {
  return Object.freeze({ className: contextVisible ? "content-layout has-context" : "content-layout full-width" });
}

export function contextualPanelModel(items) {
  const unavailable = t("COMMON_VALUE_UNAVAILABLE");
  const normalized = safeArray(items)
    .map((item) => ({
      label: displayValue(item?.label),
      value: displayValue(item?.value),
    }))
    .filter((item) => item.label !== unavailable && item.value !== unavailable)
    .map((item) => Object.freeze(item));
  return Object.freeze({ visible: normalized.length > 0, items: Object.freeze(normalized) });
}

export function compactChildren(...children) {
  return children.filter(Boolean);
}

export function sessionBootstrapState(status, session) {
  if (status === 401) return Object.freeze({ kind: "anonymous" });
  if (status >= 200 && status < 300 && session?.member && Array.isArray(session.capabilities)) {
    return Object.freeze({ kind: "authenticated", session });
  }
  return Object.freeze({ kind: "error" });
}

export async function postLogout(request) {
  const response = await request("/auth/logout", { method: "POST", credentials: "same-origin" });
  if (!response.ok) {
    const error = new Error("LOGOUT_FAILED");
    error.status = response.status;
    throw error;
  }
  return sessionBootstrapState(401);
}

export function routeState(kind, value) {
  const message = value instanceof Error ? value.message : safeString(value);
  return Object.freeze({ kind, message });
}

export function appendPage(current, incoming, key) {
  const merged = [];
  const seen = new Set();
  for (const item of [...safeArray(current), ...safeArray(incoming)]) {
    const value = key(item);
    if (seen.has(value)) continue;
    seen.add(value);
    merged.push(item);
  }
  return merged;
}

export function createMutationController(owns, onPendingChange) {
  let active;
  return Object.freeze({
    run(operation, onSuccess, onError) {
      if (active) return active;
      if (!owns()) return Promise.resolve();
      onPendingChange(true);
      let result;
      try {
        result = operation();
      } catch (error) {
        result = Promise.reject(error);
      }
      const current = Promise.resolve(result).then(
        (value) => { if (owns()) onSuccess(value); },
        (error) => { if (owns()) onError(error); },
      ).finally(() => {
        if (active === current) active = undefined;
        if (owns()) onPendingChange(false);
      });
      active = current;
      return current;
    },
  });
}

export function createReviewTagController({ spaceId, owns, request, onChange }) {
  const fixedSpaceId = safeString(spaceId);
  let items = [];
  let nextCursor;
  let pending = false;
  let loaded = false;
  let error = "";
  let errorKey = "";
  const selectedIds = new Set();
  const snapshot = () => Object.freeze({
    items: items.map((tag) => Object.freeze({ ...tag, selected: selectedIds.has(tag.id) })),
    ...(nextCursor ? { nextCursor } : {}),
    pending,
    loaded,
    error,
    errorKey,
  });
  const emit = () => onChange(snapshot());
  const mutation = createMutationController(owns, (value) => {
    pending = value;
    emit();
  });
  const load = (append) => {
    if (!owns() || (append && !nextCursor)) return Promise.resolve();
    const cursor = append ? nextCursor : undefined;
    return mutation.run(
      () => request(tagPagePath(fixedSpaceId, cursor)),
      (value) => {
        const page = reviewTagPageModel(value, fixedSpaceId);
        items = appendPage(append ? items : [], page.items, (tag) => tag.id);
        nextCursor = page.nextCursor;
        loaded = true;
        error = "";
        errorKey = "";
        emit();
      },
      () => {
        loaded = true;
        errorKey = append ? "REVIEW_TAGS_LOAD_MORE_FAILED" : "REVIEW_TAGS_LOAD_FAILED";
        error = t(append ? "REVIEW_TAGS_LOAD_MORE_FAILED" : "REVIEW_TAGS_LOAD_FAILED");
        emit();
      },
    );
  };
  return Object.freeze({
    loadInitial() { return load(false); },
    loadMore() { return load(true); },
    select(tagId, selected) {
      if (!owns()) return;
      const id = safeString(tagId);
      if (!items.some((tag) => tag.id === id)) return;
      if (selected) selectedIds.add(id);
      else selectedIds.delete(id);
    },
    snapshot,
  });
}

export function reviewTagLoadMoreModel(value) {
  const state = safeRecord(value);
  const pending = state.pending === true;
  return Object.freeze({
    visible: safeString(state.nextCursor).length > 0,
    label: t(pending ? "REVIEW_TAGS_LOADING_MORE" : "REVIEW_TAGS_LOAD_MORE"),
    accessibleName: t("REVIEW_TAGS_LOAD_MORE_ARIA"),
    disabled: pending,
  });
}

export function createOptionPageController({ resource, spaceId, writableOnly = false, owns, request, onChange }) {
  const fixedResource = safeString(resource);
  const fixedSpaceId = safeString(spaceId);
  let items = [];
  let nextCursor;
  let pending = false;
  let loaded = false;
  let error = "";
  let errorKey = "";
  const snapshot = () => Object.freeze({
    items: items.map((item) => Object.freeze({ ...item })),
    ...(nextCursor ? { nextCursor } : {}),
    pending,
    loaded,
    error,
    errorKey,
  });
  const emit = () => onChange(snapshot());
  const mutation = createMutationController(owns, (value) => {
    pending = value;
    emit();
  });
  const load = (append) => {
    if (!owns() || (append && !nextCursor)) return Promise.resolve();
    const cursor = append ? nextCursor : undefined;
    return mutation.run(
      () => request(optionPagePath(fixedResource, fixedSpaceId, cursor)),
      (value) => {
        const page = optionPageModel(value, fixedResource, fixedSpaceId, writableOnly);
        items = appendPage(append ? items : [], page.items, (item) => item.id);
        nextCursor = page.nextCursor;
        loaded = true;
        error = "";
        errorKey = "";
        emit();
      },
      () => {
        loaded = true;
        const label = optionResourceLabel(fixedResource);
        errorKey = append ? "OPTIONS_LOAD_MORE_FAILED" : "OPTIONS_LOAD_FAILED";
        error = t(append ? "OPTIONS_LOAD_MORE_FAILED" : "OPTIONS_LOAD_FAILED", { resource: label });
        emit();
      },
    );
  };
  return Object.freeze({
    loadInitial() { return load(false); },
    loadMore() { return load(true); },
    snapshot,
  });
}

export function createAdminSpacesRouteController({ owns, request, onChange }) {
  let spaces = [];
  let nextCursor;
  let pending = false;
  let loaded = false;
  let error = "";
  let errorKey = "";
  const collectionControllers = new Map();
  const collectionStates = new Map();
  const snapshot = () => Object.freeze({
    spaces: spaces.map((space) => Object.freeze({ ...space })),
    collectionPages: spaces.filter(isManagedAdminSpace).map((space) => Object.freeze({
      spaceId: space.id,
      ...(collectionStates.get(space.id) || emptyAdminCollectionState()),
    })),
    ...(nextCursor ? { nextCursor } : {}),
    pending,
    loaded,
    error,
    errorKey,
  });
  const emit = () => onChange(snapshot());
  const spacesMutation = createMutationController(owns, (value) => {
    pending = value;
    emit();
  });
  const ensureCollections = async () => {
    const loads = [];
    for (const space of spaces.filter(isManagedAdminSpace)) {
      if (collectionControllers.has(space.id)) continue;
      const controller = createAdminCollectionPageController({
        spaceId: space.id,
        owns,
        request,
        onChange(state) {
          collectionStates.set(space.id, state);
          emit();
        },
      });
      collectionControllers.set(space.id, controller);
      collectionStates.set(space.id, controller.snapshot());
      loads.push(controller.loadInitial());
    }
    await Promise.all(loads);
  };
  const loadSpaces = (append) => {
    if (!owns() || (append && !nextCursor)) return Promise.resolve();
    const cursor = append ? nextCursor : undefined;
    return spacesMutation.run(
      () => request(optionPagePath("spaces", "", cursor)),
      (value) => {
        const page = adminSpacePageModel(value);
        spaces = appendPage(append ? spaces : [], page.items, (space) => space.id);
        nextCursor = page.nextCursor;
        loaded = true;
        error = "";
        errorKey = "";
        emit();
      },
      () => {
        loaded = true;
        errorKey = append ? "OPTIONS_LOAD_MORE_FAILED" : "OPTIONS_LOAD_FAILED";
        error = t(append ? "OPTIONS_LOAD_MORE_FAILED" : "OPTIONS_LOAD_FAILED", {
          resource: t("COMMON_SPACES"),
        });
        emit();
      },
    ).then(ensureCollections);
  };
  return Object.freeze({
    loadInitial() { return loadSpaces(false); },
    loadMoreSpaces() { return loadSpaces(true); },
    loadMoreCollections(spaceId) {
      return collectionControllers.get(safeString(spaceId))?.loadMore() || Promise.resolve();
    },
    snapshot,
  });
}

export function optionLoadMoreModel(value, label) {
  const state = safeRecord(value);
  const safeLabel = safeString(label);
  const pending = state.pending === true;
  return Object.freeze({
    visible: safeString(state.nextCursor).length > 0,
    label: t(pending ? "OPTIONS_LOADING_MORE" : "OPTIONS_LOAD_MORE", { resource: safeLabel }),
    accessibleName: t("OPTIONS_LOAD_MORE_ARIA", { resource: safeLabel }),
    disabled: pending,
  });
}

export function knowledgeListModel(page) {
  const input = safeRecord(page);
  return Object.freeze({
    items: safeArray(input.items).map((candidate) => {
      const item = safeRecord(candidate);
      const id = safeString(item.id);
      const visibility = item.visibility === "admin_only" ? "admin_only" : "shared";
      return Object.freeze({
        id,
        title: safeString(item.title),
        href: `/knowledge/${encodeURIComponent(id)}`,
        revisionId: safeString(item.revisionId),
        visibility,
        visibilityLabel: visibilityLabel(visibility),
        searchStatus: searchStatus(item.searchStatus),
        tagIds: safeArray(item.tagIds).map(safeString),
        publishedAt: safeString(item.publishedAt),
        updatedAt: safeString(item.updatedAt),
      });
    }),
    ...(safeString(input.nextCursor) ? { nextCursor: safeString(input.nextCursor) } : {}),
  });
}

export function createChatItemPageController({ owns, request, onChange }) {
  let items = [];
  let nextCursor;
  let pending = false;
  let loaded = false;
  let error = "";
  let errorKey = "";
  const snapshot = () => Object.freeze({
    items: items.map((item) => Object.freeze({ ...item })),
    ...(nextCursor ? { nextCursor } : {}),
    pending,
    loaded,
    error,
    errorKey,
  });
  const emit = () => onChange(snapshot());
  const mutation = createMutationController(owns, (value) => {
    pending = value;
    emit();
  });
  const load = (append) => {
    if (!owns() || (append && !nextCursor)) return Promise.resolve();
    const cursor = append ? nextCursor : undefined;
    return mutation.run(
      () => request(knowledgeQuery("/api/knowledge", {
        limit: 50,
        ...(cursor ? { cursor } : {}),
      })),
      (value) => {
        const page = knowledgeListModel(value);
        const eligible = page.items.filter((item) => item.searchStatus === "indexed");
        items = appendPage(append ? items : [], eligible, (item) => item.id);
        nextCursor = page.nextCursor;
        loaded = true;
        error = "";
        errorKey = "";
        emit();
      },
      () => {
        loaded = true;
        errorKey = append ? "OPTIONS_LOAD_MORE_FAILED" : "OPTIONS_LOAD_FAILED";
        error = t(append ? "OPTIONS_LOAD_MORE_FAILED" : "OPTIONS_LOAD_FAILED", {
          resource: t("KNOWLEDGE_CHAT_SCOPE_ITEMS_FIELD"),
        });
        emit();
      },
    );
  };
  return Object.freeze({
    loadInitial() { return load(false); },
    loadMore() { return load(true); },
    snapshot,
  });
}

export function knowledgeSearchModel(page) {
  const input = safeRecord(page);
  return Object.freeze({
    items: safeArray(input.items).map((candidate) => searchHitModel(candidate)),
    degraded: input.degraded === true,
    ...(safeString(input.nextCursor) ? { nextCursor: safeString(input.nextCursor) } : {}),
  });
}

export function reviewPreviewModel(value) {
  const preview = safeRecord(value);
  const sourceVersion = safeRecord(preview.sourceVersion);
  const content = safeString(sourceVersion.content);
  const chunks = safeArray(preview.chunks).map((candidate) => {
    const chunk = safeRecord(candidate);
    const headingPath = safeArray(chunk.headingPath).map(safeString).filter(Boolean);
    const startLine = safeLine(chunk.startLine);
    const endLine = safeLine(chunk.endLine, startLine);
    return Object.freeze({
      heading: headingPath.join(" › ") || t("COMMON_DOCUMENT"),
      startLine,
      endLine,
      lineLabel: lineLabel(startLine, endLine),
      excerpt: safeString(chunk.excerpt),
    });
  });
  const warnings = [t("REVIEW_WARNING_INERT")];
  if (chunks.length === 0) warnings.push(t("REVIEW_WARNING_NO_CHUNK"));
  if (sourceVersion.parserVersion !== "m1-v1") warnings.push(t("REVIEW_WARNING_PARSER"));
  return Object.freeze({
    submissionId: safeString(preview.submissionId),
    status: safeString(preview.status),
    requestedSpaceId: safeString(preview.requestedSpaceId),
    requestedCollectionId: preview.requestedCollectionId === null ? null : safeString(preview.requestedCollectionId),
    requestedVisibility: preview.requestedVisibility === "admin_only" ? "admin_only" : "shared",
    kind: safeString(preview.kind),
    title: safeString(preview.title),
    rawInput: safeString(preview.rawContent),
    normalizedMarkdown: content,
    parserVersion: safeString(sourceVersion.parserVersion),
    chunks,
    warnings,
  });
}

export function reviewTargetModel(value) {
  const preview = safeRecord(value);
  const spaceId = safeString(preview.requestedSpaceId);
  const collectionId = preview.requestedCollectionId === null ? null : safeString(preview.requestedCollectionId);
  const target = safeRecord(preview.requestedTarget);
  const space = safeRecord(target.space);
  const collection = safeRecord(target.collection);
  const spaceMatches = safeString(space.id) === spaceId && space.status === "active";
  const collectionMatches = collectionId === null
    ? target.collection === null
    : safeString(collection.id) === collectionId && collection.status === "active";
  const available = target.available === true && spaceMatches && collectionMatches;
  return Object.freeze({
    spaceId,
    spaceLabel: spaceMatches ? safeString(space.name) : t("REVIEW_REQUESTED_SPACE_UNAVAILABLE"),
    collectionId,
    collectionLabel: collectionId === null
      ? t("COMMON_NO_COLLECTION")
      : collectionMatches ? safeString(collection.name) : t("REVIEW_REQUESTED_COLLECTION_UNAVAILABLE"),
    tagSpaceId: spaceId,
    available,
  });
}

export function knowledgeReaderModel(value, location = {}) {
  const input = safeRecord(value);
  const detailRevision = safeRecord(input.currentRevision);
  const isDetail = safeString(detailRevision.id).length > 0;
  const revision = isDetail ? detailRevision : input;
  const knowledgeItemId = safeString(isDetail ? input.id : revision.knowledgeItemId);
  const revisionId = safeString(revision.id);
  const focusedChunkId = safeString(safeRecord(location).chunk);
  const isCurrent = revision.isCurrent === true;
  const sourceVersionOrdinal = Number.isSafeInteger(revision.sourceVersionOrdinal)
    && revision.sourceVersionOrdinal > 0 ? revision.sourceVersionOrdinal : null;
  const parserSchemaVersion = revision.parserSchemaVersion === "m1-v1" || revision.parserSchemaVersion === "m1-v2"
    ? revision.parserSchemaVersion : null;
  const rawCodeMetadata = safeRecord(revision.codeMetadata);
  const codeMetadata = safeString(rawCodeMetadata.language) && safeString(rawCodeMetadata.fileLabel)
    && Number.isSafeInteger(rawCodeMetadata.lineBaseline) && rawCodeMetadata.lineBaseline > 0
    ? Object.freeze({
      language: safeString(rawCodeMetadata.language),
      fileLabel: safeString(rawCodeMetadata.fileLabel),
      lineBaseline: rawCodeMetadata.lineBaseline,
    })
    : null;
  const indexStatus = searchStatus(revision.indexStatus ?? input.searchStatus);
  const chunks = safeArray(revision.chunks).map((candidate) => {
    const chunk = safeRecord(candidate);
    const id = safeString(chunk.id);
    const headingPath = safeArray(chunk.headingPath).map(safeString).filter(Boolean);
    const startLine = safeLine(chunk.startLine);
    const endLine = safeLine(chunk.endLine, startLine);
    const label = `${headingPath.join(" › ") || t("COMMON_DOCUMENT")} · ${lineLabel(startLine, endLine)}`;
    return Object.freeze({
      id,
      citationId: safeString(chunk.citationId),
      label: headingPath.join(" › ") || t("COMMON_DOCUMENT"),
      lineLabel: lineLabel(startLine, endLine),
      focused: id === focusedChunkId,
      href: readerHref(knowledgeItemId, revisionId, id),
      sourceLabel: label,
    });
  });
  return Object.freeze({
    knowledgeItemId,
    title: safeString(revision.title || input.title),
    visibility: revision.visibility === "admin_only" ? "admin_only" : "shared",
    visibilityLabel: visibilityLabel(revision.visibility),
    revisionId,
    isCurrent,
    revisionLabel: t("READER_REVISION_LABEL", {
      revisionId,
      state: t(isCurrent ? "READER_REVISION_CURRENT" : "READER_REVISION_HISTORY"),
    }),
    sourceVersionId: safeString(revision.sourceVersionId),
    reviewerId: safeString(revision.reviewerId),
    sourceVersionOrdinal,
    parserSchemaVersion,
    codeMetadata,
    indexStatus,
    searchStatus: indexStatus,
    downloadHref: knowledgeDownloadRequest(knowledgeItemId, revisionId),
    publishedAt: safeString(revision.publishedAt),
    markdown: safeString(revision.markdown),
    tagIds: safeArray(revision.tagIds).map(safeString),
    focusedChunkId,
    outline: chunks.map(({ id, label, lineLabel: lines, focused, href }) => Object.freeze({ id, label, lineLabel: lines, focused, href })),
    sources: chunks.map(({ id, citationId, sourceLabel, href }) => Object.freeze({ id, citationId, label: sourceLabel, href })),
  });
}

export function citedAnswerModel(value) {
  const input = safeRecord(value);
  const allowedCitations = new Set(safeArray(input.citations).map(safeString));
  const sources = safeArray(input.sources)
    .map((candidate) => searchHitModel(candidate))
    .filter((source) => allowedCitations.has(source.citationId))
    .map((source, index) => Object.freeze({
      ...source,
      number: index + 1,
      accessibleName: t("READER_OPEN_CITATION_ARIA", {
        number: index + 1,
        title: source.title,
        location: `${source.headingPath.join(" › ") || t("COMMON_DOCUMENT")}, ${lineLabel(source.startLine, source.endLine)}`,
      }),
      href: source.citationHref,
    }));
  const evidenceConfidence = typeof input.evidenceConfidence === "number"
    && Number.isFinite(input.evidenceConfidence)
    && input.evidenceConfidence >= 0
    && input.evidenceConfidence <= 1
    ? Math.round(input.evidenceConfidence * 10_000) / 10_000
    : 0;
  const messageKey = input.messageKey === "KNOWLEDGE_EVIDENCE_INSUFFICIENT"
    ? input.messageKey
    : "";
  const suggestedActionKeys = [
    "KNOWLEDGE_CHAT_REWRITE_QUESTION",
    "KNOWLEDGE_CHAT_EXPAND_SCOPE",
  ].filter((key) => safeArray(input.suggestedActionKeys).includes(key));
  return Object.freeze({
    answer: safeString(input.answer),
    sources,
    evidenceConfidence,
    messageKey,
    suggestedActionKeys: Object.freeze(suggestedActionKeys),
  });
}

export function chatScopeControlsModel(value) {
  const scope = safeRecord(value);
  const selectedKind = ["all", "space", "collection", "items"].includes(scope.kind)
    ? scope.kind
    : "all";
  return Object.freeze({
    selectedKind,
    maxSelectedItems: 8,
    options: Object.freeze([
      Object.freeze({ kind: "all", labelKey: "KNOWLEDGE_CHAT_SCOPE_ALL" }),
      Object.freeze({ kind: "space", labelKey: "KNOWLEDGE_CHAT_SCOPE_SPACE" }),
      Object.freeze({ kind: "collection", labelKey: "KNOWLEDGE_CHAT_SCOPE_COLLECTION" }),
      Object.freeze({ kind: "items", labelKey: "KNOWLEDGE_CHAT_SCOPE_ITEMS" }),
    ]),
  });
}

export function chatScopeSummaryModel(scopeLabel, complete) {
  return t(complete ? "KNOWLEDGE_CHAT_SCOPE_CURRENT" : "KNOWLEDGE_CHAT_SCOPE_CURRENT_INCOMPLETE", {
    scope: safeString(scopeLabel),
  });
}

export function submissionResultModel(value) {
  const input = safeRecord(value);
  const duplicate = safeRecord(input.duplicateCandidate);
  if (safeString(duplicate.submissionId)) {
    const title = safeString(duplicate.title) || t("SUBMIT_EARLIER");
    return Object.freeze({
      kind: "duplicate",
      message: t("SUBMIT_DUPLICATE", { title }),
      submissionId: safeString(duplicate.submissionId),
    });
  }
  const submission = safeRecord(input.submission);
  return Object.freeze({
    kind: "created",
    message: t("SUBMIT_CREATED", { title: safeString(submission.title) || t("SUBMIT_FALLBACK_TITLE") }),
    submissionId: safeString(submission.id),
  });
}

export function renderKnowledgeSearch(model) {
  const input = safeRecord(model);
  const items = safeArray(input.items).map((candidate) => {
    const item = safeRecord(candidate);
    const matched = safeArray(item.matchedFieldLabels).map(safeString).filter(Boolean).join(", ");
    const excerpt = safeArray(item.highlightSegments).map((candidate) => {
      const segment = safeRecord(candidate);
      const text = escapeHtml(segment.text);
      return segment.highlighted === true ? `<mark>${text}</mark>` : text;
    }).join("");
    return `<li><a href="${escapeHtml(item.citationHref)}">${escapeHtml(item.title)}</a><p>${escapeHtml(item.location)}</p>${matched ? `<p>${escapeHtml(matched)}</p>` : ""}<p>${excerpt}</p></li>`;
  }).join("");
  return `<section${input.degraded === true ? ' data-degraded="true"' : ""}><ul>${items}</ul></section>`;
}

export function submissionRequest(value, idempotencyKey) {
  const input = safeRecord(value);
  const body = {
    requestedSpaceId: safeString(input.requestedSpaceId),
    ...(input.requestedCollectionId === undefined ? {} : {
      requestedCollectionId: input.requestedCollectionId === null ? null : safeString(input.requestedCollectionId),
    }),
    ...(input.requestedVisibility === "admin_only" ? { requestedVisibility: "admin_only" } : {}),
    kind: safeString(input.kind),
    title: safeString(input.title),
    content: safeString(input.content),
    ...(safeString(input.language) ? { language: safeString(input.language) } : {}),
  };
  return Object.freeze({
    path: "/api/submissions",
    init: Object.freeze({
      method: "POST",
      headers: Object.freeze({ "Idempotency-Key": safeString(idempotencyKey) }),
      body: JSON.stringify(body),
    }),
  });
}

/** Build the raw-binary request used by the private R2 originals flow. */
export function assetUploadRequest(value, idempotencyKey) {
  const file = safeRecord(value);
  const contentType = safeString(file.type).split(";", 1)[0].trim().toLowerCase() || "application/octet-stream";
  return Object.freeze({
    path: "/api/assets",
    init: Object.freeze({
      method: "POST",
      headers: Object.freeze({
        "Content-Type": contentType,
        "Idempotency-Key": safeString(idempotencyKey),
        "X-Asset-Name": safeString(file.name),
      }),
      body: value,
    }),
  });
}

export function assetUploadResultModel(value) {
  const input = safeRecord(value);
  const asset = safeRecord(input.asset);
  const job = safeRecord(input.job);
  const assetId = safeString(asset.id);
  const jobId = safeString(job.id);
  const jobStatus = safeString(job.status);
  const lastErrorCode = safeString(job.lastErrorCode);
  const messageKeys = Object.freeze({
    queued: "SUBMIT_ASSET_QUEUED",
    processing: "SUBMIT_ASSET_PROCESSING",
    succeeded: "SUBMIT_ASSET_READY",
    failed_retryable: "SUBMIT_ASSET_RETRYABLE",
    failed_terminal: "SUBMIT_ASSET_FAILED",
  });
  if (!assetId || !jobId || !messageKeys[jobStatus]) {
    return Object.freeze({
      kind: "error",
      ...(assetId ? { assetId } : {}),
      message: t("SUBMIT_ASSET_STATUS_UNAVAILABLE"),
    });
  }
  return Object.freeze({
    kind: jobStatus === "queued" ? "queued" : "updated",
    assetId,
    jobId,
    jobStatus,
    ...(lastErrorCode ? { lastErrorCode } : {}),
    message: jobStatus.startsWith("failed") && assetFailureMessageKeys[lastErrorCode]
      ? t(assetFailureMessageKeys[lastErrorCode])
      : t(messageKeys[jobStatus]),
    originalHref: `/api/assets/${encodeURIComponent(assetId)}/original`,
    ...(jobStatus === "succeeded"
      ? { parsedHref: `/api/assets/${encodeURIComponent(assetId)}/parsed` }
      : {}),
  });
}

export function assetListModel(value) {
  const input = safeRecord(value);
  const items = safeArray(input.items).map((entry) => {
    const record = safeRecord(entry);
    const asset = safeRecord(record.asset);
    const job = safeRecord(record.job);
    const id = safeString(asset.id);
    const jobStatus = safeString(job.status);
    return Object.freeze({
      id,
      originalName: safeString(asset.originalName) || t("COMMON_VALUE_UNAVAILABLE"),
      contentType: safeString(asset.contentType) || t("COMMON_VALUE_UNAVAILABLE"),
      byteSize: typeof asset.byteSize === "number" && Number.isSafeInteger(asset.byteSize) ? asset.byteSize : null,
      createdAt: safeString(asset.createdAt),
      jobStatus: jobStatus || "unknown",
      attempts: typeof job.attempts === "number" && Number.isSafeInteger(job.attempts) ? job.attempts : 0,
      updatedAt: safeString(job.updatedAt),
      lastErrorCode: safeString(job.lastErrorCode),
      failureMessage: jobStatus.startsWith("failed") && assetFailureMessageKeys[safeString(job.lastErrorCode)]
        ? t(assetFailureMessageKeys[safeString(job.lastErrorCode)])
        : "",
      originalHref: id ? `/api/assets/${encodeURIComponent(id)}/original` : "",
      parsedHref: id && jobStatus === "succeeded" ? `/api/assets/${encodeURIComponent(id)}/parsed` : "",
    });
  }).filter((item) => item.id);
  return Object.freeze({
    items: Object.freeze(items),
    nextCursor: safeString(input.nextCursor) || "",
  });
}

export function assetProcessRequest(assetId) {
  return Object.freeze({
    path: `/api/assets/${encodeURIComponent(safeString(assetId))}`,
    init: Object.freeze({ method: "POST" }),
  });
}

export function assetDownloadRequest(assetId, variant) {
  const safeVariant = variant === "parsed" ? "parsed" : "original";
  return Object.freeze({
    path: `/api/assets/${encodeURIComponent(safeString(assetId))}/${safeVariant}`,
    init: Object.freeze({ method: "GET" }),
  });
}

export function publishRequest(submissionId, value) {
  const input = safeRecord(value);
  return Object.freeze({
    path: `/api/admin/submissions/${encodeURIComponent(safeString(submissionId))}/publish`,
    init: Object.freeze({
      method: "POST",
      body: JSON.stringify({
        title: safeString(input.title),
        visibility: input.visibility === "admin_only" ? "admin_only" : "shared",
        spaceId: safeString(input.spaceId),
        collectionId: input.collectionId === null ? null : safeString(input.collectionId),
        tagIds: safeArray(input.tagIds).map(safeString).filter(Boolean),
        ...(input.visibilityReasonCode === "admin_visibility_expansion"
          ? { visibilityReasonCode: "admin_visibility_expansion" }
          : {}),
      }),
    }),
  });
}

export function resubmissionRequest(priorSubmissionId, value, idempotencyKey) {
  const input = safeRecord(value);
  const body = {
    ...(safeString(input.requestedSpaceId) ? { requestedSpaceId: safeString(input.requestedSpaceId) } : {}),
    ...(input.requestedCollectionId === null ? { requestedCollectionId: null }
      : safeString(input.requestedCollectionId)
        ? { requestedCollectionId: safeString(input.requestedCollectionId) }
        : {}),
    ...(input.requestedVisibility === "admin_only" || input.requestedVisibility === "shared"
      ? { requestedVisibility: input.requestedVisibility }
      : {}),
    kind: safeString(input.kind),
    title: safeString(input.title),
    content: safeString(input.content),
    ...(safeString(input.language) ? { language: safeString(input.language) } : {}),
  };
  return Object.freeze({
    path: `/api/submissions/${encodeURIComponent(safeString(priorSubmissionId))}/resubmit`,
    init: Object.freeze({
      method: "POST",
      headers: Object.freeze({ "Idempotency-Key": safeString(idempotencyKey) }),
      body: JSON.stringify(body),
    }),
  });
}

export function chatRequest(value) {
  const input = safeRecord(value);
  const scope = chatScopeRequestBody(input.scope);
  return Object.freeze({
    path: "/api/knowledge/chat",
    init: Object.freeze({
      method: "POST",
      body: JSON.stringify({ question: safeString(input.question), scope }),
    }),
  });
}

function chatScopeRequestBody(value) {
  const scope = safeRecord(value);
  if (scope.kind === "all" && hasExactKeys(scope, ["kind"])) return { kind: "all" };
  if (scope.kind === "space"
    && hasExactKeys(scope, ["kind", "spaceId"])
    && chatResourceId(scope.spaceId)) {
    return { kind: "space", spaceId: safeString(scope.spaceId) };
  }
  if (scope.kind === "collection"
    && hasExactKeys(scope, ["collectionId", "kind"])
    && chatResourceId(scope.collectionId)) {
    return { kind: "collection", collectionId: safeString(scope.collectionId) };
  }
  if (scope.kind === "items" && hasExactKeys(scope, ["kind", "knowledgeItemIds"])) {
    const ids = safeArray(scope.knowledgeItemIds).map(safeString);
    if (ids.length >= 1 && ids.length <= 8
      && ids.every(chatResourceId)
      && new Set(ids).size === ids.length) {
      return { kind: "items", knowledgeItemIds: ids };
    }
  }
  throw new Error(t("KNOWLEDGE_CHAT_SCOPE_REQUEST_INVALID"));
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function chatResourceId(value) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/u.test(safeString(value));
}

export function knowledgeQuery(path, value) {
  const input = safeRecord(value);
  const query = new URLSearchParams();
  for (const key of ["q", "limit", "cursor", "spaceId", "collectionId", "tagId"]) {
    const candidate = input[key];
    if (key === "limit") {
      if (Number.isSafeInteger(candidate) && candidate > 0 && candidate <= 50) query.set(key, String(candidate));
    } else if (safeString(candidate)) {
      query.set(key, safeString(candidate));
    }
  }
  const tagIds = safeArray(input.tagIds).map(safeString).filter(Boolean).slice(0, 8);
  if (tagIds.length > 0 && (input.tagMode === "and" || input.tagMode === "or")) {
    query.delete("tagId");
    for (const tagId of tagIds) query.append("tagId", tagId);
    query.set("tagMode", input.tagMode);
  }
  const serialized = query.toString();
  return `${path}${serialized ? `?${serialized}` : ""}`;
}

export function knowledgeReaderRequest(knowledgeItemId, revisionId) {
  const item = encodeURIComponent(safeString(knowledgeItemId));
  const revision = safeString(revisionId);
  return Object.freeze(revision ? {
    path: `/api/knowledge/${item}/revisions/${encodeURIComponent(revision)}`,
    responseKey: "revision",
  } : {
    path: `/api/knowledge/${item}`,
    responseKey: "knowledge",
  });
}

export function knowledgeDownloadRequest(knowledgeItemId, revisionId) {
  return `/api/knowledge/${encodeURIComponent(safeString(knowledgeItemId))}/revisions/${encodeURIComponent(safeString(revisionId))}/download`;
}

function reviewTagPageModel(value, spaceId) {
  const input = safeRecord(value);
  return Object.freeze({
    items: safeArray(input.tags).map(safeRecord).filter((tag) => (
      safeString(tag.id).length > 0
      && safeString(tag.spaceId) === spaceId
      && tag.status === "active"
    )).map((tag) => Object.freeze({ id: safeString(tag.id), name: safeString(tag.name) })),
    ...(safeString(input.nextCursor) ? { nextCursor: safeString(input.nextCursor) } : {}),
  });
}

function tagPagePath(spaceId, cursor) {
  const query = new URLSearchParams({ limit: "50" });
  if (cursor) query.set("cursor", cursor);
  return `/api/spaces/${encodeURIComponent(spaceId)}/tags?${query.toString()}`;
}

function optionPagePath(resource, spaceId, cursor) {
  const query = new URLSearchParams({ limit: "50" });
  if (cursor) query.set("cursor", cursor);
  if (resource === "spaces") return `/api/spaces?${query.toString()}`;
  return `/api/spaces/${encodeURIComponent(spaceId)}/${resource}?${query.toString()}`;
}

function optionPageModel(value, resource, spaceId, writableOnly) {
  const input = safeRecord(value);
  const candidates = safeArray(resource === "tags" ? input.tags : input.items);
  const items = candidates.map(safeRecord).filter((item) => {
    if (!safeString(item.id) || !safeString(item.name) || item.status !== "active") return false;
    if (resource === "spaces") {
      return item.kind === "shared" && (!writableOnly || item.readOnly !== true);
    }
    return safeString(item.spaceId) === spaceId;
  }).map((item) => Object.freeze({ id: safeString(item.id), name: safeString(item.name) }));
  return Object.freeze({
    items,
    ...(safeString(input.nextCursor) ? { nextCursor: safeString(input.nextCursor) } : {}),
  });
}

function adminSpacePageModel(value) {
  const input = safeRecord(value);
  const items = safeArray(input.items).map(safeRecord).filter((space) => (
    safeString(space.id).length > 0
    && safeString(space.slug).length > 0
    && safeString(space.name).length > 0
    && (space.kind === "shared" || space.kind === "legacy")
    && (space.status === "active" || space.status === "disabled")
  )).map((space) => Object.freeze({
    id: safeString(space.id),
    slug: safeString(space.slug),
    name: safeString(space.name),
    kind: space.kind,
    status: space.status,
    readOnly: space.readOnly === true,
  }));
  return Object.freeze({
    items,
    ...(safeString(input.nextCursor) ? { nextCursor: safeString(input.nextCursor) } : {}),
  });
}

function createAdminCollectionPageController({ spaceId, owns, request, onChange }) {
  let items = [];
  let nextCursor;
  let pending = false;
  let loaded = false;
  let error = "";
  let errorKey = "";
  const snapshot = () => Object.freeze({
    items: items.map((collection) => Object.freeze({ ...collection })),
    ...(nextCursor ? { nextCursor } : {}),
    pending,
    loaded,
    error,
    errorKey,
  });
  const emit = () => onChange(snapshot());
  const mutation = createMutationController(owns, (value) => {
    pending = value;
    emit();
  });
  const load = (append) => {
    if (!owns() || (append && !nextCursor)) return Promise.resolve();
    const cursor = append ? nextCursor : undefined;
    return mutation.run(
      () => request(optionPagePath("collections", spaceId, cursor)),
      (value) => {
        const page = adminCollectionPageModel(value, spaceId);
        items = appendPage(append ? items : [], page.items, (collection) => collection.id);
        nextCursor = page.nextCursor;
        loaded = true;
        error = "";
        errorKey = "";
        emit();
      },
      () => {
        loaded = true;
        errorKey = append ? "OPTIONS_LOAD_MORE_FAILED" : "OPTIONS_LOAD_FAILED";
        error = t(append ? "OPTIONS_LOAD_MORE_FAILED" : "OPTIONS_LOAD_FAILED", {
          resource: t("COMMON_COLLECTIONS"),
        });
        emit();
      },
    );
  };
  return Object.freeze({
    loadInitial() { return load(false); },
    loadMore() { return load(true); },
    snapshot,
  });
}

function adminCollectionPageModel(value, spaceId) {
  const input = safeRecord(value);
  const items = safeArray(input.items).map(safeRecord).filter((collection) => (
    safeString(collection.id).length > 0
    && safeString(collection.spaceId) === spaceId
    && safeString(collection.name).length > 0
    && (collection.status === "active" || collection.status === "disabled")
  )).map((collection) => Object.freeze({
    id: safeString(collection.id),
    spaceId,
    name: safeString(collection.name),
    status: collection.status,
  }));
  return Object.freeze({
    items,
    ...(safeString(input.nextCursor) ? { nextCursor: safeString(input.nextCursor) } : {}),
  });
}

function isManagedAdminSpace(space) {
  return space.kind === "shared" && space.readOnly !== true;
}

function emptyAdminCollectionState() {
  return Object.freeze({ items: [], pending: false, loaded: false, error: "", errorKey: "" });
}

function optionResourceLabel(resource) {
  if (resource === "collections") return t("COMMON_COLLECTIONS");
  if (resource === "tags") return t("COMMON_TAGS");
  return t("COMMON_SPACES");
}

function searchHitModel(candidate) {
  const hit = safeRecord(candidate);
  const knowledgeItemId = safeString(hit.knowledgeItemId);
  const revisionId = safeString(hit.revisionId);
  const chunkId = safeString(hit.chunkId);
  const headingPath = safeArray(hit.headingPath).map(safeString).filter(Boolean);
  const startLine = safeLine(hit.startLine);
  const endLine = safeLine(hit.endLine, startLine);
  const excerpt = safeString(hit.excerpt);
  const matchedFields = ["title", "summary", "tags", "body", "code"].filter((field) => (
    safeArray(hit.matchedFields).includes(field)
  ));
  const matchedFieldLabels = matchedFields.map(searchMatchedFieldLabel);
  const highlights = normalizeHighlightRanges(hit.highlights, [...excerpt].length);
  return Object.freeze({
    citationId: safeString(hit.citationId),
    knowledgeItemId,
    revisionId,
    chunkId,
    title: safeString(hit.title),
    headingPath,
    startLine,
    endLine,
    location: `${headingPath.join(" › ") || t("COMMON_DOCUMENT")} · ${lineLabel(startLine, endLine)}`,
    excerpt,
    matchedFields,
    matchedFieldLabels,
    highlights,
    highlightSegments: highlightSegments(excerpt, highlights),
    publishedAt: safeString(hit.publishedAt),
    citationHref: readerHref(knowledgeItemId, revisionId, chunkId),
  });
}

function searchMatchedFieldLabel(field) {
  if (field === "title") return t("COMMON_TITLE");
  if (field === "summary") return t("COMMON_SUMMARY");
  if (field === "tags") return t("COMMON_TAGS");
  if (field === "code") return t("COMMON_CODE");
  return t("COMMON_BODY");
}

function normalizeHighlightRanges(value, excerptLength) {
  const ranges = safeArray(value).map(safeRecord).filter((range) => (
    Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
    && range.start >= 0 && range.start < range.end && range.end <= excerptLength
  )).map((range) => ({ start: range.start, end: range.end }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const accepted = [];
  for (const range of ranges) {
    const prior = accepted.at(-1);
    if (prior && range.start < prior.end) continue;
    if (accepted.length === 8) break;
    accepted.push(Object.freeze(range));
  }
  return accepted;
}

function highlightSegments(excerpt, ranges) {
  const points = [...excerpt];
  const segments = [];
  let offset = 0;
  for (const range of ranges) {
    if (range.start > offset) segments.push(Object.freeze({
      text: points.slice(offset, range.start).join(""), highlighted: false,
    }));
    segments.push(Object.freeze({
      text: points.slice(range.start, range.end).join(""), highlighted: true,
    }));
    offset = range.end;
  }
  if (offset < points.length || segments.length === 0) segments.push(Object.freeze({
    text: points.slice(offset).join(""), highlighted: false,
  }));
  return segments;
}

function readerHref(knowledgeItemId, revisionId, chunkId) {
  const query = new URLSearchParams();
  if (revisionId) query.set("revision", revisionId);
  if (chunkId) query.set("chunk", chunkId);
  const suffix = query.toString();
  return `/knowledge/${encodeURIComponent(knowledgeItemId)}${suffix ? `?${suffix}` : ""}`;
}

function lineLabel(startLine, endLine) {
  return startLine === endLine
    ? t("READER_LINE", { line: startLine })
    : t("READER_LINES", { start: startLine, end: endLine });
}

function visibilityLabel(value) {
  return t(value === "admin_only" ? "COMMON_VISIBILITY_ADMIN_ONLY" : "COMMON_VISIBILITY_SHARED");
}

function searchStatus(value) {
  return value === "search_degraded" || value === "pending" || value === "failed" ? value : "indexed";
}

function safeLine(value, fallback = 1) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : Object.create(null);
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

export function displayValue(value, fallback = t("COMMON_VALUE_UNAVAILABLE")) {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function displayDate(value, locale = "en-US", fallback = t("COMMON_VALUE_UNAVAILABLE")) {
  const candidate = displayValue(value, "");
  if (!candidate) return fallback;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(value) {
  return safeString(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("=", "&#61;");
}
