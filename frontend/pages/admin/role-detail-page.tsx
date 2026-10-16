import { useEffect, useMemo, useRef, useState } from "react";
import { PERMISSION_BITS, capabilitiesForMask, hasPermission, parsePermissionMask, type PermissionKey } from "../../../src/authorization/permission-bitmap";
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
import { WORKSPACE_LOCATION_CHANGE_EVENT, writeWorkspaceHistory } from "../../lib/workspace-location";
import type { AdminRole } from "../../lib/admin-roles-data";
import type { AdminRolesState } from "../../lib/admin-roles-controller";
import { permissionGroups, permissionLabelKey, workbenchKeys, workbenchMask } from "./role-permission-groups";

export interface AdminRoleDetailPageProps {
  state: AdminRolesState;
  roleId: string;
  locale: LocaleRuntime;
  onBack?: () => void;
  onLoadRetry?: () => void;
  onSave?: (role: AdminRole, allowBits: string) => Promise<boolean> | void;
  onAssignMember?: (role: AdminRole, memberId: string) => Promise<boolean> | void;
  onUnassignMember?: (role: AdminRole, memberId: string) => Promise<boolean> | void;
  saving?: boolean;
  writeBlocked?: boolean;
  readPending?: boolean;
  readRequired?: boolean;
  saveError?: string | null;
  recordBlocked?: boolean;
  onDiscardRecord?: () => void;
  draftMemberId?: string;
  suppressDraft?: boolean;
}

/** The permission detail page: one role's matrix and member assignment, saved through the shared controller. */
export function AdminRoleDetailPage({ state, roleId, locale, onBack, onLoadRetry, onSave, onAssignMember, onUnassignMember, saving = false, writeBlocked = false, readPending = false, readRequired = false, saveError, recordBlocked = false, onDiscardRecord, draftMemberId, suppressDraft = false }: AdminRoleDetailPageProps) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind !== "ready") return <PageState kind={state.kind} title={state.message || frontendText(locale, "ADMIN_ROLES_UNAVAILABLE")} >{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>;
  const role = state.roles.find((candidate) => candidate.id === roleId);
  if (!role) return <PageState kind="error" title={frontendText(locale, "ADMIN_ROLE_UNAVAILABLE")} description={frontendText(locale, "ADMIN_ROLES_DESCRIPTION")} >{onBack && <Button type="button" variant="outline" onClick={onBack}>{frontendText(locale, "ADMIN_ROLES_LIST")}</Button>}</PageState>;
  return <RolePermissionEditor state={state} role={role} locale={locale} onBack={onBack} onLoadRetry={onLoadRetry} onSave={onSave} onAssignMember={onAssignMember} onUnassignMember={onUnassignMember} saving={saving} writeBlocked={writeBlocked} readPending={readPending} readRequired={readRequired} saveError={saveError} recordBlocked={recordBlocked} onDiscardRecord={onDiscardRecord} draftMemberId={draftMemberId} suppressDraft={suppressDraft} />;
}

