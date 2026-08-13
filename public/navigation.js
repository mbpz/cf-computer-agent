const memberItems = Object.freeze([
  { href: "/", label: "首页", group: "workspace", capability: null },
  { href: "/submit", label: "提交知识", group: "workspace", capability: "submission:create" },
  { href: "/knowledge", label: "知识库", group: "workspace", capability: "legacy:read" },
  { href: "/search", label: "搜索", group: "workspace", capability: "legacy:read" },
  { href: "/agent", label: "Agent", group: "workspace", capability: "legacy:read" },
  { href: "/my-submissions", label: "我的投稿", group: "workspace", capability: "submission:read-own" },
]);

const adminItems = Object.freeze([
  { href: "/admin", label: "管理概览", group: "admin", capability: "submission:read-all" },
  { href: "/admin/submissions", label: "待审核", group: "admin", capability: "submission:read-all" },
  { href: "/admin/members", label: "成员", group: "admin", capability: "member:manage" },
  { href: "/admin/spaces", label: "空间", group: "admin", capability: "space:manage" },
  { href: "/admin/audit", label: "审计", group: "admin", capability: "audit:read" },
]);

/**
 * Returns only destinations permitted by the server-issued session capabilities.
 * Automation has no browser session and therefore receives no navigation.
 */
export function navigationForSession(session) {
  if (!session?.member || !Array.isArray(session.capabilities)) return [];
  const capabilities = new Set(session.capabilities);
  return [...memberItems, ...adminItems]
    .filter((item) => item.capability === null || capabilities.has(item.capability))
    .map(({ capability: _capability, ...item }) => Object.freeze(item));
}
