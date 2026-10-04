import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { menuSnapshot } from "../../../shared/admin-menu-fields";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { MenuEditor, describeMenuChanges } from "./menu-editor";
import { useCreateDraft } from "../../lib/use-create-draft";
import type { AdminMenu, AdminMenuCreate, AdminMenuUpdate } from "../../lib/admin-menus-data";

export function AdminMenusPage({ onLoadRetry, state, locale, onUpdate, onDelete, onCreate, pendingId, error, writeBlocked = false, readPending = false, readRequired = false, recordBlocked = false, onDiscardRecord }: { onLoadRetry?: () => void; state: { kind: "loading" } | { kind: "error" | "forbidden"; message?: string } | { kind: "ready"; menus: readonly AdminMenu[] }; locale?: LocaleRuntime; onUpdate?: (menu: AdminMenu, input: AdminMenuUpdate) => Promise<boolean> | void; onCreate?: (input: AdminMenuCreate) => Promise<boolean>; onDelete?: (menu: AdminMenu) => void; pendingId?: string | null; error?: string | null; writeBlocked?: boolean; readPending?: boolean; readRequired?: boolean; recordBlocked?: boolean; onDiscardRecord?: () => void }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind !== "ready") return <PageState kind={state.kind} title={state.message || frontendText(locale, "ADMIN_MENUS_UNAVAILABLE")} >{onLoadRetry && <Button type="button" variant="outline" onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</PageState>;
  return <ReadyMenus menus={state.menus} {...{ locale, onLoadRetry, onUpdate, onDelete, onCreate, pendingId, error, writeBlocked, readPending, readRequired, recordBlocked, onDiscardRecord }} />;
}

