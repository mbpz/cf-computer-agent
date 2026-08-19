import { describe, expect, it } from "vitest";
import * as workspaceUi from "../../public/workspace-ui.js";

const {
  anonymousShellState,
  createOperationGuard,
  createRouteGuard,
  drawerState,
  postLogout,
  sessionBootstrapState,
  runLatestOperation,
} = workspaceUi;

describe("createRouteGuard", () => {
  it("rejects an older route completion after newer navigation begins", () => {
    const guard = createRouteGuard();
    const home = guard.begin();
    const search = guard.begin();

    expect(guard.isCurrent(home)).toBe(false);
    expect(guard.isCurrent(search)).toBe(true);
  });

  it("rejects an old-render mutation handler after a newer route begins", () => {
    const guard = createRouteGuard();
    const submitGeneration = guard.begin();
    const submission = guard.owner(submitGeneration, "/submit");

    expect(guard.owns(submission, "/submit")).toBe(true);
    guard.begin();
    expect(guard.owns(submission, "/submit")).toBe(false);
  });
});

describe("createOperationGuard", () => {
  it("lets only the newest same-route operation update its result", () => {
    const guard = createOperationGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it("prevents an older same-route error from replacing a newer success", () => {
    const guard = createOperationGuard();
    const older = guard.begin();
    const newer = guard.begin();
    const rendered: string[] = [];

    if (guard.isCurrent(newer)) rendered.push("newer-success");
    if (guard.isCurrent(older)) rendered.push("older-error");

    expect(rendered).toEqual(["newer-success"]);
  });

  it("suppresses an older completion after a newer same-route operation finishes", async () => {
    const guard = createOperationGuard();
    const first = deferred<string>();
    const second = deferred<string>();
    const rendered: string[] = [];

    const firstRun = runLatestOperation(guard, () => first.promise, (value) => rendered.push(value), () => undefined);
    const secondRun = runLatestOperation(guard, () => second.promise, (value) => rendered.push(value), () => undefined);
    second.resolve("newer-success");
    await secondRun;
    first.resolve("older-success");
    await firstRun;

    expect(rendered).toEqual(["newer-success"]);
  });

  it("suppresses an older error after a newer same-route operation succeeds", async () => {
    const guard = createOperationGuard();
    const first = deferred<string>();
    const second = deferred<string>();
    const rendered: string[] = [];

    const firstRun = runLatestOperation(guard, () => first.promise, (value) => rendered.push(value), (error) => rendered.push(String(error)));
    const secondRun = runLatestOperation(guard, () => second.promise, (value) => rendered.push(value), (error) => rendered.push(String(error)));
    second.resolve("newer-success");
    await secondRun;
    first.reject(new Error("older-error"));
    await firstRun;

    expect(rendered).toEqual(["newer-success"]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("drawerState", () => {
  it("removes a closed mobile drawer from focus and accessibility navigation", () => {
    expect(drawerState(false)).toEqual({ open: false, ariaExpanded: "false", ariaHidden: "true", inert: true });
  });

  it("exposes an open mobile drawer", () => {
    expect(drawerState(true)).toEqual({ open: true, ariaExpanded: "true", ariaHidden: "false", inert: false });
  });
});

describe("sessionBootstrapState", () => {
  it("treats an anonymous session response as an inert login state", () => {
    expect(sessionBootstrapState(401)).toEqual({ kind: "anonymous" });
  });

  it("keeps a valid member session available to the capability-driven shell", () => {
    const session = {
      member: { id: "member-1", email: "contributor@example.test", role: "contributor" },
      capabilities: ["legacy:read", "submission:create", "submission:read-own"],
    };

    expect(sessionBootstrapState(200, session)).toEqual({ kind: "authenticated", session });
  });

  it("does not mistake a non-session failure for an anonymous login", () => {
    expect(sessionBootstrapState(500)).toEqual({ kind: "error" });
  });
});

describe("postLogout", () => {
  it("posts logout with browser credentials then returns the login state", async () => {
    const requests: Array<{ path: string; init: RequestInit }> = [];
    const request = async (path: string, init: RequestInit) => {
      requests.push({ path, init });
      return new Response(null, { status: 204 });
    };

    await expect(postLogout(request)).resolves.toEqual({ kind: "anonymous" });
    expect(requests).toEqual([{ path: "/auth/logout", init: { method: "POST", credentials: "same-origin" } }]);
  });
});

describe("createLogoutController", () => {
  const factory = (workspaceUi as typeof workspaceUi & {
    createLogoutController?: (
      request: typeof fetch,
      callbacks: {
        onPendingChange: (pending: boolean) => void;
        onSuccess: () => void;
        onError: (error: unknown) => void;
      },
    ) => { run: () => Promise<void>; invalidate: () => void };
  }).createLogoutController;

  it("keeps logout single-flight and exposes pending state for disabling the button", async () => {
    expect(factory).toBeTypeOf("function");
    if (!factory) return;
    const response = deferred<Response>();
    const pending: boolean[] = [];
    let requests = 0;
    let successes = 0;
    const controller = factory(async () => {
      requests += 1;
      return response.promise;
    }, {
      onPendingChange: (value) => pending.push(value),
      onSuccess: () => { successes += 1; },
      onError: () => undefined,
    });

    const first = controller.run();
    const duplicate = controller.run();
    expect(duplicate).toBe(first);
    expect(requests).toBe(1);
    expect(pending).toEqual([true]);

    response.resolve(new Response(null, { status: 204 }));
    await first;
    expect(pending).toEqual([true, false]);
    expect(successes).toBe(1);
  });

  it.each([
    ["failure", new Error("stale logout failure"), new Response(null, { status: 204 }), ["new-success"]],
    ["success", new Response(null, { status: 204 }), new Response(null, { status: 500 }), ["new-error"]],
  ])("generation-guards a late old %s after a newer completion", async (_label, oldResult, newResult, expected) => {
    expect(factory).toBeTypeOf("function");
    if (!factory) return;
    const oldResponse = deferred<Response>();
    const newResponse = deferred<Response>();
    const responses = [oldResponse, newResponse];
    const rendered: string[] = [];
    const controller = factory(async () => responses.shift()!.promise, {
      onPendingChange: () => undefined,
      onSuccess: () => rendered.push(responses.length === 0 ? "new-success" : "old-success"),
      onError: () => rendered.push(responses.length === 0 ? "new-error" : "old-error"),
    });

    const oldRun = controller.run();
    controller.invalidate();
    const newRun = controller.run();
    if (newResult instanceof Error) newResponse.reject(newResult);
    else newResponse.resolve(newResult);
    await newRun;
    if (oldResult instanceof Error) oldResponse.reject(oldResult);
    else oldResponse.resolve(oldResult);
    await oldRun;

    expect(rendered).toEqual(expected);
  });
});

describe("anonymousShellState", () => {
  it("clears a private status flash when logout returns the shell to login", () => {
    const privateStatus = "已提交“Private submission”";
    const state = anonymousShellState();

    expect(state.statusMessage).toBe("");
    expect(state.statusMessage).not.toContain(privateStatus);
  });

  it("closes an open mobile drawer before showing the anonymous login", () => {
    const state = anonymousShellState();

    expect(state.drawer).toEqual({ open: false, ariaExpanded: "false", ariaHidden: "true", inert: true });
  });
});
