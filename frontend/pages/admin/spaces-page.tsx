import { useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

interface SpacesPageProps {
  onLoadRetry?: () => void;
  spaces: readonly { id: string; name?: string; slug?: string; collections?: readonly (string | { name?: string })[]; collectionsCursor?: string }[];
  loading?: boolean; error?: string; blocked?: boolean; pending?: boolean; needsRead?: boolean;
  nextCursor?: string; onLoadMore?: () => void; onLoadCollections?: (id: string) => void;
  onCreate?: (input: { slug: string; name: string }) => Promise<boolean | void> | void; locale?: LocaleRuntime;
}
export function SpacesPage(props: SpacesPageProps) {
  if (props.loading) return <PageState kind="loading" title={frontendText(props.locale, "APP_LOADING_TITLE")} />;
  if (props.error) return <PageState kind="error" title={props.error}>{props.onLoadRetry && <Button type="button" variant="outline" onClick={props.onLoadRetry}>{frontendText(props.locale, "COMMON_RETRY")}</Button>}</PageState>;
  return <SpacesEditor {...props} />;
}
function SpacesEditor({ onLoadRetry, spaces, onCreate, locale, blocked = false, pending = false, needsRead = false, nextCursor, onLoadMore, onLoadCollections }: SpacesPageProps) {
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
  return <section className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_SPACES_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_SPACES_DESCRIPTION")}</p></div><Button disabled={locked} onClick={() => { if (locked) return; setCreateOpen((open) => !open); setCreateState("idle"); }}>{createOpen ? frontendText(locale, "ADMIN_SPACE_CANCEL") : frontendText(locale, "ADMIN_CREATE_SPACE")}</Button></div>{needsRead && <div role="alert"><p>{frontendText(locale, "ADMIN_SPACE_READ_REQUIRED")}</p><Button type="button" variant="outline" disabled={pending} onClick={onLoadRetry}>{frontendText(locale, "COMMON_RETRY")}</Button></div>}{createOpen && <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_SPACE_CREATE_TITLE")}</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} aria-busy={createState === "pending" ? "true" : undefined}><div><Label htmlFor="admin-space-name">{frontendText(locale, "ADMIN_SPACE_NAME")}</Label><Input id="admin-space-name" value={draft.name} onChange={(event) => { const value = event.currentTarget.value; setDraft((current) => ({ ...current, name: value })); }} disabled={locked} maxLength={120} required /></div><div><Label htmlFor="admin-space-slug">{frontendText(locale, "ADMIN_SPACE_SLUG")}</Label><Input id="admin-space-slug" value={draft.slug} onChange={(event) => { const value = event.currentTarget.value; setDraft((current) => ({ ...current, slug: value })); }} disabled={locked} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required /></div><div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={locked}>{createState === "pending" ? frontendText(locale, "ADMIN_SPACE_CREATING") : frontendText(locale, "ADMIN_SPACE_CREATE")}</Button>{createState === "error" && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "ADMIN_SPACE_CREATE_ERROR")}</p>}</div></form></CardContent></Card>}{spaces.length ? <div className="grid gap-4 md:grid-cols-2">{spaces.map((space) => <Card key={space.id}><CardContent className="p-5"><h2 className="font-medium">{space.name || frontendText(locale, "ADMIN_UNNAMED_SPACE")}</h2><p className="mt-1 text-xs text-muted-foreground">{space.slug || frontendText(locale, "ADMIN_SLUG_UNAVAILABLE")}</p><p className="mt-4 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_COLLECTIONS")}: {(space.collections ?? []).map((collection) => typeof collection === "string" ? collection : collection.name || frontendText(locale, "ADMIN_NONE")).join(", ") || frontendText(locale, "ADMIN_NONE")}</p>{space.collectionsCursor && <Button type="button" variant="outline" disabled={locked} onClick={() => onLoadCollections?.(space.id)}>{frontendText(locale, "ADMIN_LOAD_MORE")}: {space.name}</Button>}</CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "ADMIN_SPACES_EMPTY")} description={frontendText(locale, "ADMIN_SPACES_DESCRIPTION")} />}{nextCursor && <Button type="button" variant="outline" disabled={locked} onClick={onLoadMore}>{frontendText(locale, "ADMIN_LOAD_MORE")}</Button>}</section>;
}
