import { ROUTES } from "./contracts/routes";

export const PUBLIC_ROUTE_MATRIX = Object.freeze(ROUTES.map((route) => Object.freeze({
  path: route.path,
  reactEntry: "/index.html",
  legacyFallback: true,
})));

export function isKnownReactRoute(pathname: string) {
  if (pathname.startsWith("/api/") || pathname.includes("..")) return false;
  if (PUBLIC_ROUTE_MATRIX.some((entry) => entry.path === pathname)) return true;
  return /^\/knowledge\/[A-Za-z0-9_-]+$/u.test(pathname)
    || /^\/admin\/submissions\/[A-Za-z0-9_-]+$/u.test(pathname);
}
