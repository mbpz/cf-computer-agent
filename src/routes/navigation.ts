import { parsePermissionMask } from "../authorization/permission-bitmap";
import { permissionMaskForPrincipal } from "../authorization/policy";
import { MenusRepository } from "../authorization/menus-repository";
import { AppError, jsonResponse, methodNotAllowed, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";

export interface NavigationRouteServices {
  menus: Pick<MenusRepository, "navigation">;
}

export async function routeNavigationApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: NavigationRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/navigation") return undefined;
  if (request.method !== "GET") return methodNotAllowed("GET", context);
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  const permissionMask = parsePermissionMask(permissionMaskForPrincipal(principal));
  return jsonResponse(await services.menus.navigation(permissionMask), 200, context.requestId);
}
