import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { readdir } from "node:fs/promises";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("migrations");
const shippedPublicAssets = await publicAssetPaths("public");

async function publicAssetPaths(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? publicAssetPaths(`${directory}/${entry.name}`, relativePath)
      : [relativePath];
  }));
  return paths.flat().sort();
}

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
      shippedPublicAssets,
    },
  },
});
