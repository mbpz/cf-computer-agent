// Tab primitive: beUI `tabs` (beui.dev/components/motion/tabs, landed at
// `components/motion/tabs.tsx`) behind the repository's tab contract.
//
// Patches, per docs/product/2026-10-17-beui-full-adoption-matrix.md §17:
//   1. labels — none needed: every visible tab label comes from the caller
//      (`frontend/pages/admin/members-page.tsx`).
//   2. attribute passthrough — `Tabs` accepts/forwards rest props onto the
//      layout root (`motion/tabs.tsx:101`) and `TabsContent` accepts/forwards
//      rest props, `hidden` and `data-state` onto its panel (`:381`/`:387`).
//      The adapter needs those to carry `id`/`role`/`aria-controls`/
//      `aria-labelledby`/`aria-orientation`/`data-*` (roving keys,
//      `data-tab-value`, `data-admin-invitations`).
//   3. slots — none: the payload already renders caller children.
//   4. callbacks — none: the payload's `onValueChange`/trigger `onClick`
//      (preventDefault aware) are the callbacks we need.
//
// The payload supplies the visual/interaction core: pill indicator layout
// animation, scrollable list with edge controls, focus reveal, reduced-motion
// collapse. This adapter only supplies what the payload does not model —
// tablist/tab/tabpanel ids, `aria-controls`, roving tabIndex, Home/End/arrow
// keyboard path (`lib/tabs-keyboard.ts`), `data-state`, the `hidden` panel, the
// controlled/uncontrolled bridge and the 44px mobile hit target. Payload
// behaviour (animation, layout projection) is left untouched.
import * as React from "react";
import { Tabs as MotionTabs, TabsContent as MotionTabsContent, TabsList as MotionTabsList, TabsTrigger as MotionTabsTrigger } from "../motion/tabs";
import { cn } from "../../lib/utils";
import { tabsKeyAction, type TabsOrientation } from "../../lib/tabs-keyboard";

type TabsVariant = "pill" | "underline" | "segment";

interface TabsContextValue {
  baseId: string;
  value: string | undefined;
  orientation: TabsOrientation;
  setValue: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TABS_CONTEXT_REQUIRED");
  return context;
}

type MotionTabsProps = React.ComponentProps<typeof MotionTabs>;
type MotionTabsContentProps = React.ComponentProps<typeof MotionTabsContent>;

export function Tabs({ className, value: controlledValue, defaultValue, onValueChange, orientation = "horizontal", variant = "pill", children, ...props }: Omit<MotionTabsProps, "value" | "defaultValue" | "onValueChange" | "variant" | "children" | "className"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
  variant?: TabsVariant;
  className?: string;
  children: React.ReactNode;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const baseId = React.useId().replace(/:/gu, "");
  const value = controlledValue ?? internalValue;
  const setValue = React.useCallback((next: string) => {
    if (controlledValue === undefined) setInternalValue(next);
    onValueChange?.(next);
  }, [controlledValue, onValueChange]);
  const contextValue = React.useMemo(() => ({ baseId, value, orientation, setValue }), [baseId, value, orientation, setValue]);
  return <TabsContext.Provider value={contextValue}>
    <MotionTabs value={value} onValueChange={setValue} variant={variant} className={className} {...props}>{children}</MotionTabs>
  </TabsContext.Provider>;
}

export function TabsList({ className, wrapperClassName, onKeyDown, ...props }: React.HTMLAttributes<HTMLDivElement> & { wrapperClassName?: string }) {
  const context = useTabsContext();
  return <MotionTabsList
    aria-orientation={context.orientation}
    wrapperClassName={wrapperClassName}
    className={className}
    {...props}
    onKeyDown={(event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      const action = tabsKeyAction(event.key, context.orientation);
      if (!action) return;
      const root = event.currentTarget;
      const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[role='tab']:not([aria-disabled='true'])"));
      if (!tabs.length) return;
      event.preventDefault();
      const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
      const index = action === "first" ? 0 : action === "last" ? tabs.length - 1 : (current + (action === "next" ? 1 : -1) + tabs.length) % tabs.length;
      const next = tabs[index];
      if (!next) return;
      context.setValue(next.dataset.tabValue || "");
      next.focus();
    }}
  />;
}

export function TabsTrigger({ className, value, disabled = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = useTabsContext();
  const active = context.value === value;
  const suffix = encodeURIComponent(value).replace(/%/gu, "_");
  const tabId = `${context.baseId}-tab-${suffix}`;
  const panelId = `${context.baseId}-panel-${suffix}`;
  return <MotionTabsTrigger
    {...props}
    value={value}
    disabled={disabled}
    id={tabId}
    aria-controls={panelId}
    aria-disabled={disabled ? "true" : undefined}
    tabIndex={active ? 0 : -1}
    data-tab-value={value}
    data-state={active ? "active" : "inactive"}
    className={cn("max-lg:min-h-11 focus-visible:ring-2 focus-visible:ring-ring", className)}
  />;
}

export function TabsContent({ className, value, ...props }: Omit<MotionTabsContentProps, "value" | "className" | "children"> & { value: string; className?: string; children: React.ReactNode }) {
  const context = useTabsContext();
  const suffix = encodeURIComponent(value).replace(/%/gu, "_");
  const active = context.value === value;
  return <MotionTabsContent
    value={value}
    role="tabpanel"
    id={`${context.baseId}-panel-${suffix}`}
    aria-labelledby={`${context.baseId}-tab-${suffix}`}
    tabIndex={0}
    data-state={active ? "active" : "inactive"}
    className={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    {...props}
  />;
}
