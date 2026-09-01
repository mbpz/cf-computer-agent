// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp } from "../helpers/authenticated-app-harness";

vi.mock("../../frontend/app", () => ({
  App() {
    throw new Error("forced App mount failure");
  },
}));

const { Window } = await import("happy-dom");

describe("authenticated App harness cleanup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("restores browser, DOM, globals, and mocks when mounting fails before returning a handle", async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const mockTarget = { operation: () => "original" };
    const originalOperation = mockTarget.operation;
    vi.spyOn(mockTarget, "operation").mockReturnValue("mocked");

    const mounting = mountApp({
      url: "https://app.test/forced-mount-failure",
      fetch: () => Promise.reject(new Error("fetch should not be reached")),
    });

    const mountedBrowser = globalThis.window as unknown as Window;
    const mountedContainer = mountedBrowser.document.body.firstElementChild;
    const closeBrowser = mountedBrowser.close.bind(mountedBrowser);
    let closeCalls = 0;
    mountedBrowser.close = () => {
      closeCalls += 1;
      closeBrowser();
    };

    await expect(mounting).rejects.toThrow("forced App mount failure");

    expect(closeCalls).toBe(1);
    expect(mountedContainer?.isConnected).toBe(false);
    expect(globalThis.window).toBe(originalWindow);
    expect(globalThis.document).toBe(originalDocument);
    expect(mockTarget.operation).toBe(originalOperation);
  });

  it("attempts later cleanup steps when removing the failed mount container throws", async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const mockTarget = { operation: () => "original" };
    const originalOperation = mockTarget.operation;
    vi.spyOn(mockTarget, "operation").mockReturnValue("mocked");

    const mounting = mountApp({
      url: "https://app.test/forced-cleanup-failure",
      fetch: () => Promise.reject(new Error("fetch should not be reached")),
    });
    const mountedBrowser = globalThis.window as unknown as Window;
    const mountedContainer = mountedBrowser.document.body.firstElementChild as HTMLElement;
    const closeBrowser = mountedBrowser.close.bind(mountedBrowser);
    let closeCalls = 0;
    mountedBrowser.close = () => {
      closeCalls += 1;
      closeBrowser();
    };
    const removeContainer = mountedContainer.remove.bind(mountedContainer);
    mountedContainer.remove = () => {
      removeContainer();
      throw new Error("forced container cleanup failure");
    };

    await expect(mounting).rejects.toThrow("App mount failed and cleanup failed");

    expect(closeCalls).toBe(1);
    expect(mountedContainer.isConnected).toBe(false);
    expect(globalThis.window).toBe(originalWindow);
    expect(globalThis.document).toBe(originalDocument);
    expect(mockTarget.operation).toBe(originalOperation);
  });
});
