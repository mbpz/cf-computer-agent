// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginPage } from "../../frontend/pages/login-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

describe("login page", () => {
  it("renders GitHub login and keeps deferred WeChat login hidden", () => {
    const english = renderToStaticMarkup(<LoginPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} />);
    expect(english).toContain("Continue with GitHub");
    expect(english).not.toContain("Scan with WeChat");
    expect(english).not.toContain("undefined");
    const chinese = renderToStaticMarkup(<LoginPage locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })} />);
    expect(chinese).toContain("使用 GitHub 登录");
    expect(chinese).not.toContain("微信扫码登录");
    expect(chinese).not.toContain("undefined");
  });

});
