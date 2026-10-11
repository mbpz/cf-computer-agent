// @vitest-environment node
import { describe, expect, it } from "vitest";
import { act } from "react";
import { LOCALE_STORAGE_KEY } from "../../frontend/lib/i18n";
import { mountApp, waitForApp } from "../helpers/authenticated-app-harness";

const session = {
  member: { id: "member-1", email: "reader@app.test", role: "contributor" as const },
  capabilities: ["knowledge:read", "submission:create", "submission:read-own"],
  permissionMask: "0x0",
  logoutUrl: "/auth/logout",
};

function fetchStub(input: RequestInfo | URL): Promise<Response> {
  return Promise.resolve(String(input) === "/api/session" ? Response.json(session) : Response.json({}));
}

async function mountWithStoredLocale() {
  return mountApp({
    url: "https://app.test/knowledge",
    configureBrowser: (browser) => { browser.localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN"); },
    fetch: fetchStub,
  });
}

describe("document language follows the active locale", () => {
  it("sets <html lang> from the stored locale when the App mounts", async () => {
    const app = await mountWithStoredLocale();
    try {
      await waitForApp(() => app.container.querySelector('[data-menu-id="language"]') !== null);
      expect(app.browser.document.documentElement.lang).toBe("zh-CN");
    } finally {
      await app.unmount();
    }
  });

  it("updates <html lang> when the shell switches the locale through the runtime", async () => {
    const app = await mountWithStoredLocale();
    try {
      await waitForApp(() => app.container.querySelector('[data-menu-id="language"]') !== null);
      expect(app.browser.document.documentElement.lang).toBe("zh-CN");

      const trigger = app.container.querySelector<HTMLButtonElement>('[data-menu-id="language"] > button');
      expect(trigger).not.toBeNull();
      await act(async () => trigger?.click());
      const english = [...app.container.querySelectorAll<HTMLElement>('[data-menu-id="language"] [role="menuitemradio"]')]
        .find((item) => item.textContent?.includes("English"));
      expect(english).not.toBeUndefined();
      await act(async () => english?.click());

      expect(app.browser.document.documentElement.lang).toBe("en");
      expect(app.browser.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    } finally {
      await app.unmount();
    }
  });
});
