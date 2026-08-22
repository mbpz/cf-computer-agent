import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((argument) => argument !== "--check")) {
  throw new Error("Usage: node scripts/vendor-browser-deps.mjs [--check]");
}

const dependencies = [
  {
    name: "markdown-it",
    version: "15.0.0",
    source: "node_modules/markdown-it/dist/browser/markdown-it.umd.min.js",
    destination: "public/vendor/markdown-it.min.js",
    sha256: "8d0f6aca8f4de3321b6d07e03286176c59ec19b7b84abb6eb31f0fa795e83abc",
  },
  {
    name: "dompurify",
    version: "3.4.14",
    source: "node_modules/dompurify/dist/purify.min.js",
    destination: "public/vendor/purify.min.js",
    sha256: "c2f26ea4fc0d88141c9aa430eb515ac86fce59418ceebd85fa475b87a8d6c3e6",
  },
];

const applicationManifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
for (const dependency of dependencies) {
  if (applicationManifest.dependencies?.[dependency.name] !== dependency.version) {
    throw new Error(`${dependency.name} must be pinned exactly to ${dependency.version}`);
  }
  const installedManifest = JSON.parse(await readFile(
    resolve(root, `node_modules/${dependency.name}/package.json`),
    "utf8",
  ));
  if (installedManifest.version !== dependency.version) {
    throw new Error(`${dependency.name} installed version does not match ${dependency.version}`);
  }
  const sourcePath = resolve(root, dependency.source);
  const sourceBytes = await readFile(sourcePath);
  if (sha256(sourceBytes) !== dependency.sha256) {
    throw new Error(`${dependency.name} reviewed browser distribution hash mismatch`);
  }
  const destinationPath = resolve(root, dependency.destination);
  if (checkOnly) {
    const destinationBytes = await readFile(destinationPath).catch(() => undefined);
    if (!destinationBytes || sha256(destinationBytes) !== dependency.sha256) {
      throw new Error(`${dependency.destination} is missing or differs from reviewed package bytes`);
    }
  } else {
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
  console.log(`${dependency.name}@${dependency.version} ${dependency.sha256}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
