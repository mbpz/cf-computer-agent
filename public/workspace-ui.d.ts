export interface RouteGuard {
  begin(): number;
  isCurrent(value: number): boolean;
}

export function createRouteGuard(): RouteGuard;
export function drawerState(open: boolean): Readonly<{
  open: boolean;
  ariaExpanded: "true" | "false";
  ariaHidden: "true" | "false";
  inert: boolean;
}>;
