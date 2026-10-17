// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert, AlertDescription, AlertTitle } from "../../frontend/components/ui/alert";
import { Badge } from "../../frontend/components/ui/badge";
import { Button, StatefulButton } from "../../frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../frontend/components/ui/card";
import { Input } from "../../frontend/components/ui/input";
import { Label } from "../../frontend/components/ui/label";
import { Skeleton } from "../../frontend/components/ui/skeleton";
import { Textarea } from "../../frontend/components/ui/textarea";

describe("owned shadcn primitives", () => {
  it("renders accessible form controls and variants", () => {
    const html = renderToStaticMarkup(
      <form>
        <Label htmlFor="title">Title</Label>
        <Input id="title" placeholder="A note" />
        <Textarea aria-label="Content" />
        <Button variant="secondary" disabled>Save</Button>
      </form>,
    );

    expect(html).toContain('for="title"');
    expect(html).toContain('id="title"');
    expect(html).toContain("disabled");
    // The Button is beUI's surface now: secondary renders the card/border pair, and
    // the adapter adds the app's focus ring beUI's button does not ship.
    expect(html).toContain("bg-card");
    expect(html).toContain("border-border");
    expect(html).toContain("focus-visible:ring-2");
  });

  it("supports composed cards, status badges, alerts, and loading semantics", () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardHeader><CardTitle>Knowledge</CardTitle></CardHeader>
        <CardContent><Badge variant="success">Indexed</Badge></CardContent>
        <Alert role="status"><AlertTitle>Ready</AlertTitle><AlertDescription>All set.</AlertDescription></Alert>
        <Skeleton aria-label="Loading" />
      </Card>,
    );

    expect(html).toContain("Knowledge");
    // The Badge is beUI's animated status pill now: the success status paints the
    // tinted emerald pair instead of the old solid swatch.
    expect(html).toContain("bg-emerald-500/10");
    expect(html).toContain("text-emerald-600");
    expect(html).toContain('data-badge-label');
    expect(html).toContain('role="status"');
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('data-slot="alert"');
    expect(html).toContain('aria-label="Loading"');
  });

  it("swaps the stateful button's label and marks it busy while pending", () => {
    const html = renderToStaticMarkup(
      <StatefulButton state="loading" loadingText="Signing in…">Sign in</StatefulButton>,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("Signing in…");
  });
});
