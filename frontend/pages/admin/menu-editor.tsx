import { useEffect, useRef, useState } from "react";
import { MENU_LABEL_KEYS } from "../../../shared/admin-menu-fields";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { Button } from "../../components/ui/button";
import type { AdminMenu, AdminMenuCreate, AdminMenuUpdate } from "../../lib/admin-menus-data";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

// A mounted editor owns its initial snapshot. A recovery GET must not rebase it.
export function MenuEditor({ menu, menus, locale, busy, onCancel, onSave }: {
  menu?: AdminMenu; menus: readonly AdminMenu[]; locale?: LocaleRuntime; busy: boolean;
  onCancel: () => void; onSave: (input: AdminMenuCreate | AdminMenuUpdate) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => ({ key: menu?.key ?? "", labelKey: menu?.labelKey ?? "NAV_HOME", path: menu?.path ?? "", parentId: menu?.parentId ?? "", icon: menu?.icon ?? "", groupName: menu?.groupName ?? "workspace", position: String(menu?.position ?? 0), requiredBits: menu?.requiredBits ?? "0x0", status: menu?.status ?? "active", visible: String(menu?.visible ?? true) }));
  const initialDraft = useRef(draft);
  const dirty = Object.keys(draft).some(key => draft[key as keyof typeof draft] !== initialDraft.current[key as keyof typeof draft]);
  const [invalid, setInvalid] = useState(false);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const disabled = busy || pending;
  type Confirmation = { kind: "save"; input: AdminMenuUpdate; draft: typeof draft; menus: typeof menus } | { kind: "discard"; draft: typeof draft };
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const validConfirmation = !!(confirmation && !pending && confirmation.draft === draft
    && (confirmation.kind === "discard" || (!busy && confirmation.menus === menus)));
  const cancelConfirmation = () => { confirmationRef.current = null; setConfirmation(null); };
  useEffect(() => { if (confirmation && !validConfirmation) cancelConfirmation(); }, [confirmation, validConfirmation]);
  useEffect(() => () => { confirmationRef.current = null; }, []);
  const requestConfirmation = (next: Confirmation) => { if (!confirmationRef.current) { confirmationRef.current = next; setConfirmation(next); } };
  const save = async (input: AdminMenuCreate | AdminMenuUpdate) => {
    if (disabled || submitting.current) return;
    submitting.current = true; setPending(true);
    try { await onSave(input); }
    finally { submitting.current = false; setPending(false); }
  };
  const confirmAction = () => {
    if (!validConfirmation || !confirmation || confirmationRef.current !== confirmation) return;
    cancelConfirmation();
    if (confirmation.kind === "discard") onCancel();
    else void save(confirmation.input);
  };

  const height = (node: AdminMenu): number => 1 + Math.max(0, ...node.children.map(height));
  const excluded = new Set<string>();
  const exclude = (node: AdminMenu) => { excluded.add(node.id); node.children.forEach(exclude); };
  if (menu) exclude(menu);
  const parents: AdminMenu[] = [];
  const visit = (nodes: readonly AdminMenu[], depth: number) => nodes.forEach(node => { if (!excluded.has(node.id) && depth + (menu ? height(menu) : 1) <= 4) parents.push(node); visit(node.children, depth + 1); });
  visit(menus, 1);
  const text = (key: string) => frontendText(locale, key);
  const field = (name: keyof typeof draft, label: string, choices?: readonly { value: string; label: string }[]) => <label className="grid gap-1 text-sm" key={name}><span>{text(label)}</span>{choices ? <select className="h-10 rounded-md border bg-background px-3" name={name} value={draft[name]} onChange={event => setDraft({ ...draft, [name]: event.target.value })}>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select> : <input autoFocus={name === (menu ? "path" : "key")} className="h-10 rounded-md border bg-background px-3" name={name} type={name === "position" ? "number" : "text"} min={name === "position" ? 0 : undefined} max={name === "position" ? 10000 : undefined} maxLength={name === "path" ? 200 : 128} value={draft[name]} onChange={event => setDraft({ ...draft, [name]: event.target.value })} />}</label>;
  return <><form inert={validConfirmation || undefined} aria-hidden={validConfirmation || undefined} className="rounded-lg border p-4" aria-label={text(menu ? "ADMIN_MENUS_EDIT" : "ADMIN_MENUS_CREATE")} noValidate onSubmit={async event => {
    event.preventDefault();
    if (disabled || submitting.current || confirmationRef.current) return;
    const position = Number(draft.position);
    const valid = (menu || /^[a-z][a-z0-9_-]{1,63}$/u.test(draft.key)) && draft.position.trim() !== "" && Number.isSafeInteger(position) && position >= 0 && position <= 10000 && (!draft.path || (/^\/[A-Za-z0-9_\-/:.]*$/u.test(draft.path) && draft.path.length <= 200)) && /^0x[0-9a-f]{1,16}$/iu.test(draft.requiredBits) && (!draft.parentId || parents.some(parent => parent.id === draft.parentId));
    if (!valid) { setInvalid(true); return; }
    setInvalid(false);
    const common = { parentId: draft.parentId || null, labelKey: draft.labelKey, path: draft.path || null, position, requiredBits: `0x${BigInt(draft.requiredBits).toString(16)}` };
    if (menu) requestConfirmation({ kind: "save", input: { ...common, status: draft.status as "active" | "disabled", visible: draft.visible === "true" }, draft, menus });
    else await save({ ...common, key: draft.key, icon: draft.icon || null, groupName: draft.groupName as "workspace" | "admin" });
  }}>
    <h2 className="mb-4 font-semibold">{text(menu ? "ADMIN_MENUS_EDIT" : "ADMIN_MENUS_CREATE")}</h2>
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
      {!menu && field("key", "ADMIN_MENUS_KEY")}
      {field("labelKey", "ADMIN_MENUS_LABEL", MENU_LABEL_KEYS.map(key => ({ value: key, label: `${text(key)} · ${key}` })))}
      {field("path", "ADMIN_MENUS_PATH")}
      {field("parentId", "ADMIN_MENUS_PARENT", [{ value: "", label: text("ADMIN_MENUS_ROOT") }, ...parents.map(parent => ({ value: parent.id, label: `${parent.labelKey} · ${parent.key}` }))])}
      {field("position", "ADMIN_MENUS_POSITION")}{field("requiredBits", "ADMIN_MENUS_PERMISSIONS")}
      {!menu && field("icon", "ADMIN_MENUS_ICON")}
      {!menu && field("groupName", "ADMIN_MENUS_GROUP", ["workspace", "admin"].map(value => ({ value, label: text(value === "workspace" ? "SHELL_GROUP_WORKSPACE" : "SHELL_GROUP_ADMIN") })))}
      {menu && field("status", "ADMIN_MENUS_STATUS", ["active", "disabled"].map(value => ({ value, label: text(value === "active" ? "ADMIN_MENUS_ACTIVE" : "ADMIN_MENUS_DISABLED") })))}
      {menu && field("visible", "ADMIN_MENUS_VISIBILITY", ["true", "false"].map(value => ({ value, label: text(value === "true" ? "ADMIN_MENUS_SHOW" : "ADMIN_MENUS_HIDE") })))}
    </fieldset>
    <p className="mt-3 text-sm text-muted-foreground">{text("ADMIN_MENUS_EDITOR_HINT")}</p>
    {invalid && <p role="alert" className="mt-3 text-sm text-destructive">{text("ADMIN_MENUS_INVALID")}</p>}
    <div className="mt-4 flex gap-2"><Button type="submit" disabled={disabled}>{text(menu ? "ADMIN_MENUS_SAVE_FULL" : "ADMIN_MENUS_CREATE_SUBMIT")}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => { if (pending || submitting.current || confirmationRef.current) return; if (dirty) requestConfirmation({ kind: "discard", draft }); else onCancel(); }}>{text("ADMIN_MENUS_CANCEL")}</Button></div>
  </form><ConfirmAction open={validConfirmation}
    title={text(confirmation?.kind === "discard" ? "ADMIN_MENUS_DISCARD_TITLE" : "ADMIN_MENUS_CONFIRM_TITLE")}
    description={confirmation?.kind === "save" && menu ? `${menu.key} · ${menu.path || menu.id}. ${describeMenuChanges(menu, confirmation.input, locale)}` : text("ADMIN_MENUS_DISCARD_IMPACT")}
    cancelLabel={text("COMMON_CANCEL")} confirmLabel={text(confirmation?.kind === "discard" ? "ADMIN_MENUS_DISCARD_CONFIRM" : "ADMIN_MENUS_APPLY_CONFIRM")}
    destructive={confirmation?.kind === "discard" || (confirmation?.kind === "save" && (confirmation.input.status === "disabled" || confirmation.input.visible === false))}
    onCancel={cancelConfirmation} onConfirm={confirmAction} /></>;
}

