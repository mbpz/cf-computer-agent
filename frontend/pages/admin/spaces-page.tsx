import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export function SpacesPage({ spaces, loading = false, error, onCreate, locale }: { spaces: readonly { id: string; name?: string; slug?: string; collections?: readonly (string | { name?: string })[] }[]; loading?: boolean; error?: string; onCreate?: (input: { slug: string; name: string }) => Promise<void> | void; locale?: LocaleRuntime }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ slug: "", name: "" });
  const [createState, setCreateState] = useState<"idle" | "pending" | "error">("idle");
  if (loading) return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (error) return <PageState kind="error" title={error} />;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const slug = draft.slug.trim().toLowerCase();
    const name = draft.name.trim();
    if (!onCreate || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(slug) || !name || name.length > 128) {
      setCreateState("error");
      return;
    }
    setCreateState("pending");
    try {
      await onCreate({ slug, name });
      setDraft({ slug: "", name: "" });
      setCreateOpen(false);
      setCreateState("idle");
    } catch {
      setCreateState("error");
    }
  };
  return <section className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_SPACES_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_SPACES_DESCRIPTION")}</p></div><Button onClick={() => { setCreateOpen((open) => !open); setCreateState("idle"); }}>{createOpen ? frontendText(locale, "ADMIN_SPACE_CANCEL") : frontendText(locale, "ADMIN_CREATE_SPACE")}</Button></div>{createOpen && <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_SPACE_CREATE_TITLE")}</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} aria-busy={createState === "pending" ? "true" : undefined}><div><Label htmlFor="admin-space-name">{frontendText(locale, "ADMIN_SPACE_NAME")}</Label><Input id="admin-space-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))} maxLength={128} required /></div><div><Label htmlFor="admin-space-slug">{frontendText(locale, "ADMIN_SPACE_SLUG")}</Label><Input id="admin-space-slug" value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: event.currentTarget.value }))} pattern="[a-z0-9][a-z0-9-]{0,63}" maxLength={64} required /></div><div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={createState === "pending"}>{createState === "pending" ? frontendText(locale, "ADMIN_SPACE_CREATING") : frontendText(locale, "ADMIN_SPACE_CREATE")}</Button>{createState === "error" && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "ADMIN_SPACE_CREATE_ERROR")}</p>}</div></form></CardContent></Card>}{spaces.length ? <div className="grid gap-4 md:grid-cols-2">{spaces.map((space) => <Card key={space.id}><CardContent className="p-5"><h2 className="font-medium">{space.name || frontendText(locale, "ADMIN_UNNAMED_SPACE")}</h2><p className="mt-1 text-xs text-muted-foreground">{space.slug || frontendText(locale, "ADMIN_SLUG_UNAVAILABLE")}</p><p className="mt-4 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_COLLECTIONS")}: {(space.collections ?? []).map((collection) => typeof collection === "string" ? collection : collection.name || frontendText(locale, "ADMIN_NONE")).join(", ") || frontendText(locale, "ADMIN_NONE")}</p></CardContent></Card>)}</div> : <PageState kind="empty" title={frontendText(locale, "ADMIN_SPACES_EMPTY")} description={frontendText(locale, "ADMIN_SPACES_DESCRIPTION")} />}</section>;
}
