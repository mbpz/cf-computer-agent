// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginPage } from "../../frontend/pages/login-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

describe("login page", () => {
  it("renders both ordinary provider entry points in English and Chinese", () => {
    const english = renderToStaticMarkup(<LoginPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />);
    expect(english).toContain("Continue with GitHub");
    expect(english).toContain("Scan with WeChat");
    expect(english).not.toContain("undefined");
    const chinese = renderToStaticMarkup(<LoginPage locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })} />);
    expect(chinese).toContain("使用 GitHub 登录");
    expect(chinese).toContain("微信扫码登录");
    expect(chinese).not.toContain("undefined");
  });
});
