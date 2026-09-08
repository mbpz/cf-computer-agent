import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { FRONTEND_BUILD } from "./frontend/build-contract.ts";
import { workbenchLandingProvenance } from "./scripts/workbench-landing-provenance.mjs";

export default defineConfig({
  root: FRONTEND_BUILD.root,
  plugins: [react(), tailwindcss(), workbenchLandingProvenance()],
  build: {
    outDir: FRONTEND_BUILD.outDir,
    emptyOutDir: true,
    manifest: "manifest.json",
  },
});
