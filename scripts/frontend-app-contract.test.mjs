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
const graphSuggestionsRouteSource = () => readFile(resolve(repositoryRoot, "src/routes/graph-suggestions.ts"), "utf8");
const graphSuggestionsDataSource = () => readFile(resolve(repositoryRoot, "frontend/lib/graph-suggestions.ts"), "utf8");
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

function matchingDelimiter(source, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter && --depth === 0) return index;
  }
  assert.fail(`unbalanced ${openCharacter}${closeCharacter} pair`);
}

function functionBody(source, name) {
  const declaration = source.indexOf(`function ${name}(`);
  assert.notEqual(declaration, -1, `missing function ${name}`);
  const parameters = source.indexOf("(", declaration);
  const parameterEnd = matchingDelimiter(source, parameters, "(", ")");
  const open = source.indexOf("{", parameterEnd);
  assert.notEqual(open, -1, `missing body for ${name}`);
  return source.slice(open + 1, matchingDelimiter(source, open, "{", "}"));
}

function returnedJsxTag(source) {
  for (const match of source.matchAll(/\breturn\b/gu)) {
    const expression = source.slice(match.index + "return".length).trimStart();
    if (expression.startsWith("<")) {
      const tag = expression.slice(1).match(/^[A-Z][A-Za-z0-9]*/u)?.[0];
      if (tag) return tag;
    }
  }
  assert.fail("missing JSX return statement");
}

function caseBody(source, value) {
  const marker = `case "${value}":`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing case ${value}`);
  const rest = source.slice(start + marker.length);
  const nextCase = rest.search(/\n\s*case\s+"/u);
  return nextCase === -1 ? rest : rest.slice(0, nextCase);
}

function jsxTagCount(source, tag) {
  return [...source.matchAll(new RegExp(`<${tag}(?:\\s|/?>)`, "gu"))].length;
}

function dynamicImportCount(source, packageName) {
  return [...source.matchAll(new RegExp(`\\bimport\\s*\\(\\s*["']${packageName}["']\\s*\\)`, "gu"))].length;
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

test("the graph route structurally returns GraphPage and renders it only for /graph", async () => {
  const [app, appRoutes, capabilities, graphPage] = await Promise.all([
    appSource(),
    appRoutesSource(),
    routeCapabilitiesSource(),
    graphPageSource(),
  ]);
  assert.match(app, /import \{ GraphRoute \} from "\.\/pages\/graph-page";/u);
  assert.equal(returnedJsxTag(caseBody(functionBody(app, "renderPage"), "graph")), "GraphRoute");
  assert.match(appRoutes, /return routeCapability\(pathname\)\?\.pageKind \?\? "not-found";/u);
  assert.match(capabilities, /\{ id: "graph", path: "\/graph", pageKind: "graph", availability: "ready"/u);
  assert.equal(returnedJsxTag(functionBody(graphPage, "GraphRoute")), "GraphPage");
  assert.equal(jsxTagCount(functionBody(graphPage, "GraphPage"), "GraphCanvas"), 1);
});

test("Cytoscape stays behind one GraphCanvas dynamic import and GraphCanvas has one GraphPage mount", async () => {
  const [graphPage, graphCanvas, frontendFiles] = await Promise.all([
    graphPageSource(),
    graphCanvasSource(),
    collectFrontendSourceFiles(resolve(repositoryRoot, "frontend")),
  ]);
  assert.match(graphPage, /import \{ GraphCanvas \} from "\.\.\/components\/graph\/graph-canvas";/u);
  assert.equal(dynamicImportCount(graphCanvas, "cytoscape"), 1);
  assert.doesNotMatch(graphCanvas, /from ["']cytoscape["']/u);

  const cytoscapeReferences = [];
  const graphCanvasMounts = [];
  for (const file of frontendFiles) {
    const source = await readFile(file, "utf8");
    const relativePath = file.replace(`${repositoryRoot}/`, "");
    if (dynamicImportCount(source, "cytoscape") > 0 || /from ["']cytoscape["']/u.test(source)) cytoscapeReferences.push(relativePath);
    const mounts = jsxTagCount(source, "GraphCanvas");
    if (mounts > 0) graphCanvasMounts.push({ path: relativePath, mounts });
  }
  assert.deepEqual(cytoscapeReferences, ["frontend/components/graph/graph-canvas.tsx"]);
  assert.deepEqual(graphCanvasMounts, [{ path: "frontend/pages/graph-page.tsx", mounts: 1 }]);
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

test("graph suggestions stay member-scoped, read-only, and manually promoted", async () => {
  const [route, page, data] = await Promise.all([graphSuggestionsRouteSource(), graphPageSource(), graphSuggestionsDataSource()]);
  assert.match(route, /url\.pathname !== "\/api\/graph\/suggestions"/u);
  assert.match(route, /requireCapability\(principal, "tasks:use"\)/u);
  assert.match(route, /requireMember\(principal\)/u);
  assert.match(route, /request\.method !== "GET"/u);
  assert.match(route, /services\.graph\.get\(member\.memberId/u);
  assert.match(route, /services\.suggestions\.suggest\(snapshot\)/u);
  assert.doesNotMatch(route, /method === "POST"/u);
  assert.match(page, /loadGraphSuggestions\(fetch\)/u);
  assert.match(data, /promotionRequired/u);
  assert.doesNotMatch(page, /promoteSuggestion|POST.*graph\/suggestions/u);
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
