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
  // The administration group is an administrator surface, not a mask grant: a
  // contributor holding an elevated role must not receive or see it.
  const includeAdmin = principal.role === "admin";
  const navigation = await services.menus.navigation(permissionMask);
  return jsonResponse({ tree: navigation.tree.flatMap((node) => {
    const annotated = withAvailability(node, includeAdmin);
    return annotated ? [annotated] : [];
  }) }, 200, context.requestId);
}

function withAvailability(node: MenuNode, includeAdmin: boolean): (MenuNode & { availability: "ready" | "coming_soon"; disabledReason?: "not_implemented" }) | null {
  if (!includeAdmin && node.groupName === "admin") return null;
  const availability = menuAvailability(node.path);
  if (!availability) return null;
  const children = node.children.flatMap((child) => {
    const annotated = withAvailability(child, includeAdmin);
    return annotated ? [annotated] : [];
  });
  return { ...node, ...availability, children };
}
