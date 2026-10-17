import type { ReactNode } from "react";
import { Loader } from "../motion/loader";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Card, CardContent } from "./card";
import { Skeleton } from "./skeleton";

export type PageStateKind = "loading" | "empty" | "error" | "forbidden" | "degraded";

/**
 * The app's one page-state surface. Every kind stays selectable by its
 * `data-page-state` value, and each one is carried by the beUI source that owns
 * that surface: `motion/loader` while a read is in flight, `card` for an empty
 * list, `alert` for the notice and failure states. `error` and `forbidden` keep
 * `role="alert"`; `degraded` is a notice, so it announces politely.
 *
 * The loading branch keeps the caller's localized `title` as the loader's label
 * instead of showing English, and keeps the two placeholder bars so the forty-odd
 * pages that use it keep their geometry.
 */
export function PageState({ kind, title, description, children }: { kind: PageStateKind; title: string; description?: string; children?: ReactNode }) {
  if (kind === "loading") return <div data-page-state={kind} aria-busy="true" className="space-y-3"><Loader size={20} label={title} className="text-muted-foreground" /><Skeleton className="h-8" /><Skeleton className="h-24" /></div>;
  if (kind === "empty") return <Card data-page-state={kind}><CardContent className="p-6"><p className="text-sm font-medium">{title}</p>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}{children}</CardContent></Card>;
  if (kind === "degraded") return <Alert data-page-state={kind} role="status"><AlertTitle>{title}</AlertTitle>{description && <AlertDescription>{description}</AlertDescription>}{children}</Alert>;
  return <Alert data-page-state={kind} variant="destructive" role="alert"><AlertTitle>{title}</AlertTitle>{description && <AlertDescription>{description}</AlertDescription>}{children}</Alert>;
}
