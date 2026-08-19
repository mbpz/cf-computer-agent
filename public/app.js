import { navigationForSession } from "/navigation.js";
import { anonymousShellState, createLogoutController, createOperationGuard, createRouteGuard, drawerState, sessionBootstrapState, runLatestOperation } from "/workspace-ui.js";

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
      element("h1", { text: title }),
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
  sidebar.setAttribute("aria-hidden", state.ariaHidden);
  sidebar.inert = state.inert;
}
function setDrawer(open, focusDrawer = false) {
  if (!mobileViewport.matches) {
    applyDrawerState({ open: false, ariaExpanded: "false", ariaHidden: "false", inert: false });
    return;
  }
  const state = drawerState(open);
  applyDrawerState(state);
  if (state.open && focusDrawer) sidebar.querySelector("a, button")?.focus();
  if (!state.open && document.activeElement instanceof HTMLElement && sidebar.contains(document.activeElement)) drawerToggle.focus();
}
function navigate(path, replace = false, flash = "") {
  if (!session) return;
  const next = new URL(path, window.location.origin);
  if (next.origin !== window.location.origin) return;
  if (next.pathname !== window.location.pathname) history[replace ? "replaceState" : "pushState"]({}, "", `${next.pathname}${next.search}`);
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
      "aria-current": item.href === window.location.pathname ? "page" : undefined,
      text: item.label,
    })),
  ])));
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
  if (isAdminRoute(path) && !has("submission:read-all")) {
    replaceOutlet(page("403：没有管理权限", "管理路由由服务器独立授权；当前登录身份没有该能力。", [empty("请返回工作区，或联系管理员调整成员状态。")]), generation);
    return;
  }
  const renderer = routes[path];
  if (!renderer) {
    replaceOutlet(page("页面不存在", "此地址没有对应的工作区页面。", [element("div", { className: "actions" }, [routeLink("返回首页", "/")])]), generation);
    return;
  }
  try {
    await renderer(generation);
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

async function renderHome(generation) {
  const submissions = await api("/api/submissions/mine?limit=5");
  if (replaceOutlet(page("你的知识工作台", "向共享知识库提交内容，并继续使用已发布的旧版知识。", [
    element("div", { className: "page-grid" }, [
      card("快速开始", [
        element("p", { text: "新内容会进入只读待审核队列；发布能力将在 Phase 3 提供。" }),
        element("div", { className: "actions" }, [routeLink("提交知识", "/submit"), routeLink("搜索旧版知识", "/search"), routeLink("询问 Agent", "/agent")]),
      ]),
      card("最近投稿", [list(submissions.items, (submission) => item(submission.title, `${submission.kind} · ${submission.status} · ${formatDate(submission.createdAt)}`), "你还没有投稿。")]),
    ]),
  ]), generation)) outlet.focus({ preventScroll: true });
}

async function loadSpaces() { return (await api("/api/spaces?limit=50")).items; }
async function renderSubmit(generation) {
  const spaces = await loadSpaces();
  const activeSpaces = spaces.filter((space) => space.status === "active" && !space.readOnly);
  const title = element("input", { name: "title", required: "", maxlength: "256" });
  const kind = element("select", { name: "kind" }, ["text", "markdown", "code"].map((value) => element("option", { value, text: value })));
  const space = element("select", { name: "space", required: "" }, activeSpaces.map((value) => element("option", { value: value.id, text: value.name })));
  const content = element("textarea", { name: "content", required: "", maxlength: String(128 * 1024), placeholder: "输入纯文本、Markdown 或代码…" });
  const owner = routeGuard.owner(generation, "/submit");
  const form = element("form", { className: "stack", onsubmit: async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/submissions", { method: "POST", body: JSON.stringify({ requestedSpaceId: space.value, kind: kind.value, title: title.value, content: content.value }) });
      if (!ownsMutation(owner)) return;
      navigate("/my-submissions", true, `已提交“${result.submission.title}”，当前状态为 ${result.submission.status}。`);
    } catch (error) { if (ownsMutation(owner)) setStatus(error.message, "error"); }
  } }, [
    field("标题", title), field("内容类型", kind), field("目标空间", space), field("内容", content),
    element("button", { className: "primary", type: "submit", text: "提交到待审核队列", disabled: activeSpaces.length ? undefined : "" }),
  ]);
  if (replaceOutlet(page("提交知识", "Phase 1 只接受文本、Markdown 和代码；内容会保留为 review_pending。", [card("新投稿", [activeSpaces.length ? form : empty("没有可投稿的活动共享空间。")])]), generation)) outlet.focus({ preventScroll: true });
}
function field(label, control) { return element("label", { text: label }, [control]); }

