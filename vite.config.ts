import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { FRONTEND_BUILD } from "./frontend/build-contract.ts";

export default defineConfig({
  root: FRONTEND_BUILD.root,
  plugins: [react()],
  build: {
    outDir: FRONTEND_BUILD.outDir,
    emptyOutDir: true,
  },
});
