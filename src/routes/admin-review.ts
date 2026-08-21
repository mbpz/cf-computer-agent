import { requireCapability } from "../authorization/policy";
import { AppError } from "../http";
import type { Principal } from "../identity/principal";

export function routeAdminReviewApi(url: URL, principal: Principal): Response | undefined {
  if (!url.pathname.startsWith("/api/admin/submissions/")) return undefined;

  requireCapability(principal, "knowledge:review");
  throw new AppError("NOT_IMPLEMENTED", "Knowledge review routes are not implemented", 501);
}
