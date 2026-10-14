import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { FRONTEND_BUILD } from "./frontend/build-contract.ts";
import { workbenchLandingProvenance } from "./scripts/workbench-landing-provenance.mjs";

export default defineConfig({
  root: FRONTEND_BUILD.root,
  plugins: [react(), tailwindcss(), workbenchLandingProvenance()],
  resolve: {
    // Matches the `@/*` paths entry in tsconfig.json and the aliases declared in
    // frontend/components.json that the shadcn registry installers write into.
    alias: { "@": fileURLToPath(new URL("./frontend", import.meta.url)) },
  },
  build: {
    outDir: FRONTEND_BUILD.outDir,
    emptyOutDir: true,
    manifest: "manifest.json",
  },
});