type PositionAttempt = { menu: AdminMenu; position: number };
type ReadyProps = Omit<Parameters<typeof AdminMenusPage>[0], "state"> & { menus: readonly AdminMenu[] };
function ReadyMenus({ menus, locale, onLoadRetry, onUpdate, onDelete, onCreate, pendingId, error, writeBlocked, readPending, readRequired, recordBlocked = false, onDiscardRecord }: ReadyProps) {
  const [positionAttempts, setPositionAttempts] = useState<Record<string, PositionAttempt>>({});
  const [editor, setEditor] = useState<{ menu?: AdminMenu } | null>(null);
  const busy = Boolean(pendingId) || Boolean(writeBlocked);
  type Confirmation = { menu: AdminMenu; input?: AdminMenuUpdate; menus: readonly AdminMenu[] };
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  // Independent of each row/editor draft: an open action is never discardable.
  useCreateDraft({}, {}, () => busy || confirmationRef.current !== null, locale, () => false);
  const validConfirmation = !!(confirmation && !busy && !readPending && !editor && menus === confirmation.menus);
  const cancelConfirmation = () => { confirmationRef.current = null; setConfirmation(null); };
  useEffect(() => { if (confirmation && !validConfirmation) cancelConfirmation(); }, [confirmation, validConfirmation]);
  useEffect(() => () => { confirmationRef.current = null; }, []);
  const requestConfirmation = (menu: AdminMenu, input?: AdminMenuUpdate) => {
    if (busy || readPending || editor || confirmationRef.current || menu.isSystem) return;
    if (input ? !onUpdate : !onDelete || menu.children.length > 0) return;
    const next = { menu, input, menus }; confirmationRef.current = next; setConfirmation(next);
  };
  const confirmAction = () => {
    if (!validConfirmation || !confirmation || confirmationRef.current !== confirmation) return;
    cancelConfirmation();
    if (confirmation.input) {
      const position = confirmation.input.position;
      if (position !== undefined) setPositionAttempts(current => ({ ...current, [confirmation.menu.id]: { menu: confirmation.menu, position } }));
      void onUpdate?.(confirmation.menu, confirmation.input);
    }
    else onDelete?.(confirmation.menu);
  };

  const recovery = <>{recordBlocked && <div role="alert" data-menu-write-record-blocked className="mb-4 space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_MENUS_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardRecord}>{frontendText(locale, "ADMIN_MENUS_RECORD_DISCARD")}</Button></div>}{(error || readRequired) && <div className="mb-4 space-y-2"><p role="alert" className="text-sm text-destructive">{error || frontendText(locale, "ADMIN_MENUS_READ_REQUIRED")}</p>{onLoadRetry && <Button type="button" variant="outline" disabled={readPending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}</div>}</>;
  const edit = (menu: AdminMenu) => setEditor({ menu });
  return <><section className="space-y-6" inert={validConfirmation || undefined} aria-hidden={validConfirmation || undefined}>
    <div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_EYEBROW")}</p><h1 className="mt-2 text-2xl font-semibold">{frontendText(locale, "ADMIN_MENUS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_MENUS_DESCRIPTION")}</p></div>
    {onCreate && <Button type="button" disabled={busy || Boolean(editor) || countMenus(menus) >= 200} onClick={() => setEditor({})}>{frontendText(locale, "ADMIN_MENUS_CREATE")}</Button>}
    {recovery}
    {editor && <MenuEditor menu={editor.menu} menus={menus} locale={locale} busy={busy} onCancel={() => setEditor(null)} onSave={async input => {
      const saved = editor.menu ? await onUpdate?.(editor.menu, { ...input, expected: menuSnapshot(editor.menu) }) : await onCreate?.(input as AdminMenuCreate);
      if (saved) setEditor(null);
    }} />}
    {menus.length ? <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_MENUS_TREE")}</CardTitle></CardHeader><CardContent><div className="space-y-2">{menus.map(menu => <MenuNode key={menu.id} menu={menu} depth={0} positionAttempts={positionAttempts} locale={locale} onUpdate={onUpdate ? (menu, input) => requestConfirmation(menu, input) : undefined} onDelete={onDelete ? menu => requestConfirmation(menu) : undefined} onEdit={onUpdate ? edit : undefined} pendingId={pendingId} writeBlocked={busy || Boolean(editor) || validConfirmation} recordBlocked={recordBlocked} />)}</div></CardContent></Card> : <PageState kind="empty" title={frontendText(locale, "ADMIN_MENUS_EMPTY")} description={frontendText(locale, "ADMIN_MENUS_DESCRIPTION")} />}
  </section><ConfirmAction open={validConfirmation}
    title={frontendText(locale, confirmation?.input ? "ADMIN_MENUS_CONFIRM_TITLE" : "ADMIN_MENUS_DELETE_CONFIRM_TITLE")}
    description={confirmation ? `${confirmation.menu.key} · ${confirmation.menu.path || confirmation.menu.id}. ${confirmation.input ? describeMenuChanges(confirmation.menu, confirmation.input, locale) : frontendText(locale, "ADMIN_MENUS_DELETE_IMPACT")}` : ""}
    cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, "ADMIN_MENUS_APPLY_CONFIRM")}
    destructive={!confirmation?.input || confirmation.input.status === "disabled" || confirmation.input.visible === false}
    onCancel={cancelConfirmation} onConfirm={confirmAction} /></>;
}
function countMenus(menus: readonly AdminMenu[]): number { return menus.reduce((total, menu) => total + 1 + countMenus(menu.children), 0); }

