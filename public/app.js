import { createI18n, createTranslationBindings } from "/i18n.js";
import { navigationForSession } from "/navigation.js";
import { renderSafeMarkdown } from "/markdown-renderer.js";
import {
  anonymousShellState,
  accountPresentationModel,
  appendPage,
  assetListModel,
  assetProcessRequest,
  assetUploadRequest,
  assetUploadResultModel,
  chatRequest,
  chatScopeControlsModel,
  chatScopeSummaryModel,
  citedAnswerModel,
  configureWorkspaceI18n,
  createAdminSpacesRouteController,
  createChatItemPageController,
  createLogoutController,
  createLocaleRefreshController,
  createMutationController,
  createOptionPageController,
  createOwnedActionController,
  createOperationGuard,
  createReplaceableOwner,
  createReviewTagController,
  createRouteGuard,
  compactChildren,
  contentLayoutModel,
  contextualPanelModel,
  dashboardMetricsModel,
  displayDate,
  displayValue,
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
  shellPresentationModel,
  submissionRequest,
  submissionResultModel,
  runLatestOperation,
} from "/workspace-ui.js";

const i18n = createI18n({
  navigatorLanguage: navigator.language,
  storage: browserStorage(),
});
const translate = (key, values) => i18n.t(key, values);
const translationBindings = createTranslationBindings(translate);
const t = (key, values) => translationBindings.value(key, values);
const localized = (render) => translationBindings.computed(render);
configureWorkspaceI18n(translate);

// The production deployment intentionally omits the paid R2 binding. Keep
// the upload affordance visible as an honest capability notice instead of
// allowing a browser to send a body that the Worker cannot persist.
const BINARY_ASSETS_ENABLED = false;

const byId = (id) => document.getElementById(id);
const shell = byId("app-shell");
const outlet = byId("page-outlet");
const statusRegion = byId("status-region");
const drawerToggle = byId("drawer-toggle");
const sidebar = byId("sidebar");
const logoutButton = byId("logout-button");
const languageSelect = byId("language-select");
const sessionAvatar = byId("session-avatar");
const shellPresentation = shellPresentationModel();
for (const [key, value] of Object.entries(shellPresentation)) shell.dataset[key] = value;
const routeGuard = createRouteGuard();
const mobileViewport = window.matchMedia("(max-width: 760px)");
let session;
let pendingFlash = "";
const openDialogs = new Set();
const logoutController = createLogoutController(fetch, {
  onPendingChange(pending) {
    logoutButton.disabled = pending || !session;
    translationBindings.text(logoutButton, t(pending ? "SHELL_LOGOUT_PENDING" : "SHELL_LOGOUT"));
  },
  onSuccess() { renderAnonymous(); },
  onError(error) { setStatus(safeErrorMessage(error, t("SHELL_LOGOUT_ERROR")), "error"); },
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
  "/admin/assets": renderAdminAssets,
  "/admin/members": renderMembers,
  "/admin/spaces": renderSpaces,
  "/admin/audit": renderAudit,
});
const localeRefreshController = createLocaleRefreshController(i18n.locale, {
  applyLocale,
  refreshTranslations: () => translationBindings.refresh(),
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
    else if (name === "text") translationBindings.text(node, value);
    else if (name.startsWith("on") && typeof value === "function") node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (translationBindings.isValue(value)) translationBindings.attribute(node, name, value);
    else node.setAttribute(name, String(value));
  }
  node.append(...children.filter(Boolean));
  return node;
}

function page(title, description, children = []) {
  const context = contextualPanelModel(session ? [
    { label: String(t("COMMON_EMAIL")), value: session.member?.email },
    { label: String(t("COMMON_ROLE")), value: String(memberRoleLabel(session.member?.role)) },
    { label: String(t("COMMON_STATUS")), value: String(t("COMMON_STATUS_ACTIVE")) },
  ] : []);
  const quickActions = session ? [
    has("submission:create") ? routeLink(t("HOME_SUBMIT_KNOWLEDGE"), "/submit") : null,
    has("knowledge:read") ? routeLink(t("SEARCH_ACTION"), "/search") : null,
    has("knowledge:read") ? routeLink(t("HOME_ASK_AGENT"), "/agent") : null,
    has("knowledge:review") ? routeLink(t("NAV_REVIEW_QUEUE"), "/admin/submissions") : null,
  ].filter(Boolean) : [];
  translationBindings.text(byId("topbar-page-title"), title);
  return element("div", { className: "page-shell" }, [
    element("header", { className: "page-header" }, [
      element("p", { className: "eyebrow", text: t("APP_EYEBROW") }),
      element("div", { className: "page-heading-row" }, [
        element("div", {}, [element("h1", { text: title, tabindex: "-1" }), element("p", { className: "muted", text: description })]),
      ]),
    ]),
    element("div", { className: contentLayoutModel(context.visible).className }, [
      element("section", { className: "content-primary" }, children),
      element("aside", {
        className: "context-panel",
        ...(context.visible ? {} : { hidden: "" }),
        "aria-label": t("SHELL_PAGE_CONTEXT"),
      }, [
        element("p", { className: "eyebrow", text: t("SHELL_CONTEXT_TITLE") }),
        element("p", { className: "muted", text: t("SHELL_CONTEXT_DESCRIPTION") }),
        element("dl", { className: "context-list" }, context.items.flatMap((item) => [
          element("dt", { text: item.label }), element("dd", { text: item.value }),
        ])),
        ...(quickActions.length ? [
          element("p", { className: "eyebrow context-actions-label", text: t("SHELL_CONTEXT_ACTIONS") }),
          element("div", { className: "context-actions" }, quickActions),
        ] : []),
      ]),
    ]),
  ]);
}

