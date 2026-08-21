import { requireCapability } from "../authorization/policy";
import { AppError } from "../http";
import type { Principal } from "../identity/principal";

export function routeLibraryApi(url: URL, principal: Principal): Response | undefined {
  if (url.pathname !== "/api/knowledge" && !url.pathname.startsWith("/api/knowledge/")) {
    return undefined;
  }

  requireCapability(principal, "knowledge:read");
  throw new AppError("NOT_IMPLEMENTED", "Knowledge library routes are not implemented", 501);
}