function RolePermissionEditor({ state, role, locale, onBack, onLoadRetry, onSave, onAssignMember, onUnassignMember, saving, writeBlocked, readPending, readRequired, saveError, recordBlocked, onDiscardRecord, draftMemberId, suppressDraft }: Omit<AdminRoleDetailPageProps, "state" | "roleId"> & { state: Extract<AdminRolesState, { kind: "ready" }>; role: AdminRole }) {
  const roles = state.roles;
  const [composer] = useState(() => !draftMemberId || suppressDraft ? { kind: "empty" as const } : loadAdminRoleDraft(draftMemberId));
  const restored = composer.kind === "ready" && composer.draft.roleId === role.id ? composer.draft : null;
  const [draftBlocked, setDraftBlocked] = useState(composer.kind === "blocked" || (composer.kind === "ready" && !restored));
  const [draftNotice, setDraftNotice] = useState<string>();
  const initialMask = useMemo(() => parsePermissionMask(role.allowBits), [role.allowBits]);
  type Action = { kind: "save" } | { kind: "assign" | "unassign"; memberId: string };
  type Confirmation = { action: Action; roles: typeof roles; role: AdminRole; mask: bigint; memberDraft: string };
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const locked = saving || writeBlocked;
  const blank = (allowBits: string) => ({ mask: allowBits, memberId: "" });
  const restoredFields = restored ? { mask: restored.mask, memberId: restored.memberId } : blank(role.allowBits);
  const draft = useCreateDraft(restoredFields, blank(role.allowBits),
    () => locked || confirmationRef.current !== null, locale, () => false);
  useEffect(() => {
    if (!draftMemberId || draftBlocked || suppressDraft) return;
    const fields = draft.fields;
    const dirty = fields.mask.toLowerCase() !== role.allowBits.toLowerCase() || fields.memberId !== "";
    const saved = persistAdminRoleDraft(draftMemberId, dirty ? { roleId: role.id, mask: fields.mask, memberId: fields.memberId, newKey: "", newName: "", newMask: "0x0" } : null);
    setDraftNotice(saved ? undefined : frontendText(locale, "ADMIN_ROLE_DRAFT_NOT_RECORDED"));
  }, [draft.fields.mask, draft.fields.memberId, role.id, role.allowBits, draftBlocked, suppressDraft, draftMemberId, locale]);
  useEffect(() => {
    const clearOnLeave = () => { if (draftMemberId && !draftBlocked && !suppressDraft) persistAdminRoleDraft(draftMemberId, null); };
    window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
    return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
  }, [draftMemberId, draftBlocked, suppressDraft]);
  const discardDraft = () => { if (!draftMemberId || !draftBlocked || !discardBlockedAdminRoleDraft(draftMemberId)) return; setDraftBlocked(false); setDraftNotice(undefined); };
  const { memberId } = draft.fields;
  const mask = parsePermissionMask(draft.fields.mask);
  const authoritative = useRef({ id: role.id, mask: initialMask });
  // A list refresh (e.g. after creation) must not consume independent edits.
  // Only a clean/accepted permission draft follows the new server baseline.
  useEffect(() => {
    const current = parsePermissionMask(draft.current.current.mask);
    if (authoritative.current.id !== role.id || current === authoritative.current.mask || current === initialMask) {
      draft.set("mask", role.allowBits);
    }
    authoritative.current = { id: role.id, mask: initialMask };
    draft.checkpoint(blank(role.allowBits));
  }, [roles, role.id, role.allowBits]);
  const setMemberId = (value: string) => draft.edit("memberId", value);
  const added = mask & ~initialMask;
  const removed = initialMask & ~mask;
  // A system administrator already owns every menu bit and cannot drop any.
  // Missing workbench bits are the one grant that account can add to itself.
  const canGrantWorkbench = (key: PermissionKey) => role.isSystem && role.key === "admin" && (workbenchKeys as readonly string[]).includes(key) && !hasPermission(initialMask, PERMISSION_BITS[key]);
  const systemWorkbenchGrant = role.isSystem && role.key === "admin" && removed === 0n && added !== 0n && (added & ~workbenchMask) === 0n;
  const toggle = (key: PermissionKey) => {
    if (locked || (role.isSystem && !canGrantWorkbench(key))) return;
    const bit = PERMISSION_BITS[key]; const current = parsePermissionMask(draft.current.current.mask);
    draft.edit("mask", `0x${(hasPermission(current, bit) ? current & ~(1n << BigInt(bit)) : current | (1n << BigInt(bit))).toString(16)}`);
  };
  const assignedMemberIds = role.assignedMemberIds ?? [];
  const dirtyPermissions = mask !== initialMask;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; confirmationRef.current = null; }; }, []);
  const validConfirmation = !!(confirmation && !locked && roles === confirmation.roles && role === confirmation.role
    && mask === confirmation.mask && memberId === confirmation.memberDraft);
  const cancelConfirmation = () => { confirmationRef.current = null; setConfirmation(null); };
  useEffect(() => { if (confirmation && !validConfirmation) cancelConfirmation(); }, [confirmation, validConfirmation]);
  const requestConfirmation = (action: Action) => {
    if (!mounted.current || locked || confirmationRef.current || draft.isConfirming()) return;
    if (role.isSystem && !(action.kind === "save" && systemWorkbenchGrant)) return;
    if ((action.kind === "assign" || action.kind === "unassign") && parsePermissionMask(draft.current.current.mask) !== initialMask) return;
    if (action.kind === "assign") action = { ...action, memberId: draft.current.current.memberId.trim() };
    if (action.kind === "save" && !onSave) return;
    if (action.kind === "assign" && (!onAssignMember || !action.memberId || assignedMemberIds.includes(action.memberId))) return;
    if (action.kind === "unassign" && (!onUnassignMember || !assignedMemberIds.includes(action.memberId))) return;
    const next = { action, roles, role, mask: parsePermissionMask(draft.current.current.mask), memberDraft: draft.current.current.memberId };
    confirmationRef.current = next; setConfirmation(next);
  };
  const confirmAction = async () => {
    if (!mounted.current || draft.isConfirming() || !validConfirmation || !confirmation || confirmationRef.current !== confirmation
      || parsePermissionMask(draft.current.current.mask) !== confirmation.mask || draft.current.current.memberId !== confirmation.memberDraft) return;
    const { action, role: target, mask: confirmedMask, memberDraft } = confirmation;
    // Consume the confirmation synchronously before the route admits the write.
    cancelConfirmation();
    if (action.kind === "save") await onSave?.(target, `0x${confirmedMask.toString(16)}`);
    else if (action.kind === "unassign") void onUnassignMember?.(target, action.memberId);
    else if (await onAssignMember?.(target, action.memberId) === true && mounted.current
      && draft.current.current.memberId === memberDraft) draft.set("memberId", "");
  };
  const action = confirmation?.action;
  const confirmationTitle = frontendText(locale, action?.kind === "assign" ? "ADMIN_ROLES_ASSIGN_CONFIRM_TITLE" : action?.kind === "unassign" ? "ADMIN_ROLES_UNASSIGN_CONFIRM_TITLE" : "ADMIN_ROLES_SAVE_CONFIRM_TITLE");
  const permissionNames = (value: bigint) => capabilitiesForMask(value).map(key => frontendText(locale, permissionLabelKey(key))).join(", ") || frontendText(locale, "ADMIN_ROLES_NO_PERMISSION_CHANGE");
  const confirmationDescription = action?.kind === "assign" || action?.kind === "unassign"
    ? `${role.name} · ${action.memberId}. ${frontendText(locale, action.kind === "assign" ? "ADMIN_ROLES_ASSIGN_IMPACT" : "ADMIN_ROLES_UNASSIGN_IMPACT")}`
    : `${role.name} · ${role.memberCount} ${frontendText(locale, "ADMIN_ROLES_MEMBERS")}. ${frontendText(locale, "ADMIN_ROLES_SAVE_IMPACT")} ${role.allowBits} → 0x${mask.toString(16)}. ${frontendText(locale, "ADMIN_ROLES_ADDED_PERMISSIONS")}: ${permissionNames(added)}. ${frontendText(locale, "ADMIN_ROLES_REMOVED_PERMISSIONS")}: ${permissionNames(removed)}.`;

  return <><section className="space-y-6" inert={validConfirmation} aria-hidden={validConfirmation || undefined}>
    {draftBlocked && <div role="alert" data-role-draft-blocked className="space-y-2 text-sm"><p>{frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={discardDraft}>{frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_DISCARD")}</Button></div>}
    {draftNotice && <p role="alert" className="text-sm">{draftNotice}</p>}
    <div>
      <Button type="button" variant="ghost" size="sm" onClick={() => (onBack ? onBack() : writeWorkspaceHistory("push", "/admin/roles"))}>← {frontendText(locale, "ADMIN_ROLES_LIST")}</Button>
      <p className="mt-3 text-sm font-medium text-primary">{frontendText(locale, "ADMIN_EYEBROW")}</p>
      <h1 className="mt-2 text-2xl font-semibold">{frontendText(locale, "ADMIN_ROLES_TITLE")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_DESCRIPTION")}</p>
    </div>
    <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{role.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{role.description || frontendText(locale, "COMMON_VALUE_UNAVAILABLE")}</p></div><div className="flex items-center gap-2">{role.isSystem && <Badge variant="outline">{frontendText(locale, "ADMIN_ROLES_SYSTEM")}</Badge>}<code className="rounded bg-muted px-2 py-1 text-xs">0x{mask.toString(16)}</code></div></div></CardHeader><CardContent className="space-y-6">
      {permissionGroups.map((group) => { const selectedCount = group.keys.filter((key) => hasPermission(mask, PERMISSION_BITS[key])).length; return <fieldset key={group.labelKey} className="space-y-3"><legend className="flex items-center gap-2 text-sm font-semibold"><span>{frontendText(locale, group.labelKey)}</span><span className="text-xs font-normal text-muted-foreground">{selectedCount}/{group.keys.length} {frontendText(locale, "ADMIN_ROLES_SELECTED")}</span></legend><div className="grid gap-2 sm:grid-cols-2">{group.keys.map((key) => <label key={key} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"><Checkbox checked={hasPermission(mask, PERMISSION_BITS[key])} onChange={() => toggle(key)} disabled={(role.isSystem && !canGrantWorkbench(key)) || locked} aria-label={frontendText(locale, permissionLabelKey(key))} /><span className="min-w-0"><span className="block truncate">{frontendText(locale, permissionLabelKey(key))}</span><code className="text-[10px] text-muted-foreground">{key}</code></span></label>)}</div></fieldset>; })}
      <fieldset className="space-y-3 border-t pt-5"><legend className="text-sm font-semibold">{frontendText(locale, "ADMIN_ROLES_ASSIGNED_MEMBERS")}</legend>{dirtyPermissions && <p role="status" className="text-xs text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_DIRTY_MEMBERSHIP")}</p>}<div className="flex flex-wrap gap-2">{assignedMemberIds.length ? assignedMemberIds.map((id) => <span key={id} className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"><code>{id}</code>{!role.isSystem && <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-xs" disabled={locked || dirtyPermissions || !onUnassignMember} onClick={() => requestConfirmation({ kind: "unassign", memberId: id })}>{frontendText(locale, "ADMIN_ROLES_UNASSIGN_MEMBER")}</Button>}</span>) : <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_NO_ASSIGNED_MEMBERS")}</p>}</div>{!role.isSystem && <div className="flex flex-col gap-2 sm:flex-row"><Input disabled={locked} value={memberId} onChange={(event) => setMemberId(event.target.value)} placeholder={frontendText(locale, "ADMIN_ROLES_MEMBER_ID_PLACEHOLDER")} aria-label={frontendText(locale, "ADMIN_ROLES_ASSIGNED_MEMBERS")} /><Button type="button" disabled={locked || dirtyPermissions || !onAssignMember || !memberId.trim() || assignedMemberIds.includes(memberId.trim())} onClick={() => requestConfirmation({ kind: "assign", memberId: memberId.trim() })}>{frontendText(locale, "ADMIN_ROLES_ASSIGN_MEMBER")}</Button></div>}</fieldset>
      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      <Button type="button" disabled={(role.isSystem && !systemWorkbenchGrant) || locked || !onSave} onClick={() => requestConfirmation({ kind: "save" })}>{saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_SAVE")}</Button>
    </CardContent></Card>
  </section><ConfirmAction open={validConfirmation} title={confirmationTitle} description={confirmationDescription}
    cancelLabel={frontendText(locale, "COMMON_CANCEL")}
    confirmLabel={frontendText(locale, "ADMIN_ROLES_APPLY_CONFIRM")}
    destructive={action?.kind === "unassign" || (action?.kind === "save" && removed !== 0n)}
    onCancel={cancelConfirmation} onConfirm={() => { void confirmAction(); }} />{recordBlocked && <div role="alert" data-role-write-record-blocked className="space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_ROLES_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardRecord}>{frontendText(locale, "ADMIN_ROLES_RECORD_DISCARD")}</Button></div>}{(readRequired || saveError) && <div className="space-y-2"><p role="status">{frontendText(locale, "ADMIN_ROLES_READ_REQUIRED")}</p><Button type="button" variant="outline" disabled={readPending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}{draft.confirmation}</>;
}
