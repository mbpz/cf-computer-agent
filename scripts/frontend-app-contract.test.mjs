import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = () => readFile(resolve(repositoryRoot, "frontend/app.tsx"), "utf8");
const appRoutesSource = () => readFile(resolve(repositoryRoot, "frontend/app-routes.ts"), "utf8");
const routeCapabilitiesSource = () => readFile(resolve(repositoryRoot, "shared/workspace-route-capabilities.ts"), "utf8");
const graphPageSource = () => readFile(resolve(repositoryRoot, "frontend/pages/graph-page.tsx"), "utf8");
const graphCanvasSource = () => readFile(resolve(repositoryRoot, "frontend/components/graph/graph-canvas.tsx"), "utf8");
const graphCanvasCss = () => readFile(resolve(repositoryRoot, "frontend/components/graph/graph-canvas.css"), "utf8");
const shellSource = () => readFile(resolve(repositoryRoot, "frontend/components/shell/app-shell.tsx"), "utf8");
const localeSource = () => readFile(resolve(repositoryRoot, "frontend/lib/i18n.ts"), "utf8");

async function collectFrontendSourceFiles(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFrontendSourceFiles(path, files);
    } else if (/\.(?:ts|tsx)$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function catalogKeysForLocale(source, locale) {
  const start = source.indexOf(`${locale}: {`);
  assert.notEqual(start, -1, `missing ${locale} locale catalog`);
  const end = locale === "en" ? source.indexOf('"zh-CN": {', start) : source.indexOf("\n  },\n};", start);
  assert.notEqual(end, -1, `unterminated ${locale} locale catalog`);
  return [...source.slice(start, end).matchAll(/^\s+(GRAPH_[A-Z0-9_]+):/gmu)].map((match) => match[1]);
}

test("anonymous bootstrap imports the LoginPage component it renders", async () => {
  const source = await appSource();
  assert.match(source, /import \{ LoginPage \} from ["']\.\/pages\/login-page["'];/u);
});

test("only anonymous root uses the public studio; deep links and session errors keep LoginPage", async () => {
  const source = await appSource();
  assert.match(source, /import \{ PublicWorkbenchPage \} from ["']\.\/pages\/workbench-landing\/public-workbench-page["'];/u);
  assert.match(source, /if \(sessionError\) return <LoginPage locale=\{locale\} error=[^>]*\/>;\s+if \(anonymous && pathname === "\/"\) return <PublicWorkbenchPage locale=\{locale\} \/>;\s+if \(anonymous\) return <LoginPage locale=\{locale\} \/>;/u);
});

test("the graph route is registered and renders GraphPage only for /graph", async () => {
  const [app, appRoutes, capabilities, graphPage] = await Promise.all([
    appSource(),
    appRoutesSource(),
    routeCapabilitiesSource(),
    graphPageSource(),
  ]);
  assert.match(app, /import \{ GraphRoute \} from "\.\/pages\/graph-page";/u);
  assert.match(app, /case "graph": return <GraphRoute locale=\{locale\} \/>;/u);
  assert.match(appRoutes, /return routeCapability\(pathname\)\?\.pageKind \?\? "not-found";/u);
  assert.match(capabilities, /\{ id: "graph", path: "\/graph", pageKind: "graph", availability: "ready"/u);
  assert.match(graphPage, /export function GraphPage\(/u);
  assert.match(graphPage, /export function GraphRoute\(/u);
});

test("Cytoscape stays behind the graph canvas dynamic import and never enters other frontend source", async () => {
  const [graphPage, graphCanvas, frontendFiles] = await Promise.all([
    graphPageSource(),
    graphCanvasSource(),
    collectFrontendSourceFiles(resolve(repositoryRoot, "frontend")),
  ]);
  assert.match(graphPage, /import \{ GraphCanvas \} from "\.\.\/components\/graph\/graph-canvas";/u);
  assert.match(graphCanvas, /import\("cytoscape"\)/u);
  assert.doesNotMatch(graphCanvas, /from ["']cytoscape["']/u);

  const cytoscapeReferences = [];
  for (const file of frontendFiles) {
    const source = await readFile(file, "utf8");
    if (/cytoscape/iu.test(source)) cytoscapeReferences.push(file.replace(`${repositoryRoot}/`, ""));
  }
  assert.deepEqual(cytoscapeReferences, ["frontend/components/graph/graph-canvas.tsx"]);
});

test("graph UI has no undefined or hardcoded visible copy and keeps both locale catalogs in parity", async () => {
  const [graphPage, graphCanvas, locales] = await Promise.all([graphPageSource(), graphCanvasSource(), localeSource()]);
  for (const source of [graphPage, graphCanvas]) {
    assert.doesNotMatch(source, /["'`]undefined["'`]/u);
    assert.doesNotMatch(source, />\s*undefined\s*</u);
    assert.doesNotMatch(source.replace(/=>/gu, ""), />\s*[A-Za-z\u4e00-\u9fff][^<{]*</u);
  }
  const enKeys = catalogKeysForLocale(locales, "en");
  const zhKeys = catalogKeysForLocale(locales, '"zh-CN"');
  assert.ok(enKeys.length > 0, "graph locale keys are missing from en");
  assert.deepEqual(zhKeys.sort(), enKeys.sort());
});

test("graph canvas keeps a semantic mobile fallback when the visual viewport is hidden", async () => {
  const [graphCanvas, css] = await Promise.all([graphCanvasSource(), graphCanvasCss()]);
  assert.match(graphCanvas, /data-graph-fallback/u);
  assert.match(graphCanvas, /<button[\s\S]*data-graph-node-id=/u);
  assert.match(css, /@media \(max-width: 48rem\)/u);
  assert.match(css, /\.graph-canvas__viewport\s*\{\s*display: none;/u);
  assert.doesNotMatch(css, /@media \(max-width: 48rem\)[\s\S]*?\.graph-canvas__fallback[\s\S]*?display:\s*none/u);
});

test("the application shell keeps account actions out of the topbar and removes free-tier copy", async () => {
  const [shell, locale] = await Promise.all([shellSource(), localeSource()]);
  assert.match(shell, /data-shell-account-footer/u);
  assert.match(shell, /data-shell-mobile-account-footer/u);
  assert.doesNotMatch(shell, /SHELL_FREE_TIER_LABEL/u);
  assert.doesNotMatch(locale, /SHELL_FREE_TIER_LABEL/u);
});