function card(title, children = [], className = "card") {
  return element("section", { className }, [element("h2", { text: title }), ...children]);
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
const apiErrorKeys = Object.freeze({
  FORBIDDEN: "ERROR_FORBIDDEN",
  UNAUTHORIZED: "ERROR_UNAUTHORIZED",
  PAGE_INVALID: "ERROR_PAGE_INVALID",
  PAGE_CURSOR_INVALID: "ERROR_PAGE_CURSOR_INVALID",
  SUBMISSION_INVALID: "ERROR_SUBMISSION_INVALID",
  SUBMISSION_REQUEST_INVALID: "ERROR_SUBMISSION_INVALID",
  SUBMISSION_TARGET_INVALID: "ERROR_SUBMISSION_TARGET_INVALID",
  SUBMISSION_NOT_FOUND: "ERROR_SUBMISSION_NOT_FOUND",
  IDEMPOTENCY_CONFLICT: "ERROR_IDEMPOTENCY_CONFLICT",
  RESUBMISSION_STATE_CONFLICT: "ERROR_RESUBMISSION_STATE_CONFLICT",
  SOURCE_ENCODING_INVALID: "ERROR_SOURCE_ENCODING_INVALID",
  LIBRARY_REQUEST_INVALID: "ERROR_LIBRARY_REQUEST_INVALID",
  KNOWLEDGE_NOT_FOUND: "ERROR_KNOWLEDGE_NOT_FOUND",
  REVIEW_INVALID: "ERROR_REVIEW_INVALID",
  TAG_INVALID: "ERROR_TAG_INVALID",
  TAG_TARGET_INVALID: "ERROR_TAG_TARGET_INVALID",
  ASSET_STORAGE_NOT_CONFIGURED: "ERROR_ASSET_STORAGE_NOT_CONFIGURED",
  ASSET_REQUEST_INVALID: "ERROR_ASSET_REQUEST_INVALID",
  ASSET_EMPTY: "ERROR_ASSET_EMPTY",
  ASSET_TOO_LARGE: "ERROR_ASSET_TOO_LARGE",
  ASSET_NAME_INVALID: "ERROR_ASSET_NAME_INVALID",
  ASSET_TYPE_UNSUPPORTED: "ERROR_ASSET_TYPE_UNSUPPORTED",
  ASSET_TYPE_MISMATCH: "ERROR_ASSET_TYPE_MISMATCH",
  ASSET_CAPACITY_LIMIT: "ERROR_ASSET_CAPACITY_LIMIT",
  ASSET_CAPACITY_UNAVAILABLE: "ERROR_ASSET_CAPACITY_UNAVAILABLE",
  ASSET_ORPHAN_REQUEST_INVALID: "ERROR_ASSET_ORPHAN_REQUEST_INVALID",
  ASSET_ORPHAN_STORAGE_UNAVAILABLE: "ERROR_ASSET_ORPHAN_STORAGE_UNAVAILABLE",
  ASSET_CONTENT_INVALID: "ERROR_ASSET_CONTENT_INVALID",
  ASSET_AI_PARSE_FAILED: "ERROR_ASSET_AI_PARSE_FAILED",
  ASSET_PERSISTENCE_UNAVAILABLE: "ERROR_ASSET_PERSISTENCE_UNAVAILABLE",
  ASSET_NOT_FOUND: "ERROR_ASSET_NOT_FOUND",
  ASSET_RESULT_NOT_READY: "ERROR_ASSET_RESULT_NOT_READY",
  ASSET_RESULT_MISSING: "ERROR_ASSET_RESULT_MISSING",
});
const submissionStatusKeys = Object.freeze({
  review_pending: "SUBMISSION_STATUS_REVIEW_PENDING",
  published: "SUBMISSION_STATUS_PUBLISHED",
  rejected: "SUBMISSION_STATUS_REJECTED",
  revision_requested: "SUBMISSION_STATUS_REVISION_REQUESTED",
});
const assetJobStatusKeys = Object.freeze({
  queued: "ASSET_STATUS_QUEUED",
  processing: "ASSET_STATUS_PROCESSING",
  succeeded: "ASSET_STATUS_SUCCEEDED",
  failed_retryable: "ASSET_STATUS_RETRYABLE",
  failed_terminal: "ASSET_STATUS_FAILED",
});
const controllerErrorKeys = Object.freeze({
  REVIEW_TAGS_LOAD_MORE_FAILED: "REVIEW_TAGS_LOAD_MORE_FAILED",
  REVIEW_TAGS_LOAD_FAILED: "REVIEW_TAGS_LOAD_FAILED",
  OPTIONS_LOAD_MORE_FAILED: "OPTIONS_LOAD_MORE_FAILED",
  OPTIONS_LOAD_FAILED: "OPTIONS_LOAD_FAILED",
});
const suggestedActionKeys = Object.freeze({
  KNOWLEDGE_CHAT_REWRITE_QUESTION: "KNOWLEDGE_CHAT_REWRITE_QUESTION",
  KNOWLEDGE_CHAT_EXPAND_SCOPE: "KNOWLEDGE_CHAT_EXPAND_SCOPE",
});
const reviewWarningKeys = Object.freeze({
  REVIEW_WARNING_INERT: "REVIEW_WARNING_INERT",
  REVIEW_WARNING_NO_CHUNK: "REVIEW_WARNING_NO_CHUNK",
  REVIEW_WARNING_PARSER: "REVIEW_WARNING_PARSER",
});
const runtimeErrorKeys = Object.freeze({
  LOGOUT_FAILED: "SHELL_LOGOUT_ERROR",
  MARKDOWN_RENDERER_UNAVAILABLE: "ERROR_MARKDOWN_RENDERER_UNAVAILABLE",
});
function apiError(data) {
  const code = typeof data?.error?.code === "string" ? data.error.code : "";
  if (!code) return t("ERROR_GENERIC");
  return apiErrorKeys[code] ? t(apiErrorKeys[code]) : t("ERROR_UNKNOWN_CODE", { code: displayValue(code, t("ERROR_GENERIC")) });
}

async function api(path, options = {}) {
  const hasExplicitContentType = Object.keys(options.headers || {}).some((name) => name.toLowerCase() === "content-type");
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body && !hasExplicitContentType ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const localizedMessage = apiError(data);
    const error = new Error(String(localizedMessage));
    error.localizedMessage = localizedMessage;
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
  const localizedMessage = apiError(data);
  const error = new Error(String(localizedMessage));
  error.localizedMessage = localizedMessage;
  error.status = response.status;
  throw error;
}

function has(capability) { return session?.capabilities.includes(capability); }
function isAdminRoute(path) { return path === "/admin" || path.startsWith("/admin/"); }
function ownsMutation(owner) { return routeGuard.owns(owner, window.location.pathname); }
function applyDrawerState(state) {
  shell.dataset.drawerOpen = String(state.open);
  drawerToggle.setAttribute("aria-expanded", state.ariaExpanded);
  translationBindings.text(drawerToggle, t(state.open ? "SHELL_CLOSE_NAVIGATION" : "SHELL_OPEN_NAVIGATION"));
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
  for (const item of navigationForSession(session, t)) {
    const group = groups.get(item.group) || [];
    group.push(item);
    groups.set(item.group, group);
  }
  nav.replaceChildren(...[...groups.entries()].map(([group, items]) => element("section", { className: "nav-group" }, [
    element("p", { className: "nav-group-label", text: t(group === "admin" ? "SHELL_GROUP_ADMIN" : "SHELL_GROUP_WORKSPACE") }),
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
  || (href === "/admin/submissions" && pathname.startsWith("/admin/submissions/"))
  || (href === "/admin/assets" && pathname.startsWith("/admin/assets"));
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
    replaceOutlet(page(t("PAGE_FORBIDDEN_TITLE"), t("PAGE_FORBIDDEN_DESCRIPTION"), [empty(t("PAGE_FORBIDDEN_EMPTY"))]), generation);
    return;
  }
  const route = rendererFor(path);
  if (!route) {
    replaceOutlet(page(t("PAGE_NOT_FOUND_TITLE"), t("PAGE_NOT_FOUND_DESCRIPTION"), [element("div", { className: "actions" }, [routeLink(t("PAGE_RETURN_HOME"), "/")])]), generation);
    return;
  }
  try {
    await route.render(generation, route.parameter);
  } catch (error) {
    if (!routeGuard.isCurrent(generation)) return;
    const label = error.status === 403 ? t("PAGE_FORBIDDEN_TITLE") : t("COMMON_PAGE_LOAD_FAILED");
    replaceOutlet(page(label, safeErrorMessage(error, t("COMMON_RETRY_LATER")), [empty(t("PAGE_DATA_UNAVAILABLE"))]), generation);
  }
}

function routeLink(label, href, className = "nav-link") { return element("a", { href, "data-route": "", className, text: label }); }
function list(items, itemRenderer, emptyText) { return items.length ? element("ul", { className: "item-list" }, items.map(itemRenderer)) : empty(emptyText); }
function item(title, meta, extra = []) {
  const safeTitle = typeof title === "string" || typeof title === "number" ? displayValue(title) : t("COMMON_VALUE_UNAVAILABLE");
  const safeMeta = meta === undefined || meta === null ? t("COMMON_VALUE_UNAVAILABLE") : meta;
  return element("li", { className: "item" }, [element("h3", { text: safeTitle }), element("p", { className: "item-meta", text: safeMeta }), ...extra]);
}
function libraryRow(entry) {
  const title = displayValue(entry?.title);
  return element("li", { className: "library-row" }, [
    element("div", { className: "library-row-main" }, [
      element("div", { className: "library-row-title" }, [
        element("h3", { text: title }),
        visibilityBadge(entry?.visibility),
      ]),
      element("p", { className: "item-meta", text: localized(() => `${searchStatusLabel(entry?.searchStatus)} · ${formatDate(entry?.updatedAt)}`) }),
    ]),
    element("div", { className: "library-row-meta" }, [
      element("span", { className: "badge", text: t("COMMON_DOCUMENT") }),
      element("span", { className: "item-meta", text: localized(() => `${t("COMMON_REVISION")} ${displayValue(entry?.revisionId)}`) }),
    ]),
    routeLink(t("LIBRARY_READ_ITEM", { title }), entry?.href || "/knowledge", "route-action secondary-link"),
  ]);
}
function formatDate(value) { return displayDate(value, i18n.locale); }
function visibilityLabel(value) { return t(value === "admin_only" ? "COMMON_VISIBILITY_ADMIN_ONLY" : "COMMON_VISIBILITY_SHARED"); }
function kindLabel(value) {
  return t(value === "code" ? "COMMON_KIND_CODE" : value === "markdown" ? "COMMON_KIND_MARKDOWN" : "COMMON_KIND_TEXT");
}
function submissionStatusLabel(value) {
  return submissionStatusKeys[value] ? t(submissionStatusKeys[value]) : t("COMMON_STATUS_UNKNOWN");
}
function assetJobStatusLabel(value) {
  return assetJobStatusKeys[value] ? t(assetJobStatusKeys[value]) : t("COMMON_STATUS_UNKNOWN");
}
function formatBytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) return t("COMMON_VALUE_UNAVAILABLE");
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}
function searchStatusLabel(value) {
  return t({
    pending: "COMMON_STATUS_PENDING",
    indexed: "COMMON_STATUS_INDEXED",
    search_degraded: "COMMON_STATUS_SEARCH_DEGRADED",
    failed: "COMMON_STATUS_FAILED",
  }[value] || "COMMON_STATUS_PENDING");
}
function memberRoleLabel(value) { return t(value === "admin" ? "COMMON_ROLE_ADMIN" : value === "contributor" ? "COMMON_ROLE_CONTRIBUTOR" : "COMMON_STATUS_UNKNOWN"); }
function activeStatusLabel(value) { return t(value === "active" ? "COMMON_STATUS_ACTIVE" : value === "disabled" ? "COMMON_STATUS_DISABLED" : "COMMON_STATUS_UNKNOWN"); }
function lineLabel(startLine, endLine) {
  return t(startLine === endLine ? "READER_LINE" : "READER_LINES", startLine === endLine
    ? { line: startLine }
    : { start: startLine, end: endLine });
}
function documentLabel(headingPath) {
  const unavailable = t("COMMON_VALUE_UNAVAILABLE");
  return Array.isArray(headingPath) && headingPath.length
    ? headingPath.map((value) => displayValue(value)).filter((value) => value !== unavailable).join(" › ") || t("COMMON_DOCUMENT")
    : t("COMMON_DOCUMENT");
}
function searchLocation(hit) {
  return localized(() => `${documentLabel(hit.headingPath)} · ${lineLabel(hit.startLine, hit.endLine)}`);
}
function matchedFieldLabels(fields) {
  const matchedFieldKeys = {
    title: "COMMON_TITLE",
    summary: "COMMON_SUMMARY",
    tags: "COMMON_TAGS",
    code: "COMMON_CODE",
    body: "COMMON_BODY",
  };
  return fields.map((fieldName) => String(t(matchedFieldKeys[fieldName] || "COMMON_BODY"))).join(", ");
}
function rawChunkLocations(value) {
  const revision = value?.currentRevision?.id ? value.currentRevision : value;
  return Array.isArray(revision?.chunks) ? revision.chunks.map((chunk) => ({
    headingPath: Array.isArray(chunk?.headingPath) ? chunk.headingPath.filter((heading) => typeof heading === "string" && heading) : [],
    startLine: Number.isSafeInteger(chunk?.startLine) && chunk.startLine > 0 ? chunk.startLine : 1,
    endLine: Number.isSafeInteger(chunk?.endLine) && chunk.endLine > 0 ? chunk.endLine : 1,
  })) : [];
}
function visibilityBadge(value, label = visibilityLabel(value)) {
  return element("span", { className: `badge visibility-${value === "admin_only" ? "admin" : "shared"}`, text: label });
}
function safeErrorMessage(error, fallback = t("COMMON_OPERATION_FAILED")) {
  if (error?.localizedMessage) return error.localizedMessage;
  if (error instanceof Error && runtimeErrorKeys[error.message]) return t(runtimeErrorKeys[error.message]);
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
  translationBindings.text(button, pending ? pendingLabel : readyLabel);
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
  const cancel = element("button", { className: "secondary", type: "button", text: t("COMMON_CANCEL") });
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
  const metrics = dashboardMetricsModel(submissions.items);
  const metric = (label, value, tone = "") => element("div", { className: `metric ${tone}` }, [
    element("dt", { text: label }),
    element("dd", { text: String(value) }),
  ]);
  if (replaceOutlet(page(t("HOME_TITLE"), t("HOME_DESCRIPTION"), [
    element("section", { className: "dashboard-hero" }, [
      element("div", { className: "dashboard-hero-copy" }, [
        element("p", { className: "eyebrow", text: t("HOME_OVERVIEW_LABEL") }),
        element("h2", { text: t("HOME_QUICK_START") }),
        element("p", { className: "muted", text: t("HOME_OVERVIEW_BODY") }),
      ]),
      element("div", { className: "actions" }, [
        routeLink(t("HOME_START_SUBMISSION"), "/submit", "route-action primary-link"),
        routeLink(t("SEARCH_ACTION"), "/search", "route-action secondary-link"),
        routeLink(t("HOME_ASK_AGENT"), "/agent", "route-action secondary-link"),
      ]),
    ]),
    element("dl", { className: "metric-strip" }, [
      metric(t("HOME_TOTAL_SUBMISSIONS"), metrics.total),
      metric(t("HOME_PENDING_SUBMISSIONS"), metrics.pending, "metric-warning"),
      metric(t("HOME_PUBLISHED_SUBMISSIONS"), metrics.published, "metric-success"),
      metric(t("HOME_NEEDS_REVISION"), metrics.needsRevision, "metric-danger"),
    ]),
    element("div", { className: "page-grid" }, [
      card(t("HOME_RECENT_SUBMISSIONS"), [list(submissions.items, (submission) => item(submission.title, localized(() => `${kindLabel(submission.kind)} · ${submissionStatusLabel(submission.status)} · ${formatDate(submission.createdAt)}`)), t("HOME_NO_SUBMISSIONS"))]),
      card(t("HOME_QUICK_START"), [
        element("p", { text: t("HOME_QUICK_START_BODY") }),
        element("div", { className: "workflow-list" }, [
          element("div", { className: "workflow-step" }, [element("span", { className: "workflow-index", text: "01" }), element("span", { text: t("HOME_START_SUBMISSION") })]),
          element("div", { className: "workflow-step" }, [element("span", { className: "workflow-index", text: "02" }), element("span", { text: t("NAV_REVIEW_QUEUE") })]),
          element("div", { className: "workflow-step" }, [element("span", { className: "workflow-index", text: "03" }), element("span", { text: t("NAV_LIBRARY") })]),
        ]),
        routeLink(t("HOME_VIEW_ALL_SUBMISSIONS"), "/my-submissions", "route-action secondary-link"),
      ]),
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
      const options = state.items.map((item) => element("option", { value: displayValue(item.id), text: displayValue(item.name) }));
      select.replaceChildren(...(emptyLabel === undefined ? [] : [element("option", { value: "", text: emptyLabel })]), ...options);
      if ([...select.options].some((option) => option.value === selected)) select.value = selected;
      select.disabled = state.pending && !state.loaded;
      const moreModel = () => optionLoadMoreModel(state, String(label));
      translationBindings.text(more, localized(() => moreModel().label));
      translationBindings.attribute(more, "aria-label", localized(() => moreModel().accessibleName));
      translationBindings.effect(more, "option-page", () => {
        const model = moreModel();
        more.hidden = !model.visible;
        more.disabled = model.disabled;
      });
      translationBindings.text(status, state.errorKey
        ? t(controllerErrorKeys[state.errorKey], { resource: String(label) })
        : "");
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
    label: t("COMMON_SPACES"),
    fieldLabel: t("SUBMIT_TARGET_SPACE"),
    required: true,
    onState: (state) => { if (submitButton) submitButton.disabled = state.items.length === 0; },
  });
  await spaceControl.controller.loadInitial();
  const title = element("input", { name: "title", required: "", maxlength: "200", autocomplete: "off" });
  const kind = element("select", { name: "kind" }, ["text", "markdown", "code"].map((value) => element("option", { value, text: value })));
  const requestedVisibility = element("select", { name: "visibility" }, [
    element("option", { value: "shared", text: t("COMMON_VISIBILITY_SHARED") }),
    element("option", { value: "admin_only", text: t("COMMON_VISIBILITY_ADMIN_ONLY") }),
  ]);
  const space = spaceControl.select;
  space.name = "space";
  const collectionSlot = element("div", { className: "stack" });
  let collection = element("select", { name: "collection", disabled: "" }, [element("option", { value: "", text: t("COMMON_NO_COLLECTION") })]);
  collectionSlot.replaceChildren(field(t("SUBMIT_COLLECTION_OPTIONAL"), collection));
  const language = element("select", { name: "language" }, ["", "bash", "css", "go", "html", "javascript", "json", "markdown", "python", "rust", "sql", "typescript", "yaml"].map((value) => element("option", { value, text: value || t("COMMON_PLAIN_AUTO") })));
  const content = element("textarea", { name: "content", required: "", maxlength: String(128 * 1024), placeholder: t("SUBMIT_CONTENT_PLACEHOLDER") });
  submitButton = element("button", { className: "primary", type: "submit", text: t("SUBMIT_ACTION"), disabled: spaceControl.controller.snapshot().items.length ? undefined : "" });
  const requestKey = idempotencyKey();
  let form;
  const mutation = createMutationController(
    () => ownsMutation(owner),
    (pending) => setPending(submitButton, pending, t("SUBMIT_PENDING"), t("SUBMIT_ACTION")),
  );
  form = element("form", { className: "stack submission-form", onsubmit: (event) => {
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
          validationSummary(form, localized(() => submissionResultModel(result).message));
          return;
        }
        navigate("/my-submissions", true, localized(() => submissionResultModel(result).message));
      },
      (error) => validationSummary(form, safeErrorMessage(error)),
    );
  } }, [
    field(t("COMMON_TITLE"), title), field(t("COMMON_CONTENT_TYPE"), kind), field(t("COMMON_REQUESTED_VISIBILITY"), requestedVisibility), spaceControl.root, collectionSlot,
    field(t("COMMON_CODE_LANGUAGE_OPTIONAL"), language), field(t("COMMON_CONTENT"), content), submitButton,
  ]);
  let collectionGeneration = 0;
  const updateCollections = async () => {
    collectionGeneration += 1;
    const fixedGeneration = collectionGeneration;
    collection = element("select", { name: "collection", disabled: "" }, [element("option", { value: "", text: t("COMMON_NO_COLLECTION") })]);
    collectionSlot.replaceChildren(field(t("SUBMIT_COLLECTION_OPTIONAL"), collection));
    if (!space.value) return;
    const control = createPagedOptionControl({
      resource: "collections",
      spaceId: space.value,
      owner,
      owns: () => fixedGeneration === collectionGeneration,
      label: t("COMMON_COLLECTIONS"),
      fieldLabel: t("SUBMIT_COLLECTION_OPTIONAL"),
      emptyLabel: t("COMMON_NO_COLLECTION"),
    });
    collection = control.select;
    collection.name = "collection";
    collectionSlot.replaceChildren(control.root);
    await control.controller.loadInitial();
  };
  space.addEventListener("change", () => { void updateCollections(); });
  if (spaceControl.controller.snapshot().items.length) await updateCollections();
  const spaceState = spaceControl.controller.snapshot();
  const assetInput = element("input", {
    type: "file",
    name: "asset",
    ...(BINARY_ASSETS_ENABLED ? {} : { disabled: "" }),
    accept: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.json,.xml,.rtf,.png,.jpg,.jpeg,.gif,.webp",
  });
  const assetButton = element("button", {
    className: "secondary",
    type: "button",
    text: t("SUBMIT_ASSET_UPLOAD"),
    ...(BINARY_ASSETS_ENABLED ? {} : { disabled: "" }),
  });
  const processButton = element("button", { className: "primary", type: "button", text: t("SUBMIT_ASSET_PROCESS"), hidden: "" });
  const assetStatus = element("p", { className: "muted", role: "status", "aria-live": "polite" });
  const assetDownloads = element("div", { className: "actions", "aria-live": "polite" });
  const assetPanel = element("div", { className: "asset-upload-panel" }, [
    element("p", { className: "muted", text: t(BINARY_ASSETS_ENABLED ? "SUBMIT_ASSET_HELP" : "SUBMIT_ASSET_FREE_TIER_HELP") }),
    field(t("SUBMIT_ASSET_FILE"), assetInput),
    assetButton,
    processButton,
    assetStatus,
    assetDownloads,
  ]);
  const assetRequestKey = idempotencyKey();
  let uploadedAssetId = "";
  const updateAssetDownloads = (outcome) => {
    assetDownloads.replaceChildren();
    if (!outcome?.originalHref) return;
    assetDownloads.append(element("a", {
      className: "download-link",
      href: outcome.originalHref,
      download: "",
      text: t("SUBMIT_ASSET_DOWNLOAD_ORIGINAL"),
    }));
    if (outcome.parsedHref) {
      assetDownloads.append(element("a", {
        className: "download-link",
        href: outcome.parsedHref,
        download: "",
        text: t("SUBMIT_ASSET_DOWNLOAD_PARSED"),
      }));
    }
  };
  assetButton.addEventListener("click", () => {
    const file = assetInput.files?.[0];
    if (!file) {
      translationBindings.text(assetStatus, t("SUBMIT_ASSET_SELECT_FILE"));
      return;
    }
    const request = assetUploadRequest(file, assetRequestKey);
    setPending(assetButton, true, t("SUBMIT_ASSET_UPLOAD_PENDING"), t("SUBMIT_ASSET_UPLOAD"));
    translationBindings.text(assetStatus, "");
    void api(request.path, request.init).then((result) => {
      const outcome = assetUploadResultModel(result);
      translationBindings.text(assetStatus, outcome.message);
      assetStatus.dataset.state = outcome.kind;
      uploadedAssetId = outcome.assetId || "";
      updateAssetDownloads(outcome);
      processButton.hidden = !uploadedAssetId || outcome.kind === "error";
    }).catch((error) => {
      translationBindings.text(assetStatus, safeErrorMessage(error, t("SUBMIT_ASSET_UPLOAD_ERROR")));
      assetStatus.dataset.state = "error";
    }).finally(() => {
      setPending(assetButton, false, t("SUBMIT_ASSET_UPLOAD_PENDING"), t("SUBMIT_ASSET_UPLOAD"));
    });
  });
  processButton.addEventListener("click", () => {
    if (!uploadedAssetId) return;
    const request = assetProcessRequest(uploadedAssetId);
    setPending(processButton, true, t("SUBMIT_ASSET_PROCESS_PENDING"), t("SUBMIT_ASSET_PROCESS"));
    void api(request.path, request.init).then((result) => {
      const outcome = assetUploadResultModel(result);
      translationBindings.text(assetStatus, outcome.message);
      assetStatus.dataset.state = outcome.kind;
      updateAssetDownloads(outcome);
    }).catch((error) => {
      translationBindings.text(assetStatus, safeErrorMessage(error, t("SUBMIT_ASSET_UPLOAD_ERROR")));
      assetStatus.dataset.state = "error";
    }).finally(() => {
      setPending(processButton, false, t("SUBMIT_ASSET_PROCESS_PENDING"), t("SUBMIT_ASSET_PROCESS"));
    });
  });
  replaceOutlet(page(t("SUBMIT_TITLE"), t("SUBMIT_DESCRIPTION"), [
    card(t("SUBMIT_NEW"), [spaceState.items.length || spaceState.nextCursor ? form : empty(t("SUBMIT_NO_SPACE"))]),
    card(t("SUBMIT_ASSET_TITLE"), [assetPanel]),
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
    const rows = items.length
      ? element("ul", { className: "library-list" }, items.map(libraryRow))
      : empty(t("LIBRARY_EMPTY"));
    const more = cursor ? element("button", { className: "secondary", type: "button", text: t("COMMON_LOAD_MORE"), onclick: () => {
      more.disabled = true;
      void runLatestOperation(operations, () => api(knowledgeQuery("/api/knowledge", { limit: 20, cursor })), (data) => {
        if (!ownsMutation(owner)) return;
        const next = knowledgeListModel(data);
        items = appendPage(items, next.items, (entry) => entry.id);
        cursor = next.nextCursor;
        renderItems();
      }, (error) => { if (ownsMutation(owner)) region.replaceChildren(rows, routeStateNode("error", safeErrorMessage(error))); }, () => ownsMutation(owner));
    } }) : undefined;
    region.replaceChildren(...compactChildren(rows, more));
  };
  renderItems();
  replaceOutlet(page(t("LIBRARY_TITLE"), t("LIBRARY_DESCRIPTION"), [card(t("LIBRARY_PUBLISHED"), [region])]), generation);
}

async function renderSearch(generation) {
  const owner = routeGuard.owner(generation, "/search");
  const spaceControl = createPagedOptionControl({ resource: "spaces", owner, label: t("COMMON_SPACES"), fieldLabel: t("COMMON_SPACE"), emptyLabel: t("SEARCH_ALL_SPACES") });
  await spaceControl.controller.loadInitial();
  const query = element("input", { type: "search", required: "", maxlength: "200", placeholder: t("SEARCH_PLACEHOLDER"), "aria-label": t("SEARCH_ARIA_QUERY") });
  const space = spaceControl.select;
  let collection = element("select", { disabled: "" }, [element("option", { value: "", text: t("SEARCH_ALL_COLLECTIONS") })]);
  let tag = element("select", { disabled: "", multiple: "", size: "4" }, [element("option", { value: "", text: t("SEARCH_ALL_TAGS") })]);
  const tagMode = element("select", {}, [
    element("option", { value: "and", text: t("SEARCH_MATCH_ALL_TAGS") }),
    element("option", { value: "or", text: t("SEARCH_MATCH_ANY_TAG") }),
  ]);
  const collectionSlot = element("div", { className: "stack" }, [field(t("COMMON_COLLECTION"), collection)]);
  const tagSlot = element("div", { className: "stack" }, [field(t("COMMON_TAG"), tag)]);
  const results = element("div", { className: "stack", "aria-live": "polite" });
  const operations = createOperationGuard();
  let currentItems = [];
  let currentCursor;
  let currentFilters;
  const renderResults = (model) => {
    const nodes = [];
    if (model.degraded) nodes.push(routeStateNode("degraded", t("SEARCH_DEGRADED")));
    nodes.push(list(currentItems, (hit) => item(hit.title, searchLocation(hit), [
      element("p", { className: "item-meta", text: t("COMMON_MATCHED_FIELDS", () => ({ fields: matchedFieldLabels(hit.matchedFields) })) }),
      element("p", { className: "excerpt" }, hit.highlightSegments.map((segment) => (
        segment.highlighted ? element("mark", { text: segment.text }) : segment.text
      ))),
      routeLink(t("SEARCH_OPEN_CITATION", () => ({ title: displayValue(hit.title), location: String(searchLocation(hit)) })), hit.citationHref),
    ]), t("SEARCH_EMPTY")));
    if (currentCursor) nodes.push(element("button", { className: "secondary", type: "button", text: t("COMMON_LOAD_MORE_RESULTS"), onclick: () => { void search(currentCursor, true); } }));
    results.replaceChildren(...nodes);
  };
  const search = async (cursor, append = false) => {
    results.replaceChildren(routeStateNode("loading", t(append ? "COMMON_LOADING_MORE_RESULTS" : "COMMON_SEARCHING")));
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
    currentFilters = {
      q: query.value,
      spaceId: space.value,
      collectionId: collection.value,
      tagIds: [...tag.selectedOptions].map((option) => option.value).filter(Boolean).slice(0, 8),
      tagMode: tagMode.value,
    };
    currentItems = [];
    currentCursor = undefined;
    void search(undefined, false);
  } }, [field(t("COMMON_QUERY"), query), spaceControl.root, collectionSlot, tagSlot, field(t("SEARCH_TAG_MODE"), tagMode), element("button", { className: "primary", type: "submit", text: t("SEARCH_ACTION") })]);
  let filterGeneration = 0;
  const updateDependentFilters = async () => {
    filterGeneration += 1;
    const fixedGeneration = filterGeneration;
    collection = element("select", { disabled: "" }, [element("option", { value: "", text: t("SEARCH_ALL_COLLECTIONS") })]);
    tag = element("select", { disabled: "", multiple: "", size: "4" }, [element("option", { value: "", text: t("SEARCH_ALL_TAGS") })]);
    collectionSlot.replaceChildren(field(t("COMMON_COLLECTION"), collection));
    tagSlot.replaceChildren(field(t("COMMON_TAG"), tag));
    if (!space.value) return;
    const ownsFilter = () => fixedGeneration === filterGeneration;
    const collectionControl = createPagedOptionControl({
      resource: "collections", spaceId: space.value, owner, owns: ownsFilter, label: t("COMMON_COLLECTIONS"), fieldLabel: t("COMMON_COLLECTION"), emptyLabel: t("SEARCH_ALL_COLLECTIONS"),
    });
    const tagControl = createPagedOptionControl({
      resource: "tags", spaceId: space.value, owner, owns: ownsFilter, label: t("COMMON_TAGS"), fieldLabel: t("COMMON_TAG"), emptyLabel: t("SEARCH_ALL_TAGS"),
    });
    collection = collectionControl.select;
    tag = tagControl.select;
    tag.multiple = true;
    tag.size = 4;
    collectionSlot.replaceChildren(collectionControl.root);
    tagSlot.replaceChildren(tagControl.root);
    await Promise.all([collectionControl.controller.loadInitial(), tagControl.controller.loadInitial()]);
  };
  space.addEventListener("change", () => { void updateDependentFilters(); });
  replaceOutlet(page(t("SEARCH_TITLE"), t("SEARCH_DESCRIPTION"), [card(t("SEARCH_FILTERS"), [form], "card search-panel"), card(t("SEARCH_RESULTS"), [results], "card search-results-panel")]), generation);
}

async function renderAgent(generation) {
  const owner = routeGuard.owner(generation, "/agent");
  const scopeModel = chatScopeControlsModel({ kind: "all" });
  const question = element("textarea", { required: "", maxlength: "200", placeholder: t("AGENT_QUESTION_PLACEHOLDER") });
  const answer = element("div", { className: "stack", "aria-live": "polite" });
  const submitButton = element("button", { className: "primary", type: "submit", text: t("AGENT_ACTION") });
  const scopeKindLabels = Object.freeze({
    all: t("KNOWLEDGE_CHAT_SCOPE_ALL"),
    space: t("KNOWLEDGE_CHAT_SCOPE_SPACE"),
    collection: t("KNOWLEDGE_CHAT_SCOPE_COLLECTION"),
    items: t("KNOWLEDGE_CHAT_SCOPE_ITEMS"),
  });
  const scopeOptions = scopeModel.options.map((option, index) => {
    const input = element("input", {
      type: "radio",
      name: "chat-scope-kind",
      value: option.kind,
      checked: index === 0 ? "" : undefined,
      "data-i18n-key": option.labelKey,
    });
    return { ...option, input };
  });
  const scopeKinds = element("fieldset", { className: "scope-selector" }, [
    element("legend", { text: t("KNOWLEDGE_CHAT_SCOPE_LEGEND"), "data-i18n-key": "KNOWLEDGE_CHAT_SCOPE_LEGEND" }),
    ...scopeOptions.map((option) => element("label", { className: "check-option", text: scopeKindLabels[option.kind] }, [option.input])),
  ]);
  const spaceControl = createPagedOptionControl({
    resource: "spaces",
    owner,
    label: t("COMMON_SPACES"),
    fieldLabel: t("KNOWLEDGE_CHAT_SCOPE_SPACE_FIELD"),
    emptyLabel: t("KNOWLEDGE_CHAT_SCOPE_SPACE_SELECT"),
  });
  await spaceControl.controller.loadInitial();
  let collection = element("select", { disabled: "", "aria-label": t("KNOWLEDGE_CHAT_SCOPE_COLLECTION_FIELD") }, [
    element("option", { value: "", text: t("KNOWLEDGE_CHAT_SCOPE_COLLECTION_SELECT") }),
  ]);
  const collectionSlot = element("div", { className: "stack" }, [field(t("KNOWLEDGE_CHAT_SCOPE_COLLECTION_FIELD"), collection)]);
  let collectionGeneration = 0;
  const loadCollections = async () => {
    collectionGeneration += 1;
    const fixedGeneration = collectionGeneration;
    collection = element("select", { disabled: "", "aria-label": t("KNOWLEDGE_CHAT_SCOPE_COLLECTION_FIELD") }, [
      element("option", { value: "", text: t("KNOWLEDGE_CHAT_SCOPE_COLLECTION_SELECT") }),
    ]);
    collection.addEventListener("change", updateScopeState);
    collectionSlot.replaceChildren(field(t("KNOWLEDGE_CHAT_SCOPE_COLLECTION_FIELD"), collection));
    if (!spaceControl.select.value) return;
    const control = createPagedOptionControl({
      resource: "collections",
      spaceId: spaceControl.select.value,
      owner,
      owns: () => fixedGeneration === collectionGeneration,
      label: t("COMMON_COLLECTIONS"),
      fieldLabel: t("KNOWLEDGE_CHAT_SCOPE_COLLECTION_FIELD"),
      emptyLabel: t("KNOWLEDGE_CHAT_SCOPE_COLLECTION_SELECT"),
    });
    collection = control.select;
    collection.addEventListener("change", updateScopeState);
    collectionSlot.replaceChildren(control.root);
    await control.controller.loadInitial();
    updateScopeState();
  };
  const itemSelect = element("select", {
    multiple: "",
    size: "8",
    "aria-label": t("KNOWLEDGE_CHAT_SCOPE_ITEMS_ARIA"),
    "aria-describedby": "chat-item-selection-help",
  });
  const itemHelp = element("p", {
    id: "chat-item-selection-help",
    className: "muted",
    text: t("KNOWLEDGE_CHAT_SCOPE_ITEMS_HELP"),
    "data-i18n-key": "KNOWLEDGE_CHAT_SCOPE_ITEMS_HELP",
  });
  const itemStatus = element("p", { className: "muted", role: "status", "aria-live": "polite" });
  const itemMore = element("button", { className: "secondary", type: "button", text: t("KNOWLEDGE_CHAT_SCOPE_ITEMS_LOAD_MORE") });
  const itemSlot = element("div", { className: "stack" }, [field(t("KNOWLEDGE_CHAT_SCOPE_ITEMS_FIELD"), itemSelect), itemHelp, itemMore, itemStatus]);
  let itemCursor;
  let loadedItems = [];
  let loadingItems = false;
  const renderItemOptions = () => {
    const selected = new Set([...itemSelect.selectedOptions].map((option) => option.value));
    itemSelect.replaceChildren(...loadedItems.map((item) => element("option", {
      value: item.id,
      text: localized(() => `${displayValue(item.title)} · ${visibilityLabel(item.visibility)}`),
      selected: selected.has(item.id) ? "" : undefined,
    })));
    itemMore.hidden = !itemCursor;
    itemMore.disabled = loadingItems;
  };
  const itemController = createChatItemPageController({
    owns: () => ownsMutation(owner),
    request: api,
    onChange(state) {
      if (!ownsMutation(owner)) return;
      loadedItems = state.items;
      itemCursor = state.nextCursor;
      loadingItems = state.pending;
      translationBindings.text(itemStatus, state.errorKey
        ? t(controllerErrorKeys[state.errorKey], { resource: t("KNOWLEDGE_CHAT_SCOPE_ITEMS_FIELD") })
        : "");
      renderItemOptions();
      updateScopeState();
    },
  });
  itemMore.addEventListener("click", () => { void itemController.loadMore(); });
  itemSelect.addEventListener("change", () => {
    const selected = [...itemSelect.selectedOptions];
    if (selected.length > scopeModel.maxSelectedItems) {
      selected.slice(scopeModel.maxSelectedItems).forEach((option) => { option.selected = false; });
      translationBindings.text(itemStatus, t("KNOWLEDGE_CHAT_SCOPE_ITEMS_MAX"));
      itemStatus.dataset.i18nKey = "KNOWLEDGE_CHAT_SCOPE_ITEMS_MAX";
    } else {
      translationBindings.text(itemStatus, t("KNOWLEDGE_CHAT_SCOPE_ITEMS_COUNT", {
        selected: selected.length,
        maximum: scopeModel.maxSelectedItems,
      }));
      itemStatus.dataset.i18nKey = "KNOWLEDGE_CHAT_SCOPE_ITEMS_COUNT";
    }
    updateScopeState();
  });
  const scopeSummary = element("p", {
    className: "muted",
    role: "status",
    "aria-live": "polite",
    "data-i18n-key": "KNOWLEDGE_CHAT_SCOPE_CURRENT",
  });
  let pending = false;
  const selectedScopeKind = () => scopeOptions.find((option) => option.input.checked)?.kind || "all";
  const requestedScope = () => {
    const kind = selectedScopeKind();
    if (kind === "all") return { kind: "all" };
    if (kind === "space" && spaceControl.select.value) {
      return { kind: "space", spaceId: spaceControl.select.value };
    }
    if (kind === "collection" && collection.value) {
      return { kind: "collection", collectionId: collection.value };
    }
    const knowledgeItemIds = [...itemSelect.selectedOptions].map((option) => option.value);
    return kind === "items" && knowledgeItemIds.length >= 1 && knowledgeItemIds.length <= 8
      ? { kind: "items", knowledgeItemIds }
      : null;
  };
  const scopeSummaryText = localized(() => {
    const kind = selectedScopeKind();
    return chatScopeSummaryModel(String(scopeKindLabels[kind]), Boolean(requestedScope()));
  });
  function updateScopeState() {
    const kind = selectedScopeKind();
    spaceControl.select.disabled = pending || (kind !== "space" && kind !== "collection");
    collection.disabled = pending || kind !== "collection" || !spaceControl.select.value;
    itemSelect.disabled = pending || kind !== "items";
    itemMore.disabled = pending || loadingItems;
    for (const option of scopeOptions) option.input.disabled = pending;
    translationBindings.text(scopeSummary, scopeSummaryText);
  }
  translationBindings.effect(scopeSummary, "scope-summary", updateScopeState);
  for (const option of scopeOptions) option.input.addEventListener("change", () => {
    updateScopeState();
    if (option.kind === "items" && !itemController.snapshot().loaded) {
      void itemController.loadInitial();
    }
    if (option.kind === "collection" && spaceControl.select.value) void loadCollections();
  });
  spaceControl.select.addEventListener("change", () => {
    if (selectedScopeKind() === "collection") void loadCollections();
    updateScopeState();
  });
  const mutation = createMutationController(
    () => ownsMutation(owner),
    (value) => {
      pending = value;
      question.disabled = value;
      setPending(submitButton, value, t("AGENT_PENDING"), t("AGENT_ACTION"));
      updateScopeState();
    },
  );
  const form = element("form", { className: "stack", onsubmit: (event) => {
    event.preventDefault();
    const scope = requestedScope();
    if (!scope) {
      answer.replaceChildren(routeStateNode("error", t("KNOWLEDGE_CHAT_SCOPE_INVALID")));
      return;
    }
    const request = chatRequest({ question: question.value, scope });
    void mutation.run(() => {
      answer.replaceChildren(routeStateNode("loading", t("KNOWLEDGE_CHAT_READING")));
      return api(request.path, request.init);
    }, (data) => {
      const model = citedAnswerModel(data);
      answer.replaceChildren(
        element("p", {
          className: "item-meta",
          text: t("KNOWLEDGE_CHAT_EVIDENCE_CONFIDENCE", { percent: Math.round(model.evidenceConfidence * 100) }),
          "data-i18n-key": "KNOWLEDGE_CHAT_EVIDENCE_CONFIDENCE",
        }),
        element("p", { className: "answer-text", text: model.answer }),
        ...(model.messageKey ? [element("div", {
          className: "notice",
          "data-kind": "degraded",
          "data-i18n-key": model.messageKey,
        }, [
          element("p", { text: t("KNOWLEDGE_CHAT_TRY_AGAIN") }),
          element("ul", {}, model.suggestedActionKeys.map((key) => element("li", {
            text: t(suggestedActionKeys[key]),
            "data-i18n-key": key,
          }))),
        ])] : []),
        element("h3", { text: t("KNOWLEDGE_CHAT_CITATIONS") }),
        list(model.sources, (source) => item(`[${source.number}] ${displayValue(source.title)}`, searchLocation(source), [
          element("p", { className: "item-meta", text: t("COMMON_MATCHED_FIELDS", () => ({ fields: matchedFieldLabels(source.matchedFields) })) }),
          element("p", { className: "excerpt" }, source.highlightSegments.map((segment) => (
            segment.highlighted ? element("mark", { text: segment.text }) : segment.text
          ))),
          element("a", { href: source.href, "data-route": "", className: "nav-link", "aria-label": t("READER_OPEN_CITATION_ARIA", () => ({
            number: source.number,
          title: displayValue(source.title),
            location: `${documentLabel(source.headingPath)}, ${lineLabel(source.startLine, source.endLine)}`,
          })), text: t("KNOWLEDGE_CHAT_OPEN_SOURCE") }),
        ]), t("KNOWLEDGE_CHAT_NO_CITATIONS")),
      );
    }, (error) => answer.replaceChildren(routeStateNode(error?.status === 403 ? "forbidden" : "error", safeErrorMessage(error))));
  } }, [
    field(t("AGENT_QUESTION"), question),
    scopeKinds,
    spaceControl.root,
    collectionSlot,
    itemSlot,
    scopeSummary,
    submitButton,
  ]);
  updateScopeState();
  replaceOutlet(page(t("AGENT_TITLE"), t("AGENT_DESCRIPTION"), [card(t("AGENT_GROUNDED_QUESTION"), [form, answer], "card agent-panel")]), generation);
}

async function renderMySubmissions(generation) {
  const owner = routeGuard.owner(generation, "/my-submissions");
  const requestedStatus = new URL(window.location.href).searchParams.get("status");
  let status = ["review_pending", "published", "rejected", "revision_requested"].includes(requestedStatus) ? requestedStatus : "";
  let data = await api(mySubmissionsPath(status));
  const assetHistory = assetListModel(await api("/api/assets?limit=20").catch(() => ({ items: [] })));
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
        const button = element("button", { className: "primary", type: "submit", text: t("MY_SUBMISSIONS_REVISE") });
        const key = idempotencyKey();
        let form;
        const mutation = createMutationController(
          () => ownsMutation(owner),
          (pending) => setPending(button, pending, t("MY_SUBMISSIONS_RESUBMITTING"), t("MY_SUBMISSIONS_REVISE")),
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
            () => navigate("/my-submissions", true, t("MY_SUBMISSIONS_RESUBMITTED")),
            (error) => validationSummary(form, safeErrorMessage(error)),
          );
        } }, [field(t("MY_SUBMISSIONS_REVISED_TITLE"), revisedTitle), field(t("MY_SUBMISSIONS_REVISED_CONTENT"), revisedContent), button]);
        children.push(form);
      }
      return item(
        submission.title,
        localized(() => `${kindLabel(submission.kind)} · ${submissionStatusLabel(submission.status)} · ${formatDate(submission.createdAt)}`),
        children,
      );
    }, t("MY_SUBMISSIONS_EMPTY"));
    const more = cursor ? element("button", { className: "secondary", type: "button", text: t("COMMON_LOAD_MORE"), onclick: () => {
      more.disabled = true;
      void runLatestOperation(operations, () => api(mySubmissionsPath(status, cursor)), (next) => {
        if (!ownsMutation(owner)) return;
        items = appendPage(items, next.items, (submission) => submission.id);
        cursor = next.nextCursor;
        renderItems();
      }, (error) => { if (ownsMutation(owner)) region.replaceChildren(rows, routeStateNode("error", safeErrorMessage(error))); }, () => ownsMutation(owner));
    } }) : undefined;
    region.replaceChildren(...compactChildren(rows, more));
  };
  const statusFilter = element("select", { "aria-label": t("MY_SUBMISSIONS_FILTER_LABEL") }, [
    element("option", { value: "", text: t("MY_SUBMISSIONS_FILTER_ALL") }),
    ...["review_pending", "published", "rejected", "revision_requested"].map((value) => element("option", {
      value,
      text: submissionStatusLabel(value),
    })),
  ]);
  statusFilter.value = status;
  statusFilter.addEventListener("change", () => {
    status = statusFilter.value;
    const next = new URL(window.location.href);
    if (status) next.searchParams.set("status", status);
    else next.searchParams.delete("status");
    history.replaceState({}, "", `${next.pathname}${next.search}`);
    cursor = undefined;
    items = [];
    region.replaceChildren(routeStateNode("loading", t("SHELL_LOADING_BODY")));
    void runLatestOperation(operations, () => api(mySubmissionsPath(status)), (nextPage) => {
      if (!ownsMutation(owner)) return;
      items = nextPage.items;
      cursor = nextPage.nextCursor;
      renderItems();
    }, (error) => {
      if (ownsMutation(owner)) region.replaceChildren(routeStateNode("error", safeErrorMessage(error)));
    }, () => ownsMutation(owner));
  });
  renderItems();
  const assetRows = list(assetHistory.items, (asset) => item(
    asset.originalName,
    localized(() => [assetJobStatusLabel(asset.jobStatus), asset.failureMessage, formatBytes(asset.byteSize), formatDate(asset.createdAt)]
      .filter(Boolean).join(" · ")),
    compactChildren(
      element("div", { className: "actions" }, [
        element("a", { href: asset.originalHref, className: "download-link", download: "", text: t("SUBMIT_ASSET_DOWNLOAD_ORIGINAL") }),
        asset.parsedHref
          ? element("a", { href: asset.parsedHref, className: "download-link", download: "", text: t("SUBMIT_ASSET_DOWNLOAD_PARSED") })
          : undefined,
      ]),
    ),
  ), t("MY_ASSETS_EMPTY"));
  replaceOutlet(page(t("MY_SUBMISSIONS_TITLE"), t("MY_SUBMISSIONS_DESCRIPTION"), [card(t("MY_SUBMISSIONS_HISTORY"), [
    field(t("MY_SUBMISSIONS_FILTER_LABEL"), statusFilter),
    region,
  ]), card(t("MY_ASSETS_TITLE"), [
    element("p", { className: "muted", text: t("MY_ASSETS_DESCRIPTION") }),
    assetRows,
  ])]), generation);
}