async function renderKnowledge(generation) {
  const spaces = await loadSpaces();
  if (replaceOutlet(page("知识空间", "默认知识库可管理；旧版个人空间保持只读兼容。", [
    element("div", { className: "page-grid" }, spaces.map((space) => card(space.name, [
      element("p", { className: "muted", text: space.description || "没有说明。" }),
      element("p", { text: `${space.kind === "legacy" ? "旧版" : "共享"} · ${space.readOnly ? "只读" : "可投稿"} · ${space.status}` }),
      space.kind === "legacy" ? routeLink("搜索已发布知识", "/search") : routeLink("提交到此空间", "/submit"),
    ]))),
  ]), generation)) outlet.focus({ preventScroll: true });
}

async function renderSearch(generation) {
  const query = element("input", { type: "search", placeholder: "输入关键词", "aria-label": "搜索关键词" });
  const results = element("div", { className: "stack" });
  const owner = routeGuard.owner(generation, "/search");
  const operations = createOperationGuard();
  const form = element("form", { className: "actions", onsubmit: async (event) => {
    event.preventDefault();
    results.replaceChildren(empty("正在搜索…"));
    await runLatestOperation(operations, () => api(`/api/search?q=${encodeURIComponent(query.value)}`), (data) => {
      if (!ownsMutation(owner)) return;
      results.replaceChildren(list(data.hits, (hit) => item(hit.title, hit.excerpt || "没有摘要", (hit.tags || []).map((tag) => element("span", { className: "badge", text: tag }))), "没有匹配的已发布知识。"));
    }, (error) => { if (ownsMutation(owner)) results.replaceChildren(empty(error.message)); });
  } }, [query, element("button", { className: "primary", type: "submit", text: "搜索" })]);
  if (replaceOutlet(page("搜索已发布知识", "此页面检索 Phase 0 的兼容知识库，不包含待审核投稿。", [card("检索", [form, results])]), generation)) outlet.focus({ preventScroll: true });
}

async function renderAgent(generation) {
  const question = element("textarea", { required: "", placeholder: "例如：根据已发布的知识，下一步应关注什么？" });
  const answer = element("div", { className: "stack" });
  const owner = routeGuard.owner(generation, "/agent");
  const operations = createOperationGuard();
  const form = element("form", { className: "stack", onsubmit: async (event) => {
    event.preventDefault();
    answer.replaceChildren(empty("正在阅读已发布知识…"));
    await runLatestOperation(operations, () => api("/api/chat", { method: "POST", body: JSON.stringify({ question: question.value }) }), (data) => {
      if (!ownsMutation(owner)) return;
      answer.replaceChildren(element("p", { text: data.answer }), element("h3", { text: "来源" }), list(data.sources || [], (source) => item(source.title, source.excerpt || ""), "没有可引用来源。"));
    }, (error) => { if (ownsMutation(owner)) answer.replaceChildren(empty(error.message)); });
  } }, [field("问题", question), element("button", { className: "primary", type: "submit", text: "询问 Agent" })]);
  if (replaceOutlet(page("向 Agent 提问", "回答只依据已发布的旧版知识；待审核投稿不会被用于回答。", [card("问题", [form, answer])]), generation)) outlet.focus({ preventScroll: true });
}