/** Show only changed fields, while the full original snapshot remains the CAS precondition. */
export function describeMenuChanges(menu: AdminMenu, input: AdminMenuUpdate, locale?: LocaleRuntime): string {
  const fields = { parentId: "ADMIN_MENUS_PARENT", labelKey: "ADMIN_MENUS_LABEL", path: "ADMIN_MENUS_PATH", position: "ADMIN_MENUS_POSITION", requiredBits: "ADMIN_MENUS_PERMISSIONS", status: "ADMIN_MENUS_STATUS", visible: "ADMIN_MENUS_VISIBILITY" } as const;
  const display = (key: keyof typeof fields, value: unknown): string => {
    if (key === "status") return frontendText(locale, value === "active" ? "ADMIN_MENUS_ACTIVE" : "ADMIN_MENUS_DISABLED");
    if (key === "visible") return frontendText(locale, value ? "ADMIN_MENUS_SHOW" : "ADMIN_MENUS_HIDE");
    if (key === "parentId" && value === null) return frontendText(locale, "ADMIN_MENUS_ROOT");
    return value === null ? "—" : String(value);
  };
  const changes = (Object.keys(fields) as (keyof typeof fields)[]).filter(key => input[key] !== undefined && input[key] !== menu[key])
    .map(key => `${frontendText(locale, fields[key])}: ${display(key, menu[key])} → ${display(key, input[key])}`).join("; ");
  return `${frontendText(locale, "ADMIN_MENUS_CHANGE_IMPACT")} ${changes || frontendText(locale, "ADMIN_MENUS_NO_CHANGE")}`;
}
