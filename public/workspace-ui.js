export function createRouteGuard() {
  let generation = 0;
  return Object.freeze({
    begin() { generation += 1; return generation; },
    capture(pathname) { return Object.freeze({ generation, pathname }); },
    isCurrent(value) { return value === generation; },
    owns(owner, pathname) { return owner.generation === generation && owner.pathname === pathname; },
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
