import { useEffect, useRef, useState, type FormEvent } from "react";
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
  loading?: boolean; error?: string; blocked?: boolean; pending?: boolean; needsRead?: boolean;
  nextCursor?: string; onLoadMore?: () => void; onLoadCollections?: (id: string) => void;
  onCreate?: (input: { slug: string; name: string }) => Promise<boolean | void> | void; locale?: LocaleRuntime;
}
export function SpacesPage(props: SpacesPageProps) {
  if (props.loading) return <PageState kind="loading" title={frontendText(props.locale, "APP_LOADING_TITLE")} />;
  if (props.error) return <PageState kind="error" title={props.error}>{props.onLoadRetry && <Button type="button" variant="outline" onClick={props.onLoadRetry}>{frontendText(props.locale, "COMMON_RETRY")}</Button>}</PageState>;
  return <SpacesEditor {...props} />;
}
function SpacesEditor({ onLoadRetry, spaces, onCreate, onManage, locale, blocked = false, pending = false, needsRead = false, nextCursor, onLoadMore, onLoadCollections }: SpacesPageProps) {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ slug: "", name: "" });
  const [createState, setCreateState] = useState<"idle" | "pending" | "error">("idle");
  const submitting = useRef(false);
  const locked = blocked || pending || createState === "pending";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || submitting.current) return;
    const slug = draft.slug.trim().toLowerCase();
    const name = draft.name.trim();
    if (!onCreate || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 80 || !name || name.length > 120) {
      setCreateState("error");
      return;
    }
    submitting.current = true;
    setCreateState("pending");
    try {
      if (await onCreate({ slug, name }) === false) { setCreateState("error"); return; }
      setDraft({ slug: "", name: "" });
      setCreateOpen(false);
      setCreateState("idle");
    } catch {
      setCreateState("error");
    } finally { submitting.current = false; }
  };
  return <section className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_SPACES_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_SPACES_DESCRIPTION")}</p></div><Button disabled={locked || Boolean(target)} onClick={() => { if (locked || target) return; setCreateOpen((open) => !open); setCreateState("idle"); }}>{createOpen ? frontendText(locale, "ADMIN_SPACE_CANCEL") : frontendText(locale, "ADMIN_CREATE_SPACE")}</Button></div>{needsRead && <div role="alert"><p>{frontendText(locale, "ADMIN_SPACE_READ_REQUIRED")}</p><Button type="button" variant="outline" disabled={pending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}{createOpen && <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_SPACE_CREATE_TITLE")}</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} aria-busy={createState === "pending" ? "true" : undefined}><div><Label htmlFor="admin-space-name">{frontendText(locale, "ADMIN_SPACE_NAME")}</Label><Input id="admin-space-name" value={draft.name} onChange={(event) => { const value = event.currentTarget.value; setDraft((current) => ({ ...current, name: value })); }} disabled={locked} maxLength={120} required /></div><div><Label htmlFor="admin-space-slug">{frontendText(locale, "ADMIN_SPACE_SLUG")}</Label><Input id="admin-space-slug" value={draft.slug} onChange={(event) => { const value = event.currentTarget.value; setDraft((current) => ({ ...current, slug: value })); }} disabled={locked} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required /></div><div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={locked}>{createState === "pending" ? frontendText(locale, "ADMIN_SPACE_CREATING") : frontendText(locale, "ADMIN_SPACE_CREATE")}</Button>{createState === "error" && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "ADMIN_SPACE_CREATE_ERROR")}</p>}</div></form></CardContent></Card>}{target && onManage && <RecordEditor target={target} locale={locale} locked={locked} onCancel={() => setTarget(null)} onSave={async command => { const saved = await onManage(command); if (saved) setTarget(null); return saved; }} />}{spaces.length ? <div className="grid gap-4 md:grid-cols-2">{spaces.map((space) => <Card key={space.id}><CardContent className="p-5"><h2 className="font-medium">{space.name || frontendText(locale, "ADMIN_UNNAMED_SPACE")}</h2><p className="mt-1 text-xs text-muted-foreground">{space.slug || frontendText(locale, "ADMIN_SLUG_UNAVAILABLE")}</p>{onManage && <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={locked || createOpen || Boolean(target) || space.readOnly || space.kind === "legacy"} onClick={() => setTarget({ kind: "space", space })}>{frontendText(locale, "ADMIN_SPACE_EDIT")}: {space.name}</Button><Button type="button" variant="outline" disabled={locked || createOpen || Boolean(target) || space.readOnly || space.kind === "legacy"} onClick={() => setTarget({ kind: "create-collection", space })}>{frontendText(locale, "ADMIN_COLLECTION_CREATE")}: {space.name}</Button></div>}<p className="mt-4 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_COLLECTIONS")}: {(space.collections ?? []).map((collection) => typeof collection === "string" ? collection : collection.name || frontendText(locale, "ADMIN_NONE")).join(", ") || frontendText(locale, "ADMIN_NONE")}</p>{onManage && <ul className="mt-3 space-y-2">{(space.collections ?? []).filter((item): item is CollectionSummary => typeof item !== "string" && Boolean(item.id)).map(collection => <li key={collection.id}><Button type="button" variant="ghost" disabled={locked || createOpen || Boolean(target) || space.readOnly || space.kind === "legacy"} onClick={() => setTarget({ kind: "collection", space, collection })}>{frontendText(locale, "ADMIN_COLLECTION_EDIT")}: {collection.name}</Button></li>)}</ul>}{space.collectionsCursor && <Button type="button" variant="outline" disabled={locked} onClick={() => onLoadCollections?.(space.id)}>{frontendText(locale, "ADMIN_LOAD_MORE")}: {space.name}</Button>}</CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "ADMIN_SPACES_EMPTY")} description={frontendText(locale, "ADMIN_SPACES_DESCRIPTION")} />}{nextCursor && <Button type="button" variant="outline" disabled={locked} onClick={onLoadMore}>{frontendText(locale, "ADMIN_LOAD_MORE")}</Button>}</section>;
}

