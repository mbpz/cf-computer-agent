import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: {
          APP_TOKEN: "worker-test-token",
          ALLOW_INSECURE_LOCAL: "false",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    provide: {
      d1Migrations: migrations,
    },
  },
});
