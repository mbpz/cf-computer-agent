import { useMemo, useState } from "react";
import { PERMISSION_BITS, capabilitiesForMask, hasPermission, parsePermissionMask, type PermissionKey } from "../../../src/authorization/permission-bitmap";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
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

export function AdminRolesPage({ state, locale, onSelect, onSave, onCreate, onAssignMember, onUnassignMember, saving = false, saveError }: { state: RolePageState; locale?: LocaleRuntime; onSelect?: (id: string) => void; onSave?: (role: AdminRole, allowBits: string) => void; onCreate?: (input: { key: string; name: string; allowBits: string }) => void; onAssignMember?: (role: AdminRole, memberId: string) => void; onUnassignMember?: (role: AdminRole, memberId: string) => void; saving?: boolean; saveError?: string | null }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "ADMIN_ROLES_UNAVAILABLE")} />;
  if (!state.roles.length) return <PageState kind="empty" title={frontendText(locale, "ADMIN_ROLES_EMPTY")} description={frontendText(locale, "ADMIN_ROLES_DESCRIPTION")} />;
  return <RoleEditor roles={state.roles} locale={locale} onSelect={onSelect} onSave={onSave} onCreate={onCreate} onAssignMember={onAssignMember} onUnassignMember={onUnassignMember} saving={saving} saveError={saveError} />;
}

function RoleEditor({ roles, locale, onSelect, onSave, onCreate, onAssignMember, onUnassignMember, saving, saveError }: { roles: readonly AdminRole[]; locale?: LocaleRuntime; onSelect?: (id: string) => void; onSave?: (role: AdminRole, allowBits: string) => void; onCreate?: (input: { key: string; name: string; allowBits: string }) => void; onAssignMember?: (role: AdminRole, memberId: string) => void; onUnassignMember?: (role: AdminRole, memberId: string) => void; saving: boolean; saveError?: string | null }) {
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
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newMask, setNewMask] = useState("0x0");
  const [memberId, setMemberId] = useState("");
  const assignedMemberIds = selected.assignedMemberIds ?? [];
  return <section className="space-y-6">
    <div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_EYEBROW")}</p><h1 className="mt-2 text-2xl font-semibold">{frontendText(locale, "ADMIN_ROLES_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_DESCRIPTION")}</p></div>
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <Card><CardHeader><CardTitle className="text-sm">{frontendText(locale, "ADMIN_ROLES_LIST")}</CardTitle></CardHeader><CardContent className="space-y-1 p-2">{roles.map((role) => <button key={role.id} type="button" onClick={() => selectRole(role.id)} className={`flex w-full items-start justify-between rounded-md px-3 py-2 text-left text-sm ${role.id === selected.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}><span><span className="block font-medium">{role.name}</span><span className="text-xs text-muted-foreground">{role.memberCount} {frontendText(locale, "ADMIN_ROLES_MEMBERS")}</span></span>{role.isSystem && <Badge variant="outline">{frontendText(locale, "ADMIN_ROLES_SYSTEM")}</Badge>}</button>)}<div className="mt-3 space-y-2 border-t p-2"><p className="text-xs font-medium">{frontendText(locale, "ADMIN_ROLES_CREATE")}</p><input className="h-8 w-full rounded-md border px-2 text-sm" value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder={frontendText(locale, "ADMIN_ROLES_KEY_PLACEHOLDER")} aria-label={frontendText(locale, "ADMIN_ROLES_KEY")} /><input className="h-8 w-full rounded-md border px-2 text-sm" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={frontendText(locale, "ADMIN_ROLES_NAME_PLACEHOLDER")} aria-label={frontendText(locale, "ADMIN_ROLES_NAME")} /><input className="h-8 w-full rounded-md border px-2 text-sm" value={newMask} onChange={(event) => setNewMask(event.target.value)} placeholder="0x0" aria-label={frontendText(locale, "ADMIN_ROLES_MASK")} /><Button type="button" size="sm" disabled={saving || !newKey || !newName} onClick={() => { onCreate?.({ key: newKey, name: newName, allowBits: newMask }); setNewKey(""); setNewName(""); }}>{frontendText(locale, "ADMIN_ROLES_CREATE")}</Button></div></CardContent></Card>
      <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{selected.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selected.description || frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</p></div><code className="rounded bg-muted px-2 py-1 text-xs">0x{mask.toString(16)}</code></div></CardHeader><CardContent className="space-y-6">{groups.map((group) => { const selectedCount = group.keys.filter((key) => hasPermission(mask, PERMISSION_BITS[key])).length; return <fieldset key={group.labelKey} className="space-y-3"><legend className="flex items-center gap-2 text-sm font-semibold"><span>{frontendText(locale, group.labelKey)}</span><span className="text-xs font-normal text-muted-foreground">{selectedCount}/{group.keys.length} {frontendText(locale, "ADMIN_ROLES_SELECTED")}</span></legend><div className="grid gap-2 sm:grid-cols-2">{group.keys.map((key) => <label key={key} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"><Checkbox checked={hasPermission(mask, PERMISSION_BITS[key])} onChange={() => toggle(key)} disabled={selected.isSystem || saving} aria-label={frontendText(locale, permissionLabelKey(key))} /><span className="min-w-0"><span className="block truncate">{frontendText(locale, permissionLabelKey(key))}</span><code className="text-[10px] text-muted-foreground">{key}</code></span></label>)}</div></fieldset>; })}<fieldset className="space-y-3 border-t pt-5"><legend className="text-sm font-semibold">{frontendText(locale, "ADMIN_ROLES_ASSIGNED_MEMBERS")}</legend><div className="flex flex-wrap gap-2">{assignedMemberIds.length ? assignedMemberIds.map((id) => <span key={id} className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"><code>{id}</code>{!selected.isSystem && <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-xs" disabled={saving} onClick={() => onUnassignMember?.(selected, id)}>{frontendText(locale, "ADMIN_ROLES_UNASSIGN_MEMBER")}</Button>}</span>) : <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_NO_ASSIGNED_MEMBERS")}</p>}</div>{!selected.isSystem && <div className="flex flex-col gap-2 sm:flex-row"><Input value={memberId} onChange={(event) => setMemberId(event.target.value)} placeholder={frontendText(locale, "ADMIN_ROLES_MEMBER_ID_PLACEHOLDER")} aria-label={frontendText(locale, "ADMIN_ROLES_ASSIGNED_MEMBERS")} /><Button type="button" disabled={saving || !memberId.trim()} onClick={() => { const id = memberId.trim(); onAssignMember?.(selected, id); setMemberId(""); }}>{frontendText(locale, "ADMIN_ROLES_ASSIGN_MEMBER")}</Button></div>}</fieldset>{saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}<Button type="button" disabled={selected.isSystem || saving} onClick={() => onSave?.(selected, `0x${mask.toString(16)}`)}>{saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_SAVE")}</Button></CardContent></Card>
    </div>
  </section>;
}

function permissionLabelKey(key: PermissionKey): string {
  return `ADMIN_ROLES_PERMISSION_${key.replace(":", "_").replaceAll("-", "_").toUpperCase()}`;
}
