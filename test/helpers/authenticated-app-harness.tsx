import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { App } from "../../frontend/app";

const vmContexts = new WeakSet<object>();

class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) {
      context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
}

vi.mock("node:vm", () => ({
  default: {
    Script: InertVmScript,
    createContext(value: object) { vmContexts.add(value); return value; },
    isContext(value: object) { return vmContexts.has(value); },
  },
  Script: InertVmScript,
}));
vi.mock("vm", () => ({
  default: {
    Script: InertVmScript,
    createContext(value: object) { vmContexts.add(value); return value; },
    isContext(value: object) { return vmContexts.has(value); },
  },
  Script: InertVmScript,
}));

const { Window } = await import("happy-dom");

export interface MountedApp {
  readonly browser: InstanceType<typeof Window>;
  readonly container: HTMLElement;
  readonly root: Root;
  unmount(): Promise<void>;
}

export async function mountAuthenticatedApp(options: {
  url: string;
  role: "contributor" | "admin";
  permissionMask: string;
  fetch: typeof globalThis.fetch;
}): Promise<MountedApp> {
  const session = {
    member: {
      id: options.role === "admin" ? "admin-route-auditor" : "contributor-route-auditor",
      email: `${options.role}@app.test`,
      role: options.role,
    },
    capabilities: options.role === "admin"
      ? ["knowledge:read", "submission:create", "submission:read-own", "submission:read-all", "knowledge:review", "member:manage", "role:manage", "menu:manage", "space:manage", "audit:read", "analytics:read"]
      : ["knowledge:read", "submission:create", "submission:read-own"],
    permissionMask: options.permissionMask,
    logoutUrl: "/auth/logout",
  };
  return mountApp({
    url: options.url,
    fetch: (input, init) => String(input) === "/api/session"
      ? Promise.resolve(Response.json(session))
      : options.fetch(input, init),
  });
}

export async function mountApp(options: {
  url: string;
  fetch: typeof globalThis.fetch;
}): Promise<MountedApp> {
  const browser = new Window({ url: options.url });
  let container: HTMLElement | undefined;
  let root: Root | undefined;
  let cleanupStarted = false;

  const cleanup = async (): Promise<void> => {
    if (cleanupStarted) return;
    cleanupStarted = true;
    const errors: unknown[] = [];
    const attempt = async (operation: () => void | Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        errors.push(error);
      }
    };

    await attempt(async () => {
      if (root !== undefined) await act(async () => root?.unmount());
    });
    await attempt(() => container?.remove());
    await attempt(() => browser.close());
    await attempt(() => vi.unstubAllGlobals());
    await attempt(() => vi.restoreAllMocks());

    if (errors.length > 0) throw new AggregateError(errors, "Authenticated App cleanup failed");
  };

  try {
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("history", browser.history);
    vi.stubGlobal("location", browser.location);
    vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("fetch", options.fetch);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
    await act(async () => root?.render(<App />));
    await waitFor(() => container?.querySelector("[data-shell-root]") !== null || container?.querySelector("main") !== null);
    return { browser, container, root, unmount: cleanup };
  } catch (mountError) {
    try {
      await cleanup();
    } catch (cleanupError) {
      const cleanupErrors = cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError];
      throw new AggregateError([mountError, ...cleanupErrors], "App mount failed and cleanup failed");
    }
    throw mountError;
  }
}

export async function waitForApp(predicate: () => boolean): Promise<void> {
  await waitFor(predicate);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    if (predicate()) return;
  }
  throw new Error("authenticated App condition not reached");
}