function MenuNode({ menu, depth, positionAttempts, locale, onUpdate, onDelete, onEdit, pendingId, writeBlocked, recordBlocked = false }: { menu: AdminMenu; depth: number; positionAttempts: Record<string, PositionAttempt>; locale?: LocaleRuntime; onUpdate?: (menu: AdminMenu, input: AdminMenuUpdate) => Promise<boolean> | void; onEdit?: (menu: AdminMenu) => void; onDelete?: (menu: AdminMenu) => void; pendingId?: string | null; writeBlocked?: boolean; recordBlocked?: boolean }) {
  const busy = Boolean(pendingId) || writeBlocked || recordBlocked;
  const initial = { position: String(menu.position) };
  const rowDraft = useCreateDraft(initial, initial, () => false, locale, () => Boolean(busy));
  const baseline = useRef(menu.position);
  const consumedAttempt = useRef<PositionAttempt | undefined>(undefined);
  const attempt = positionAttempts[menu.id];
  useEffect(() => {
    const recoveredAttempt = attempt && attempt !== consumedAttempt.current && attempt.menu !== menu;
    if (rowDraft.current.current.position === String(baseline.current) || (recoveredAttempt && rowDraft.current.current.position === String(attempt.position))) rowDraft.set("position", String(menu.position));
    rowDraft.checkpoint({ position: String(menu.position) }); baseline.current = menu.position;
    if (recoveredAttempt) consumedAttempt.current = attempt;
  }, [menu, attempt]);
  const position = Number(rowDraft.fields.position);
  const update = (input: AdminMenuUpdate) => { if (!busy && !rowDraft.isConfirming()) onUpdate?.(menu, input); };
  return <><div className="space-y-2" style={{ marginLeft: `${Math.min(depth, 4) * 1.25}rem` }}><div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{menu.labelKey}</p><p className="truncate text-xs text-muted-foreground">{menu.path || menu.key} · {menu.requiredBits}</p></div>{menu.isSystem && <Badge variant="outline">{frontendText(locale, "ADMIN_MENUS_SYSTEM")}</Badge>}<Badge variant={menu.status === "active" ? "secondary" : "outline"}>{menu.status === "active" ? frontendText(locale, "ADMIN_MENUS_ACTIVE") : frontendText(locale, "ADMIN_MENUS_DISABLED")}</Badge>{onEdit && !menu.isSystem && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { if (!busy && !rowDraft.isConfirming()) onEdit(menu); }}>{frontendText(locale, "ADMIN_MENUS_EDIT")}</Button>}<label className="flex items-center gap-2 text-xs"><span className="sr-only">{frontendText(locale, "ADMIN_MENUS_POSITION")}</span><input className="h-8 w-16 rounded-md border bg-background px-2 text-sm" type="number" min={0} value={rowDraft.fields.position} disabled={menu.isSystem || busy} onChange={(event) => rowDraft.edit("position", event.target.value)} /></label><Button type="button" size="sm" variant="outline" disabled={menu.isSystem || busy || position === menu.position || !rowDraft.fields.position.trim() || !Number.isSafeInteger(position) || position < 0 || position > 10000} onClick={() => { const value = rowDraft.current.current.position; const position = Number(value); if (value.trim() && Number.isSafeInteger(position) && position >= 0 && position <= 10000) update({ position, expected: menuSnapshot(menu) }); }}>{frontendText(locale, "ADMIN_MENUS_SAVE")}</Button><Button type="button" size="sm" variant="ghost" disabled={menu.isSystem || busy} onClick={() => update({ status: menu.status === "active" ? "disabled" : "active", expected: menuSnapshot(menu) })}>{menu.status === "active" ? frontendText(locale, "ADMIN_MENUS_DISABLE") : frontendText(locale, "ADMIN_MENUS_ENABLE")}</Button><Button type="button" size="sm" variant="ghost" disabled={menu.isSystem || busy} onClick={() => update({ visible: !menu.visible, expected: menuSnapshot(menu) })}>{frontendText(locale, menu.visible ? "ADMIN_MENUS_HIDE" : "ADMIN_MENUS_SHOW")}</Button>{!menu.isSystem && menu.children.length === 0 && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { if (!busy && !rowDraft.isConfirming()) onDelete?.(menu); }}>{frontendText(locale, "ADMIN_MENUS_DELETE")}</Button>}</div>{menu.children.map((child) => <MenuNode key={child.id} menu={child} depth={depth + 1} positionAttempts={positionAttempts} locale={locale} onUpdate={onUpdate} onDelete={onDelete} onEdit={onEdit} pendingId={pendingId} writeBlocked={writeBlocked} recordBlocked={recordBlocked} />)}</div>{rowDraft.confirmation}</>;
}
