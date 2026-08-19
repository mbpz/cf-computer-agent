export function createRouteGuard() {
  let generation = 0;
  return Object.freeze({
    begin() { generation += 1; return generation; },
    capture(pathname) { return Object.freeze({ generation, pathname }); },
    owner(routeGeneration, pathname) { return Object.freeze({ generation: routeGeneration, pathname }); },
    isCurrent(value) { return value === generation; },
    owns(owner, pathname) { return owner.generation === generation && owner.pathname === pathname; },
  });
}

export function createOperationGuard() {
  let generation = 0;
  return Object.freeze({
    begin() { generation += 1; return generation; },
    isCurrent(value) { return value === generation; },
  });
}

export async function runLatestOperation(guard, operation, onSuccess, onError) {
  const generation = guard.begin();
  try {
    const value = await operation();
    if (guard.isCurrent(generation)) onSuccess(value);
  } catch (error) {
    if (guard.isCurrent(generation)) onError(error);
  }
}

export function createLogoutController(request, callbacks) {
  const guard = createOperationGuard();
  let active;
  return Object.freeze({
    run() {
      if (active) return active;
      const generation = guard.begin();
      callbacks.onPendingChange(true);
      active = postLogout(request).then(
        () => {
          if (!guard.isCurrent(generation)) return;
          active = undefined;
          callbacks.onPendingChange(false);
          callbacks.onSuccess();
        },
        (error) => {
          if (!guard.isCurrent(generation)) return;
          active = undefined;
          callbacks.onPendingChange(false);
          callbacks.onError(error);
        },
      );
      return active;
    },
    invalidate() {
      guard.begin();
      active = undefined;
      callbacks.onPendingChange(false);
    },
  });
}

export function drawerState(open) {
  return Object.freeze({
    open,
    ariaExpanded: String(open),
    ariaHidden: String(!open),
    inert: !open,
  });
}

export function anonymousShellState() {
  return Object.freeze({
    statusMessage: "",
    drawer: drawerState(false),
  });
}

export function sessionBootstrapState(status, session) {
  if (status === 401) return Object.freeze({ kind: "anonymous" });
  if (status >= 200 && status < 300 && session?.member && Array.isArray(session.capabilities)) {
    return Object.freeze({ kind: "authenticated", session });
  }
  return Object.freeze({ kind: "error" });
}

export async function postLogout(request) {
  const response = await request("/auth/logout", { method: "POST", credentials: "same-origin" });
  if (!response.ok) {
    const error = new Error(response.statusText || "退出失败，请重试。");
    error.status = response.status;
    throw error;
  }
  return sessionBootstrapState(401);
}
