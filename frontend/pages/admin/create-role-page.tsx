import { useEffect, useRef, useState } from "react";
import { PERMISSION_BITS, hasPermission, parsePermissionMask, type PermissionKey } from "../../../src/authorization/permission-bitmap";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/motion/input";
import { Checkbox } from "../../components/motion/checkbox";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { useCreateDraft } from "../../lib/use-create-draft";
import { discardBlockedAdminRoleDraft, loadAdminRoleDraft, persistAdminRoleDraft } from "../../lib/admin-role-draft";
import { WORKSPACE_LOCATION_CHANGE_EVENT, writeWorkspaceHistory } from "../../lib/workspace-location";
import { permissionGroups, permissionLabelKey } from "./role-permission-groups";

export interface AdminRoleCreatePageProps {
  locale: LocaleRuntime;
  onCreate?: (input: { key: string; name: string; allowBits: string }) => Promise<boolean>;
  onCreated?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  writeBlocked?: boolean;
  saveError?: string | null;
  recordBlocked?: boolean;
  onDiscardRecord?: () => void;
  readRequired?: boolean;
  readPending?: boolean;
  onLoadRetry?: () => void;
  draftMemberId?: string;
  suppressDraft?: boolean;
}

const CREATE_DRAFT_ROLE = "new";
const blank = { newKey: "", newName: "", newMask: "0x0" };