function mySubmissionsPath(status, cursor) {
  const query = new URLSearchParams({ limit: "20" });
  if (status) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  return `/api/submissions/mine?${query.toString()}`;
}

async function renderKnowledgeReader(generation, knowledgeItemId) {
  const url = new URL(window.location.href);
  for (const key of url.searchParams.keys()) {
    if (!["revision", "chunk"].includes(key) || url.searchParams.getAll(key).length !== 1) {
      replaceOutlet(page(t("READER_INVALID_TITLE"), t("READER_INVALID_DESCRIPTION"), [routeStateNode("error", t("READER_INVALID_URL"))]), generation);
      return;
    }
  }
  const requestedRevision = url.searchParams.get("revision") || "";
  const requestedChunk = url.searchParams.get("chunk") || "";
  const request = knowledgeReaderRequest(knowledgeItemId, requestedRevision);
  const response = await api(request.path);
  const readerValue = response[request.responseKey];
  const model = knowledgeReaderModel(readerValue, { revision: requestedRevision, chunk: requestedChunk });
  const readerLocations = rawChunkLocations(readerValue);
  const outline = element("nav", { className: "reader-outline", "aria-label": t("READER_OUTLINE_ARIA") }, [
    element("h2", { text: t("READER_OUTLINE") }),
    list(model.outline, (entry, index) => element("li", { className: "item" }, [
      element("a", {
        href: entry.href,
        "data-route": "",
        "aria-current": entry.focused ? "location" : undefined,
        text: localized(() => {
          const location = readerLocations[index] || { headingPath: [], startLine: 1, endLine: 1 };
          return `${documentLabel(location.headingPath)} · ${lineLabel(location.startLine, location.endLine)}`;
        }),
      }),
    ]), t("READER_NO_HEADINGS")),
  ]);
  const markdownBody = element("div", { className: "markdown-body" });
  markdownBody.append(renderSafeMarkdown(model.markdown));
  const metadata = element("dl", { className: "reader-metadata", "aria-label": t("READER_METADATA_ARIA") }, [
    element("dt", { text: t("READER_REVISION_ID") }), element("dd", { text: model.revisionId }),
    element("dt", { text: t("READER_SOURCE_VERSION_ID") }), element("dd", { text: model.sourceVersionId || t("COMMON_LEGACY_UNAVAILABLE") }),
    element("dt", { text: t("READER_REVIEWER_ID") }), element("dd", { text: model.reviewerId || t("COMMON_LEGACY_UNAVAILABLE") }),
    element("dt", { text: t("READER_SOURCE_VERSION_ORDINAL") }), element("dd", { text: model.sourceVersionOrdinal === null ? t("COMMON_LEGACY_UNAVAILABLE") : displayValue(model.sourceVersionOrdinal) }),
    element("dt", { text: t("READER_PARSER_SCHEMA") }), element("dd", { text: model.parserSchemaVersion || t("COMMON_LEGACY_UNAVAILABLE") }),
    element("dt", { text: t("READER_INDEX_STATUS") }), element("dd", { text: searchStatusLabel(model.indexStatus) }),
    ...(model.codeMetadata ? [
      element("dt", { text: t("READER_CODE_SOURCE") }),
      element("dd", { text: t("READER_CODE_SOURCE_VALUE", { file: model.codeMetadata.fileLabel, language: model.codeMetadata.language, line: model.codeMetadata.lineBaseline }) }),
    ] : []),
  ]);
  const body = element("article", { className: "reader-body", "aria-label": t("READER_BODY_ARIA") }, [
    element("div", { className: "actions reader-toolbar" }, [
      visibilityBadge(model.visibility),
      element("span", { className: "badge", text: t("READER_REVISION_LABEL", () => ({
        revisionId: model.revisionId,
        state: t(model.isCurrent ? "READER_REVISION_CURRENT" : "READER_REVISION_HISTORY"),
      })) }),
      element("a", { href: model.downloadHref, className: "download-link", download: "", text: t("READER_DOWNLOAD_MARKDOWN") }),
    ]),
    !model.isCurrent
      ? routeStateNode("degraded", t("READER_HISTORY_WARNING"))
      : undefined,
    model.indexStatus === "search_degraded"
      ? routeStateNode("degraded", t("READER_INDEX_DEGRADED"))
      : undefined,
    model.indexStatus === "failed"
      ? routeStateNode("error", t("READER_INDEX_FAILED"))
      : undefined,
    metadata,
    markdownBody,
  ]);
  const sources = element("aside", { className: "reader-sources", "aria-label": t("READER_SOURCES_ARIA") }, [
    element("h2", { text: t("READER_SOURCES") }),
    list(model.sources, (source, index) => {
      const location = readerLocations[index] || { headingPath: [], startLine: 1, endLine: 1 };
      const sourceLocation = localized(() => `${documentLabel(location.headingPath)} · ${lineLabel(location.startLine, location.endLine)}`);
      return element("li", {
        id: `chunk-${source.id}`,
        className: "item source-location",
        tabindex: source.id === model.focusedChunkId ? "-1" : undefined,
      }, [
        element("p", { text: sourceLocation }),
        element("a", { href: source.href, "data-route": "", "aria-label": t("READER_OPEN_SOURCE_ARIA", () => ({
          label: String(sourceLocation),
        })), text: t("READER_COPYABLE_LOCATION") }),
      ]);
    }, t("READER_NO_SOURCES")),
  ]);
  if (replaceOutlet(page(model.title, localized(() => `${t("READER_REVISION_LABEL", {
    revisionId: model.revisionId,
    state: t(model.isCurrent ? "READER_REVISION_CURRENT" : "READER_REVISION_HISTORY"),
  })} · ${t("COMMON_PUBLISHED_AT", { date: formatDate(model.publishedAt) })}`), [
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
  const recoveryButton = element("button", { className: "secondary", type: "button", text: t("ADMIN_RECOVER_ACTION") });
  const recovery = createMutationController(
    () => ownsMutation(owner),
    (pendingState) => setPending(recoveryButton, pendingState, t("ADMIN_RECOVER_PENDING"), t("ADMIN_RECOVER_ACTION")),
  );
  recoveryButton.addEventListener("click", () => openReviewDialog({
    title: t("ADMIN_RECOVER_DIALOG_TITLE"),
    description: t("ADMIN_RECOVER_DIALOG_DESCRIPTION"),
    confirmLabel: t("ADMIN_RECOVER_CONFIRM"),
    owns: () => ownsMutation(owner),
    onConfirm: () => { void recovery.run(
      () => api("/api/admin/publications/recover", { method: "POST", body: JSON.stringify({ limit: 20 }) }),
      (result) => setStatus(t("ADMIN_RECOVER_RESULT", {
        publications: result.recovery.recoveredIntents,
        indexes: result.recovery.recoveredIndexJobs,
        failures: result.recovery.failures.length,
      }), result.recovery.failures.length ? "error" : "success"),
      (error) => setStatus(safeErrorMessage(error), "error"),
    ); },
  }));
  replaceOutlet(page(t("ADMIN_TITLE"), t("ADMIN_DESCRIPTION"), [
    element("div", { className: "page-grid" }, [
      metricCard(t("ADMIN_REVIEW_QUEUE"), pending.items.length, t("ADMIN_OPEN_REVIEW_QUEUE"), "/admin/submissions"), metricCard(t("NAV_MEMBERS"), members.items.length, t("ADMIN_MANAGE_MEMBERS"), "/admin/members"),
      metricCard(t("NAV_SPACES"), spaces.items.length, t("ADMIN_MANAGE_SPACES"), "/admin/spaces"), metricCard(t("ADMIN_AUDIT_EVENTS"), audit.items.length, t("ADMIN_OPEN_AUDIT"), "/admin/audit"),
    ]),
    card(t("ADMIN_RECOVERY"), [element("p", { text: t("ADMIN_RECOVERY_BODY") }), recoveryButton]),
  ]), generation);
}
function metricCard(title, value, label, href) { return card(title, [element("p", { text: displayValue(value) }), routeLink(label, href)]); }

async function renderAdminAssets(generation) {
  const owner = routeGuard.owner(generation, "/admin/assets");
  const url = new URL(window.location.href);
  let status = ["queued", "processing", "succeeded", "failed_retryable", "failed_terminal"].includes(url.searchParams.get("status"))
    ? url.searchParams.get("status")
    : "";
  const filter = element("select", { "aria-label": t("ADMIN_ASSET_FILTER_LABEL") }, [
    element("option", { value: "", text: t("ADMIN_ASSET_FILTER_ALL") }),
    ...["queued", "processing", "succeeded", "failed_retryable", "failed_terminal"].map((value) => element("option", {
      value,
      text: assetJobStatusLabel(value),
    })),
  ]);
  filter.value = status;
  const region = element("div", { className: "stack", "aria-live": "polite" });
  const operations = createOperationGuard();
  const load = async () => {
    const response = await api(adminAssetsPath(status));
    const model = assetListModel(response);
    const rows = list(model.items, (asset) => {
      const actions = [
        element("a", { href: `/api/admin/assets/${encodeURIComponent(asset.id)}/original`, className: "download-link", target: "_blank", rel: "noreferrer", text: t("ADMIN_ASSET_OPEN_ORIGINAL") }),
        asset.parsedHref
          ? element("a", { href: `/api/admin/assets/${encodeURIComponent(asset.id)}/parsed`, className: "download-link", target: "_blank", rel: "noreferrer", text: t("ADMIN_ASSET_OPEN_PARSED") })
          : undefined,
      ];
      if (asset.jobStatus === "failed_retryable" || asset.jobStatus === "failed_terminal") {
        const retry = element("button", { className: "secondary", type: "button", text: t("ADMIN_ASSET_RETRY") });
        const mutation = createMutationController(
          () => ownsMutation(owner),
          (pending) => setPending(retry, pending, t("ADMIN_ASSET_RETRYING"), t("ADMIN_ASSET_RETRY")),
        );
        retry.addEventListener("click", () => void mutation.run(
          () => api(`/api/admin/assets/${encodeURIComponent(asset.id)}/retry`, { method: "POST" }),
          () => { setStatus(t("ADMIN_ASSET_RETRIED"), "success"); void load(); },
          (error) => setStatus(safeErrorMessage(error), "error"),
        ));
        actions.push(retry);
      }
      if (asset.lastErrorCode) actions.push(element("span", { className: "item-meta", text: t("ADMIN_ASSET_ERROR_CODE", { code: asset.lastErrorCode }) }));
      return item(asset.originalName, localized(() => [
        assetJobStatusLabel(asset.jobStatus),
        t("ADMIN_ASSET_ATTEMPTS", { count: asset.attempts }),
        asset.failureMessage,
        formatDate(asset.updatedAt || asset.createdAt),
      ].filter(Boolean).join(" · ")), actions);
    }, t("ADMIN_ASSET_EMPTY"));
    region.replaceChildren(rows);
  };
  filter.addEventListener("change", () => {
    status = filter.value;
    const next = new URL(window.location.href);
    if (status) next.searchParams.set("status", status);
    else next.searchParams.delete("status");
    history.replaceState({}, "", `${next.pathname}${next.search}`);
    region.replaceChildren(routeStateNode("loading", t("SHELL_LOADING_BODY")));
    void runLatestOperation(operations, load, () => undefined, (error) => region.replaceChildren(routeStateNode("error", safeErrorMessage(error))), () => ownsMutation(owner));
  });
  await load();
  replaceOutlet(page(t("ADMIN_ASSET_QUEUE_TITLE"), t("ADMIN_ASSET_QUEUE_DESCRIPTION"), [card(t("ADMIN_ASSET_QUEUE_TITLE"), [filter, region])]), generation);
}

function adminAssetsPath(status) {
  const query = new URLSearchParams({ limit: "50" });
  if (status) query.set("status", status);
  return `/api/admin/assets?${query.toString()}`;
}

async function renderPendingSubmissions(generation) {
  const owner = routeGuard.owner(generation, "/admin/submissions");
  let data = await api("/api/admin/submissions?status=review_pending&limit=20");
  let items = data.items;
  let cursor = data.nextCursor;
  const region = element("div", { className: "stack", "aria-live": "polite" });
  const operations = createOperationGuard();
  const renderItems = () => {
    const rows = list(items, (submission) => item(submission.title, localized(() => `${kindLabel(submission.kind)} · ${t("COMMON_SUBMITTED_AT", { date: formatDate(submission.createdAt) })}`), [
      element("pre", { className: "content-preview", text: submission.content }),
      routeLink(t("REVIEW_QUEUE_REVIEW_ITEM", { title: displayValue(submission.title) }), `/admin/submissions/${encodeURIComponent(displayValue(submission.id))}`),
    ]), t("REVIEW_QUEUE_EMPTY"));
    const more = cursor ? element("button", { className: "secondary", type: "button", text: t("COMMON_LOAD_MORE"), onclick: () => {
      more.disabled = true;
      void runLatestOperation(operations, () => api(`/api/admin/submissions?status=review_pending&limit=20&cursor=${encodeURIComponent(cursor)}`), (next) => {
        if (!ownsMutation(owner)) return;
        items = appendPage(items, next.items, (submission) => submission.id);
        cursor = next.nextCursor;
        renderItems();
      }, (error) => { if (ownsMutation(owner)) region.replaceChildren(rows, routeStateNode("error", safeErrorMessage(error))); }, () => ownsMutation(owner));
    } }) : undefined;
    region.replaceChildren(...compactChildren(rows, more));
  };
  renderItems();
  replaceOutlet(page(t("REVIEW_QUEUE_TITLE"), t("REVIEW_QUEUE_DESCRIPTION"), [card(t("SUBMISSION_STATUS_REVIEW_PENDING"), [region])]), generation);
}

async function renderReviewSubmission(generation, submissionId) {
  const pathname = `/admin/submissions/${submissionId}`;
  const owner = routeGuard.owner(generation, pathname);
  const previewResponse = await api(`/api/admin/submissions/${encodeURIComponent(submissionId)}`);
  const model = reviewPreviewModel(previewResponse.preview);
  const target = reviewTargetModel(previewResponse.preview);
  const previewLocations = rawChunkLocations({ chunks: previewResponse.preview?.chunks });
  const requestedTarget = previewResponse.preview?.requestedTarget || {};
  const requestedSpace = requestedTarget.space || {};
  const requestedCollection = requestedTarget.collection;
  const requestedSpaceAvailable = requestedSpace.id === target.spaceId && requestedSpace.status === "active";
  const requestedCollectionAvailable = target.collectionId === null
    ? requestedCollection === null
    : requestedCollection?.id === target.collectionId && requestedCollection?.status === "active";
  const warningKeys = ["REVIEW_WARNING_INERT"];
  if (model.chunks.length === 0) warningKeys.push("REVIEW_WARNING_NO_CHUNK");
  if (model.parserVersion !== "m1-v1") warningKeys.push("REVIEW_WARNING_PARSER");
  const title = element("input", { required: "", maxlength: "200", value: model.title });
  const visibility = element("select", {}, [
    element("option", { value: "shared", text: t("COMMON_VISIBILITY_SHARED") }),
    element("option", { value: "admin_only", text: t("COMMON_VISIBILITY_ADMIN_ONLY") }),
  ]);
  visibility.value = model.requestedVisibility;
  const finalSpace = element("input", { required: "", maxlength: "128", value: target.spaceId });
  const finalCollection = element("input", { maxlength: "128", value: target.collectionId || "" });
  const tags = element("fieldset", { className: "tag-selector", "aria-live": "polite" });
  let tagController;
  const renderTags = (state) => {
    const nodes = [element("legend", { text: t("REVIEW_TAGS_LEGEND") })];
    if (!state.loaded) nodes.push(routeStateNode("loading", t("REVIEW_TAGS_LOADING")));
    if (state.items.length) nodes.push(...state.items.map((tag) => element("label", { className: "check-option", text: tag.name }, [
      element("input", {
        type: "checkbox",
        value: tag.id,
        checked: tag.selected ? "" : undefined,
        onchange: (event) => tagController.select(tag.id, event.currentTarget.checked),
      }),
    ])));
    else if (state.loaded && !state.error) nodes.push(element("p", { className: "muted", text: t("REVIEW_TAGS_EMPTY") }));
    if (state.error) nodes.push(routeStateNode("error", state.errorKey ? t(controllerErrorKeys[state.errorKey]) : state.error));
    const loadMore = reviewTagLoadMoreModel(state);
    if (loadMore.visible) {
      const loadMoreButton = element("button", {
        className: "secondary",
        type: "button",
        onclick: () => { void tagController.loadMore(); },
      });
      const currentPage = () => reviewTagLoadMoreModel(state);
      translationBindings.text(loadMoreButton, localized(() => currentPage().label));
      translationBindings.attribute(loadMoreButton, "aria-label", localized(() => currentPage().accessibleName));
      translationBindings.effect(loadMoreButton, "review-tag-page", () => {
        const current = currentPage();
        loadMoreButton.disabled = current.disabled;
      });
      nodes.push(loadMoreButton);
    }
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
    element("option", { value: "not_relevant", text: t("REVIEW_REASON_NOT_RELEVANT") }),
    element("option", { value: "duplicate", text: t("REVIEW_REASON_DUPLICATE") }),
    element("option", { value: "unsafe", text: t("REVIEW_REASON_UNSAFE") }),
  ]);
  const note = element("textarea", { maxlength: "4000", placeholder: t("REVIEW_NOTE_PLACEHOLDER") });
  const publishButton = element("button", { className: "primary", type: "button", text: t("REVIEW_PUBLISH") });
  const rejectButton = element("button", { className: "danger", type: "button", text: t("REVIEW_REJECT") });
  const revisionButton = element("button", { className: "secondary", type: "button", text: t("REVIEW_REQUEST_REVISION") });
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
      validationSummary(form, t("REVIEW_PUBLICATION_VALIDATION"));
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
          navigate(`/knowledge/${encodeURIComponent(displayValue(result.revision.knowledgeItemId))}?revision=${encodeURIComponent(displayValue(result.revision.id))}`, true, t("REVIEW_PUBLISHED", { title: displayValue(result.revision.title) }));
        } else {
          navigate("/admin/submissions", true, t(kind === "reject" ? "REVIEW_REJECTED" : "REVIEW_REVISION_REQUESTED"));
        }
      },
      (error) => validationSummary(form, safeErrorMessage(error)),
    );
  };
  const confirmPublication = () => {
    if (model.requestedVisibility === "admin_only" && visibility.value === "shared") {
      openReviewDialog({
        title: t("REVIEW_EXPAND_TITLE"),
        description: t("REVIEW_EXPAND_DESCRIPTION"),
        confirmLabel: t("REVIEW_EXPAND_CONFIRM"),
        owns: () => ownsMutation(owner),
        onConfirm: () => runDecision("publish", "admin_visibility_expansion"),
      });
      return;
    }
    runDecision("publish");
  };
  publishButton.addEventListener("click", () => openReviewDialog({
    title: t("REVIEW_PUBLISH_TITLE"),
    description: t("REVIEW_PUBLISH_DESCRIPTION"),
    confirmLabel: t("REVIEW_PUBLISH_CONFIRM"),
    owns: () => ownsMutation(owner),
    onConfirm: confirmPublication,
  }));
  rejectButton.addEventListener("click", () => openReviewDialog({
    title: t("REVIEW_REJECT_TITLE"),
    description: t("REVIEW_REJECT_DESCRIPTION"),
    confirmLabel: t("REVIEW_REJECT_CONFIRM"),
    danger: true,
    owns: () => ownsMutation(owner),
    onConfirm: () => runDecision("reject"),
  }));
  revisionButton.addEventListener("click", () => openReviewDialog({
    title: t("REVIEW_REVISION_TITLE"),
    description: t("REVIEW_REVISION_DESCRIPTION"),
    confirmLabel: t("REVIEW_REVISION_CONFIRM"),
    owns: () => ownsMutation(owner),
    onConfirm: () => runDecision("revision"),
  }));
  form = element("form", { className: "stack", onsubmit: (event) => event.preventDefault() }, [
    field(t("REVIEW_FINAL_VISIBILITY"), visibility),
    element("dl", { className: "review-target", "aria-label": t("REVIEW_METADATA_ARIA") }, [
      element("dt", { text: t("REVIEW_REQUESTED_TITLE") }), element("dd", { text: displayValue(model.title) }),
      element("dt", { text: t("REVIEW_FINAL_TITLE") }), element("dd", {}, [title]),
      element("dt", { text: t("REVIEW_REQUESTED_SPACE") }), element("dd", { text: requestedSpaceAvailable ? requestedSpace.name : t("REVIEW_REQUESTED_SPACE_UNAVAILABLE") }),
      element("dt", { text: t("REVIEW_REQUESTED_COLLECTION") }), element("dd", { text: target.collectionId === null
        ? t("COMMON_NO_COLLECTION")
        : requestedCollectionAvailable ? requestedCollection.name : t("REVIEW_REQUESTED_COLLECTION_UNAVAILABLE") }),
      element("dt", { text: t("COMMON_REQUESTED_VISIBILITY") }), element("dd", { text: visibilityLabel(model.requestedVisibility) }),
      element("dt", { text: t("REVIEW_FINAL_SPACE_ID") }), element("dd", {}, [finalSpace]),
      element("dt", { text: t("REVIEW_FINAL_COLLECTION_ID") }), element("dd", {}, [finalCollection]),
    ]),
    tags,
    field(t("REVIEW_REJECTION_REASON"), reason), field(t("REVIEW_NOTE"), note), element("div", { className: "actions" }, actionButtons),
  ]);
  if (replaceOutlet(page(t("REVIEW_TITLE", { title: displayValue(model.title) }), t("REVIEW_META", {
    kind: kindLabel(model.kind), status: submissionStatusLabel(model.status), parser: model.parserVersion,
  }), [
    element("div", { className: "review-grid" }, [
      card(t("REVIEW_RAW_INPUT"), [element("pre", { className: "content-preview", text: model.rawInput })]),
      card(t("REVIEW_NORMALIZED_MARKDOWN"), [element("pre", { className: "content-preview", text: model.normalizedMarkdown })]),
    ]),
    element("div", { className: "page-grid" }, [
      card(t("REVIEW_CHUNK_PREVIEW"), [list(model.chunks, (chunk, index) => {
        const location = previewLocations[index] || { headingPath: [], startLine: chunk.startLine, endLine: chunk.endLine };
        return item(documentLabel(location.headingPath), lineLabel(location.startLine, location.endLine), [
          element("pre", { className: "content-preview", text: chunk.excerpt }),
        ]);
      }, t("REVIEW_NO_CHUNKS"))]),
      card(t("REVIEW_WARNINGS"), [list(warningKeys, (key) => element("li", { className: "item", text: t(reviewWarningKeys[key]) }), t("REVIEW_NO_WARNINGS"))]),
    ]),
    card(t("REVIEW_DECISION"), [form]),
  ]), generation)) {
    void tagController.loadInitial();
  }
}

