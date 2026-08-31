import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Card, CardContent } from "./card";
import { Skeleton } from "./skeleton";

export type PageStateKind = "loading" | "empty" | "error" | "forbidden" | "degraded";

export function PageState({ kind, title, description, children }: { kind: PageStateKind; title: string; description?: string; children?: ReactNode }) {
  if (kind === "loading") return <div data-page-state={kind} aria-busy="true" className="space-y-3"><Skeleton className="h-8" /><Skeleton className="h-24" /></div>;
  if (kind === "empty") return <Card data-page-state={kind}><CardContent className="p-6"><p className="text-sm font-medium">{title}</p>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}{children}</CardContent></Card>;
  if (kind === "degraded") return <Alert data-page-state={kind}><AlertTitle>{title}</AlertTitle>{description && <AlertDescription>{description}</AlertDescription>}{children}</Alert>;
  return <Alert data-page-state={kind} variant="destructive" role="alert"><AlertTitle>{title}</AlertTitle>{description && <AlertDescription>{description}</AlertDescription>}{children}</Alert>;
}
