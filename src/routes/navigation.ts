import { parsePermissionMask } from "../authorization/permission-bitmap";
import { permissionMaskForPrincipal } from "../authorization/policy";
import { MenusRepository } from "../authorization/menus-repository";
import { AppError, jsonResponse, methodNotAllowed, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { menuAvailability } from "../../shared/workspace-route-capabilities";
import type { MenuNode } from "../authorization/menu-tree";

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
  const navigation = await services.menus.navigation(permissionMask);
  return jsonResponse({ tree: navigation.tree.map(withAvailability) }, 200, context.requestId);
}

function withAvailability(node: MenuNode): MenuNode & ReturnType<typeof menuAvailability> {
  return { ...node, ...menuAvailability(node.path), children: node.children.map(withAvailability) };
}
