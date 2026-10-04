import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCreateDraft } from "../../lib/use-create-draft";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

import type { AdminSpaceCommand, AdminRecordFields } from "../../lib/admin-spaces-data";

type CollectionSummary = { id?: string; updatedAt?: string; name?: string; parentId?: string | null; description?: string; status?: "active" | "disabled"; position?: number };
type SpaceSummary = { id: string; updatedAt?: string; name?: string; slug?: string; description?: string; status?: "active" | "disabled"; position?: number; readOnly?: boolean; kind?: string; collections?: readonly (string | CollectionSummary)[]; collectionsCursor?: string };
type EditorTarget = { kind: "space" | "create-collection" | "collection"; space: SpaceSummary; collection?: CollectionSummary };
interface SpacesPageProps {
  onLoadRetry?: () => void;
  spaces: readonly SpaceSummary[];
  onManage?: (command: AdminSpaceCommand) => Promise<boolean>;
  loading?: boolean; error?: string; blocked?: boolean; navigationBlocked?: boolean; pending?: boolean; needsRead?: boolean;
  recordBlocked?: boolean; recordNotice?: string; onDiscardRecord?: () => void;
  nextCursor?: string; onLoadMore?: () => void; onLoadCollections?: (id: string) => void;
  onCreate?: (input: { slug: string; name: string }) => Promise<boolean | void> | void; locale?: LocaleRuntime;
}
export function SpacesPage(props: SpacesPageProps) {
  if (props.loading) return <PageState kind="loading" title={frontendText(props.locale, "APP_LOADING_TITLE")} />;
  if (props.error) return <PageState kind="error" title={props.error}>{props.onLoadRetry && <Button type="button" variant="outline" onClick={props.onLoadRetry}>{frontendText(props.locale, "COMMON_RETRY")}</Button>}</PageState>;
  return <SpacesEditor {...props} />;
}
function SpacesEditor({ onLoadRetry, spaces, onCreate, onManage, locale, blocked = false, navigationBlocked = blocked, pending = false, needsRead = false, recordBlocked = false, recordNotice, onDiscardRecord, nextCursor, onLoadMore, onLoadCollections }: SpacesPageProps) {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const initialDraft = useRef({ slug: "", name: "" });
  const [createState, setCreateState] = useState<"idle" | "pending" | "error">("idle");
  const submitting = useRef(false);
  const locked = blocked || pending || createState === "pending";
  const [discard, setDiscard] = useState<typeof initialDraft.current | null>(null);
  const discardRef = useRef<typeof initialDraft.current | null>(null);
  const alive = useRef(true);
  const createDraft = useCreateDraft(initialDraft.current, initialDraft.current, () => navigationBlocked || submitting.current || discardRef.current !== null, locale, () => locked || Boolean(target));
  const draft = createDraft.fields;
  const validDiscard = Boolean(discard && discard === draft && createOpen && !locked);
  const cancelDiscard = () => { discardRef.current = null; setDiscard(null); };
  useEffect(() => { if (discard && !validDiscard) cancelDiscard(); }, [discard, validDiscard]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; discardRef.current = null; }; }, []);
  const toggleCreate = () => {
    if (!alive.current || locked || target || submitting.current || discardRef.current || createDraft.isConfirming()) return;
    const draft = createDraft.current.current;
    if (createOpen && (draft.name || draft.slug)) { discardRef.current = draft; setDiscard(draft); return; }
    setCreateOpen(!createOpen); setCreateState("idle");
  };
  const confirmDiscard = () => {
    if (!alive.current || createDraft.isConfirming() || !validDiscard || !discard || discardRef.current !== discard || discard !== createDraft.current.current || submitting.current) return;
    cancelDiscard(); createDraft.reset(); setCreateOpen(false); setCreateState("idle");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!alive.current || locked || submitting.current || discardRef.current || createDraft.isConfirming()) return;
    const draft = createDraft.current.current;
    const slug = draft.slug.trim().toLowerCase();
    const name = draft.name.trim();
    if (!onCreate || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 80 || !name || name.length > 120) {
      setCreateState("error");
      return;
    }
    submitting.current = true;
    setCreateState("pending");
    try {
      const saved = await onCreate({ slug, name });
      if (!alive.current) return;
      if (saved === false) { setCreateState("error"); return; }
      createDraft.reset();
      setCreateOpen(false);
      setCreateState("idle");
    } catch {
      if (alive.current) setCreateState("error");
    } finally { submitting.current = false; }
  };
  return <><section className="space-y-5" inert={validDiscard} aria-hidden={validDiscard || undefined}><div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_SPACES_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_SPACES_DESCRIPTION")}</p></div><Button disabled={locked || Boolean(target)} onClick={toggleCreate}>{createOpen ? frontendText(locale, "ADMIN_SPACE_CANCEL") : frontendText(locale, "ADMIN_CREATE_SPACE")}</Button></div>{recordBlocked && <div role="alert" data-space-write-record-blocked className="space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_SPACE_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardRecord}>{frontendText(locale, "ADMIN_SPACE_RECORD_DISCARD")}</Button></div>}{recordNotice && <p role="alert" className="text-sm text-destructive">{recordNotice}</p>}{needsRead && <div role="alert"><p>{frontendText(locale, "ADMIN_SPACE_READ_REQUIRED")}</p><Button type="button" variant="outline" disabled={pending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}{createOpen && <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_SPACE_CREATE_TITLE")}</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} aria-busy={createState === "pending" ? "true" : undefined}><div><Label htmlFor="admin-space-name">{frontendText(locale, "ADMIN_SPACE_NAME")}</Label><Input id="admin-space-name" value={draft.name} onChange={(event) => { const value = event.currentTarget.value; createDraft.edit("name", value); }} disabled={locked} maxLength={120} required /></div><div><Label htmlFor="admin-space-slug">{frontendText(locale, "ADMIN_SPACE_SLUG")}</Label><Input id="admin-space-slug" value={draft.slug} onChange={(event) => { const value = event.currentTarget.value; createDraft.edit("slug", value); }} disabled={locked} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required /></div><div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={locked}>{createState === "pending" ? frontendText(locale, "ADMIN_SPACE_CREATING") : frontendText(locale, "ADMIN_SPACE_CREATE")}</Button>{createState === "error" && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "ADMIN_SPACE_CREATE_ERROR")}</p>}</div></form></CardContent></Card>}{target && onManage && <RecordEditor records={spaces} target={target} locale={locale} locked={locked} navigationBlocked={navigationBlocked} onCancel={() => setTarget(null)} onSave={async command => { const saved = await onManage(command); if (saved) setTarget(null); return saved; }} />}{spaces.length ? <div className="grid gap-4 md:grid-cols-2">{spaces.map((space) => <Card key={space.id}><CardContent className="p-5"><h2 className="font-medium">{space.name || frontendText(locale, "ADMIN_UNNAMED_SPACE")}</h2><p className="mt-1 text-xs text-muted-foreground">{space.slug || frontendText(locale, "ADMIN_SLUG_UNAVAILABLE")}</p>{onManage && <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={locked || createOpen || Boolean(target) || space.readOnly || space.kind === "legacy"} onClick={() => setTarget({ kind: "space", space })}>{frontendText(locale, "ADMIN_SPACE_EDIT")}: {space.name}</Button><Button type="button" variant="outline" disabled={locked || createOpen || Boolean(target) || space.readOnly || space.kind === "legacy"} onClick={() => setTarget({ kind: "create-collection", space })}>{frontendText(locale, "ADMIN_COLLECTION_CREATE")}: {space.name}</Button></div>}<p className="mt-4 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_COLLECTIONS")}: {(space.collections ?? []).map((collection) => typeof collection === "string" ? collection : collection.name || frontendText(locale, "ADMIN_NONE")).join(", ") || frontendText(locale, "ADMIN_NONE")}</p>{onManage && <ul className="mt-3 space-y-2">{(space.collections ?? []).filter((item): item is CollectionSummary => typeof item !== "string" && Boolean(item.id)).map(collection => <li key={collection.id}><Button type="button" variant="ghost" disabled={locked || createOpen || Boolean(target) || space.readOnly || space.kind === "legacy"} onClick={() => setTarget({ kind: "collection", space, collection })}>{frontendText(locale, "ADMIN_COLLECTION_EDIT")}: {collection.name}</Button></li>)}</ul>}{space.collectionsCursor && <Button type="button" variant="outline" disabled={locked} onClick={() => onLoadCollections?.(space.id)}>{frontendText(locale, "ADMIN_LOAD_MORE")}: {space.name}</Button>}</CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "ADMIN_SPACES_EMPTY")} description={frontendText(locale, "ADMIN_SPACES_DESCRIPTION")} />}{nextCursor && <Button type="button" variant="outline" disabled={locked} onClick={onLoadMore}>{frontendText(locale, "ADMIN_LOAD_MORE")}</Button>}</section><ConfirmAction open={validDiscard} title={frontendText(locale,"ADMIN_RECORD_DISCARD_TITLE")}
    description={frontendText(locale,"ADMIN_RECORD_DISCARD_IMPACT")} cancelLabel={frontendText(locale,"COMMON_CANCEL")}
    confirmLabel={frontendText(locale,"ADMIN_RECORD_DISCARD_CONFIRM")} destructive onCancel={cancelDiscard} onConfirm={confirmDiscard} />{createDraft.confirmation}</>;
}

function RecordEditor({ target, records, locale, locked, navigationBlocked, onCancel, onSave }: {
  target: EditorTarget; records: readonly SpaceSummary[]; locale?: LocaleRuntime; locked: boolean; navigationBlocked: boolean; onCancel: () => void; onSave: (command: AdminSpaceCommand) => Promise<boolean>;
}) {
  const [requestKey] = useState(() => crypto.randomUUID());
  const source = target.kind === "space" ? target.space : target.collection;
  const initialDraft = useRef({ name: source?.name ?? "", slug: target.space.slug ?? "", description: source?.description ?? "", status: source?.status ?? "active", position: String(source?.position ?? 0), parentId: target.collection?.parentId ?? "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const writing = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { nameInput.current?.focus(); }, []);
  const busy = locked || pending;
  type Confirmation = {kind:"save"; command:AdminSpaceCommand; draft:typeof initialDraft.current; records:readonly SpaceSummary[]} | {kind:"discard"; draft:typeof initialDraft.current};
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const alive = useRef(true);
  const recordDraft = useCreateDraft(initialDraft.current, initialDraft.current, () => navigationBlocked || writing.current || confirmationRef.current !== null, locale, () => false);
  const draft = recordDraft.fields;
  const validConfirmation = Boolean(confirmation && !busy && confirmation.draft === draft
    && (confirmation.kind === "discard" || confirmation.records === records));
  const cancelConfirmation = () => { confirmationRef.current = null; setConfirmation(null); };
  useEffect(() => { if (confirmation && !validConfirmation) cancelConfirmation(); }, [confirmation, validConfirmation]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; confirmationRef.current = null; }; }, []);
  const requestConfirmation = (next:Confirmation) => {
    if (!alive.current || busy || writing.current || confirmationRef.current || recordDraft.isConfirming()) return;
    confirmationRef.current = next; setConfirmation(next);
  };
  const save = async (command:AdminSpaceCommand) => {
    if (!alive.current || busy || writing.current || recordDraft.isConfirming()) return;
    writing.current = true; setPending(true); setError(false);
    try { if (!await onSave(command) && alive.current) setError(true); } catch { if (alive.current) setError(true); } finally { writing.current = false; if (alive.current) setPending(false); }
  };
  const confirm = () => {
    if (!alive.current || recordDraft.isConfirming() || !validConfirmation || !confirmation || confirmationRef.current !== confirmation || confirmation.draft !== recordDraft.current.current || writing.current) return;
    cancelConfirmation();
    if (confirmation.kind === "discard") onCancel();
    else void save(confirmation.command);
  };
  const collections = (target.space.collections ?? []).filter((item): item is CollectionSummary => typeof item !== "string" && Boolean(item.id));
  const selectable = collections.filter(item => {
    if (item.status !== "active") return false;
    const seen = new Set<string>(); let current: CollectionSummary | undefined = item;
    while (current?.id) {
      if (current.id === target.collection?.id || seen.has(current.id)) return false;
      seen.add(current.id); current = collections.find(parent => parent.id === current?.parentId);
    }
    return true;
  });
  const set = (key: keyof typeof draft, value: string) => {
    if (!alive.current || busy || writing.current || recordDraft.isConfirming()) return;
    recordDraft.set(key, value);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!alive.current || busy || writing.current || confirmationRef.current || recordDraft.isConfirming()) return;
    const draft = recordDraft.current.current;
    const name = draft.name.trim(); const description = draft.description.trim(); const position = Number(draft.position);
    if (!name || name.length > 120 || draft.description.length > 1000 || !draft.position.trim() || !Number.isSafeInteger(position) || position < 0 || position > 1_000_000 || !["active", "disabled"].includes(draft.status) || (target.kind === "space" && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) || draft.slug.length > 80))) { setError(true); return; }
    if (target.kind !== "create-collection" && !source?.updatedAt) { setError(true); return; }
    const fields: AdminRecordFields = { name, description, position, status: draft.status };
    const command: AdminSpaceCommand = target.kind === "space" ? { kind: "space", spaceId: target.space.id, input: { ...fields, slug: draft.slug, expectedUpdatedAt: source!.updatedAt! } } : target.kind === "create-collection" ? { kind: "create-collection", spaceId: target.space.id, requestKey, input: { ...fields, parentId: draft.parentId || null } } : { kind: "collection", spaceId: target.space.id, collectionId: target.collection!.id!, input: { ...fields, parentId: draft.parentId || null, expectedUpdatedAt: source!.updatedAt! } };
    setError(false);
    if (command.kind === "create-collection") await save(command);
    else requestConfirmation({kind:"save",command,draft,records});
  };
  return <><Card><CardHeader><CardTitle>{frontendText(locale, target.kind === "space" ? "ADMIN_SPACE_EDIT" : target.kind === "collection" ? "ADMIN_COLLECTION_EDIT" : "ADMIN_COLLECTION_CREATE")}: {target.space.name}</CardTitle></CardHeader><CardContent>
    <form onSubmit={submit} inert={validConfirmation} aria-hidden={validConfirmation || undefined} className="grid gap-4 sm:grid-cols-2" aria-busy={pending || undefined}>
      <div><Label htmlFor="admin-record-name">{frontendText(locale, "ADMIN_SPACE_NAME")}</Label><Input ref={nameInput} id="admin-record-name" value={draft.name} onChange={event => set("name", event.currentTarget.value)} required maxLength={120} disabled={busy} /></div>
      {target.kind === "space" && <div><Label htmlFor="admin-record-slug">{frontendText(locale, "ADMIN_SPACE_SLUG")}</Label><Input id="admin-record-slug" value={draft.slug} onChange={event => set("slug", event.currentTarget.value)} required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" disabled={busy} /></div>}
      <div className="sm:col-span-2"><Label htmlFor="admin-record-description">{frontendText(locale, "ADMIN_RECORD_DESCRIPTION")}</Label><Input id="admin-record-description" value={draft.description} onChange={event => set("description", event.currentTarget.value)} maxLength={1000} disabled={busy} /></div>
      <div><Label htmlFor="admin-record-position">{frontendText(locale, "ADMIN_RECORD_POSITION")}</Label><Input id="admin-record-position" type="number" min={0} max={1000000} step={1} value={draft.position} onChange={event => set("position", event.currentTarget.value)} required disabled={busy} /></div>
      <div><Label htmlFor="admin-record-status">{frontendText(locale, "ADMIN_RECORD_STATUS")}</Label><select id="admin-record-status" className="h-10 w-full rounded-md border bg-background px-3" value={draft.status} onChange={event => set("status", event.currentTarget.value)} disabled={busy}><option value="active">{frontendText(locale, "ADMIN_MENUS_ACTIVE")}</option><option value="disabled">{frontendText(locale, "ADMIN_MENUS_DISABLED")}</option></select></div>
      {target.kind !== "space" && <div className="sm:col-span-2"><Label htmlFor="admin-record-parent">{frontendText(locale, "ADMIN_COLLECTION_PARENT")}</Label><select id="admin-record-parent" className="h-10 w-full rounded-md border bg-background px-3" value={draft.parentId} onChange={event => set("parentId", event.currentTarget.value)} disabled={busy}><option value="">{frontendText(locale, "ADMIN_COLLECTION_ROOT")}</option>{draft.parentId && !selectable.some(item => item.id === draft.parentId) && <option value={draft.parentId}>{frontendText(locale, "ADMIN_COLLECTION_CURRENT_PARENT")}: {draft.parentId}</option>}{selectable.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{target.space.collectionsCursor && <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_COLLECTION_MORE_PARENTS")}</p>}</div>}
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy}>{frontendText(locale, "ADMIN_RECORD_SAVE")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { if (!alive.current || busy || writing.current || confirmationRef.current || recordDraft.isConfirming()) return; const draft = recordDraft.current.current; if (JSON.stringify(draft) !== JSON.stringify(initialDraft.current)) requestConfirmation({kind:"discard",draft}); else onCancel(); }}>{frontendText(locale, "ADMIN_SPACE_CANCEL")}</Button>{error && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "ADMIN_RECORD_SAVE_ERROR")}</p>}</div>
    </form>
  </CardContent></Card><ConfirmAction open={validConfirmation}
    title={frontendText(locale,confirmation?.kind === "discard" ? "ADMIN_RECORD_DISCARD_TITLE" : "ADMIN_RECORD_CONFIRM_TITLE")}
    description={confirmation?.kind === "save" ? `${target.space.name} (${target.space.id})${target.collection ? ` / ${target.collection.name} (${target.collection.id})` : ""}. ${describeRecordChanges(target, confirmation.command, locale)}` : frontendText(locale,"ADMIN_RECORD_DISCARD_IMPACT")}
    cancelLabel={frontendText(locale,"COMMON_CANCEL")} confirmLabel={frontendText(locale,confirmation?.kind === "discard" ? "ADMIN_RECORD_DISCARD_CONFIRM" : "ADMIN_RECORD_CONFIRM_ACTION")}
    destructive={confirmation?.kind === "discard" || (confirmation?.kind === "save" && confirmation.command.input.status === "disabled")}
    onCancel={cancelConfirmation} onConfirm={confirm} />{recordDraft.confirmation}</>;

}

