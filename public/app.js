import { navigationForSession } from "/navigation.js";
import {
  anonymousShellState,
  appendPage,
  chatRequest,
  citedAnswerModel,
  createAdminSpacesRouteController,
  createLogoutController,
  createMutationController,
  createOptionPageController,
  createOwnedActionController,
  createOperationGuard,
  createReplaceableOwner,
  createReviewTagController,
  createRouteGuard,
  drawerStateForViewport,
  knowledgeListModel,
  knowledgeQuery,
  knowledgeReaderModel,
  knowledgeReaderRequest,
  knowledgeSearchModel,
  optionLoadMoreModel,
  publishRequest,
  resubmissionRequest,
  reviewPreviewModel,
  reviewTagLoadMoreModel,
  reviewTargetModel,
  sessionBootstrapState,
  submissionRequest,
  submissionResultModel,
  runLatestOperation,
} from "/workspace-ui.js";

const byId = (id) => document.getElementById(id);
const shell = byId("app-shell");
const outlet = byId("page-outlet");
const statusRegion = byId("status-region");
const drawerToggle = byId("drawer-toggle");
const sidebar = byId("sidebar");
const logoutButton = byId("logout-button");
const routeGuard = createRouteGuard();
const mobileViewport = window.matchMedia("(max-width: 760px)");
let session;
let pendingFlash = "";
const openDialogs = new Set();
const logoutController = createLogoutController(fetch, {
  onPendingChange(pending) { logoutButton.disabled = pending || !session; },
  onSuccess() { renderAnonymous(); },
  onError(error) { setStatus(error.message || "退出失败，请重试。", "error"); },
});

const routes = Object.freeze({
  "/": renderHome,
  "/submit": renderSubmit,
  "/knowledge": renderKnowledge,
  "/search": renderSearch,
  "/agent": renderAgent,
  "/my-submissions": renderMySubmissions,
  "/admin": renderAdminDashboard,
  "/admin/submissions": renderPendingSubmissions,
  "/admin/members": renderMembers,
  "/admin/spaces": renderSpaces,
  "/admin/audit": renderAudit,
});

function rendererFor(path) {
  if (routes[path]) return { render: routes[path], parameter: undefined };
  const reader = /^\/knowledge\/([A-Za-z0-9_-]{1,128})$/u.exec(path);
  if (reader) return { render: renderKnowledgeReader, parameter: reader[1] };
  const review = /^\/admin\/submissions\/([A-Za-z0-9_-]{1,128})$/u.exec(path);
  if (review) return { render: renderReviewSubmission, parameter: review[1] };
  return undefined;
}

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    if (name === "className") node.className = value;
    else if (name === "text") node.textContent = value;
    else if (name.startsWith("on") && typeof value === "function") node.addEventListener(name.slice(2).toLowerCase(), value);
    else node.setAttribute(name, String(value));
  }
  node.append(...children.filter(Boolean));
  return node;
}

function page(title, description, children = []) {
  return element("div", {}, [
    element("header", { className: "page-header" }, [
      element("p", { className: "eyebrow", text: "MEMORY GARDEN" }),
      element("h1", { text: title, tabindex: "-1" }),
      element("p", { className: "muted", text: description }),
    ]),
    ...children,
  ]);
}

function card(title, children = []) {
  return element("section", { className: "card" }, [element("h2", { text: title }), ...children]);
}

