// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert, AlertDescription, AlertTitle } from "../../frontend/components/ui/alert";
import { Badge } from "../../frontend/components/ui/badge";
import { Button } from "../../frontend/components/ui/button";
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
    expect(html).toContain("bg-secondary");
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
    expect(html).toContain("bg-emerald-100");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading"');
  });
});
