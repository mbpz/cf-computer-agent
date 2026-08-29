// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { HomePage } from "../../frontend/pages/home-page";
import { KnowledgePage } from "../../frontend/pages/knowledge-page";
import { SubmitPage } from "../../frontend/pages/submit-page";

describe("React page locale boundary", () => {
  const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });

  it("renders user-facing page copy from the selected locale", () => {
    const html = renderToStaticMarkup(<HomePage locale={locale} state={{ kind: "ready", total: 1, pending: 2, published: 3 }} />);
    expect(html).toContain("知识工作区");
    expect(html).toContain("提交总数");
    expect(html).not.toContain("Knowledge workspace");
  });

  it("localizes empty knowledge and submit labels without exposing undefined", () => {
    const empty = renderToStaticMarkup(<KnowledgePage locale={locale} state={{ kind: "ready", items: [], nextCursor: null }} />);
    const submit = renderToStaticMarkup(<SubmitPage locale={locale} draft={{ mode: "markdown", title: "", content: "" }} state={{ kind: "idle" }} />);
    expect(empty).toContain("当前没有可见的已发布知识。");
    expect(empty).toContain(">0<");
    expect(empty).toContain("0 / 0");
    expect(submit).toContain("新建提交");
    expect(`${empty}${submit}`).not.toMatch(/\bundefined\b|\bnull\b/u);
  });
});
