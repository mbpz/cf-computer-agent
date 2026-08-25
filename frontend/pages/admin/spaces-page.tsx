import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export function SpacesPage({ spaces, loading = false, error, onCreate, locale }: { spaces: readonly { id: string; name?: string; slug?: string; collections?: readonly (string | { name?: string })[] }[]; loading?: boolean; error?: string; onCreate?: () => void; locale?: LocaleRuntime }) {
  if (loading) return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (error) return <PageState kind="error" title={error} />;
  if (!spaces.length) return <PageState kind="empty" title={frontendText(locale, "ADMIN_SPACES_EMPTY")} description={frontendText(locale, "ADMIN_SPACES_DESCRIPTION")}><Button className="mt-4" onClick={onCreate}>{frontendText(locale, "ADMIN_CREATE_SPACE")}</Button></PageState>;
  return <section className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_SPACES_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_SPACES_DESCRIPTION")}</p></div><Button onClick={onCreate}>{frontendText(locale, "ADMIN_CREATE_SPACE")}</Button></div><div className="grid gap-4 md:grid-cols-2">{spaces.map((space) => <Card key={space.id}><CardContent className="p-5"><h2 className="font-medium">{space.name || frontendText(locale, "ADMIN_UNNAMED_SPACE")}</h2><p className="mt-1 text-xs text-muted-foreground">{space.slug || frontendText(locale, "ADMIN_SLUG_UNAVAILABLE")}</p><p className="mt-4 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_COLLECTIONS")}: {(space.collections ?? []).map((collection) => typeof collection === "string" ? collection : collection.name || frontendText(locale, "ADMIN_NONE")).join(", ") || frontendText(locale, "ADMIN_NONE")}</p></CardContent></Card>)}</div></section>;
}
