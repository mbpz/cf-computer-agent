// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createFocusRestorer } from "../../frontend/lib/focus";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { SubmitPage } from "../../frontend/pages/submit-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const session = { member: { id: "m1", email: "a@example.com", role: "contributor" as const }, capabilities: ["submission:create", "knowledge:read"], logoutUrl: "/auth/logout" };

describe("frontend accessibility gates", () => {
  it("keeps skip navigation, landmarks, names, and form associations", () => {
    const shell = renderToStaticMarkup(<AppShell session={session} pathname="/submit" locale={createLocaleRuntime()}><SubmitPage draft={{ mode: "text", title: "Guide", content: "Body" }} state={{ kind: "idle" }} /></AppShell>);
    expect(shell).toContain('href="#main-content"');
    expect(shell).toContain('aria-label="Primary navigation"');
    expect(shell).toContain('aria-label="Language"');
    expect(shell).toContain('for="submission-title"');
    expect(shell).not.toMatch(/>\s*(undefined|null)\s*</u);
  });

  it("restores focus ownership when a transient navigation surface closes", () => {
    const focus = createFocusRestorer();
    const owner = { focus: () => { owner.focused = true; }, focused: false };
    focus.capture(owner);
    expect(focus.release()).toBe(true);
    expect(owner.focused).toBe(true);
    expect(focus.release()).toBe(false);
  });
});
