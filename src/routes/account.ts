import { APP_CONFIG } from "../config";
import { AppError, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { SessionService } from "../identity/session";
import type { PasswordAuthService } from "../password/service";

export interface AccountRouteServices {
  passwords: Pick<PasswordAuthService, "changePassword">;
  sessions: Pick<SessionService, "revokeOtherSessions">;
}

/**
 * `POST /api/account/password` — authenticated password change.
 *
 * This is the recovery path for accounts that predate invitation codes and
 * cannot pass the unauthenticated reset (which requires the bound invitation).
 * An existing password account must prove the current password; an account
 * without a password (for example a GitHub-only member) may set its first one
 * from a live session. Other sessions are revoked; the caller's session stays.
 */
export async function routeAccountApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: AccountRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/account/password") return undefined;
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  if (request.method !== "POST") return methodNotAllowed("POST", context);
  requireNoQuery(url);
  const input = strictRecord(
    await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
    ["currentPassword", "newPassword"],
  );
  const newPassword = input.newPassword;
  if (typeof newPassword !== "string") {
    throw new AppError("PASSWORD_CHANGE_INVALID", "New password is required", 400);
  }
  const currentPassword = input.currentPassword;
  if (currentPassword !== undefined && currentPassword !== null && typeof currentPassword !== "string") {
    throw new AppError("PASSWORD_CHANGE_INVALID", "Current password is invalid", 400);
  }
  await services.passwords.changePassword({
    memberId: principal.memberId,
    ...(typeof currentPassword === "string" ? { currentPassword } : {}),
    newPassword,
  });
  await services.sessions.revokeOtherSessions(request, principal.memberId);
  return jsonResponse({ changed: true }, 200, context.requestId);
}

/** Local copy of the shared strict-object guard: the account route has exactly
 * two optional/required keys and must reject any extra field. */
function strictRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("PASSWORD_CHANGE_INVALID", "Password change request is invalid", 400);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new AppError("PASSWORD_CHANGE_INVALID", "Password change request is invalid", 400);
  }
  return record;
}
