import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "../../frontend/components/ui/page-header";

describe("shared page header", () => {
  it("renders one titled h1 with an optional described context line and actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="成员管理" description="邀请制，一次性验证码登录" status="只读" actions={<button type="button">邀请成员</button>} />,
    );
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain("成员管理");
    expect(html).toMatch(/aria-describedby="[^"]+-description"/u);
    expect(html).toContain('id="');
    expect(html).toContain("邀请制，一次性验证码登录");
    expect(html).toContain("只读");
    expect(html).toContain("邀请成员");
  });

  it("omits the context paragraph and action row when a page has neither", () => {
    const html = renderToStaticMarkup(<PageHeader title="概览" />);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("<p");
  });
});
