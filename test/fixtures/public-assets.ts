import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    shippedPublicAssets: string[];
  }
}

export const SHIPPED_PUBLIC_ASSETS = inject("shippedPublicAssets");
