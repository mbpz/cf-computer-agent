import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Window } from "happy-dom";
import { API } from "typescript/unstable/sync";
import * as ast from "typescript/unstable/ast";

const root = resolve(argument("--root") || new URL("../", import.meta.url).pathname);
const publicRoot = resolve(root, "public");
const errors = [];
const checkedKeys = new Set();
let placeholderCount = 0;

// Developer-contract failures are never rendered intentionally. All other human copy in a
// throw/display path must use a stable technical code that the UI maps through i18n.
const TECHNICAL_COPY_ALLOWLIST = Object.freeze(new Set([
  "Memory Garden",
  "Locale subscriber must be a function",
  "Translation binding translator must be a function",
  "Translation binding target must be an object",
  "Computed translation must be a function",
  "Translation binding update must be a function",
]));
const TECHNICAL_COPY_PREFIX_ALLOWLIST = Object.freeze([
  "Translation attribute is not user-visible:",
  "Translation property is not user-visible:",
  "Translation placeholder mismatch for",
]);
const USER_VISIBLE_ATTRIBUTES = new Set(["alt", "aria-label", "aria-description", "placeholder", "title"]);
const TRANSLATION_KEY = /^[A-Z][A-Z0-9_]*$/u;

const en = await importCatalog(resolve(publicRoot, "locales/en.js"), "en");
const zhCN = await importCatalog(resolve(publicRoot, "locales/zh-CN.js"), "zhCN");
const enKeys = Object.keys(en).sort();
const zhKeys = Object.keys(zhCN).sort();

if (!same(enKeys, zhKeys)) errors.push(`[fail] locale-key-parity en=${enKeys.length} zh-CN=${zhKeys.length}`);
for (const key of enKeys.filter((candidate) => Object.hasOwn(zhCN, candidate))) {
  const left = placeholders(en[key]);
  const right = placeholders(zhCN[key]);
  placeholderCount += left.length;
  if (!same(left, right)) errors.push(`[fail] placeholder-parity key=${key}`);
}

const files = (await walk(publicRoot))
  .filter((path) => /\.(?:js|html)$/u.test(path))
  .filter((path) => !path.includes("/vendor/") && !path.includes("/locales/"));
const javaScriptFiles = files.filter((path) => path.endsWith(".js"));
if (javaScriptFiles.length) scanJavaScriptFiles(javaScriptFiles);
for (const path of files.filter((candidate) => candidate.endsWith(".html"))) await scanHtml(path);

for (const key of checkedKeys) {
  if (!Object.hasOwn(en, key)) errors.push(`[fail] unknown-key key=${key}`);
}

if (errors.length) {
  for (const error of [...new Set(errors)]) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`[pass] i18n keys=${enKeys.length} placeholders=${placeholderCount} files=${files.length}`);
  console.log("[pass] i18n-hardcoded-copy ast=typescript html=dom");
}

function scanJavaScriptFiles(paths) {
  const api = new API({ cwd: root });
  let snapshot;
  try {
    snapshot = api.updateSnapshot({ openFiles: paths });
    for (const path of paths) {
      const project = snapshot.getDefaultProjectForFile(path);
      const sourceFile = project?.program.getSourceFile(path);
      if (!sourceFile) {
        errors.push(`[fail] ast-load file=${relative(path)}`);
        continue;
      }
      const diagnostics = project.program.getSyntacticDiagnostics(path);
      if (diagnostics.length) {
        errors.push(`[fail] ast-syntax file=${relative(path)}`);
        continue;
      }
      scanJavaScript(path, sourceFile);
    }
  } catch (error) {
    errors.push(`[fail] ast-compiler-api ${error instanceof Error ? error.message : "unknown"}`);
  } finally {
    snapshot?.dispose();
    api.close();
  }
}

