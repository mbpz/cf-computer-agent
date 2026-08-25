export const FRONTEND_BUILD = Object.freeze({
  root: "frontend",
  outDir: "dist",
  entry: "/main.tsx",
  command: "npm run build:ui && wrangler deploy --dry-run",
});
