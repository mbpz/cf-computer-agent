import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    d1Migrations: D1Migration[];
  }
}

export const MIGRATIONS = inject("d1Migrations");