async function renderMySubmissions(generation) {
  const data = await api("/api/submissions/mine?limit=50");
  if (replaceOutlet(page("我的投稿", "只有你自己的投稿会显示在这里。", [card("投稿记录", [list(data.items, (submission) => item(submission.title, `${submission.kind} · ${submission.status} · ${formatDate(submission.createdAt)}`, [element("p", { className: "muted", text: submission.content })]), "你还没有投稿。")])]), generation)) outlet.focus({ preventScroll: true });
}

async function renderAdminDashboard(generation) {
  const [pending, members, spaces, audit] = await Promise.all([
    api("/api/admin/submissions?status=review_pending&limit=5"), api("/api/admin/members?limit=5"), api("/api/spaces?limit=5"), api("/api/admin/audit-events?limit=5"),
  ]);
  if (replaceOutlet(page("管理概览", "治理操作仍由每个 API 的服务器授权执行。", [
    element("div", { className: "page-grid" }, [
      metricCard("待审核投稿", pending.items.length, "查看队列", "/admin/submissions"), metricCard("成员", members.items.length, "管理成员", "/admin/members"),
      metricCard("空间", spaces.items.length, "管理空间", "/admin/spaces"), metricCard("审计事件", audit.items.length, "查看审计", "/admin/audit"),
    ]),
  ]), generation)) outlet.focus({ preventScroll: true });
}
function metricCard(title, value, label, href) { return card(title, [element("p", { text: String(value) }), routeLink(label, href)]); }

async function renderPendingSubmissions(generation) {
  const data = await api("/api/admin/submissions?status=review_pending&limit=50");
  if (replaceOutlet(page("待审核投稿", "该队列在 Phase 1 为只读；批准、驳回和发布将在 Phase 3 提供。", [
    element("p", { className: "notice", text: "Phase 3 才会提供审核决定与发布能力。" }),
    card("review_pending", [list(data.items, (submission) => item(submission.title, `${submission.kind} · ${submission.submitterId} · ${formatDate(submission.createdAt)}`, [element("p", { className: "muted", text: submission.content })]), "没有待审核投稿。")]),
  ]), generation)) outlet.focus({ preventScroll: true });
}