async function renderMembers(generation) {
  const data = await api("/api/admin/members?limit=50");
  const owner = routeGuard.owner(generation, "/admin/members");
  const rows = data.items.map((member) => {
    const readyLabel = t(member.status === "active" ? "MEMBERS_DISABLE" : "MEMBERS_ENABLE");
    const status = element("button", { className: "secondary", type: "button", text: readyLabel, disabled: member.role === "admin" ? "" : undefined });
    const mutation = createMutationController(
      () => ownsMutation(owner),
      (pending) => setPending(status, pending, t("MEMBERS_UPDATING"), readyLabel),
    );
    status.addEventListener("click", () => { void mutation.run(
      () => api(`/api/admin/members/${encodeURIComponent(member.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: member.status === "active" ? "disabled" : "active" }) }),
      () => navigate("/admin/members", true, t("MEMBERS_UPDATED")),
      (error) => setStatus(safeErrorMessage(error), "error"),
    ); });
    return element("tr", {}, [element("td", { text: member.email }), element("td", { text: memberRoleLabel(member.role) }), element("td", { text: activeStatusLabel(member.status) }), element("td", {}, [status])]);
  });
  replaceOutlet(page(t("MEMBERS_TITLE"), t("MEMBERS_DESCRIPTION"), [card(t("MEMBERS_DIRECTORY"), [table([
    t("COMMON_EMAIL"), t("COMMON_ROLE"), t("COMMON_STATUS"), t("COMMON_ACTION"),
  ], rows)])]), generation);
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
  const slug = element("input", { required: "", placeholder: t("SPACES_SLUG_PLACEHOLDER") });
  const name = element("input", { required: "", placeholder: t("SPACES_NAME_PLACEHOLDER") });
  const position = element("input", { type: "number", value: String(spaces.length) });
  const createSpaceButton = element("button", { className: "primary", type: "submit", text: t("SPACES_CREATE") });
  let form;
  const spaceMutation = createMutationController(
    () => ownsMutation(owner),
    (pending) => setPending(createSpaceButton, pending, t("SPACES_CREATING"), t("SPACES_CREATE")),
  );
  form = element("form", { className: "stack", onsubmit: (event) => {
    event.preventDefault();
    void spaceMutation.run(
      () => api("/api/admin/spaces", { method: "POST", body: JSON.stringify({ slug: slug.value, name: name.value, position: Number(position.value) }) }),
      () => navigate("/admin/spaces", true, t("SPACES_CREATED")),
      (error) => validationSummary(form, safeErrorMessage(error)),
    );
  } }, [field(t("COMMON_SLUG"), slug), field(t("COMMON_NAME"), name), field(t("COMMON_POSITION"), position), createSpaceButton]);
  const collectionSpace = element("select", { required: "" }, managedSpaces.map((space) => element("option", { value: space.id, text: space.name })));
  const collectionName = element("input", { required: "", placeholder: t("SPACES_COLLECTION_PLACEHOLDER") });
  const collectionPosition = element("input", { type: "number", value: "0" });
  const createCollectionButton = element("button", { className: "primary", type: "submit", text: t("SPACES_CREATE_COLLECTION"), disabled: managedSpaces.length ? undefined : "" });
  let collectionForm;
  const collectionMutation = createMutationController(
    () => ownsMutation(owner),
    (pending) => setPending(createCollectionButton, pending, t("SPACES_CREATING"), t("SPACES_CREATE_COLLECTION")),
  );
  collectionForm = element("form", { className: "stack", onsubmit: (event) => {
    event.preventDefault();
    void collectionMutation.run(
      () => api("/api/admin/collections", { method: "POST", body: JSON.stringify({ spaceId: collectionSpace.value, name: collectionName.value, position: Number(collectionPosition.value) }) }),
      () => navigate("/admin/spaces", true, t("SPACES_COLLECTION_CREATED")),
      (error) => validationSummary(collectionForm, safeErrorMessage(error)),
    );
  } }, [field(t("SUBMIT_TARGET_SPACE"), collectionSpace), field(t("SPACES_COLLECTION_NAME"), collectionName), field(t("COMMON_POSITION"), collectionPosition), createCollectionButton]);
  const spacesSlot = element("div");
  const collectionsSlot = element("div");
  const spacesMore = element("button", { className: "secondary", type: "button" });
  const spacesStatus = element("p", { className: "muted", role: "status", "aria-live": "polite" });
  spacesMore.addEventListener("click", () => { void controller.loadMoreSpaces(); });
  replaceOutlet(page(t("SPACES_TITLE"), t("SPACES_DESCRIPTION"), [
    element("div", { className: "page-grid wide-left" }, [card(t("SPACES_EXISTING"), [spacesSlot, spacesMore, spacesStatus]), card(t("SPACES_NEW"), [form])]),
    element("div", { className: "page-grid wide-left" }, [
      card(t("SPACES_COLLECTIONS"), [collectionsSlot]),
      card(t("SPACES_NEW_COLLECTION"), [collectionForm]),
    ]),
  ]), generation);
  renderState = () => {
    if (!ownsMutation(owner) || !latestState) return;
    spacesSlot.replaceChildren(list(latestState.spaces, (space) => item(
      space.name,
      localized(() => `${space.slug} · ${space.kind} · ${space.readOnly ? t("COMMON_READ_ONLY") : activeStatusLabel(space.status)}`),
    ), t("SPACES_EMPTY")));
    const currentSpacePage = () => optionLoadMoreModel(latestState, String(t("COMMON_SPACES")));
    translationBindings.text(spacesMore, localized(() => currentSpacePage().label));
    translationBindings.attribute(spacesMore, "aria-label", localized(() => currentSpacePage().accessibleName));
    translationBindings.effect(spacesMore, "space-page", () => {
      const spaceMoreModel = currentSpacePage();
      spacesMore.hidden = !spaceMoreModel.visible;
      spacesMore.disabled = spaceMoreModel.disabled;
    });
    translationBindings.text(spacesStatus, latestState.errorKey
      ? t(controllerErrorKeys[latestState.errorKey], { resource: t("COMMON_SPACES") })
      : "");
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
        const currentCollectionPage = () => optionLoadMoreModel(collectionPage, String(t("COMMON_COLLECTIONS")));
        translationBindings.text(more, localized(() => currentCollectionPage().label));
        translationBindings.attribute(more, "aria-label", localized(() => t("OPTIONS_LOAD_MORE_IN_SPACE_ARIA", {
          label: currentCollectionPage().accessibleName,
          space: spaceById.get(collectionPage.spaceId)?.name || t("COMMON_SPACE"),
        })));
        translationBindings.effect(more, "collection-page", () => {
          const moreModel = currentCollectionPage();
          more.hidden = !moreModel.visible;
          more.disabled = moreModel.disabled;
        });
        more.addEventListener("click", () => { void controller.loadMoreCollections(collectionPage.spaceId); });
        const status = element("p", { className: "muted", role: "status", "aria-live": "polite", text: collectionPage.errorKey
          ? t(controllerErrorKeys[collectionPage.errorKey], { resource: t("COMMON_COLLECTIONS") })
          : "" });
        status.hidden = !collectionPage.error;
        return item(
          spaceById.get(collectionPage.spaceId)?.name || t("COMMON_SPACE"),
          collectionPage.items.length ? collectionPage.items.map((collection) => collection.name).join(" · ") : t("SPACES_NO_COLLECTIONS"),
          [more, status],
        );
      },
      t("SPACES_NO_MANAGEABLE"),
    ) : empty(t("SPACES_NO_MANAGEABLE")));
  };
  latestState = controller.snapshot();
  renderState();
}

async function renderAudit(generation) {
  const data = await api("/api/admin/audit-events?limit=50");
  // Keep the audit metadata contract shape: localized(() => `${event.resourceType} · ${formatDate(event.createdAt)}`)
  replaceOutlet(page(t("AUDIT_TITLE"), t("AUDIT_DESCRIPTION"), [card(t("AUDIT_RECENT"), [list(data.items, (event) => item(event.action, localized(() => `${displayValue(event.resourceType)} · ${formatDate(event.createdAt)}`), [element("code", { text: displayValue(JSON.stringify(event.metadata), t("COMMON_NO_METADATA")) })]), t("AUDIT_EMPTY"))])]), generation);
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
    renderSessionSummary();
    logoutButton.hidden = false;
    logoutButton.disabled = false;
    drawerToggle.hidden = false;
    drawerToggle.disabled = false;
    setDrawer(false);
    shell.dataset.ready = "true";
    await renderRoute();
  } catch (error) {
    replaceOutlet(page(t("BOOTSTRAP_FAILED_TITLE"), safeErrorMessage(error, t("BOOTSTRAP_SESSION_FAILED")), [empty(t("COMMON_RETRY_LATER"))]));
  }
}

function renderAnonymous() {
  closeOpenDialogs();
  logoutController.invalidate();
  const state = anonymousShellState();
  session = undefined;
  routeGuard.begin();
  pendingFlash = "";
  setStatus(t("ANONYMOUS_STATUS"));
  byId("primary-navigation").replaceChildren();
  translationBindings.text(byId("session-summary"), t("SESSION_SIGN_IN_HINT"));
  sessionAvatar.hidden = true;
  sessionAvatar.replaceChildren();
  logoutButton.hidden = true;
  logoutButton.disabled = true;
  drawerToggle.hidden = true;
  drawerToggle.disabled = true;
  applyDrawerState(state.drawer);
  shell.dataset.ready = "false";
  replaceOutlet(page(t("ANONYMOUS_TITLE"), t("ANONYMOUS_DESCRIPTION"), [
    element("div", { className: "actions" }, [element("a", { href: "/auth/github", className: "login-action", text: t("ANONYMOUS_GITHUB") })]),
  ]));
}

function renderSessionSummary() {
  if (!session) return;
  const account = accountPresentationModel(session);
  sessionAvatar.hidden = !account.visible;
  if (account.visible) sessionAvatar.replaceChildren(document.createTextNode(account.initials));
  else sessionAvatar.replaceChildren();
  translationBindings.text(byId("session-summary"), t("SESSION_SUMMARY", {
    email: displayValue(account.email, t("COMMON_VALUE_UNAVAILABLE")),
    role: memberRoleLabel(session.member?.role),
  }));
}

function applyLocale() {
  document.documentElement.lang = i18n.locale;
  translationBindings.property(document, "title", t("APP_TITLE"));
  languageSelect.value = i18n.locale;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    translationBindings.text(node, localized(() => translate(node.dataset.i18n)));
  }
  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    translationBindings.attribute(node, "aria-label", localized(() => translate(node.dataset.i18nAriaLabel)));
  }
  configureWorkspaceI18n(translate);
}

function browserStorage() {
  try { return window.localStorage; } catch { return undefined; }
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
languageSelect.addEventListener("change", () => { i18n.setLocale(languageSelect.value); });
mobileViewport.addEventListener("change", () => { if (session) setDrawer(false); });
i18n.subscribe(() => {
  localeRefreshController.apply(i18n.locale);
});
applyLocale();
applyDrawerState(anonymousShellState().drawer);
drawerToggle.disabled = true;
void bootstrap();
