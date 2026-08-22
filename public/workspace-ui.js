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
    label: open ? "Close navigation" : "Open navigation",
  });
}

export function drawerStateForViewport(mobile, open) {
  return mobile ? drawerState(open) : Object.freeze({
    open: false,
    ariaExpanded: "false",
    ariaHidden: "false",
    inert: false,
    label: "Open navigation",
  });
}

export function anonymousShellState() {
  return Object.freeze({
    statusMessage: "",
    drawer: drawerState(false),
  });
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
    const error = new Error(response.statusText || "退出失败，请重试。");
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
  const selectedIds = new Set();
  const snapshot = () => Object.freeze({
    items: items.map((tag) => Object.freeze({ ...tag, selected: selectedIds.has(tag.id) })),
    ...(nextCursor ? { nextCursor } : {}),
    pending,
    loaded,
    error,
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
        emit();
      },
      () => {
        loaded = true;
        error = append ? "Could not load more Tags." : "Could not load Tags.";
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
    label: pending ? "Loading more Tags…" : "Load more Tags",
    accessibleName: "Load more Tags in the requested Space",
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
      heading: headingPath.join(" › ") || "Document",
      startLine,
      endLine,
      lineLabel: lineLabel(startLine, endLine),
      excerpt: safeString(chunk.excerpt),
    });
  });
  const warnings = ["Preview is inert text; Markdown and HTML are never executed."];
  if (chunks.length === 0) warnings.push("No publication Chunk was produced; this submission cannot be published.");
  if (sourceVersion.parserVersion !== "m1-v1") warnings.push("The parser version is not recognized by this workspace.");
  return Object.freeze({
    submissionId: safeString(preview.submissionId),
    status: safeString(preview.status),
    requestedSpaceId: safeString(preview.requestedSpaceId),
    requestedCollectionId: preview.requestedCollectionId === null ? null : safeString(preview.requestedCollectionId),
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
    spaceLabel: spaceMatches ? safeString(space.name) : "Requested Space unavailable",
    collectionId,
    collectionLabel: collectionId === null ? "No collection" : collectionMatches ? safeString(collection.name) : "Requested Collection unavailable",
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
  const chunks = safeArray(revision.chunks).map((candidate) => {
    const chunk = safeRecord(candidate);
    const id = safeString(chunk.id);
    const headingPath = safeArray(chunk.headingPath).map(safeString).filter(Boolean);
    const startLine = safeLine(chunk.startLine);
    const endLine = safeLine(chunk.endLine, startLine);
    const label = `${headingPath.join(" › ") || "Document"} · ${lineLabel(startLine, endLine)}`;
    return Object.freeze({
      id,
      citationId: safeString(chunk.citationId),
      label: headingPath.join(" › ") || "Document",
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
    revisionLabel: `Revision ${revisionId} · ${isCurrent ? "current" : "history"}`,
    ...(typeof input.searchStatus === "string" ? { searchStatus: searchStatus(input.searchStatus) } : {}),
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
      accessibleName: `Open citation ${index + 1}: ${source.title}, ${source.headingPath.join(" › ") || "Document"}, ${lineLabel(source.startLine, source.endLine)}`,
      href: source.citationHref,
    }));
  return Object.freeze({ answer: safeString(input.answer), sources });
}

export function submissionResultModel(value) {
  const input = safeRecord(value);
  const duplicate = safeRecord(input.duplicateCandidate);
  if (safeString(duplicate.submissionId)) {
    const title = safeString(duplicate.title) || "an earlier submission";
    return Object.freeze({
      kind: "duplicate",
      message: `A matching submission already exists: ${title}.`,
      submissionId: safeString(duplicate.submissionId),
    });
  }
  const submission = safeRecord(input.submission);
  return Object.freeze({
    kind: "created",
    message: `Submitted ${safeString(submission.title) || "knowledge"} for review.`,
    submissionId: safeString(submission.id),
  });
}

export function renderKnowledgeSearch(model) {
  const input = safeRecord(model);
  const items = safeArray(input.items).map((candidate) => {
    const item = safeRecord(candidate);
    return `<li><a href="${escapeHtml(item.citationHref)}">${escapeHtml(item.title)}</a><p>${escapeHtml(item.location)}</p><p>${escapeHtml(item.excerpt)}</p></li>`;
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
      }),
    }),
  });
}

export function chatRequest(value) {
  const input = safeRecord(value);
  return Object.freeze({
    path: "/api/knowledge/chat",
    init: Object.freeze({ method: "POST", body: JSON.stringify({ question: safeString(input.question) }) }),
  });
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

function searchHitModel(candidate) {
  const hit = safeRecord(candidate);
  const knowledgeItemId = safeString(hit.knowledgeItemId);
  const revisionId = safeString(hit.revisionId);
  const chunkId = safeString(hit.chunkId);
  const headingPath = safeArray(hit.headingPath).map(safeString).filter(Boolean);
  const startLine = safeLine(hit.startLine);
  const endLine = safeLine(hit.endLine, startLine);
  return Object.freeze({
    citationId: safeString(hit.citationId),
    knowledgeItemId,
    revisionId,
    chunkId,
    title: safeString(hit.title),
    headingPath,
    startLine,
    endLine,
    location: `${headingPath.join(" › ") || "Document"} · ${lineLabel(startLine, endLine)}`,
    excerpt: safeString(hit.excerpt),
    publishedAt: safeString(hit.publishedAt),
    citationHref: readerHref(knowledgeItemId, revisionId, chunkId),
  });
}

function readerHref(knowledgeItemId, revisionId, chunkId) {
  const query = new URLSearchParams();
  if (revisionId) query.set("revision", revisionId);
  if (chunkId) query.set("chunk", chunkId);
  const suffix = query.toString();
  return `/knowledge/${encodeURIComponent(knowledgeItemId)}${suffix ? `?${suffix}` : ""}`;
}

function lineLabel(startLine, endLine) {
  return startLine === endLine ? `line ${startLine}` : `lines ${startLine}–${endLine}`;
}

function visibilityLabel(value) {
  return value === "admin_only" ? "Admin only" : "Shared";
}

function searchStatus(value) {
  return value === "search_degraded" || value === "pending" ? value : "indexed";
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

function escapeHtml(value) {
  return safeString(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("=", "&#61;");
}
