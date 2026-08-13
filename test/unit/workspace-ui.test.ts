import { describe, expect, it } from "vitest";
import { createOperationGuard, createRouteGuard, drawerState, runLatestOperation } from "../../public/workspace-ui.js";

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
