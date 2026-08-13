export function createRouteGuard() {
  let generation = 0;
  return Object.freeze({
    begin() { generation += 1; return generation; },
    isCurrent(value) { return value === generation; },
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