async function renderMembers(generation) {
  const data = await api("/api/admin/members?limit=50");
  const owner = routeGuard.owner(generation, "/admin/members");
  const rows = data.items.map((member) => {
    const status = element("button", { className: "secondary", type: "button", text: member.status === "active" ? "禁用 contributor" : "启用 contributor", disabled: member.role === "admin" ? "" : undefined, onclick: async () => {
      try {
        await api(`/api/admin/members/${encodeURIComponent(member.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: member.status === "active" ? "disabled" : "active" }) });
        if (!ownsMutation(owner)) return;
        setStatus("成员状态已更新。", "success");
        await renderMembers(owner.generation);
      } catch (error) { if (ownsMutation(owner)) setStatus(error.message, "error"); }
    } });
    return element("tr", {}, [element("td", { text: member.email }), element("td", { text: member.role }), element("td", { text: member.status }), element("td", {}, [status])]);
  });
  if (replaceOutlet(page("成员", "唯一管理员受服务器保护，不能通过 Web 界面变更。", [card("成员目录", [table(["邮箱", "角色", "状态", "操作"], rows)])]), generation)) outlet.focus({ preventScroll: true });
}
function table(headers, rows) { return element("div", { className: "table-wrap" }, [element("table", {}, [element("thead", {}, [element("tr", {}, headers.map((header) => element("th", { text: header }))) ]), element("tbody", {}, rows)])]); }

async function renderSpaces(generation) {
  const spaces = await loadSpaces();
  const managedSpaces = spaces.filter((space) => !space.readOnly && space.kind === "shared");
  const collectionPages = await Promise.all(managedSpaces.map(async (space) => ({
    space,
    collections: (await api(`/api/spaces/${encodeURIComponent(space.id)}/collections?limit=50`)).items,
  })));
  const slug = element("input", { required: "", placeholder: "engineering" });
  const owner = routeGuard.owner(generation, "/admin/spaces");
  const name = element("input", { required: "", placeholder: "Engineering" });
  const position = element("input", { type: "number", value: String(spaces.length) });
  const form = element("form", { className: "stack", onsubmit: async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/spaces", { method: "POST", body: JSON.stringify({ slug: slug.value, name: name.value, position: Number(position.value) }) });
      if (!ownsMutation(owner)) return;
      setStatus("空间已创建。", "success");
      await renderSpaces(owner.generation);
    } catch (error) { if (ownsMutation(owner)) setStatus(error.message, "error"); }
  } }, [field("Slug", slug), field("名称", name), field("排序位置", position), element("button", { className: "primary", type: "submit", text: "创建共享空间" })]);
  const collectionSpace = element("select", { required: "" }, managedSpaces.map((space) => element("option", { value: space.id, text: space.name })));
  const collectionName = element("input", { required: "", placeholder: "Runbooks" });
  const collectionPosition = element("input", { type: "number", value: "0" });
  const collectionForm = element("form", { className: "stack", onsubmit: async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/collections", { method: "POST", body: JSON.stringify({ spaceId: collectionSpace.value, name: collectionName.value, position: Number(collectionPosition.value) }) });
      if (!ownsMutation(owner)) return;
      setStatus("集合已创建。", "success");
      await renderSpaces(owner.generation);
    } catch (error) { if (ownsMutation(owner)) setStatus(error.message, "error"); }
  } }, [field("目标空间", collectionSpace), field("集合名称", collectionName), field("排序位置", collectionPosition), element("button", { className: "primary", type: "submit", text: "创建集合", disabled: managedSpaces.length ? undefined : "" })]);
  if (replaceOutlet(page("空间", "旧版个人空间永久只读；共享空间及其集合由服务器校验。", [
    element("div", { className: "page-grid wide-left" }, [card("现有空间", [list(spaces, (space) => item(space.name, `${space.slug} · ${space.kind} · ${space.readOnly ? "只读" : space.status}`), "没有空间。")]), card("新共享空间", [form])]),
    element("div", { className: "page-grid wide-left" }, [
      card("集合", [collectionPages.length ? list(collectionPages, ({ space, collections }) => item(space.name, collections.length ? collections.map((collection) => collection.name).join(" · ") : "还没有集合。"), "没有可管理的共享空间。") : empty("没有可管理的共享空间。")]),
      card("新集合", [collectionForm]),
    ]),
  ]), generation)) outlet.focus({ preventScroll: true });
}

async function renderAudit(generation) {
  const data = await api("/api/admin/audit-events?limit=50");
  if (replaceOutlet(page("审计", "事件元数据由服务端按动作白名单脱敏。", [card("最近事件", [list(data.items, (event) => item(event.action, `${event.resourceType} · ${formatDate(event.createdAt)}`, [element("code", { text: JSON.stringify(event.metadata) })]), "没有审计事件。")])]), generation)) outlet.focus({ preventScroll: true });
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
    sidebar.inert = false;
    sidebar.removeAttribute("aria-hidden");
    shell.dataset.ready = "true";
    await renderRoute();
  } catch (error) {
    replaceOutlet(page("无法启动工作区", error.message || "无法获取当前会话。", [empty("请稍后重试。")]))
  }
}

function renderAnonymous() {
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
  outlet.focus({ preventScroll: true });
}

function logout() { return logoutController.run(); }

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-route]");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
  event.preventDefault();
  navigate(link.getAttribute("href"));
});
window.addEventListener("popstate", () => {
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