function scanJavaScript(path, sourceFile) {
  const declarations = new Map();
  const reassigned = new Set();
  const dynamicKeyMaps = new Map();

  walkAst(sourceFile, (node) => {
    if (ast.isVariableDeclaration(node) && ast.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer);
      if (node.name.text.endsWith("Keys")) {
        const object = unwrapObjectLiteral(node.initializer);
        if (object) {
          const keys = object.properties
            .filter(ast.isPropertyAssignment)
            .map((property) => literalText(property.initializer))
            .filter((value) => value !== undefined);
          if (keys.length === object.properties.length && keys.every((key) => TRANSLATION_KEY.test(key))) {
            dynamicKeyMaps.set(node.name.text, new Set(keys));
            keys.forEach((key) => checkedKeys.add(key));
          }
        }
      }
    }
    if (ast.isBinaryExpression(node)
      && node.operatorToken.kind === ast.SyntaxKind.EqualsToken
      && ast.isIdentifier(node.left)) reassigned.add(node.left.text);
  });
  const environment = { declarations, reassigned, dynamicKeyMaps, sourceFile };

  walkAst(sourceFile, (node) => {
    if (ast.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name === "labelKey" || name === "data-i18n-key") {
        const key = literalText(node.initializer);
        if (key) checkedKeys.add(key);
      }
    }
    if (ast.isCallExpression(node)) {
      scanTranslationCall(node, path, environment);
      scanCallSink(node, path, environment);
    }
    if (ast.isNewExpression(node) && errorConstructorName(node.expression) && node.arguments?.[0]) {
      checkCopy(node.arguments[0], path, environment);
    }
    if (ast.isThrowStatement(node) && node.expression) checkCopy(node.expression, path, environment);
    if (ast.isBinaryExpression(node) && node.operatorToken.kind === ast.SyntaxKind.EqualsToken) {
      const property = accessName(node.left);
      if (property && ["textContent", "innerText", "title", "placeholder", "ariaLabel"].includes(property)) {
        checkCopy(node.right, path, environment);
      }
    }
  });
}

function scanTranslationCall(node, path, environment) {
  if (!ast.isIdentifier(node.expression) || node.expression.text !== "t") return;
  const expression = node.arguments[0];
  if (!expression) return;
  const keys = resolveTranslationKeys(expression, environment);
  if (!keys?.size) {
    errors.push(`[fail] unknown-dynamic-key file=${relative(path)} line=${lineOf(environment.sourceFile, node.pos)}`);
    return;
  }
  keys.forEach((key) => checkedKeys.add(key));
}

function resolveTranslationKeys(expression, environment, seen = new Set()) {
  const literal = literalText(expression);
  if (literal !== undefined) return new Set([literal]);
  if (ast.isParenthesizedExpression(expression)) return resolveTranslationKeys(expression.expression, environment, seen);
  if (ast.isConditionalExpression(expression)) {
    return union(resolveTranslationKeys(expression.whenTrue, environment, seen), resolveTranslationKeys(expression.whenFalse, environment, seen));
  }
  if (ast.isBinaryExpression(expression)
    && (expression.operatorToken.kind === ast.SyntaxKind.BarBarToken
      || expression.operatorToken.kind === ast.SyntaxKind.QuestionQuestionToken)) {
    return union(resolveTranslationKeys(expression.left, environment, seen), resolveTranslationKeys(expression.right, environment, seen));
  }
  if (ast.isElementAccessExpression(expression)) {
    const object = expression.expression;
    if (ast.isIdentifier(object) && environment.dynamicKeyMaps.has(object.text)) {
      return new Set(environment.dynamicKeyMaps.get(object.text));
    }
    const literalObject = unwrapObjectLiteral(object);
    if (literalObject) {
      return new Set(literalObject.properties.filter(ast.isPropertyAssignment)
        .map((property) => literalText(property.initializer)).filter(Boolean));
    }
  }
  if (ast.isIdentifier(expression) && !environment.reassigned.has(expression.text) && !seen.has(expression.text)) {
    const initializer = environment.declarations.get(expression.text);
    if (initializer) {
      seen.add(expression.text);
      return resolveTranslationKeys(initializer, environment, seen);
    }
  }
  return undefined;
}

