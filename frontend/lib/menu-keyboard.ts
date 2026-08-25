export type MenuKeyAction = "close" | "first" | "last" | "next" | "previous" | null;

export function menuKeyAction(key: string): MenuKeyAction {
  if (key === "Escape") return "close";
  if (key === "Home") return "first";
  if (key === "End") return "last";
  if (key === "ArrowDown") return "next";
  if (key === "ArrowUp") return "previous";
  return null;
}
