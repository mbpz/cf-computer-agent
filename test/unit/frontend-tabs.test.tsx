// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../frontend/components/ui/tabs";
import { tabsKeyAction } from "../../frontend/lib/tabs-keyboard";

describe("frontend tabs", () => {
  it("emits tab semantics, selected state, and a labelled panel", () => {
    const html = renderToStaticMarkup(
      <Tabs defaultValue="overview" aria-label="Admin sections">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="audit">Audit content</TabsContent>
      </Tabs>,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('hidden');
  });

  it.each([
    ["ArrowRight", "next", "horizontal"],
    ["ArrowLeft", "previous", "horizontal"],
    ["ArrowDown", "next", "vertical"],
    ["ArrowUp", "previous", "vertical"],
    ["Home", "first", "horizontal"],
    ["End", "last", "vertical"],
    ["Enter", undefined, "horizontal"],
  ] as const)("maps %s for %s tabs", (key, expected, orientation) => {
    expect(tabsKeyAction(key, orientation)).toBe(expected);
  });
});
