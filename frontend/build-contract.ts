export const FRONTEND_BUILD = Object.freeze({
  root: "frontend",
  outDir: "dist",
  entry: "/main.tsx",
  command: "npm run build:ui && npm run build:secrets && wrangler deploy --dry-run",
});