function scanCallSink(node, path, environment) {
  const callName = ast.isIdentifier(node.expression) ? node.expression.text : accessName(node.expression);
  if (!callName) return;
  if (errorConstructorName(node.expression) && node.arguments[0]) {
    checkCopy(node.arguments[0], path, environment);
    return;
  }
  if (callName === "reject" && ast.isPropertyAccessExpression(node.expression)
    && node.expression.expression.getText(environment.sourceFile) === "Promise" && node.arguments[0]) {
    checkCopy(node.arguments[0], path, environment);
    return;
  }
  if (callName === "setAttribute" && ast.isPropertyAccessExpression(node.expression)) {
    const attribute = literalText(node.arguments[0]);
    const visible = attribute && (USER_VISIBLE_ATTRIBUTES.has(attribute)
      || (attribute === "value" && visibleValueTarget(node.expression.expression, environment)));
    if (visible && node.arguments[1]) checkCopy(node.arguments[1], path, environment);
    return;
  }
  if (callName === "createTextNode" && node.arguments[0]) {
    checkCopy(node.arguments[0], path, environment);
    return;
  }
  if (callName === "text" && node.expression.getText(environment.sourceFile).endsWith("translationBindings.text") && node.arguments[1]) {
    checkCopy(node.arguments[1], path, environment);
    return;
  }
  if ((callName === "attribute" || callName === "property")
    && node.expression.getText(environment.sourceFile).startsWith("translationBindings.") && node.arguments[2]) {
    checkCopy(node.arguments[2], path, environment);
    return;
  }
  if (callName === "element") {
    scanElementOptions(node.arguments[0], node.arguments[1], path, environment);
    scanChildren(node.arguments[2], path, environment);
    return;
  }
  if (callName === "openReviewDialog") {
    scanNamedObjectProperties(node.arguments[0], ["title", "description", "confirmLabel"], path, environment);
    return;
  }
  const sinkPositions = Object.assign(Object.create(null), {
    page: [0, 1], card: [0], empty: [0], field: [0], routeLink: [0], item: [0, 1],
    list: [2], table: [0], setStatus: [0], validationSummary: [1], routeStateNode: [1], setPending: [2, 3],
  });
  for (const position of sinkPositions[callName] || []) {
    if (node.arguments[position]) checkCopy(node.arguments[position], path, environment);
  }
}

function scanElementOptions(tagExpression, expression, path, environment) {
  const object = resolveObjectLiteral(expression, environment);
  if (!object) return;
  const tag = literalText(tagExpression);
  for (const property of object.properties.filter(ast.isPropertyAssignment)) {
    const name = propertyName(property.name);
    if (name === "text" || USER_VISIBLE_ATTRIBUTES.has(name)
      || (name === "value" && tag === "input" && visibleInputType(object))) {
      checkCopy(property.initializer, path, environment);
    }
  }
}

function scanNamedObjectProperties(expression, names, path, environment) {
  const object = resolveObjectLiteral(expression, environment);
  if (!object) return;
  for (const property of object.properties.filter(ast.isPropertyAssignment)) {
    if (names.includes(propertyName(property.name))) checkCopy(property.initializer, path, environment);
  }
}

function scanChildren(expression, path, environment) {
  if (!expression || !ast.isArrayLiteralExpression(expression)) return;
  for (const child of expression.elements) {
    if (ast.isSpreadElement(child)) continue;
    if (ast.isArrayLiteralExpression(child)) scanChildren(child, path, environment);
    else checkCopy(child, path, environment);
  }
}

function checkCopy(expression, path, environment) {
  const copy = staticCopy(expression, environment);
  if (!copy || !humanCopy(copy) || allowedTechnicalCopy(copy)) return;
  errors.push(`[fail] hardcoded-copy file=${relative(path)} line=${lineOf(environment.sourceFile, expression.pos)}`);
}

