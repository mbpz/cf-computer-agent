import * as React from "react";
import { cn } from "../../lib/utils";
import { tabsKeyAction, type TabsOrientation } from "../../lib/tabs-keyboard";

interface TabsContextValue {
  baseId: string;
  value: string | undefined;
  orientation: TabsOrientation;
  firstValue: React.MutableRefObject<string | undefined>;
  setValue: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TABS_CONTEXT_REQUIRED");
  return context;
}

export function Tabs({ className, value: controlledValue, defaultValue, onValueChange, orientation = "horizontal", children, ...props }: React.HTMLAttributes<HTMLDivElement> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const firstValue = React.useRef<string>();
  const baseId = React.useId().replace(/:/gu, "");
  const value = controlledValue ?? internalValue;
  const setValue = (next: string) => {
    if (controlledValue === undefined) setInternalValue(next);
    onValueChange?.(next);
  };
  return <TabsContext.Provider value={{ baseId, value, orientation, firstValue, setValue }}><div className={className} {...props}>{children}</div></TabsContext.Provider>;
}

export function TabsList({ className, onKeyDown, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = useTabsContext();
  return <div role="tablist" aria-orientation={context.orientation} className={cn("inline-flex items-center gap-1 rounded-md bg-muted p-1", className)} onKeyDown={(event) => {
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
  }} {...props} />;
}

export function TabsTrigger({ className, value, disabled = false, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = useTabsContext();
  if (!context.firstValue.current) context.firstValue.current = value;
  const activeValue = context.value ?? context.firstValue.current;
  const active = activeValue === value;
  const suffix = encodeURIComponent(value).replace(/%/gu, "_");
  const tabId = `${context.baseId}-tab-${suffix}`;
  const panelId = `${context.baseId}-panel-${suffix}`;
  return <button type="button" role="tab" id={tabId} data-tab-value={value} aria-controls={panelId} aria-selected={active ? "true" : "false"} aria-disabled={disabled ? "true" : undefined} tabIndex={active ? 0 : -1} disabled={disabled} className={cn("rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground", className)} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && !disabled) context.setValue(value); }} {...props} data-state={active ? "active" : "inactive"} />;
}

export function TabsContent({ className, value, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = useTabsContext();
  if (!context.firstValue.current) context.firstValue.current = value;
  const suffix = encodeURIComponent(value).replace(/%/gu, "_");
  const active = (context.value ?? context.firstValue.current) === value;
  return <div role="tabpanel" id={`${context.baseId}-panel-${suffix}`} aria-labelledby={`${context.baseId}-tab-${suffix}`} tabIndex={0} hidden={!active} data-state={active ? "active" : "inactive"} className={cn("mt-3 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />;
}