/** Role creation gets its own route: a beUI form that navigates back to the list once the write lands. */
export function AdminRoleCreatePage({ locale, onCreate, onCreated, onCancel, saving = false, writeBlocked = false, saveError, recordBlocked = false, onDiscardRecord, readRequired = false, readPending = false, onLoadRetry, draftMemberId, suppressDraft = false }: AdminRoleCreatePageProps) {
  const [composer] = useState(() => !draftMemberId || suppressDraft ? { kind: "empty" as const } : loadAdminRoleDraft(draftMemberId));
  const restored = composer.kind === "ready" && composer.draft.roleId === CREATE_DRAFT_ROLE ? composer.draft : null;
  const [draftBlocked, setDraftBlocked] = useState(composer.kind === "blocked" || (composer.kind === "ready" && !restored));
  const [draftNotice, setDraftNotice] = useState<string>();
  const locked = saving || writeBlocked;
  const creating = useRef(false);
  const mounted = useRef(false);
  const restoredFields = restored ? { newKey: restored.newKey, newName: restored.newName, newMask: restored.newMask } : blank;
  const draft = useCreateDraft(restoredFields, blank, () => locked, locale, () => false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!draftMemberId || draftBlocked || suppressDraft) return;
    const fields = draft.fields;
    const dirty = fields.newKey !== "" || fields.newName !== "" || fields.newMask.toLowerCase() !== "0x0";
    const saved = persistAdminRoleDraft(draftMemberId, dirty ? { roleId: CREATE_DRAFT_ROLE, mask: "0x0", memberId: "", newKey: fields.newKey, newName: fields.newName, newMask: fields.newMask } : null);
    setDraftNotice(saved ? undefined : frontendText(locale, "ADMIN_ROLE_DRAFT_NOT_RECORDED"));
  }, [draft.fields.newKey, draft.fields.newName, draft.fields.newMask, draftBlocked, suppressDraft, draftMemberId, locale]);
  useEffect(() => {
    const clearOnLeave = () => { if (draftMemberId && !draftBlocked && !suppressDraft) persistAdminRoleDraft(draftMemberId, null); };
    window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
    return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
  }, [draftMemberId, draftBlocked, suppressDraft]);
  const discardDraft = () => { if (!draftMemberId || !draftBlocked || !discardBlockedAdminRoleDraft(draftMemberId)) return; setDraftBlocked(false); setDraftNotice(undefined); };
  const { newKey, newName, newMask } = draft.fields;
  const mask = (() => { try { return parsePermissionMask(newMask); } catch { return 0n; } })();
  const toggle = (key: PermissionKey) => {
    const bit = PERMISSION_BITS[key];
    draft.edit("newMask", `0x${(hasPermission(mask, bit) ? mask & ~(1n << BigInt(bit)) : mask | (1n << BigInt(bit))).toString(16)}`);
  };
  const submit = async () => {
    if (!mounted.current || locked || creating.current || draft.isConfirming() || !onCreate) return;
    const input = { ...draft.current.current };
    if (!input.newKey || !input.newName) return;
    creating.current = true;
    try {
      if (await onCreate({ key: input.newKey, name: input.newName, allowBits: input.newMask }) !== true || !mounted.current) return;
      const current = draft.current.current;
      // A late success must not erase input newer than the snapshot it submitted.
      if (current.newKey !== input.newKey || current.newName !== input.newName || current.newMask !== input.newMask) return;
      draft.reset();
      onCreated?.();
    } finally { creating.current = false; }
  };
  const back = () => (onCancel ? onCancel() : writeWorkspaceHistory("push", "/admin/roles"));

  return <section className="mx-auto flex w-full max-w-2xl flex-col gap-5">
    <div>
      <Button type="button" variant="ghost" size="sm" onClick={back}>← {frontendText(locale, "ADMIN_ROLES_LIST")}</Button>
      <p className="mt-3 text-sm font-medium text-primary">{frontendText(locale, "ADMIN_EYEBROW")}</p>
      <h1 className="mt-2 text-2xl font-semibold">{frontendText(locale, "ADMIN_ROLES_CREATE")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_ROLES_DESCRIPTION")}</p>
    </div>
    {draftBlocked && <div role="alert" data-role-draft-blocked className="space-y-2 text-sm"><p>{frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={discardDraft}>{frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_DISCARD")}</Button></div>}
    {draftNotice && <p role="alert" className="text-sm">{draftNotice}</p>}
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_ROLES_CREATE")}</CardTitle></CardHeader><CardContent className="space-y-5">
      <Input label={frontendText(locale, "ADMIN_ROLES_KEY")} aria-label={frontendText(locale, "ADMIN_ROLES_KEY")} disabled={locked} value={newKey} onChange={(value) => draft.edit("newKey", value)} />
      <Input label={frontendText(locale, "ADMIN_ROLES_NAME")} aria-label={frontendText(locale, "ADMIN_ROLES_NAME")} disabled={locked} value={newName} onChange={(value) => draft.edit("newName", value)} />
      <Input label={frontendText(locale, "ADMIN_ROLES_MASK")} aria-label={frontendText(locale, "ADMIN_ROLES_MASK")} disabled={locked} value={newMask} onChange={(value) => draft.edit("newMask", value)} />
      {permissionGroups.map((group) => <fieldset key={group.labelKey} className="space-y-3"><legend className="text-sm font-semibold">{frontendText(locale, group.labelKey)}</legend><div className="grid gap-2 sm:grid-cols-2">{group.keys.map((key) => <Checkbox key={key} checked={hasPermission(mask, PERMISSION_BITS[key])} onCheckedChange={() => toggle(key)} disabled={locked} label={frontendText(locale, permissionLabelKey(key))} aria-label={frontendText(locale, permissionLabelKey(key))} />)}</div></fieldset>)}
      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={locked || !onCreate || !newKey || !newName} onClick={() => { void submit(); }}>{saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_CREATE")}</Button>
        <Button type="button" variant="outline" disabled={locked} onClick={back}>{frontendText(locale, "COMMON_CANCEL")}</Button>
      </div>
    </CardContent></Card>
    {recordBlocked && <div role="alert" data-role-write-record-blocked className="space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_ROLES_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardRecord}>{frontendText(locale, "ADMIN_ROLES_RECORD_DISCARD")}</Button></div>}
    {(readRequired || saveError) && <div className="space-y-2"><p role="status">{frontendText(locale, "ADMIN_ROLES_READ_REQUIRED")}</p><Button type="button" variant="outline" disabled={readPending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}
    {draft.confirmation}
  </section>;
}
