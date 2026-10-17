/** The two `/admin/members` surfaces: the member table and the invitation records. */
export const ADMIN_MEMBERS_TABS = ["members", "invitations"] as const;
export type AdminMembersTab = typeof ADMIN_MEMBERS_TABS[number];

export function isAdminMembersTab(value: unknown): value is AdminMembersTab {
  return typeof value === "string" && (ADMIN_MEMBERS_TABS as readonly string[]).includes(value);
}

/** Missing, duplicated, or unknown values resolve to the canonical table tab. */
export function parseAdminMembersTab(search: string): AdminMembersTab {
  const values = new URLSearchParams(search).getAll("tab");
  return values.length === 1 && isAdminMembersTab(values[0]) ? values[0] : "members";
}

/** The default tab is omitted; every other search param is preserved. */
export function writeAdminMembersTab(search: string, tab: AdminMembersTab): string {
  const params = new URLSearchParams(search);
  params.delete("tab");
  if (tab !== "members") params.set("tab", tab);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/** Canonical search when the URL carries a non-canonical tab, otherwise null. */
export function normalizeAdminMembersTab(search: string): string | null {
  const values = new URLSearchParams(search).getAll("tab");
  if (!values.length) return null;
  if (values.length === 1 && values[0] === "invitations") return null;
  return writeAdminMembersTab(search, parseAdminMembersTab(search));
}
