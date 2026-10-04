import { useEffect, useMemo, useRef, useState } from "react";
import { PERMISSION_BITS, capabilitiesForMask, hasPermission, parsePermissionMask, permissionMaskFor, type PermissionKey } from "../../../src/authorization/permission-bitmap";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { useCreateDraft } from "../../lib/use-create-draft";
import { discardBlockedAdminRoleDraft, loadAdminRoleDraft, persistAdminRoleDraft } from "../../lib/admin-role-draft";
import { WORKSPACE_LOCATION_CHANGE_EVENT } from "../../lib/workspace-location";
import type { AdminRole } from "../../lib/admin-roles-data";

type RolePageState = { kind: "loading" } | { kind: "error" | "forbidden"; message?: string } | { kind: "ready"; roles: readonly AdminRole[] };

const workbenchKeys = ["workspace.tasks", "workspace.vm"] as const satisfies readonly PermissionKey[];
const workbenchMask = permissionMaskFor(workbenchKeys);
const groups: ReadonlyArray<{ labelKey: string; keys: readonly PermissionKey[] }> = [
  { labelKey: "ADMIN_ROLES_GROUP_KNOWLEDGE", keys: ["knowledge:read", "knowledge:create", "knowledge:edit", "knowledge:review", "knowledge:publish", "knowledge:delete"] },
  { labelKey: "ADMIN_ROLES_GROUP_SUBMISSIONS", keys: ["submission:create", "submission:read-own", "submission:read-all"] },
  { labelKey: "ADMIN_ROLES_GROUP_GOVERNANCE", keys: ["member:manage", "role:manage", "menu:manage", "space:manage", "audit:read", "analytics:read"] },
  { labelKey: "ADMIN_ROLES_GROUP_OPERATIONS", keys: ["asset:manage", "duplicate:review", "agent:use", "search:use", "workspace.tasks", "workspace.vm"] },
];

