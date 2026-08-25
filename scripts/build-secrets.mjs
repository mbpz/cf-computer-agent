import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const CREDENTIAL_PATTERNS = Object.freeze([
  { reason: "credential-name", pattern: /\b(?:GITHUB_OAUTH_CLIENT_(?:ID|SECRET)|BOOTSTRAP_ADMIN_EMAIL|ALLOWED_MEMBER_EMAILS|AUTOMATION_(?:CLIENT_ID|SECRET)|APP_TOKEN|ACCESS_TEAM_DOMAIN|ACCESS_AUD)\b/iu },
  { reason: "credential-field", pattern: /\b(?:client_secret|access_token|refresh_token)\b\s*[:=]/iu },
  { reason: "bearer-value", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}\b/u },
]);

async function textFiles(directory, prefix = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await textFiles(path, prefix));
    else if (entry.isFile()) files.push({ path, relativePath: relative(prefix, path) });
  }
  return files;
}

export async function findBuildSecretLeaks(directory) {
  const leaks = [];
  for (const file of await textFiles(directory)) {
    let source;
    try { source = await readFile(file.path, "utf8"); } catch { continue; }
    for (const entry of CREDENTIAL_PATTERNS) {
      if (entry.pattern.test(source)) leaks.push({ file: file.relativePath, reason: entry.reason });
    }
  }
  return leaks;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const directory = process.argv[2] ?? "frontend/dist";
  const leaks = await findBuildSecretLeaks(directory);
  if (leaks.length) {
    console.error(`[fail] build secret scan found ${leaks.length} public asset violation(s)`);
    for (const leak of leaks) console.error(`[fail] ${leak.file}: ${leak.reason}`);
    process.exitCode = 1;
  } else {
    console.log(`[pass] build secret scan: ${directory}`);
  }
}
