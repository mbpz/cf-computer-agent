const memberItems = Object.freeze([
  { href: "/", label: "Home", group: "workspace", capability: null },
  { href: "/submit", label: "Submit", group: "workspace", capability: "submission:create" },
  { href: "/knowledge", label: "Library", group: "workspace", capability: "knowledge:read" },
  { href: "/search", label: "Search", group: "workspace", capability: "knowledge:read" },
  { href: "/agent", label: "Agent", group: "workspace", capability: "knowledge:read" },
  { href: "/my-submissions", label: "My Submissions", group: "workspace", capability: "submission:read-own" },
]);

const adminItems = Object.freeze([
  { href: "/admin", label: "Administration", group: "admin", capability: "submission:read-all" },
  { href: "/admin/submissions", label: "Review Queue", group: "admin", capability: "knowledge:review" },
  { href: "/admin/members", label: "Members", group: "admin", capability: "member:manage" },
  { href: "/admin/spaces", label: "Spaces", group: "admin", capability: "space:manage" },
  { href: "/admin/audit", label: "Audit", group: "admin", capability: "audit:read" },
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
