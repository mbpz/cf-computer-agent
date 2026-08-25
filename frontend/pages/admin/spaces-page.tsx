import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

export function SpacesPage({ spaces, onCreate }: { spaces: readonly { id: string; name?: string; slug?: string; collections?: readonly string[] }[]; onCreate?: () => void }) {
  return <section className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Spaces and collections</h1><p className="mt-1 text-sm text-muted-foreground">Keep knowledge boundaries explicit and reviewable.</p></div><Button onClick={onCreate}>Create space</Button></div><div className="grid gap-4 md:grid-cols-2">{spaces.map((space) => <Card key={space.id}><CardContent className="p-5"><h2 className="font-medium">{space.name || "Unnamed space"}</h2><p className="mt-1 text-xs text-muted-foreground">{space.slug || "Slug unavailable"}</p><p className="mt-4 text-sm text-muted-foreground">Collections: {(space.collections ?? []).join(", ") || "None"}</p></CardContent></Card>)}</div></section>;
}