export function AdminRolesPage({ onLoadRetry, state, locale, onSelect, onSave, onCreate, onAssignMember, onUnassignMember, saving = false, writeBlocked = false, readPending = false, readRequired = false, saveError, recordBlocked = false, onDiscardRecord, draftMemberId, suppressDraft = false }: { onLoadRetry?: () => void; state: RolePageState; locale?: LocaleRuntime; onSelect?: (id: string) => void; onSave?: (role: AdminRole, allowBits: string) => void; onCreate?: (input: { key: string; name: string; allowBits: string }) => Promise<boolean> | void; onAssignMember?: (role: AdminRole, memberId: string) => Promise<boolean> | void; onUnassignMember?: (role: AdminRole, memberId: string) => Promise<boolean> | void; saving?: boolean; writeBlocked?: boolean; readPending?: boolean; readRequired?: boolean; saveError?: string | null; recordBlocked?: boolean; onDiscardRecord?: () => void; draftMemberId?: string; suppressDraft?: boolean }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind !== "ready") return <PageState kind={state.kind} title={state.message || frontendText(locale, "ADMIN_ROLES_UNAVAILABLE")} >{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>;
  if (!state.roles.length) return <PageState kind="empty" title={frontendText(locale, "ADMIN_ROLES_EMPTY")} description={frontendText(locale, "ADMIN_ROLES_DESCRIPTION")} />;
  return <><RoleEditor roles={state.roles} locale={locale} onSelect={onSelect} onSave={onSave} onCreate={onCreate} onAssignMember={onAssignMember} onUnassignMember={onUnassignMember} saving={saving} writeBlocked={writeBlocked} saveError={saveError} draftMemberId={draftMemberId} suppressDraft={suppressDraft} />{recordBlocked && <div role="alert" data-role-write-record-blocked className="space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_ROLES_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardRecord}>{frontendText(locale, "ADMIN_ROLES_RECORD_DISCARD")}</Button></div>}{(readRequired || saveError) && <div className="space-y-2"><p role="status">{frontendText(locale, "ADMIN_ROLES_READ_REQUIRED")}</p><Button type="button" variant="outline" disabled={readPending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}</>;
}

function RoleEditor({ roles, locale, onSelect, onSave, onCreate, onAssignMember, onUnassignMember, saving, writeBlocked, saveError, draftMemberId, suppressDraft }: { roles: readonly AdminRole[]; locale?: LocaleRuntime; onSelect?: (id: string) => void; onSave?: (role: AdminRole, allowBits: string) => void; onCreate?: (input: { key: string; name: string; allowBits: string }) => Promise<boolean> | void; onAssignMember?: (role: AdminRole, memberId: string) => Promise<boolean> | void; onUnassignMember?: (role: AdminRole, memberId: string) => Promise<boolean> | void; saving: boolean; writeBlocked: boolean; saveError?: string | null; draftMemberId?: string; suppressDraft: boolean }) {
  const [composer] = useState(() => !draftMemberId || suppressDraft ? { kind: "empty" as const } : loadAdminRoleDraft(draftMemberId));
  const restored = composer.kind === "ready" && roles.some((role) => role.id === composer.draft.roleId) ? composer.draft : null;
  const [draftBlocked, setDraftBlocked] = useState(composer.kind === "blocked" || (composer.kind === "ready" && !restored));
  const [draftNotice, setDraftNotice] = useState<string>();
  const [selectedId, setSelectedId] = useState(restored?.roleId ?? roles[0]!.id);
  const selected = roles.find((role) => role.id === selectedId) || roles[0]!;
  const initialMask = useMemo(() => parsePermissionMask(selected.allowBits), [selected.allowBits]);
  type Action = { kind: "save" } | { kind: "assign" | "unassign"; memberId: string } | { kind: "switch"; nextId: string };
  type Confirmation = { action: Action; roles: typeof roles; role: AdminRole; mask: bigint; memberDraft: string };
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const locked = saving || writeBlocked;
  const blank = (allowBits: string) => ({ mask: allowBits, memberId: "", newKey: "", newName: "", newMask: "0x0" });
  const restoredFields = restored && restored.roleId === selected.id
    ? { mask: restored.mask, memberId: restored.memberId, newKey: restored.newKey, newName: restored.newName, newMask: restored.newMask }
    : blank(selected.allowBits);
  const draft = useCreateDraft(restoredFields, blank(selected.allowBits),
    () => locked || confirmationRef.current !== null, locale, () => false);
  useEffect(() => {
    if (!draftMemberId || draftBlocked || suppressDraft) return;
    const fields = draft.fields;
    const dirty = fields.mask.toLowerCase() !== selected.allowBits.toLowerCase() || fields.memberId !== "" || fields.newKey !== "" || fields.newName !== "" || fields.newMask !== "0x0";
    const saved = persistAdminRoleDraft(draftMemberId, dirty ? { roleId: selected.id, mask: fields.mask, memberId: fields.memberId, newKey: fields.newKey, newName: fields.newName, newMask: fields.newMask } : null);
    setDraftNotice(saved ? undefined : frontendText(locale, "ADMIN_ROLE_DRAFT_NOT_RECORDED"));
  }, [draft.fields.mask, draft.fields.memberId, draft.fields.newKey, draft.fields.newName, draft.fields.newMask, selected.id, selected.allowBits, draftBlocked, suppressDraft, draftMemberId, locale]);
  useEffect(() => {
    const clearOnLeave = () => { if (draftMemberId && !draftBlocked && !suppressDraft) persistAdminRoleDraft(draftMemberId, null); };
    window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
    return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
  }, [draftMemberId, draftBlocked, suppressDraft]);
  const discardDraft = () => { if (!draftMemberId || !draftBlocked || !discardBlockedAdminRoleDraft(draftMemberId)) return; setDraftBlocked(false); setDraftNotice(undefined); };
  const { memberId, newKey, newName, newMask } = draft.fields;
  const mask = parsePermissionMask(draft.fields.mask);
  const authoritative = useRef({ id: selected.id, mask: initialMask });
  // A list refresh (e.g. after creation) must not consume independent edits.
  // Only a clean/accepted permission draft follows the new server baseline.
  useEffect(() => {
    const current = parsePermissionMask(draft.current.current.mask);
    if (authoritative.current.id !== selected.id || current === authoritative.current.mask || current === initialMask) {
      draft.set("mask", selected.allowBits);
    }
    authoritative.current = { id: selected.id, mask: initialMask };
    draft.checkpoint(blank(selected.allowBits));
  }, [roles, selected.id, selected.allowBits]);
  const setMemberId = (value: string) => draft.edit("memberId", value);
  const setNewKey = (value: string) => draft.edit("newKey", value);
  const setNewName = (value: string) => draft.edit("newName", value);
  const setNewMask = (value: string) => draft.edit("newMask", value);
  const switchRole = (id: string) => {
    const next = roles.find((role) => role.id === id);
    if (!next || locked || draft.isConfirming()) return;
    latestRole.current = id; setSelectedId(id);
    draft.set("memberId", ""); draft.set("mask", next.allowBits);
    draft.checkpoint(blank(next.allowBits));
    onSelect?.(id);
  };
  const added = mask & ~initialMask;
  const removed = initialMask & ~mask;
  // A system administrator already owns every menu bit and cannot drop any.
  // Missing workbench bits are the one grant that account can add to itself.
  const canGrantWorkbench = (key: PermissionKey) => selected.isSystem && selected.key === "admin" && (workbenchKeys as readonly string[]).includes(key) && !hasPermission(initialMask, PERMISSION_BITS[key]);
  const systemWorkbenchGrant = selected.isSystem && selected.key === "admin" && removed === 0n && added !== 0n && (added & ~workbenchMask) === 0n;
  const toggle = (key: PermissionKey) => {
    if (locked || (selected.isSystem && !canGrantWorkbench(key))) return;
    const bit = PERMISSION_BITS[key]; const current = parsePermissionMask(draft.current.current.mask);
    draft.edit("mask", `0x${(hasPermission(current, bit) ? current & ~(1n << BigInt(bit)) : current | (1n << BigInt(bit))).toString(16)}`);
  };
  const assignedMemberIds = selected.assignedMemberIds ?? [];
  const dirtyPermissions = mask !== initialMask;
  const mounted = useRef(false);
  const latestRole = useRef(selected.id); latestRole.current = selected.id;
  const creating = useRef(false);
  const createRole = async () => {
    if (!mounted.current || locked || creating.current || confirmationRef.current || draft.isConfirming() || !onCreate) return;
    const input = { ...draft.current.current };
    if (!input.newKey || !input.newName) return;
    creating.current = true;
    try {
      if (await onCreate({ key: input.newKey, name: input.newName, allowBits: input.newMask }) !== true || !mounted.current) return;
      const current = draft.current.current;
      if (current.newKey !== input.newKey || current.newName !== input.newName || current.newMask !== input.newMask) return;
      draft.set("newKey", ""); draft.set("newName", ""); draft.set("newMask", "0x0");
    } finally { creating.current = false; }
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; confirmationRef.current = null; }; }, []);
  const validConfirmation = !!(confirmation && !locked && roles === confirmation.roles && selected === confirmation.role
    && mask === confirmation.mask && memberId === confirmation.memberDraft);
  const cancelConfirmation = () => { confirmationRef.current = null; setConfirmation(null); };
  useEffect(() => { if (confirmation && !validConfirmation) cancelConfirmation(); }, [confirmation, validConfirmation]);
  const requestConfirmation = (action: Action) => {
    if (!mounted.current || locked || confirmationRef.current || draft.isConfirming()) return;
    if (action.kind !== "switch" && selected.isSystem && !(action.kind === "save" && systemWorkbenchGrant)) return;
    if ((action.kind === "assign" || action.kind === "unassign") && parsePermissionMask(draft.current.current.mask) !== initialMask) return;
    if (action.kind === "assign") action = { ...action, memberId: draft.current.current.memberId.trim() };
    if (action.kind === "save" && !onSave) return;
    if (action.kind === "assign" && (!onAssignMember || !action.memberId || assignedMemberIds.includes(action.memberId))) return;
    if (action.kind === "unassign" && (!onUnassignMember || !assignedMemberIds.includes(action.memberId))) return;
    const next = { action, roles, role: selected, mask: parsePermissionMask(draft.current.current.mask), memberDraft: draft.current.current.memberId };
    confirmationRef.current = next; setConfirmation(next);
  };
  const selectRole = (id: string) => {
    if (locked || draft.isConfirming() || confirmationRef.current || id === selected.id || !roles.some(role => role.id === id)) return;
    if (parsePermissionMask(draft.current.current.mask) !== initialMask || draft.current.current.memberId.trim()) requestConfirmation({ kind: "switch", nextId: id });
    else switchRole(id);
  };
  const confirmAction = async () => {
    if (!mounted.current || draft.isConfirming() || !validConfirmation || !confirmation || confirmationRef.current !== confirmation
      || parsePermissionMask(draft.current.current.mask) !== confirmation.mask || draft.current.current.memberId !== confirmation.memberDraft) return;
    const { action, role, mask: confirmedMask, memberDraft } = confirmation;
    // Consume the confirmation synchronously before the route admits the write.
    cancelConfirmation();
    if (action.kind === "switch") switchRole(action.nextId);
    else if (action.kind === "save") onSave?.(role, `0x${confirmedMask.toString(16)}`);
    else if (action.kind === "unassign") void onUnassignMember?.(role, action.memberId);
    else if (await onAssignMember?.(role, action.memberId) === true && mounted.current
      && latestRole.current === role.id && draft.current.current.memberId === memberDraft) draft.set("memberId", "");
  };
  const action = confirmation?.action;
  const confirmationTitle = frontendText(locale, action?.kind === "switch" ? "ADMIN_ROLES_DISCARD_TITLE"
    : action?.kind === "assign" ? "ADMIN_ROLES_ASSIGN_CONFIRM_TITLE" : action?.kind === "unassign" ? "ADMIN_ROLES_UNASSIGN_CONFIRM_TITLE" : "ADMIN_ROLES_SAVE_CONFIRM_TITLE");
  const permissionNames = (value: bigint) => capabilitiesForMask(value).map(key => frontendText(locale, permissionLabelKey(key))).join(", ") || frontendText(locale, "ADMIN_ROLES_NO_PERMISSION_CHANGE");
  const confirmationDescription = action?.kind === "switch"
    ? `${selected.name} → ${roles.find(role => role.id === action.nextId)?.name || action.nextId}. ${frontendText(locale, "ADMIN_ROLES_DISCARD_IMPACT")}`
    : action?.kind === "assign" || action?.kind === "unassign"
      ? `${selected.name} · ${action.memberId}. ${frontendText(locale, action.kind === "assign" ? "ADMIN_ROLES_ASSIGN_IMPACT" : "ADMIN_ROLES_UNASSIGN_IMPACT")}`
      : `${selected.name} · ${selected.memberCount} ${frontendText(locale, "ADMIN_ROLES_MEMBERS")}. ${frontendText(locale, "ADMIN_ROLES_SAVE_IMPACT")} ${selected.allowBits} → 0x${mask.toString(16)}. ${frontendText(locale, "ADMIN_ROLES_ADDED_PERMISSIONS")}: ${permissionNames(added)}. ${frontendText(locale, "ADMIN_ROLES_REMOVED_PERMISSIONS")}: ${permissionNames(removed)}.`;

  return <><section className="space-y-6" inert={validConfirmation} aria-hidden={validConfirmation || undefined}>
    {draftBlocked && <div role="alert" data-role-draft-blocked className="space-y-2 text-sm"><p>{frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={discardDraft}>{frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_DISCARD")}</Button></div>}
    {draftNotice && <p role="alert" className="text-sm">{draftNotice}</p>}
    <div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_EYEBROW")}</p><h1 className="mt-2 text-2xl font-semibold">{frontendText(locale, "ADMIN_ROLES_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_DESCRIPTION")}</p></div>
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <Card><CardHeader><CardTitle className="text-sm">{frontendText(locale, "ADMIN_ROLES_LIST")}</CardTitle></CardHeader><CardContent className="space-y-1 p-2">{roles.map((role) => <button key={role.id} type="button" disabled={locked} onClick={() => selectRole(role.id)} className={`flex w-full items-start justify-between rounded-md px-3 py-2 text-left text-sm ${role.id === selected.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}><span><span className="block font-medium">{role.name}</span><span className="text-xs text-muted-foreground">{role.memberCount} {frontendText(locale, "ADMIN_ROLES_MEMBERS")}</span></span>{role.isSystem && <Badge variant="outline">{frontendText(locale, "ADMIN_ROLES_SYSTEM")}</Badge>}</button>)}<div className="mt-3 space-y-2 border-t p-2"><p className="text-xs font-medium">{frontendText(locale, "ADMIN_ROLES_CREATE")}</p><Input disabled={locked} className="h-8" value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder={frontendText(locale, "ADMIN_ROLES_KEY_PLACEHOLDER")} aria-label={frontendText(locale, "ADMIN_ROLES_KEY")} /><Input disabled={locked} className="h-8" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={frontendText(locale, "ADMIN_ROLES_NAME_PLACEHOLDER")} aria-label={frontendText(locale, "ADMIN_ROLES_NAME")} /><Input disabled={locked} className="h-8" value={newMask} onChange={(event) => setNewMask(event.target.value)} placeholder="0x0" aria-label={frontendText(locale, "ADMIN_ROLES_MASK")} /><Button type="button" size="sm" disabled={locked || !newKey || !newName} onClick={() => { void createRole(); }}>{frontendText(locale, "ADMIN_ROLES_CREATE")}</Button></div></CardContent></Card>
      <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{selected.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selected.description || frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</p></div><code className="rounded bg-muted px-2 py-1 text-xs">0x{mask.toString(16)}</code></div></CardHeader><CardContent className="space-y-6">{groups.map((group) => { const selectedCount = group.keys.filter((key) => hasPermission(mask, PERMISSION_BITS[key])).length; return <fieldset key={group.labelKey} className="space-y-3"><legend className="flex items-center gap-2 text-sm font-semibold"><span>{frontendText(locale, group.labelKey)}</span><span className="text-xs font-normal text-muted-foreground">{selectedCount}/{group.keys.length} {frontendText(locale, "ADMIN_ROLES_SELECTED")}</span></legend><div className="grid gap-2 sm:grid-cols-2">{group.keys.map((key) => <label key={key} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"><Checkbox checked={hasPermission(mask, PERMISSION_BITS[key])} onChange={() => toggle(key)} disabled={(selected.isSystem && !canGrantWorkbench(key)) || locked} aria-label={frontendText(locale, permissionLabelKey(key))} /><span className="min-w-0"><span className="block truncate">{frontendText(locale, permissionLabelKey(key))}</span><code className="text-[10px] text-muted-foreground">{key}</code></span></label>)}</div></fieldset>; })}<fieldset className="space-y-3 border-t pt-5">{dirtyPermissions && <p role="status" className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_DIRTY_MEMBERSHIP")}</p>}<legend className="text-sm font-semibold">{frontendText(locale, "ADMIN_ROLES_ASSIGNED_MEMBERS")}</legend>{dirtyPermissions && <p role="status" className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_DIRTY_MEMBERSHIP")}</p>}<div className="flex flex-wrap gap-2">{assignedMemberIds.length ? assignedMemberIds.map((id) => <span key={id} className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"><code>{id}</code>{!selected.isSystem && <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-xs" disabled={locked || dirtyPermissions || !onUnassignMember} onClick={() => requestConfirmation({ kind: "unassign", memberId: id })}>{frontendText(locale, "ADMIN_ROLES_UNASSIGN_MEMBER")}</Button>}</span>) : <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_NO_ASSIGNED_MEMBERS")}</p>}</div>{!selected.isSystem && <div className="flex flex-col gap-2 sm:flex-row"><Input disabled={locked} value={memberId} onChange={(event) => setMemberId(event.target.value)} placeholder={frontendText(locale, "ADMIN_ROLES_MEMBER_ID_PLACEHOLDER")} aria-label={frontendText(locale, "ADMIN_ROLES_ASSIGNED_MEMBERS")} /><Button type="button" disabled={locked || dirtyPermissions || !onAssignMember || !memberId.trim() || assignedMemberIds.includes(memberId.trim())} onClick={() => requestConfirmation({ kind: "assign", memberId: memberId.trim() })}>{frontendText(locale, "ADMIN_ROLES_ASSIGN_MEMBER")}</Button></div>}</fieldset>{saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}<Button type="button" disabled={(selected.isSystem && !systemWorkbenchGrant) || locked || !onSave} onClick={() => requestConfirmation({ kind: "save" })}>{saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_SAVE")}</Button></CardContent></Card>
    </div>
  </section><ConfirmAction open={validConfirmation} title={confirmationTitle} description={confirmationDescription}
    cancelLabel={frontendText(locale, "COMMON_CANCEL")}
    confirmLabel={frontendText(locale, action?.kind === "switch" ? "ADMIN_ROLES_DISCARD_CONFIRM" : "ADMIN_ROLES_APPLY_CONFIRM")}
    destructive={action?.kind === "switch" || action?.kind === "unassign" || (action?.kind === "save" && removed !== 0n)}
    onCancel={cancelConfirmation} onConfirm={() => { void confirmAction(); }} />{draft.confirmation}</>;
}

function permissionLabelKey(key: PermissionKey): string {
  return `ADMIN_ROLES_PERMISSION_${key.replace(/[:.]/gu, "_").replaceAll("-", "_").toUpperCase()}`;
}