function staticCopy(expression, environment, seen = new Set()) {
  const literal = literalText(expression);
  if (literal !== undefined) return literal;
  if (ast.isParenthesizedExpression(expression)) return staticCopy(expression.expression, environment, seen);
  if (ast.isIdentifier(expression) && !environment.reassigned.has(expression.text) && !seen.has(expression.text)) {
    const initializer = environment.declarations.get(expression.text);
    if (!initializer) return "";
    seen.add(expression.text);
    return staticCopy(initializer, environment, seen);
  }
  if (ast.isPropertyAccessExpression(expression) || ast.isElementAccessExpression(expression)) {
    const object = resolveObjectLiteral(expression.expression, environment);
    const name = accessName(expression);
    const property = object?.properties.find((candidate) => {
      return (ast.isPropertyAssignment(candidate) || ast.isShorthandPropertyAssignment(candidate))
        && propertyName(candidate.name) === name;
    });
    if (property && ast.isPropertyAssignment(property)) {
      return staticCopy(property.initializer, environment, new Set(seen));
    }
    if (property && ast.isShorthandPropertyAssignment(property)) {
      return staticCopy(property.name, environment, new Set(seen));
    }
  }
  if (ast.isTemplateExpression(expression)) {
    return [expression.head.text, ...expression.templateSpans.flatMap((span) => [
      staticCopy(span.expression, environment, new Set(seen)), span.literal.text,
    ])].join(" ");
  }
  if (ast.isBinaryExpression(expression) && expression.operatorToken.kind === ast.SyntaxKind.PlusToken) {
    return `${staticCopy(expression.left, environment, new Set(seen))} ${staticCopy(expression.right, environment, new Set(seen))}`;
  }
  if (ast.isConditionalExpression(expression)) {
    return `${staticCopy(expression.whenTrue, environment, new Set(seen))} ${staticCopy(expression.whenFalse, environment, new Set(seen))}`;
  }
  if (ast.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) => staticCopy(element, environment, new Set(seen))).join(" ");
  }
  if (ast.isCallExpression(expression) && ast.isIdentifier(expression.expression) && expression.arguments.length === 1) {
    const encoded = literalText(expression.arguments[0]);
    if (encoded !== undefined && expression.expression.text === "atob") {
      try { return Buffer.from(encoded, "base64").toString("utf8"); } catch { return encoded; }
    }
    if (encoded !== undefined && (expression.expression.text === "decodeURI" || expression.expression.text === "decodeURIComponent")) {
      try { return decodeURIComponent(encoded); } catch { return encoded; }
    }
  }
  return "";
}

async function scanHtml(path) {
  const source = await readFile(path, "utf8");
  const window = new Window({ settings: {
    disableJavaScriptEvaluation: true,
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
  } });
  try {
    const document = new window.DOMParser().parseFromString(source, "text/html");
    const roots = [document];
    for (let index = 0; index < roots.length; index += 1) {
      const scanRoot = roots[index];
      scanHtmlTextChildren(scanRoot, undefined, path);
      for (const element of scanRoot.querySelectorAll("*")) {
        const tag = element.tagName.toLowerCase();
        if (tag === "script" || tag === "style") continue;
        const textKey = element.getAttribute("data-i18n");
        if (textKey) checkedKeys.add(textKey);
        const ariaKey = element.getAttribute("data-i18n-aria-label");
        if (ariaKey) checkedKeys.add(ariaKey);
        scanHtmlTextChildren(element, textKey, path);
        for (const name of [...USER_VISIBLE_ATTRIBUTES, "value"]) {
          if (name === "value" && !visibleHtmlValue(element)) continue;
          const value = element.getAttribute(name);
          if (!value || !humanCopy(value) || allowedTechnicalCopy(value)) continue;
          if (name === "aria-label" && ariaKey) continue;
          errors.push(`[fail] hardcoded-copy file=${relative(path)} html-attr=${name}`);
        }
        if (tag === "template" && element.content) roots.push(element.content);
      }
    }
  } catch {
    errors.push(`[fail] html-parse file=${relative(path)}`);
  } finally {
    window.close();
  }
}

function scanHtmlTextChildren(parent, textKey, path) {
  for (const node of parent.childNodes || []) {
    if (node.nodeType !== 3) continue;
    const text = node.textContent.trim();
    if (humanCopy(text) && !allowedTechnicalCopy(text) && !textKey) {
      errors.push(`[fail] hardcoded-copy file=${relative(path)} html-text=${compact(text)}`);
    }
  }
}

