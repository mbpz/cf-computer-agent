export interface RouteGuard {
  begin(): number;
  capture(pathname: string): Readonly<{ generation: number; pathname: string }>;
  owner(routeGeneration: number, pathname: string): Readonly<{ generation: number; pathname: string }>;
  isCurrent(value: number): boolean;
  owns(owner: Readonly<{ generation: number; pathname: string }>, pathname: string): boolean;
}

export function createRouteGuard(): RouteGuard;
export function drawerState(open: boolean): Readonly<{
  open: boolean;
  ariaExpanded: "true" | "false";
  ariaHidden: "true" | "false";
  inert: boolean;
}>;