function RecordEditor({ target, locale, locked, onCancel, onSave }: {
  target: EditorTarget; locale?: LocaleRuntime; locked: boolean; onCancel: () => void; onSave: (command: AdminSpaceCommand) => Promise<boolean>;
}) {
  const [requestKey] = useState(() => crypto.randomUUID());
  const source = target.kind === "space" ? target.space : target.collection;
  const [draft, setDraft] = useState({ name: source?.name ?? "", slug: target.space.slug ?? "", description: source?.description ?? "", status: source?.status ?? "active", position: String(source?.position ?? 0), parentId: target.collection?.parentId ?? "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const writing = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { nameInput.current?.focus(); }, []);
  const busy = locked || pending;
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
  const set = (key: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy || writing.current) return;
    const name = draft.name.trim(); const description = draft.description.trim(); const position = Number(draft.position);
    if (!name || name.length > 120 || draft.description.length > 1000 || !draft.position.trim() || !Number.isSafeInteger(position) || position < 0 || position > 1_000_000 || !["active", "disabled"].includes(draft.status) || (target.kind === "space" && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) || draft.slug.length > 80))) { setError(true); return; }
    if (target.kind !== "create-collection" && !source?.updatedAt) { setError(true); return; }
    const fields: AdminRecordFields = { name, description, position, status: draft.status };
    const command: AdminSpaceCommand = target.kind === "space" ? { kind: "space", spaceId: target.space.id, input: { ...fields, slug: draft.slug, expectedUpdatedAt: source!.updatedAt! } } : target.kind === "create-collection" ? { kind: "create-collection", spaceId: target.space.id, requestKey, input: { ...fields, parentId: draft.parentId || null } } : { kind: "collection", spaceId: target.space.id, collectionId: target.collection!.id!, input: { ...fields, parentId: draft.parentId || null, expectedUpdatedAt: source!.updatedAt! } };
    writing.current = true; setPending(true); setError(false);
    try { if (!await onSave(command)) setError(true); } catch { setError(true); } finally { writing.current = false; setPending(false); }
  };
  return <Card><CardHeader><CardTitle>{frontendText(locale, target.kind === "space" ? "ADMIN_SPACE_EDIT" : target.kind === "collection" ? "ADMIN_COLLECTION_EDIT" : "ADMIN_COLLECTION_CREATE")}: {target.space.name}</CardTitle></CardHeader><CardContent>
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-busy={pending || undefined}>
      <div><Label htmlFor="admin-record-name">{frontendText(locale, "ADMIN_SPACE_NAME")}</Label><Input ref={nameInput} id="admin-record-name" value={draft.name} onChange={event => set("name", event.currentTarget.value)} required maxLength={120} disabled={busy} /></div>
      {target.kind === "space" && <div><Label htmlFor="admin-record-slug">{frontendText(locale, "ADMIN_SPACE_SLUG")}</Label><Input id="admin-record-slug" value={draft.slug} onChange={event => set("slug", event.currentTarget.value)} required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" disabled={busy} /></div>}
      <div className="sm:col-span-2"><Label htmlFor="admin-record-description">{frontendText(locale, "ADMIN_RECORD_DESCRIPTION")}</Label><Input id="admin-record-description" value={draft.description} onChange={event => set("description", event.currentTarget.value)} maxLength={1000} disabled={busy} /></div>
      <div><Label htmlFor="admin-record-position">{frontendText(locale, "ADMIN_RECORD_POSITION")}</Label><Input id="admin-record-position" type="number" min={0} max={1000000} step={1} value={draft.position} onChange={event => set("position", event.currentTarget.value)} required disabled={busy} /></div>
      <div><Label htmlFor="admin-record-status">{frontendText(locale, "ADMIN_RECORD_STATUS")}</Label><select id="admin-record-status" className="h-10 w-full rounded-md border bg-background px-3" value={draft.status} onChange={event => set("status", event.currentTarget.value)} disabled={busy}><option value="active">{frontendText(locale, "ADMIN_MENUS_ACTIVE")}</option><option value="disabled">{frontendText(locale, "ADMIN_MENUS_DISABLED")}</option></select></div>
      {target.kind !== "space" && <div className="sm:col-span-2"><Label htmlFor="admin-record-parent">{frontendText(locale, "ADMIN_COLLECTION_PARENT")}</Label><select id="admin-record-parent" className="h-10 w-full rounded-md border bg-background px-3" value={draft.parentId} onChange={event => set("parentId", event.currentTarget.value)} disabled={busy}><option value="">{frontendText(locale, "ADMIN_COLLECTION_ROOT")}</option>{draft.parentId && !selectable.some(item => item.id === draft.parentId) && <option value={draft.parentId}>{frontendText(locale, "ADMIN_COLLECTION_CURRENT_PARENT")}: {draft.parentId}</option>}{selectable.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{target.space.collectionsCursor && <p className="text-sm text-muted-foreground">{frontendText(locale, "ADMIN_COLLECTION_MORE_PARENTS")}</p>}</div>}
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy}>{frontendText(locale, "ADMIN_RECORD_SAVE")}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{frontendText(locale, "ADMIN_SPACE_CANCEL")}</Button>{error && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "ADMIN_RECORD_SAVE_ERROR")}</p>}</div>
    </form>
  </CardContent></Card>;
}
