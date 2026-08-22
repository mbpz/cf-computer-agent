import { translateEnglish } from "./i18n.js";

const memberItems = Object.freeze([
  { href: "/", labelKey: "NAV_HOME", group: "workspace", capability: null },
  { href: "/submit", labelKey: "NAV_SUBMIT", group: "workspace", capability: "submission:create" },
  { href: "/knowledge", labelKey: "NAV_LIBRARY", group: "workspace", capability: "knowledge:read" },
  { href: "/search", labelKey: "NAV_SEARCH", group: "workspace", capability: "knowledge:read" },
  { href: "/agent", labelKey: "NAV_AGENT", group: "workspace", capability: "knowledge:read" },
  { href: "/my-submissions", labelKey: "NAV_MY_SUBMISSIONS", group: "workspace", capability: "submission:read-own" },
]);

const adminItems = Object.freeze([
  { href: "/admin", labelKey: "NAV_ADMINISTRATION", group: "admin", capability: "submission:read-all" },
  { href: "/admin/submissions", labelKey: "NAV_REVIEW_QUEUE", group: "admin", capability: "knowledge:review" },
  { href: "/admin/members", labelKey: "NAV_MEMBERS", group: "admin", capability: "member:manage" },
  { href: "/admin/spaces", labelKey: "NAV_SPACES", group: "admin", capability: "space:manage" },
  { href: "/admin/audit", labelKey: "NAV_AUDIT", group: "admin", capability: "audit:read" },
]);

/**
 * Returns only destinations permitted by the server-issued session capabilities.
 * Automation has no browser session and therefore receives no navigation.
 */
export function navigationForSession(session, translate = translateEnglish) {
  if (!session?.member || !Array.isArray(session.capabilities)) return [];
  const capabilities = new Set(session.capabilities);
  return [...memberItems, ...adminItems]
    .filter((item) => item.capability === null || capabilities.has(item.capability))
    .map(({ capability: _capability, labelKey, ...item }) => Object.freeze({
      ...item,
      label: translate(labelKey),
    }));
}
