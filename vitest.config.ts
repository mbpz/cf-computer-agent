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
          BOOTSTRAP_ADMIN_EMAIL: "bootstrap-only@example.test",
          GITHUB_OAUTH_CLIENT_ID: "fake-github-client-id",
          GITHUB_OAUTH_CLIENT_SECRET: "fake-github-client-secret",
          ALLOWED_MEMBER_EMAILS: "bootstrap-only@example.test",
          AUTOMATION_CLIENT_ID: "fake-automation-client-id",
          AUTOMATION_SECRET: "fake-automation-secret",
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