async function importCatalog(path, exportName) {
  try {
    const url = pathToFileURL(path);
    url.searchParams.set("verify", `${Date.now()}-${Math.random()}`);
    const module = await import(url.href);
    const catalog = module[exportName];
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) throw new Error();
    return catalog;
  } catch {
    console.error(`[fail] locale-load ${exportName}`);
    process.exit(1);
  }
}

function unwrapObjectLiteral(expression) {
  if (!expression) return undefined;
  if (ast.isObjectLiteralExpression(expression)) return expression;
  if (ast.isParenthesizedExpression(expression)) return unwrapObjectLiteral(expression.expression);
  if (ast.isCallExpression(expression) && expression.arguments.length === 1
    && expression.expression.getText(expression.getSourceFile()) === "Object.freeze") {
    return unwrapObjectLiteral(expression.arguments[0]);
  }
  return undefined;
}

function resolveObjectLiteral(expression, environment, seen = new Set()) {
  if (!expression) return undefined;
  const object = unwrapObjectLiteral(expression);
  if (object) return object;
  if (ast.isIdentifier(expression) && !environment.reassigned.has(expression.text) && !seen.has(expression.text)) {
    const initializer = environment.declarations.get(expression.text);
    if (!initializer) return undefined;
    seen.add(expression.text);
    return resolveObjectLiteral(initializer, environment, seen);
  }
  return undefined;
}

function visibleValueTarget(expression, environment, seen = new Set()) {
  if (!expression) return false;
  if (ast.isParenthesizedExpression(expression)) return visibleValueTarget(expression.expression, environment, seen);
  if (ast.isIdentifier(expression) && !environment.reassigned.has(expression.text) && !seen.has(expression.text)) {
    const initializer = environment.declarations.get(expression.text);
    if (!initializer) return false;
    seen.add(expression.text);
    return visibleValueTarget(initializer, environment, seen);
  }
  if (!ast.isCallExpression(expression) || !ast.isIdentifier(expression.expression)
    || expression.expression.text !== "element" || literalText(expression.arguments[0]) !== "input") return false;
  const options = resolveObjectLiteral(expression.arguments[1], environment);
  return Boolean(options && visibleInputType(options));
}

function visibleInputType(object) {
  const type = object.properties.filter(ast.isPropertyAssignment)
    .find((property) => propertyName(property.name) === "type");
  return Boolean(type && ["button", "reset", "submit"].includes(literalText(type.initializer)));
}

function visibleHtmlValue(element) {
  if (element.tagName.toLowerCase() !== "input") return false;
  return ["button", "reset", "submit"].includes((element.getAttribute("type") || "text").toLowerCase());
}

function literalText(node) {
  return node && (ast.isStringLiteral(node) || ast.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}
function propertyName(node) { return ast.isIdentifier(node) || ast.isStringLiteral(node) ? node.text : ""; }
function accessName(node) {
  if (ast.isPropertyAccessExpression(node)) return node.name.text;
  if (ast.isElementAccessExpression(node)) return literalText(node.argumentExpression) || "";
  return "";
}
function errorConstructorName(node) {
  return ast.isIdentifier(node) && ["Error", "TypeError", "DOMException"].includes(node.text) ? node.text : "";
}
function union(left, right) {
  if (!left || !right) return undefined;
  return new Set([...left, ...right]);
}
function walkAst(node, visitor) {
  visitor(node);
  node.forEachChild((child) => { walkAst(child, visitor); });
}
function humanCopy(value) {
  if (!value || TRANSLATION_KEY.test(value)) return false;
  if (/\p{Script=Han}/u.test(value)) return true;
  return (value.match(/[A-Za-z]{2,}/gu) || []).length >= 2;
}
function allowedTechnicalCopy(value) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return TECHNICAL_COPY_ALLOWLIST.has(normalized)
    || TECHNICAL_COPY_PREFIX_ALLOWLIST.some((prefix) => normalized.startsWith(prefix));
}
function placeholders(value) {
  return [...String(value).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}
function same(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function lineOf(sourceFile, position) { return sourceFile.text.slice(0, Math.max(0, position)).split("\n").length; }
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }))).flat().sort();
}
function argument(name) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function relative(path) { return path.slice(root.length + 1); }
function compact(value) { return value.replace(/\s+/gu, " ").slice(0, 40); }
