export type TabsOrientation = "horizontal" | "vertical";
export type TabsKeyAction = "next" | "previous" | "first" | "last";

export function tabsKeyAction(key: string, orientation: TabsOrientation): TabsKeyAction | undefined {
  if (key === "Home") return "first";
  if (key === "End") return "last";
  if (orientation === "vertical") {
    if (key === "ArrowDown") return "next";
    if (key === "ArrowUp") return "previous";
  } else {
    if (key === "ArrowRight") return "next";
    if (key === "ArrowLeft") return "previous";
  }
  return undefined;
}