function empty(message) { return element("div", { className: "empty-state", text: message }); }
function replaceOutlet(node, generation) {
  if (generation !== undefined && !routeGuard.isCurrent(generation)) return false;
  outlet.replaceChildren(node);
  outlet.inert = false;
  outlet.setAttribute("aria-busy", "false");
  node.querySelector("h1")?.focus({ preventScroll: true });
  return true;
}
function setStatus(message = "", kind = "") {
  statusRegion.replaceChildren(message ? element("p", { className: "notice", "data-kind": kind, text: message }) : "");
}
function apiError(data, fallback) { return data?.error?.message || data?.error || fallback; }

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(apiError(data, response.statusText));
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadSession() {
  const response = await fetch("/api/session", { credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  const state = sessionBootstrapState(response.status, data);
  if (state.kind !== "error") return state;
  const error = new Error(apiError(data, response.statusText));
  error.status = response.status;
  throw error;
}

function has(capability) { return session?.capabilities.includes(capability); }
function isAdminRoute(path) { return path === "/admin" || path.startsWith("/admin/"); }
function ownsMutation(owner) { return routeGuard.owns(owner, window.location.pathname); }
function applyDrawerState(state) {
  shell.dataset.drawerOpen = String(state.open);
  drawerToggle.setAttribute("aria-expanded", state.ariaExpanded);
  drawerToggle.textContent = state.label;
  sidebar.setAttribute("aria-hidden", state.ariaHidden);
  sidebar.inert = state.inert;
}
function setDrawer(open, focusDrawer = false) {
  const state = drawerStateForViewport(mobileViewport.matches, open);
  applyDrawerState(state);
  if (state.open && focusDrawer) sidebar.querySelector("a, button")?.focus();
  if (!state.open && document.activeElement instanceof HTMLElement && sidebar.contains(document.activeElement)) drawerToggle.focus();
}
function navigate(path, replace = false, flash = "") {
  closeOpenDialogs();
  if (!session) return;
  const next = new URL(path, window.location.origin);
  if (next.origin !== window.location.origin) return;
  if (`${next.pathname}${next.search}` !== `${window.location.pathname}${window.location.search}`) {
    history[replace ? "replaceState" : "pushState"]({}, "", `${next.pathname}${next.search}`);
  }
  pendingFlash = flash;
  setDrawer(false);
  void renderRoute();
}

function renderNavigation() {
  const nav = byId("primary-navigation");
  const groups = new Map();
  for (const item of navigationForSession(session)) {
    const group = groups.get(item.group) || [];
    group.push(item);
    groups.set(item.group, group);
  }
  nav.replaceChildren(...[...groups.entries()].map(([group, items]) => element("section", { className: "nav-group" }, [
    element("p", { className: "nav-group-label", text: group === "admin" ? "治理" : "工作区" }),
    ...items.map((item) => element("a", {
      href: item.href,
      className: "nav-link",
      "data-route": "",
      "aria-current": isNavigationCurrent(item.href, window.location.pathname) ? "page" : undefined,
      text: item.label,
    })),
  ])));
}

function isNavigationCurrent(href, pathname) {
  return href === pathname
    || (href === "/knowledge" && pathname.startsWith("/knowledge/"))
    || (href === "/admin/submissions" && pathname.startsWith("/admin/submissions/"));
}

function requiredCapability(path) {
  if (path === "/knowledge" || path.startsWith("/knowledge/") || path === "/search" || path === "/agent") return "knowledge:read";
  if (path === "/admin/submissions" || path.startsWith("/admin/submissions/")) return "knowledge:review";
  return undefined;
}

async function renderRoute() {
  if (!session) {
    renderAnonymous();
    return;
  }
  const path = window.location.pathname;
  const generation = routeGuard.begin();
  setStatus(pendingFlash, pendingFlash ? "success" : "");
  pendingFlash = "";
  renderNavigation();
  outlet.inert = true;
  outlet.setAttribute("aria-busy", "true");
  const routeCapability = requiredCapability(path);
  if ((isAdminRoute(path) && !has("submission:read-all")) || (routeCapability && !has(routeCapability))) {
    replaceOutlet(page("403：没有管理权限", "管理路由由服务器独立授权；当前登录身份没有该能力。", [empty("请返回工作区，或联系管理员调整成员状态。")]), generation);
    return;
  }
  const route = rendererFor(path);
  if (!route) {
    replaceOutlet(page("页面不存在", "此地址没有对应的工作区页面。", [element("div", { className: "actions" }, [routeLink("返回首页", "/")])]), generation);
    return;
  }
  try {
    await route.render(generation, route.parameter);
  } catch (error) {
    if (!routeGuard.isCurrent(generation)) return;
    const label = error.status === 403 ? "403：访问被拒绝" : "无法加载页面";
    replaceOutlet(page(label, error.message || "请稍后重试。", [empty("页面数据暂不可用；服务器权限仍是最终依据。")]), generation);
  }
}

function routeLink(label, href) { return element("a", { href, "data-route": "", className: "nav-link", text: label }); }
function list(items, itemRenderer, emptyText) { return items.length ? element("ul", { className: "item-list" }, items.map(itemRenderer)) : empty(emptyText); }
function item(title, meta, extra = []) { return element("li", { className: "item" }, [element("h3", { text: title }), element("p", { className: "item-meta", text: meta }), ...extra]); }
function formatDate(value) { return value ? new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" }) : "—"; }
function visibilityBadge(value, label = value === "admin_only" ? "Admin only" : "Shared") {
  return element("span", { className: `badge visibility-${value === "admin_only" ? "admin" : "shared"}`, text: label });
}
function safeErrorMessage(error, fallback = "操作失败，请重试。") {
  return error instanceof Error && error.message ? error.message : fallback;
}
function validationSummary(form, message) {
  form.querySelector(".validation-summary")?.remove();
  const summary = element("div", { className: "validation-summary", role: "alert", tabindex: "-1", text: message });
  form.prepend(summary);
  summary.focus({ preventScroll: true });
}
function setPending(button, pending, pendingLabel, readyLabel) {
  button.disabled = pending;
  button.textContent = pending ? pendingLabel : readyLabel;
}
function idempotencyKey() {
  return crypto.randomUUID().replaceAll("-", "");
}
function routeStateNode(kind, message) {
  return element("div", {
    className: `route-state route-state-${kind}`,
    role: kind === "error" || kind === "forbidden" ? "alert" : "status",
    text: message,
  });
}

function closeOpenDialogs() {
  for (const entry of openDialogs) {
    entry.controller.invalidate();
    if (entry.dialog.open) entry.dialog.close();
    else {
      entry.dialog.remove();
      openDialogs.delete(entry);
    }
  }
}

function openReviewDialog({ title, description, confirmLabel, danger = false, owns, onConfirm }) {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const controller = createOwnedActionController(owns, onConfirm);
  const cancel = element("button", { className: "secondary", type: "button", text: "Cancel" });
  const confirm = element("button", { className: danger ? "danger" : "primary", type: "button", text: confirmLabel });
  const dialog = element("dialog", { className: "review-dialog", "aria-labelledby": "review-dialog-title" }, [
    element("div", { className: "stack" }, [
      element("h2", { id: "review-dialog-title", text: title }),
      element("p", { text: description }),
      element("div", { className: "actions" }, [cancel, confirm]),
    ]),
  ]);
  const close = () => { if (dialog.open) dialog.close(); };
  cancel.addEventListener("click", close);
  confirm.addEventListener("click", () => { controller.run(); close(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener("close", () => {
    openDialogs.delete(entry);
    dialog.remove();
    if (controller.canReturnFocus() && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }, { once: true });
  const entry = { dialog, controller };
  openDialogs.add(entry);
  document.body.append(dialog);
  dialog.showModal();
  cancel.focus();
}

async function renderHome(generation) {
  const submissions = await api("/api/submissions/mine?limit=5");
  if (replaceOutlet(page("Trusted knowledge workspace", "Submit, review, find, and cite the current published knowledge base.", [
    element("div", { className: "page-grid" }, [
      card("Quick start", [
        element("p", { text: "New content enters the review queue. Published knowledge remains immutable and citation-addressable." }),
        element("div", { className: "actions" }, [routeLink("Submit knowledge", "/submit"), routeLink("Search", "/search"), routeLink("Ask Agent", "/agent")]),
      ]),
      card("Recent submissions", [list(submissions.items, (submission) => item(submission.title, `${submission.kind} · ${submission.status} · ${formatDate(submission.createdAt)}`), "You have no submissions yet.")]),
    ]),
  ]), generation)) return;
}

function replaceOptions(select, options, emptyLabel) {
  select.replaceChildren(element("option", { value: "", text: emptyLabel }), ...options);
}

function createPagedOptionControl({ resource, spaceId, writableOnly = false, owner, owns, label, fieldLabel, emptyLabel, required = false, onState }) {
  const select = element("select", { ...(required ? { required: "" } : {}) });
  const more = element("button", { className: "secondary", type: "button" });
  const status = element("p", { className: "muted", role: "status", "aria-live": "polite" });
  const root = element("div", { className: "stack" }, [fieldLabel ? field(fieldLabel, select) : select, more, status]);
  const stillOwns = () => ownsMutation(owner) && (!owns || owns());
  const controller = createOptionPageController({
    resource,
    spaceId,
    writableOnly,
    owns: stillOwns,
    request: api,
    onChange(state) {
      if (!stillOwns()) return;
      const selected = select.value;
      const options = state.items.map((item) => element("option", { value: item.id, text: item.name }));
      select.replaceChildren(...(emptyLabel === undefined ? [] : [element("option", { value: "", text: emptyLabel })]), ...options);
      if ([...select.options].some((option) => option.value === selected)) select.value = selected;
      select.disabled = state.pending && !state.loaded;
      const model = optionLoadMoreModel(state, label);
      more.hidden = !model.visible;
      more.disabled = model.disabled;
      more.textContent = model.label;
      more.setAttribute("aria-label", model.accessibleName);
      status.textContent = state.error;
      status.hidden = !state.error;
      onState?.(state);
    },
  });
  more.addEventListener("click", () => { void controller.loadMore(); });
  return Object.freeze({ root, select, controller });
}

async function renderSubmit(generation) {
  const owner = routeGuard.owner(generation, "/submit");
  let submitButton;
  const spaceControl = createPagedOptionControl({
    resource: "spaces",
    writableOnly: true,
    owner,
    label: "Spaces",
    fieldLabel: "Target Space",
    required: true,
    onState: (state) => { if (submitButton) submitButton.disabled = state.items.length === 0; },
  });
  await spaceControl.controller.loadInitial();
  const title = element("input", { name: "title", required: "", maxlength: "200", autocomplete: "off" });
  const kind = element("select", { name: "kind" }, ["text", "markdown", "code"].map((value) => element("option", { value, text: value })));
  const requestedVisibility = element("select", { name: "visibility" }, [
    element("option", { value: "shared", text: "Shared" }),
    element("option", { value: "admin_only", text: "Admin only" }),
  ]);
  const space = spaceControl.select;
  space.name = "space";
  const collectionSlot = element("div", { className: "stack" });
  let collection = element("select", { name: "collection", disabled: "" }, [element("option", { value: "", text: "No collection" })]);
  collectionSlot.replaceChildren(field("Collection (optional)", collection));
  const language = element("select", { name: "language" }, ["", "bash", "css", "go", "html", "javascript", "json", "markdown", "python", "rust", "sql", "typescript", "yaml"].map((value) => element("option", { value, text: value || "Plain / auto" })));
  const content = element("textarea", { name: "content", required: "", maxlength: String(128 * 1024), placeholder: "Enter plain text, safe Markdown, or code…" });
  submitButton = element("button", { className: "primary", type: "submit", text: "Submit for review", disabled: spaceControl.controller.snapshot().items.length ? undefined : "" });
  const requestKey = idempotencyKey();
  let form;
  const mutation = createMutationController(
    () => ownsMutation(owner),
    (pending) => setPending(submitButton, pending, "Submitting…", "Submit for review"),
  );
  form = element("form", { className: "stack", onsubmit: (event) => {
    event.preventDefault();
    form.querySelector(".validation-summary")?.remove();
    const request = submissionRequest({
      requestedSpaceId: space.value,
      requestedCollectionId: collection.value || null,
      requestedVisibility: requestedVisibility.value,
      kind: kind.value,
      title: title.value,
      content: content.value,
      language: kind.value === "code" ? language.value : "",
    }, requestKey);
    void mutation.run(
      () => api(request.path, request.init),
      (result) => {
        const outcome = submissionResultModel(result);
        if (outcome.kind === "duplicate") {
          validationSummary(form, outcome.message);
          return;
        }
        navigate("/my-submissions", true, outcome.message);
      },
      (error) => validationSummary(form, safeErrorMessage(error)),
    );
  } }, [
    field("Title", title), field("Content type", kind), field("Requested visibility", requestedVisibility), spaceControl.root, collectionSlot,
    field("Code language (optional)", language), field("Content", content), submitButton,
  ]);
  let collectionGeneration = 0;
  const updateCollections = async () => {
    collectionGeneration += 1;
    const fixedGeneration = collectionGeneration;
    collection = element("select", { name: "collection", disabled: "" }, [element("option", { value: "", text: "No collection" })]);
    collectionSlot.replaceChildren(field("Collection (optional)", collection));
    if (!space.value) return;
    const control = createPagedOptionControl({
      resource: "collections",
      spaceId: space.value,
      owner,
      owns: () => fixedGeneration === collectionGeneration,
      label: "Collections",
      fieldLabel: "Collection (optional)",
      emptyLabel: "No collection",
    });
    collection = control.select;
    collection.name = "collection";
    collectionSlot.replaceChildren(control.root);
    await control.controller.loadInitial();
  };
  space.addEventListener("change", () => { void updateCollections(); });
  if (spaceControl.controller.snapshot().items.length) await updateCollections();
  const spaceState = spaceControl.controller.snapshot();
  replaceOutlet(page("Submit knowledge", "Idempotent submission keeps retries safe. Identity, role, paths, hashes, sources, and citations are never accepted from this form.", [
    card("New submission", [spaceState.items.length || spaceState.nextCursor ? form : empty("No active shared Space accepts submissions.")]),
  ]), generation);
}
function field(label, control) { return element("label", { text: label }, [control]); }

async function renderKnowledge(generation) {
  const owner = routeGuard.owner(generation, "/knowledge");
  const first = knowledgeListModel(await api(knowledgeQuery("/api/knowledge", { limit: 20 })));
  let items = first.items;
  let cursor = first.nextCursor;
  const region = element("div", { className: "stack", "aria-live": "polite" });
  const operations = createOperationGuard();
  const renderItems = () => {
    const rows = list(items, (entry) => item(entry.title, `${entry.visibilityLabel} · ${entry.searchStatus} · ${formatDate(entry.updatedAt)}`, [
      element("div", { className: "actions" }, [visibilityBadge(entry.visibility, entry.visibilityLabel), routeLink(`Read ${entry.title}`, entry.href)]),
    ]), "No published knowledge is visible to this account.");
    const more = cursor ? element("button", { className: "secondary", type: "button", text: "Load more", onclick: () => {
      more.disabled = true;
      void runLatestOperation(operations, () => api(knowledgeQuery("/api/knowledge", { limit: 20, cursor })), (data) => {
        if (!ownsMutation(owner)) return;
        const next = knowledgeListModel(data);
        items = appendPage(items, next.items, (entry) => entry.id);
        cursor = next.nextCursor;
        renderItems();
      }, (error) => { if (ownsMutation(owner)) region.replaceChildren(rows, routeStateNode("error", safeErrorMessage(error))); }, () => ownsMutation(owner));
    } }) : undefined;
    region.replaceChildren(rows, more);
  };
  renderItems();
  replaceOutlet(page("Library", "Browse the permission-filtered current Revision for every visible Knowledge Item.", [card("Published knowledge", [region])]), generation);
}

async function renderSearch(generation) {
  const owner = routeGuard.owner(generation, "/search");
  const spaceControl = createPagedOptionControl({ resource: "spaces", owner, label: "Spaces", fieldLabel: "Space", emptyLabel: "All Spaces" });
  await spaceControl.controller.loadInitial();
  const query = element("input", { type: "search", required: "", maxlength: "200", placeholder: "Search published knowledge", "aria-label": "Search query" });
  const space = spaceControl.select;
  let collection = element("select", { disabled: "" }, [element("option", { value: "", text: "All Collections" })]);
  let tag = element("select", { disabled: "" }, [element("option", { value: "", text: "All Tags" })]);
  const collectionSlot = element("div", { className: "stack" }, [field("Collection", collection)]);
  const tagSlot = element("div", { className: "stack" }, [field("Tag", tag)]);
  const results = element("div", { className: "stack", "aria-live": "polite" });
  const operations = createOperationGuard();
  let currentItems = [];
  let currentCursor;
  let currentFilters;
  const renderResults = (model) => {
    const nodes = [];
    if (model.degraded) nodes.push(routeStateNode("degraded", "Search index is degraded. Published documents remain readable; results may be incomplete."));
    nodes.push(list(currentItems, (hit) => item(hit.title, hit.location, [
      element("p", { className: "excerpt", text: hit.excerpt }),
      routeLink(`Open citation: ${hit.title}, ${hit.location}`, hit.citationHref),
    ]), "No matching published knowledge."));
    if (currentCursor) nodes.push(element("button", { className: "secondary", type: "button", text: "Load more results", onclick: () => { void search(currentCursor, true); } }));
    results.replaceChildren(...nodes);
  };
  const search = async (cursor, append = false) => {
    results.replaceChildren(routeStateNode("loading", append ? "Loading more results…" : "Searching…"));
    await runLatestOperation(operations, () => api(knowledgeQuery("/api/knowledge/search", { ...currentFilters, limit: 20, cursor })), (data) => {
      if (!ownsMutation(owner)) return;
      const model = knowledgeSearchModel(data);
      currentItems = append ? appendPage(currentItems, model.items, (hit) => hit.citationId) : model.items;
      currentCursor = model.nextCursor;
      renderResults(model);
    }, (error) => { if (ownsMutation(owner)) results.replaceChildren(routeStateNode(error?.status === 403 ? "forbidden" : "error", safeErrorMessage(error))); }, () => ownsMutation(owner));
  };
  const form = element("form", { className: "filter-grid", onsubmit: (event) => {
    event.preventDefault();
    currentFilters = { q: query.value, spaceId: space.value, collectionId: collection.value, tagId: tag.value };
    currentItems = [];
    currentCursor = undefined;
    void search(undefined, false);
  } }, [field("Query", query), spaceControl.root, collectionSlot, tagSlot, element("button", { className: "primary", type: "submit", text: "Search" })]);
  let filterGeneration = 0;
  const updateDependentFilters = async () => {
    filterGeneration += 1;
    const fixedGeneration = filterGeneration;
    collection = element("select", { disabled: "" }, [element("option", { value: "", text: "All Collections" })]);
    tag = element("select", { disabled: "" }, [element("option", { value: "", text: "All Tags" })]);
    collectionSlot.replaceChildren(field("Collection", collection));
    tagSlot.replaceChildren(field("Tag", tag));
    if (!space.value) return;
    const ownsFilter = () => fixedGeneration === filterGeneration;
    const collectionControl = createPagedOptionControl({
      resource: "collections", spaceId: space.value, owner, owns: ownsFilter, label: "Collections", fieldLabel: "Collection", emptyLabel: "All Collections",
    });
    const tagControl = createPagedOptionControl({
      resource: "tags", spaceId: space.value, owner, owns: ownsFilter, label: "Tags", fieldLabel: "Tag", emptyLabel: "All Tags",
    });
    collection = collectionControl.select;
    tag = tagControl.select;
    collectionSlot.replaceChildren(collectionControl.root);
    tagSlot.replaceChildren(tagControl.root);
    await Promise.all([collectionControl.controller.loadInitial(), tagControl.controller.loadInitial()]);
  };
  space.addEventListener("change", () => { void updateDependentFilters(); });
  replaceOutlet(page("Search", "FTS search is permission-scoped and links every result to its exact Revision and Chunk.", [card("Search filters", [form]), card("Results", [results])]), generation);
}

async function renderAgent(generation) {
  const question = element("textarea", { required: "", maxlength: "200", placeholder: "Ask a question grounded in published knowledge…" });
  const answer = element("div", { className: "stack", "aria-live": "polite" });
  const owner = routeGuard.owner(generation, "/agent");
  const submitButton = element("button", { className: "primary", type: "submit", text: "Ask Agent" });
  const mutation = createMutationController(
    () => ownsMutation(owner),
    (pending) => {
      question.disabled = pending;
      setPending(submitButton, pending, "Asking…", "Ask Agent");
    },
  );
  const form = element("form", { className: "stack", onsubmit: (event) => {
    event.preventDefault();
    const request = chatRequest({ question: question.value });
    void mutation.run(() => {
      answer.replaceChildren(routeStateNode("loading", "Reading permission-scoped published knowledge…"));
      return api(request.path, request.init);
    }, (data) => {
      const model = citedAnswerModel(data);
      answer.replaceChildren(
        element("p", { className: "answer-text", text: model.answer }),
        element("h3", { text: "Citations" }),
        list(model.sources, (source) => item(`[${source.number}] ${source.title}`, source.location, [
          element("p", { className: "excerpt", text: source.excerpt }),
          element("a", { href: source.href, "data-route": "", className: "nav-link", "aria-label": source.accessibleName, text: "Open exact source location" }),
        ]), "The answer contains no source citations."),
      );
    }, (error) => answer.replaceChildren(routeStateNode(error?.status === 403 ? "forbidden" : "error", safeErrorMessage(error))));
  } }, [field("Question", question), submitButton]);
  replaceOutlet(page("Agent", "Answers use only current permission-scoped search hits; unsupported claims fail closed.", [card("Grounded question", [form, answer])]), generation);
}

async function renderMySubmissions(generation) {
  const owner = routeGuard.owner(generation, "/my-submissions");
  let data = await api("/api/submissions/mine?limit=20");
  let items = data.items;
  let cursor = data.nextCursor;
  const region = element("div", { className: "stack", "aria-live": "polite" });
  const operations = createOperationGuard();
  const renderItems = () => {
    const rows = list(items, (submission) => {
      const children = [element("pre", { className: "content-preview", text: submission.content })];
      if (submission.status === "revision_requested") {
        const revisedTitle = element("input", { required: "", maxlength: "200", value: submission.title });
        const revisedContent = element("textarea", { required: "", maxlength: String(128 * 1024), text: submission.content });
        const button = element("button", { className: "primary", type: "submit", text: "Revise and resubmit" });
        const key = idempotencyKey();
        let form;
        const mutation = createMutationController(
          () => ownsMutation(owner),
          (pending) => setPending(button, pending, "Resubmitting…", "Revise and resubmit"),
        );
        form = element("form", { className: "stack", onsubmit: (event) => {
          event.preventDefault();
          const request = resubmissionRequest(submission.id, {
            kind: submission.kind,
            title: revisedTitle.value,
            content: revisedContent.value,
          }, key);
          void mutation.run(
            () => api(request.path, request.init),
            () => navigate("/my-submissions", true, "Revision resubmitted for review."),
            (error) => validationSummary(form, safeErrorMessage(error)),
          );
        } }, [field("Revised title", revisedTitle), field("Revised content", revisedContent), button]);
        children.push(form);
      }
      return item(
        submission.title,
        `${submission.kind} · ${submission.status} · ${formatDate(submission.createdAt)}`,
        children,
      );
    }, "You have no submissions.");
    const more = cursor ? element("button", { className: "secondary", type: "button", text: "Load more", onclick: () => {
      more.disabled = true;
      void runLatestOperation(operations, () => api(`/api/submissions/mine?limit=20&cursor=${encodeURIComponent(cursor)}`), (next) => {
        if (!ownsMutation(owner)) return;
        items = appendPage(items, next.items, (submission) => submission.id);
        cursor = next.nextCursor;
        renderItems();
      }, (error) => { if (ownsMutation(owner)) region.replaceChildren(rows, routeStateNode("error", safeErrorMessage(error))); }, () => ownsMutation(owner));
    } }) : undefined;
    region.replaceChildren(rows, more);
  };
  renderItems();
  replaceOutlet(page("My Submissions", "Only your own submitted source text and review status are visible here.", [card("Submission history", [region])]), generation);
}

async function renderKnowledgeReader(generation, knowledgeItemId) {
  const url = new URL(window.location.href);
  for (const key of url.searchParams.keys()) {
    if (!["revision", "chunk"].includes(key) || url.searchParams.getAll(key).length !== 1) {
      replaceOutlet(page("Invalid reader location", "Only one Revision and Chunk location may be selected.", [routeStateNode("error", "The reader URL is invalid.")]), generation);
      return;
    }
  }
  const requestedRevision = url.searchParams.get("revision") || "";
  const requestedChunk = url.searchParams.get("chunk") || "";
  const request = knowledgeReaderRequest(knowledgeItemId, requestedRevision);
  const response = await api(request.path);
  const readerValue = response[request.responseKey];
  const model = knowledgeReaderModel(readerValue, { revision: requestedRevision, chunk: requestedChunk });
  const outline = element("nav", { className: "reader-outline", "aria-label": "Document outline" }, [
    element("h2", { text: "Outline" }),
    list(model.outline, (entry) => element("li", { className: "item" }, [
      element("a", {
        href: entry.href,
        "data-route": "",
        "aria-current": entry.focused ? "location" : undefined,
        text: `${entry.label} · ${entry.lineLabel}`,
      }),
    ]), "This Revision has no indexed headings."),
  ]);
  const body = element("article", { className: "reader-body", "aria-label": "Revision body" }, [
    element("div", { className: "actions" }, [visibilityBadge(model.visibility, model.visibilityLabel), element("span", { className: "badge", text: model.revisionLabel })]),
    !model.isCurrent
      ? routeStateNode("degraded", "You are reading an immutable historical Revision. Citations do not silently move to the current text.")
      : undefined,
    model.searchStatus === "search_degraded"
      ? routeStateNode("degraded", "This document is readable, but its search index is degraded.")
      : undefined,
    element("pre", { className: "markdown-body", text: model.markdown }),
  ]);
  const sources = element("aside", { className: "reader-sources", "aria-label": "Sources and locations" }, [
    element("h2", { text: "Sources" }),
    list(model.sources, (source) => element("li", {
      id: `chunk-${source.id}`,
      className: "item source-location",
      tabindex: source.id === model.focusedChunkId ? "-1" : undefined,
    }, [
      element("p", { text: source.label }),
      element("a", { href: source.href, "data-route": "", "aria-label": `Open source location: ${source.label}`, text: "Copyable reader location" }),
    ]), "This Revision has no source locations."),
  ]);
  if (replaceOutlet(page(model.title, `${model.revisionLabel} · published ${formatDate(model.publishedAt)}`, [
    element("div", { className: "reader-grid" }, [outline, body, sources]),
  ]), generation) && model.focusedChunkId) {
    byId(`chunk-${model.focusedChunkId}`)?.focus({ preventScroll: false });
  }
}

async function renderAdminDashboard(generation) {
  const owner = routeGuard.owner(generation, "/admin");
  const [pending, members, spaces, audit] = await Promise.all([
    api("/api/admin/submissions?status=review_pending&limit=5"), api("/api/admin/members?limit=5"), api("/api/spaces?limit=5"), api("/api/admin/audit-events?limit=5"),
  ]);
  const recoveryButton = element("button", { className: "secondary", type: "button", text: "Recover pending publications" });
  const recovery = createMutationController(
    () => ownsMutation(owner),
    (pendingState) => setPending(recoveryButton, pendingState, "Recovering…", "Recover pending publications"),
  );
  recoveryButton.addEventListener("click", () => openReviewDialog({
    title: "Recover pending publications?",
    description: "This bounded operation resumes up to 20 durable publication or indexing intents.",
    confirmLabel: "Run recovery",
    owns: () => ownsMutation(owner),
    onConfirm: () => { void recovery.run(
      () => api("/api/admin/publications/recover", { method: "POST", body: JSON.stringify({ limit: 20 }) }),
      (result) => setStatus(`Recovery finished: ${result.recovery.recoveredIntents} publications and ${result.recovery.recoveredIndexJobs} indexes recovered; ${result.recovery.failures.length} failures.`, result.recovery.failures.length ? "error" : "success"),
      (error) => setStatus(safeErrorMessage(error), "error"),
    ); },
  }));
  replaceOutlet(page("Administration", "Every governance operation is authorized again by its server API.", [
    element("div", { className: "page-grid" }, [
      metricCard("Review queue", pending.items.length, "Open Review Queue", "/admin/submissions"), metricCard("Members", members.items.length, "Manage members", "/admin/members"),
      metricCard("Spaces", spaces.items.length, "Manage Spaces", "/admin/spaces"), metricCard("Audit events", audit.items.length, "Open audit", "/admin/audit"),
    ]),
    card("Recovery", [element("p", { text: "Recovery is bounded, explicit, and safe to retry." }), recoveryButton]),
  ]), generation);
}
function metricCard(title, value, label, href) { return card(title, [element("p", { text: String(value) }), routeLink(label, href)]); }

async function renderPendingSubmissions(generation) {
  const owner = routeGuard.owner(generation, "/admin/submissions");
  let data = await api("/api/admin/submissions?status=review_pending&limit=20");
  let items = data.items;
  let cursor = data.nextCursor;
  const region = element("div", { className: "stack", "aria-live": "polite" });
  const operations = createOperationGuard();
  const renderItems = () => {
    const rows = list(items, (submission) => item(submission.title, `${submission.kind} · submitted ${formatDate(submission.createdAt)}`, [
      element("pre", { className: "content-preview", text: submission.content }),
      routeLink(`Review ${submission.title}`, `/admin/submissions/${encodeURIComponent(submission.id)}`),
    ]), "The review queue is empty.");
    const more = cursor ? element("button", { className: "secondary", type: "button", text: "Load more", onclick: () => {
      more.disabled = true;
      void runLatestOperation(operations, () => api(`/api/admin/submissions?status=review_pending&limit=20&cursor=${encodeURIComponent(cursor)}`), (next) => {
        if (!ownsMutation(owner)) return;
        items = appendPage(items, next.items, (submission) => submission.id);
        cursor = next.nextCursor;
        renderItems();
      }, (error) => { if (ownsMutation(owner)) region.replaceChildren(rows, routeStateNode("error", safeErrorMessage(error))); }, () => ownsMutation(owner));
    } }) : undefined;
    region.replaceChildren(rows, more);
  };
  renderItems();
  replaceOutlet(page("Review Queue", "Preview normalized source content before publishing, rejecting, or requesting a revision.", [card("review_pending", [region])]), generation);
}

async function renderReviewSubmission(generation, submissionId) {
  const pathname = `/admin/submissions/${submissionId}`;
  const owner = routeGuard.owner(generation, pathname);
  const previewResponse = await api(`/api/admin/submissions/${encodeURIComponent(submissionId)}`);
  const model = reviewPreviewModel(previewResponse.preview);
  const target = reviewTargetModel(previewResponse.preview);
  const title = element("input", { required: "", maxlength: "200", value: model.title });
  const visibility = element("select", {}, [
    element("option", { value: "shared", text: "Shared" }),
    element("option", { value: "admin_only", text: "Admin only" }),
  ]);
  visibility.value = model.requestedVisibility;
  const finalSpace = element("input", { required: "", maxlength: "128", value: target.spaceId });
  const finalCollection = element("input", { maxlength: "128", value: target.collectionId || "" });
  const tags = element("fieldset", { className: "tag-selector", "aria-live": "polite" });
  let tagController;
  const renderTags = (state) => {
    const nodes = [element("legend", { text: "Tags in the requested Space" })];
    if (!state.loaded) nodes.push(routeStateNode("loading", "Loading active Tags…"));
    if (state.items.length) nodes.push(...state.items.map((tag) => element("label", { className: "check-option", text: tag.name }, [
      element("input", {
        type: "checkbox",
        value: tag.id,
        checked: tag.selected ? "" : undefined,
        onchange: (event) => tagController.select(tag.id, event.currentTarget.checked),
      }),
    ])));
    else if (state.loaded && !state.error) nodes.push(element("p", { className: "muted", text: "No active Tags in this Space." }));
    if (state.error) nodes.push(routeStateNode("error", state.error));
    const loadMore = reviewTagLoadMoreModel(state);
    if (loadMore.visible) nodes.push(element("button", {
      className: "secondary",
      type: "button",
      text: loadMore.label,
      disabled: loadMore.disabled ? "" : undefined,
      "aria-label": loadMore.accessibleName,
      onclick: () => { void tagController.loadMore(); },
    }));
    tags.replaceChildren(...nodes);
  };
  const tagOwnership = createReplaceableOwner(() => ownsMutation(owner));
  const resetTagController = () => {
    const controllerOwns = tagOwnership.claim();
    tagController = createReviewTagController({
      spaceId: finalSpace.value,
      owns: controllerOwns,
      request: (path) => api(path),
      onChange: renderTags,
    });
    renderTags(tagController.snapshot());
    if (finalSpace.value) void tagController.loadInitial();
  };
  finalSpace.addEventListener("change", () => {
    finalCollection.value = "";
    resetTagController();
  });
  resetTagController();
  const reason = element("select", {}, [
    element("option", { value: "not_relevant", text: "Not relevant" }),
    element("option", { value: "duplicate", text: "Duplicate" }),
    element("option", { value: "unsafe", text: "Unsafe content" }),
  ]);
  const note = element("textarea", { maxlength: "4000", placeholder: "Review note or revision request…" });
  const publishButton = element("button", { className: "primary", type: "button", text: "Publish" });
  const rejectButton = element("button", { className: "danger", type: "button", text: "Reject" });
  const revisionButton = element("button", { className: "secondary", type: "button", text: "Request revision" });
  const actionButtons = [publishButton, rejectButton, revisionButton];
  let form;
  const mutation = createMutationController(
    () => ownsMutation(owner),
    (pending) => {
      for (const button of actionButtons) {
        button.disabled = pending;
      }
    },
  );
  const runDecision = (kind, visibilityReasonCode) => {
    form.querySelector(".validation-summary")?.remove();
    if (kind === "publish" && !form.reportValidity()) {
      validationSummary(form, "Select an active writable final Space and complete every required publication field.");
      return;
    }
    let request;
    if (kind === "publish") {
      request = publishRequest(submissionId, {
        title: title.value,
        visibility: visibility.value,
        spaceId: finalSpace.value,
        collectionId: finalCollection.value || null,
        tagIds: tagController.snapshot().items.filter((tag) => tag.selected).map((tag) => tag.id),
        ...(visibilityReasonCode ? { visibilityReasonCode } : {}),
      });
    } else {
      request = {
        path: `/api/admin/submissions/${encodeURIComponent(submissionId)}/${kind === "reject" ? "reject" : "request-revision"}`,
        init: {
          method: "POST",
          body: JSON.stringify(kind === "reject"
            ? { reasonCode: reason.value, note: note.value }
            : { reasonCode: "needs_revision", note: note.value }),
        },
      };
    }
    void mutation.run(
      () => api(request.path, request.init),
      (result) => {
        if (kind === "publish") {
          navigate(`/knowledge/${encodeURIComponent(result.revision.knowledgeItemId)}?revision=${encodeURIComponent(result.revision.id)}`, true, `Published ${result.revision.title}.`);
        } else {
          navigate("/admin/submissions", true, kind === "reject" ? "Submission rejected." : "Revision requested.");
        }
      },
      (error) => validationSummary(form, safeErrorMessage(error)),
    );
  };
  const confirmPublication = () => {
    if (model.requestedVisibility === "admin_only" && visibility.value === "shared") {
      openReviewDialog({
        title: "Expand visibility to Shared?",
        description: "This expands an Admin-only request. Confirm the bounded administrator visibility-expansion reason.",
        confirmLabel: "Confirm visibility expansion",
        owns: () => ownsMutation(owner),
        onConfirm: () => runDecision("publish", "admin_visibility_expansion"),
      });
      return;
    }
    runDecision("publish");
  };
  publishButton.addEventListener("click", () => openReviewDialog({
    title: "Publish this immutable Revision?",
    description: "The server will validate the active target, write canonical Markdown, create chunks, and index the current Revision.",
    confirmLabel: "Publish Revision",
    owns: () => ownsMutation(owner),
    onConfirm: confirmPublication,
  }));
  rejectButton.addEventListener("click", () => openReviewDialog({
    title: "Reject this submission?",
    description: "The review decision is audited and the submission will leave the pending queue.",
    confirmLabel: "Reject submission",
    danger: true,
    owns: () => ownsMutation(owner),
    onConfirm: () => runDecision("reject"),
  }));
  revisionButton.addEventListener("click", () => openReviewDialog({
    title: "Request a revision?",
    description: "The contributor will see that this source needs revision; no formal knowledge will be published.",
    confirmLabel: "Request revision",
    owns: () => ownsMutation(owner),
    onConfirm: () => runDecision("revision"),
  }));
  form = element("form", { className: "stack", onsubmit: (event) => event.preventDefault() }, [
    field("Final visibility", visibility),
    element("dl", { className: "review-target", "aria-label": "Requested and final review metadata" }, [
      element("dt", { text: "Requested title" }), element("dd", { text: model.title }),
      element("dt", { text: "Final title" }), element("dd", {}, [title]),
      element("dt", { text: "Requested Space" }), element("dd", { text: target.spaceLabel }),
      element("dt", { text: "Requested Collection" }), element("dd", { text: target.collectionLabel }),
      element("dt", { text: "Requested visibility" }), element("dd", { text: model.requestedVisibility }),
      element("dt", { text: "Final Space ID" }), element("dd", {}, [finalSpace]),
      element("dt", { text: "Final Collection ID" }), element("dd", {}, [finalCollection]),
    ]),
    tags,
    field("Rejection reason", reason), field("Review note", note), element("div", { className: "actions" }, actionButtons),
  ]);
  if (replaceOutlet(page(`Review: ${model.title}`, `${model.kind} · ${model.status} · parser ${model.parserVersion}`, [
    element("div", { className: "review-grid" }, [
      card("Raw input (inert text)", [element("pre", { className: "content-preview", text: model.rawInput })]),
      card("Normalized Markdown (inert text)", [element("pre", { className: "content-preview", text: model.normalizedMarkdown })]),
    ]),
    element("div", { className: "page-grid" }, [
      card("Chunk and location preview", [list(model.chunks, (chunk) => item(chunk.heading, chunk.lineLabel, [
        element("pre", { className: "content-preview", text: chunk.excerpt }),
      ]), "No publication Chunks were produced.")]),
      card("Warnings", [list(model.warnings, (warning) => element("li", { className: "item", text: warning }), "No warnings.")]),
    ]),
    card("Review decision", [form]),
  ]), generation)) {
    void tagController.loadInitial();
  }
}

async function renderMembers(generation) {
  const data = await api("/api/admin/members?limit=50");
  const owner = routeGuard.owner(generation, "/admin/members");
  const rows = data.items.map((member) => {
    const readyLabel = member.status === "active" ? "Disable contributor" : "Enable contributor";
    const status = element("button", { className: "secondary", type: "button", text: readyLabel, disabled: member.role === "admin" ? "" : undefined });
    const mutation = createMutationController(
      () => ownsMutation(owner),
      (pending) => setPending(status, pending, "Updating…", readyLabel),
    );
    status.addEventListener("click", () => { void mutation.run(
      () => api(`/api/admin/members/${encodeURIComponent(member.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: member.status === "active" ? "disabled" : "active" }) }),
      () => navigate("/admin/members", true, "Member status updated."),
      (error) => setStatus(safeErrorMessage(error), "error"),
    ); });
    return element("tr", {}, [element("td", { text: member.email }), element("td", { text: member.role }), element("td", { text: member.status }), element("td", {}, [status])]);
  });
  replaceOutlet(page("Members", "The sole administrator remains protected from browser status changes.", [card("Member directory", [table(["Email", "Role", "Status", "Action"], rows)])]), generation);
}
function table(headers, rows) { return element("div", { className: "table-wrap" }, [element("table", {}, [element("thead", {}, [element("tr", {}, headers.map((header) => element("th", { text: header }))) ]), element("tbody", {}, rows)])]); }

async function renderSpaces(generation) {
  const owner = routeGuard.owner(generation, "/admin/spaces");
  let latestState;
  let renderState = () => undefined;
  const controller = createAdminSpacesRouteController({
    owns: () => ownsMutation(owner),
    request: api,
    onChange(state) {
      latestState = state;
      renderState();
    },
  });
  await controller.loadInitial();
  const spaces = controller.snapshot().spaces;
  const managedSpaces = spaces.filter((space) => !space.readOnly && space.kind === "shared");
  const slug = element("input", { required: "", placeholder: "engineering" });
  const name = element("input", { required: "", placeholder: "Engineering" });
  const position = element("input", { type: "number", value: String(spaces.length) });
  const createSpaceButton = element("button", { className: "primary", type: "submit", text: "Create shared Space" });
  let form;
  const spaceMutation = createMutationController(
    () => ownsMutation(owner),
    (pending) => setPending(createSpaceButton, pending, "Creating…", "Create shared Space"),
  );
  form = element("form", { className: "stack", onsubmit: (event) => {
    event.preventDefault();
    void spaceMutation.run(
      () => api("/api/admin/spaces", { method: "POST", body: JSON.stringify({ slug: slug.value, name: name.value, position: Number(position.value) }) }),
      () => navigate("/admin/spaces", true, "Space created."),
      (error) => validationSummary(form, safeErrorMessage(error)),
    );
  } }, [field("Slug", slug), field("Name", name), field("Position", position), createSpaceButton]);
  const collectionSpace = element("select", { required: "" }, managedSpaces.map((space) => element("option", { value: space.id, text: space.name })));
  const collectionName = element("input", { required: "", placeholder: "Runbooks" });
  const collectionPosition = element("input", { type: "number", value: "0" });
  const createCollectionButton = element("button", { className: "primary", type: "submit", text: "Create Collection", disabled: managedSpaces.length ? undefined : "" });
  let collectionForm;
  const collectionMutation = createMutationController(
    () => ownsMutation(owner),
    (pending) => setPending(createCollectionButton, pending, "Creating…", "Create Collection"),
  );
  collectionForm = element("form", { className: "stack", onsubmit: (event) => {
    event.preventDefault();
    void collectionMutation.run(
      () => api("/api/admin/collections", { method: "POST", body: JSON.stringify({ spaceId: collectionSpace.value, name: collectionName.value, position: Number(collectionPosition.value) }) }),
      () => navigate("/admin/spaces", true, "Collection created."),
      (error) => validationSummary(collectionForm, safeErrorMessage(error)),
    );
  } }, [field("Target Space", collectionSpace), field("Collection name", collectionName), field("Position", collectionPosition), createCollectionButton]);
  const spacesSlot = element("div");
  const collectionsSlot = element("div");
  const spacesMore = element("button", { className: "secondary", type: "button" });
  const spacesStatus = element("p", { className: "muted", role: "status", "aria-live": "polite" });
  spacesMore.addEventListener("click", () => { void controller.loadMoreSpaces(); });
  replaceOutlet(page("Spaces", "Legacy personal Spaces remain read-only; server APIs validate every shared Space and Collection mutation.", [
    element("div", { className: "page-grid wide-left" }, [card("Existing Spaces", [spacesSlot, spacesMore, spacesStatus]), card("New shared Space", [form])]),
    element("div", { className: "page-grid wide-left" }, [
      card("Collections", [collectionsSlot]),
      card("New Collection", [collectionForm]),
    ]),
  ]), generation);
  renderState = () => {
    if (!ownsMutation(owner) || !latestState) return;
    spacesSlot.replaceChildren(list(latestState.spaces, (space) => item(
      space.name,
      `${space.slug} · ${space.kind} · ${space.readOnly ? "read-only" : space.status}`,
    ), "No Spaces."));
    const spaceMoreModel = optionLoadMoreModel(latestState, "Spaces");
    spacesMore.hidden = !spaceMoreModel.visible;
    spacesMore.disabled = spaceMoreModel.disabled;
    spacesMore.textContent = spaceMoreModel.label;
    spacesMore.setAttribute("aria-label", spaceMoreModel.accessibleName);
    spacesStatus.textContent = latestState.error;
    spacesStatus.hidden = !latestState.error;

    const selection = collectionSpace.value;
    const writableSpaces = latestState.spaces.filter((space) => !space.readOnly && space.kind === "shared");
    collectionSpace.replaceChildren(...writableSpaces.map((space) => element("option", { value: space.id, text: space.name })));
    if ([...collectionSpace.options].some((option) => option.value === selection)) collectionSpace.value = selection;
    createCollectionButton.disabled = writableSpaces.length === 0;

    const spaceById = new Map(latestState.spaces.map((space) => [space.id, space]));
    collectionsSlot.replaceChildren(latestState.collectionPages.length ? list(
      latestState.collectionPages,
      (collectionPage) => {
        const more = element("button", { className: "secondary", type: "button" });
        const moreModel = optionLoadMoreModel(collectionPage, "Collections");
        more.hidden = !moreModel.visible;
        more.disabled = moreModel.disabled;
        more.textContent = moreModel.label;
        more.setAttribute("aria-label", `${moreModel.accessibleName} in ${spaceById.get(collectionPage.spaceId)?.name || "Space"}`);
        more.addEventListener("click", () => { void controller.loadMoreCollections(collectionPage.spaceId); });
        const status = element("p", { className: "muted", role: "status", "aria-live": "polite", text: collectionPage.error });
        status.hidden = !collectionPage.error;
        return item(
          spaceById.get(collectionPage.spaceId)?.name || "Space",
          collectionPage.items.length ? collectionPage.items.map((collection) => collection.name).join(" · ") : "No Collections yet.",
          [more, status],
        );
      },
      "No manageable shared Space.",
    ) : empty("No manageable shared Space."));
  };
  latestState = controller.snapshot();
  renderState();
}

async function renderAudit(generation) {
  const data = await api("/api/admin/audit-events?limit=50");
  replaceOutlet(page("Audit", "Server action allowlists redact event metadata before it reaches this browser.", [card("Recent events", [list(data.items, (event) => item(event.action, `${event.resourceType} · ${formatDate(event.createdAt)}`, [element("code", { text: JSON.stringify(event.metadata) })]), "No audit events.")])]), generation);
}

async function bootstrap() {
  try {
    const state = await loadSession();
    if (state.kind === "anonymous") {
      renderAnonymous();
      return;
    }
    logoutController.invalidate();
    session = state.session;
    byId("session-summary").textContent = `${session.member.email} · ${session.member.role}`;
    logoutButton.hidden = false;
    logoutButton.disabled = false;
    drawerToggle.disabled = false;
    setDrawer(false);
    shell.dataset.ready = "true";
    await renderRoute();
  } catch (error) {
    replaceOutlet(page("无法启动工作区", error.message || "无法获取当前会话。", [empty("请稍后重试。")]))
  }
}

function renderAnonymous() {
  closeOpenDialogs();
  logoutController.invalidate();
  const state = anonymousShellState();
  session = undefined;
  routeGuard.begin();
  pendingFlash = "";
  setStatus(state.statusMessage);
  byId("primary-navigation").replaceChildren();
  byId("session-summary").textContent = "登录后即可访问你的知识工作区。";
  logoutButton.hidden = true;
  logoutButton.disabled = true;
  drawerToggle.disabled = true;
  applyDrawerState(state.drawer);
  shell.dataset.ready = "false";
  replaceOutlet(page("欢迎来到 Memory Garden", "使用 GitHub 登录后，即可继续访问你的知识工作区。", [
    element("div", { className: "actions" }, [element("a", { href: "/auth/github", className: "login-action", text: "使用 GitHub 登录" })]),
  ]));
}

function logout() { return logoutController.run(); }

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-route]");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
  event.preventDefault();
  navigate(link.getAttribute("href"));
});
window.addEventListener("popstate", () => {
  closeOpenDialogs();
  if (!session) return;
  setDrawer(false);
  void renderRoute();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && shell.dataset.drawerOpen === "true") setDrawer(false); });
drawerToggle.addEventListener("click", () => setDrawer(shell.dataset.drawerOpen !== "true", true));
logoutButton.addEventListener("click", () => { void logout(); });
mobileViewport.addEventListener("change", () => { if (session) setDrawer(false); });
applyDrawerState(anonymousShellState().drawer);
drawerToggle.disabled = true;
void bootstrap();
