export interface RouteGuard {
  begin(): number;
  capture(pathname: string): Readonly<{ generation: number; pathname: string }>;
  owner(routeGeneration: number, pathname: string): Readonly<{ generation: number; pathname: string }>;
  isCurrent(value: number): boolean;
  owns(owner: Readonly<{ generation: number; pathname: string }>, pathname: string): boolean;
}

export function createRouteGuard(): RouteGuard;
export interface OperationGuard {
  begin(): number;
  isCurrent(value: number): boolean;
}
export function createOperationGuard(): OperationGuard;
export function runLatestOperation<T>(
  guard: OperationGuard,
  operation: () => Promise<T>,
  onSuccess: (value: T) => void,
  onError: (error: unknown) => void,
): Promise<void>;
export function drawerState(open: boolean): Readonly<{
  open: boolean;
  ariaExpanded: "true" | "false";
  ariaHidden: "true" | "false";
  inert: boolean;
}>;
export function anonymousShellState(): Readonly<{
  statusMessage: "";
  drawer: ReturnType<typeof drawerState>;
}>;
export function sessionBootstrapState(
  status: number,
  session?: BrowserSession,
): Readonly<{ kind: "anonymous" } | { kind: "authenticated"; session: BrowserSession } | { kind: "error" }>;
export function postLogout(
  request: (path: string, init: RequestInit) => Promise<Response>,
): Promise<Readonly<{ kind: "anonymous" }>>;
