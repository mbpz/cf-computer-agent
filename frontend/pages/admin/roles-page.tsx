import { useMemo, useState } from "react";
import { PERMISSION_BITS, capabilitiesForMask, hasPermission, parsePermissionMask, type PermissionKey } from "../../../src/authorization/permission-bitmap";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { AdminRole } from "../../lib/admin-roles-data";

type RolePageState = { kind: "loading" } | { kind: "error"; message?: string } | { kind: "ready"; roles: readonly AdminRole[] };

const groups: ReadonlyArray<{ labelKey: string; keys: readonly PermissionKey[] }> = [
  { labelKey: "ADMIN_ROLES_GROUP_KNOWLEDGE", keys: ["knowledge:read", "knowledge:create", "knowledge:edit", "knowledge:review", "knowledge:publish", "knowledge:delete"] },
  { labelKey: "ADMIN_ROLES_GROUP_SUBMISSIONS", keys: ["submission:create", "submission:read-own", "submission:read-all"] },
  { labelKey: "ADMIN_ROLES_GROUP_GOVERNANCE", keys: ["member:manage", "role:manage", "menu:manage", "space:manage", "audit:read", "analytics:read"] },
  { labelKey: "ADMIN_ROLES_GROUP_OPERATIONS", keys: ["asset:manage", "duplicate:review", "agent:use", "search:use"] },
];

export function AdminRolesPage({ state, locale, onSelect, onSave, saving = false, saveError }: { state: RolePageState; locale?: LocaleRuntime; onSelect?: (id: string) => void; onSave?: (role: AdminRole, allowBits: string) => void; saving?: boolean; saveError?: string | null }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "ADMIN_ROLES_UNAVAILABLE")} />;
  if (!state.roles.length) return <PageState kind="empty" title={frontendText(locale, "ADMIN_ROLES_EMPTY")} description={frontendText(locale, "ADMIN_ROLES_DESCRIPTION")} />;
  return <RoleEditor roles={state.roles} locale={locale} onSelect={onSelect} onSave={onSave} saving={saving} saveError={saveError} />;
}

function RoleEditor({ roles, locale, onSelect, onSave, saving, saveError }: { roles: readonly AdminRole[]; locale?: LocaleRuntime; onSelect?: (id: string) => void; onSave?: (role: AdminRole, allowBits: string) => void; saving: boolean; saveError?: string | null }) {
  const [selectedId, setSelectedId] = useState(roles[0]!.id);
  const selected = roles.find((role) => role.id === selectedId) || roles[0]!;
  const initialMask = useMemo(() => parsePermissionMask(selected.allowBits), [selected.allowBits]);
  const [mask, setMask] = useState(initialMask);
  const selectRole = (id: string) => {
    const next = roles.find((role) => role.id === id);
    if (!next) return;
    setSelectedId(id);
    setMask(parsePermissionMask(next.allowBits));
    onSelect?.(id);
  };
  const toggle = (key: PermissionKey) => {
    const bit = PERMISSION_BITS[key];
    setMask((current) => hasPermission(current, bit) ? current & ~(1n << BigInt(bit)) : current | (1n << BigInt(bit)));
  };
  return <section className="space-y-6">
    <div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_EYEBROW")}</p><h1 className="mt-2 text-2xl font-semibold">{frontendText(locale, "ADMIN_ROLES_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_DESCRIPTION")}</p></div>
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <Card><CardHeader><CardTitle className="text-sm">{frontendText(locale, "ADMIN_ROLES_LIST")}</CardTitle></CardHeader><CardContent className="space-y-1 p-2">{roles.map((role) => <button key={role.id} type="button" onClick={() => selectRole(role.id)} className={`flex w-full items-start justify-between rounded-md px-3 py-2 text-left text-sm ${role.id === selected.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}><span><span className="block font-medium">{role.name}</span><span className="text-xs text-muted-foreground">{role.memberCount} {frontendText(locale, "ADMIN_ROLES_MEMBERS")}</span></span>{role.isSystem && <Badge variant="outline">{frontendText(locale, "ADMIN_ROLES_SYSTEM")}</Badge>}</button>)}</CardContent></Card>
      <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{selected.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selected.description || frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</p></div><code className="rounded bg-muted px-2 py-1 text-xs">0x{mask.toString(16)}</code></div></CardHeader><CardContent className="space-y-6">{groups.map((group) => <fieldset key={group.labelKey} className="space-y-3"><legend className="text-sm font-semibold">{frontendText(locale, group.labelKey)}</legend><div className="grid gap-2 sm:grid-cols-2">{group.keys.map((key) => <label key={key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={hasPermission(mask, PERMISSION_BITS[key])} onChange={() => toggle(key)} disabled={selected.isSystem || saving} /><span>{key}</span></label>)}</div></fieldset>)}{saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}<Button type="button" disabled={selected.isSystem || saving} onClick={() => onSave?.(selected, `0x${mask.toString(16)}`)}>{saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_SAVE")}</Button></CardContent></Card>
    </div>
  </section>;
}
