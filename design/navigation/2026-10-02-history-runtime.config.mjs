import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: new URL("../../", import.meta.url).pathname,
  plugins: [react(), tailwindcss(), {
    name: "local-history-fixture",
    configureServer(server) { server.middlewares.use((req, _res, next) => {
      if (["/", "/tasks", "/inbox"].includes((req.url ?? "").split("?")[0])) req.url = "/design/navigation/2026-10-02-history-runtime.html";
      next();
    }); },
  }],
  server: { host: "127.0.0.1", port: 61008, strictPort: true, fs: { deny: ["**/.git/**", "**/.dev.vars*", "**/SECRETS*", "**/*.pem", "**/.env*"] } },
});
