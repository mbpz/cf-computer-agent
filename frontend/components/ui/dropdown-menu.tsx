import * as React from "react";
import { cn } from "../../lib/utils";

export const DropdownMenu = ({ children }: { children: React.ReactNode }) => <details className="relative">{children}</details>;
export const DropdownMenuTrigger = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <summary className={cn("cursor-pointer list-none rounded-md p-2 hover:bg-accent", className)} {...props} />;
export const DropdownMenuContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("absolute right-0 z-20 mt-2 min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md", className)} {...props} />;
export const DropdownMenuItem = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" className={cn("flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent", className)} {...props} />;