function describeRecordChanges(target:EditorTarget, command:AdminSpaceCommand, locale?:LocaleRuntime):string {
  const source = target.kind === "space" ? target.space : target.collection;
  const fields = {name:"ADMIN_SPACE_NAME",slug:"ADMIN_SPACE_SLUG",description:"ADMIN_RECORD_DESCRIPTION",position:"ADMIN_RECORD_POSITION",status:"ADMIN_RECORD_STATUS",parentId:"ADMIN_COLLECTION_PARENT"} as const;
  const before = source as unknown as Record<string,unknown>;
  const after = command.input as unknown as Record<string,unknown>;
  const display = (key:string,value:unknown) => key === "status" ? frontendText(locale,value === "active" ? "ADMIN_MENUS_ACTIVE" : "ADMIN_MENUS_DISABLED") : key === "parentId" && !value ? frontendText(locale,"ADMIN_COLLECTION_ROOT") : String(value ?? "—");
  const changes = (Object.keys(fields) as (keyof typeof fields)[]).filter(key => key in after && after[key] !== before[key])
    .map(key => `${frontendText(locale,fields[key])}: ${display(key,before[key])} → ${display(key,after[key])}`).join("; ");
  return `${frontendText(locale,"ADMIN_RECORD_CHANGE_IMPACT")} ${changes || frontendText(locale,"ADMIN_RECORD_NO_CHANGE")}`;
}
